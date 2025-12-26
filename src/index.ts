/**
 * Chrome Extension Sync Backend Server
 * Main entry point that orchestrates:
 * - WebSocket server for Chrome extension communication
 * - PTY manager for running Gemini CLI
 * - MCP server for browser context tools
 */

import express from 'express';
import { createServer } from 'http';
import { TerminalManager } from './pty/terminal-manager.js';
import { ConnectionManager } from './websocket/connection-manager.js';

// Configuration
const PORT = parseInt(process.env.PORT || '3456', 10);

// Terminal output logging throttle
let terminalOutputBytes = 0;
let lastTerminalLogTime = 0;
const TERMINAL_LOG_INTERVAL = 5000; // Log summary every 5 seconds

class ChromeExtensionSyncServer {
  private app: express.Express;
  private server: ReturnType<typeof createServer>;
  private terminalManager: TerminalManager;
  private connectionManager: ConnectionManager;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.terminalManager = new TerminalManager({
      cwd: process.cwd(),
      env: {
        FORCE_COLOR: '1',
        TERM: 'xterm-256color'
      }
    });
    this.connectionManager = new ConnectionManager();

    this.setupExpress();
    this.setupConnections();
  }

  /**
   * Set up Express routes
   */
  private setupExpress(): void {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        terminal: this.terminalManager.isRunning(),
        clients: this.connectionManager.getClientCount(),
        timestamp: new Date().toISOString()
      });
    });

    // Status endpoint
    this.app.get('/status', (_req, res) => {
      res.json({
        terminal: {
          running: this.terminalManager.isRunning(),
          dimensions: this.terminalManager.getDimensions()
        },
        websocket: {
          clients: this.connectionManager.getClientCount()
        }
      });
    });

    // CORS headers for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Browser context endpoints for MCP server
    this.setupBrowserEndpoints();
  }

  /**
   * Set up browser context HTTP endpoints for MCP server communication
   */
  private setupBrowserEndpoints(): void {
    // Helper to handle browser context responses
    const handleBrowserRequest = async (
      action: string,
      params: Record<string, unknown> | undefined,
      res: express.Response
    ) => {
      try {
        console.log(`[Server] Browser request: ${action}`, params ? JSON.stringify(params).slice(0, 100) : '');
        const response = await this.connectionManager.requestBrowserContext(action as any, params);
        console.log(`[Server] Browser response: ${action}`, response.success ? 'success' : response.error);

        if (response.success) {
          res.json(response.data ?? { success: true });
        } else {
          res.status(500).json({ error: response.error || 'Unknown error' });
        }
      } catch (error) {
        console.error(`[Server] Browser request error: ${action}`, error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    };

    // Get DOM
    this.app.post('/browser/getDom', (req, res) => handleBrowserRequest('getDom', req.body, res));

    // Get selection
    this.app.post('/browser/getSelection', (req, res) => handleBrowserRequest('getSelection', req.body, res));

    // Get URL
    this.app.post('/browser/getUrl', (req, res) => handleBrowserRequest('getUrl', req.body, res));

    // Screenshot
    this.app.post('/browser/screenshot', (req, res) => handleBrowserRequest('screenshot', req.body, res));

    // Execute script
    this.app.post('/browser/executeScript', (req, res) => handleBrowserRequest('executeScript', req.body, res));

    // Modify DOM
    this.app.post('/browser/modifyDom', (req, res) => handleBrowserRequest('modifyDom', req.body, res));

    // Get console logs
    this.app.post('/browser/getConsoleLogs', (req, res) => handleBrowserRequest('getConsoleLogs', req.body, res));
  }

  /**
   * Set up WebSocket and PTY connections
   */
  private setupConnections(): void {
    // Initialize WebSocket server
    this.connectionManager.initialize(this.server);

    // Terminal output -> WebSocket clients
    this.terminalManager.on('data', (data: string) => {
      // Throttle logging to avoid spam
      terminalOutputBytes += data.length;
      const now = Date.now();
      if (now - lastTerminalLogTime >= TERMINAL_LOG_INTERVAL) {
        console.log(`[Server] Terminal activity: ${terminalOutputBytes} bytes in last ${Math.round((now - lastTerminalLogTime) / 1000)}s`);
        terminalOutputBytes = 0;
        lastTerminalLogTime = now;
      }
      this.connectionManager.sendTerminalOutput(data);
    });

    // Terminal ready
    this.terminalManager.on('ready', () => {
      console.log('[Server] Terminal ready');
    });

    // Terminal exit -> restart or notify
    this.terminalManager.on('exit', ({ exitCode, signal }) => {
      console.log(`[Server] Terminal exited (code: ${exitCode}, signal: ${signal})`);
      // Optionally restart the terminal
      setTimeout(() => {
        if (this.connectionManager.hasClients()) {
          console.log('[Server] Restarting terminal...');
          this.terminalManager.start();
        }
      }, 1000);
    });

    // WebSocket input -> Terminal
    this.connectionManager.on('terminalInput', (data: string) => {
      this.terminalManager.write(data);
    });

    // WebSocket resize -> Terminal
    this.connectionManager.on('terminalResize', ({ cols, rows }: { cols: number; rows: number }) => {
      this.terminalManager.resize(cols, rows);
    });

    // Client connected -> Start terminal if not running
    this.connectionManager.on('clientConnected', () => {
      console.log('[Server] Client connected');
      if (!this.terminalManager.isRunning()) {
        this.terminalManager.start();
      }
    });

    // Client disconnected
    this.connectionManager.on('clientDisconnected', () => {
      console.log('[Server] Client disconnected');
      // Optionally kill terminal when all clients disconnect
      if (!this.connectionManager.hasClients()) {
        console.log('[Server] No more clients, keeping terminal running');
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(PORT, () => {
        console.log('');
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║           Chrome Extension Sync - Backend Server          ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║  WebSocket Server: ws://localhost:${PORT}                    ║`);
        console.log(`║  Health Check:     http://localhost:${PORT}/health            ║`);
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log('║  Waiting for Chrome extension to connect...               ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log('');
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    console.log('[Server] Shutting down...');
    this.terminalManager.kill();
    this.connectionManager.close();
    this.server.close();
    console.log('[Server] Shutdown complete');
  }
}

// Main entry point
const server = new ChromeExtensionSyncServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

// Start server
server.start().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
