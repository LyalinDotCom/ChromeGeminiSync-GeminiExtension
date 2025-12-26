/**
 * WebSocket Connection Manager
 * Manages WebSocket connections from Chrome extension clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { Server } from 'http';
import type { WebSocketMessage, BrowserContextRequest, BrowserContextResponse } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class ConnectionManager extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private pendingBrowserRequests: Map<string, {
    resolve: (response: BrowserContextResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws, req) => {
      console.log('[ConnectionManager] New client connected from:', req.socket.remoteAddress);
      this.clients.add(ws);
      this.emit('clientConnected', ws);

      ws.on('message', (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[ConnectionManager] Failed to parse message:', error);
        }
      });

      ws.on('close', () => {
        console.log('[ConnectionManager] Client disconnected');
        this.clients.delete(ws);
        this.emit('clientDisconnected', ws);
      });

      ws.on('error', (error) => {
        console.error('[ConnectionManager] WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    console.log('[ConnectionManager] WebSocket server initialized');
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(_ws: WebSocket, message: WebSocketMessage): void {
    switch (message.type) {
      case 'terminal:input':
        // Forward terminal input to PTY
        this.emit('terminalInput', message.data);
        break;

      case 'terminal:resize':
        // Forward resize to PTY
        this.emit('terminalResize', { cols: message.cols, rows: message.rows });
        break;

      case 'browser:response':
        // Handle browser context response
        this.handleBrowserResponse(message as BrowserContextResponse);
        break;

      default:
        console.log('[ConnectionManager] Unknown message type:', message);
    }
  }

  /**
   * Handle browser context response
   */
  private handleBrowserResponse(response: BrowserContextResponse): void {
    const pending = this.pendingBrowserRequests.get(response.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingBrowserRequests.delete(response.requestId);
      pending.resolve(response);
    } else {
      console.warn('[ConnectionManager] Received response for unknown request:', response.requestId);
    }
  }

  /**
   * Send terminal output to all connected clients
   */
  sendTerminalOutput(data: string): void {
    this.broadcast({
      type: 'terminal:output',
      data
    });
  }

  /**
   * Request browser context from connected extension
   */
  async requestBrowserContext(
    action: BrowserContextRequest['action'],
    params?: Record<string, unknown>,
    timeoutMs: number = 30000
  ): Promise<BrowserContextResponse> {
    if (this.clients.size === 0) {
      return {
        type: 'browser:response',
        requestId: '',
        success: false,
        error: 'No browser extension connected'
      };
    }

    const requestId = uuidv4();
    const request: BrowserContextRequest = {
      type: 'browser:request',
      requestId,
      action,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingBrowserRequests.delete(requestId);
        resolve({
          type: 'browser:response',
          requestId,
          success: false,
          error: 'Request timed out'
        });
      }, timeoutMs);

      this.pendingBrowserRequests.set(requestId, {
        resolve,
        reject,
        timeout
      });

      // Send request to all connected clients (typically just one)
      this.broadcast(request);
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if any clients are connected
   */
  hasClients(): boolean {
    return this.clients.size > 0;
  }

  /**
   * Close all connections
   */
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }
}
