/**
 * Shared types for backend server
 */

// Terminal I/O messages
export interface TerminalInputMessage {
  type: 'terminal:input';
  data: string;
}

export interface TerminalOutputMessage {
  type: 'terminal:output';
  data: string;
}

export interface TerminalResizeMessage {
  type: 'terminal:resize';
  cols: number;
  rows: number;
}

// Browser context request/response messages
export interface BrowserContextRequest {
  type: 'browser:request';
  requestId: string;
  action: 'getDom' | 'getSelection' | 'getUrl' | 'screenshot' | 'executeScript' | 'modifyDom' | 'getConsoleLogs';
  params?: Record<string, unknown>;
}

export interface BrowserContextResponse {
  type: 'browser:response';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Connection status messages
export interface ConnectionStatusMessage {
  type: 'connection:status';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  message?: string;
}

// Union type for all WebSocket messages
export type WebSocketMessage =
  | TerminalInputMessage
  | TerminalOutputMessage
  | TerminalResizeMessage
  | BrowserContextRequest
  | BrowserContextResponse
  | ConnectionStatusMessage;

// MCP Tool Result
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
