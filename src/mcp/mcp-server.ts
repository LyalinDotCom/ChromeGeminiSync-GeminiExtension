#!/usr/bin/env node
/**
 * Standalone Browser MCP Server
 * This script is spawned by Gemini CLI as an MCP server
 * It communicates with the main backend server via HTTP to access browser context
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3456';

// Tool parameter schemas
const GetDomSchema = z.object({
  selector: z.string().optional().describe('CSS selector to get specific element (default: body)'),
  includeStyles: z.boolean().optional().describe('Include computed styles')
});

const GetSelectionSchema = z.object({});

const GetUrlSchema = z.object({});

const ScreenshotSchema = z.object({});

const ExecuteScriptSchema = z.object({
  script: z.string().describe('JavaScript code to execute in the page context')
});

const ModifyDomSchema = z.object({
  selector: z.string().describe('CSS selector to find the element(s) to modify'),
  action: z.enum(['setHTML', 'setOuterHTML', 'setText', 'setAttribute', 'removeAttribute', 'addClass', 'removeClass', 'remove', 'insertBefore', 'insertAfter']).describe('The DOM modification action to perform'),
  value: z.string().optional().describe('The value for the action (HTML content, text, attribute value, class name, etc.)'),
  attributeName: z.string().optional().describe('Attribute name for setAttribute/removeAttribute actions'),
  all: z.boolean().optional().describe('Apply to all matching elements (default: first match only)')
});

const GetConsoleLogsSchema = z.object({
  level: z.enum(['all', 'error', 'warning', 'info']).optional().describe('Filter logs by level (default: all)'),
  clear: z.boolean().optional().describe('Clear logs after retrieving them')
});

/**
 * Ensure the backend server is running.
 * If not, spawn it as a detached process.
 */
async function ensureBackendRunning(): Promise<void> {
  const healthUrl = `${BACKEND_URL}/health`;

  // 1. Try to connect
  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      return; // Server is running
    }
  } catch (e) {
    // Server not running, proceed to start
  }

  console.error('[BrowserMCPServer] Backend not running, starting...');

  // 2. Resolve path to backend entry point
  // We assume CWD is the extension root (as set in gemini-extension.json)
  const serverPath = resolve(process.cwd(), 'dist/index.js');

  if (!existsSync(serverPath)) {
    console.error(`[BrowserMCPServer] Could not find backend entry point at ${serverPath}. Please ensure the project is built.`);
    return;
  }

  // 3. Spawn server
  try {
    const child = spawn('node', [serverPath], {
      detached: true,
      stdio: 'ignore', // Detached process shouldn't hold onto our stdio
      env: { ...process.env, PORT: '3456' }
    });

    child.unref();

    // 4. Wait for health check
    const startTime = Date.now();
    const timeout = 10000; // 10s timeout

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(healthUrl);
        if (response.ok) {
          console.error('[BrowserMCPServer] Backend started successfully');
          return;
        }
      } catch (e) {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.error('[BrowserMCPServer] Timed out waiting for backend to start');
  } catch (error) {
    console.error('[BrowserMCPServer] Failed to spawn backend:', error);
  }
}

/**
 * Make HTTP request to backend server for browser context
 */
async function requestBrowserContext(
  action: string,
  params?: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/browser/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params || {})
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error: ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function main() {
  // Ensure backend server is running
  await ensureBackendRunning();

  const server = new McpServer({
    name: 'browser-context',
    version: '1.1.0'
  });

  // Get DOM content tool
  server.registerTool(
    'get_browser_dom',
    {
      description: 'Get the DOM content of the active browser tab. Returns HTML, URL, and title. Use this when the user asks you to look at, analyze, or work with the current webpage.',
      inputSchema: GetDomSchema.shape
    },
    async (params) => {
      const response = await requestBrowserContext('getDom', {
        selector: params.selector || 'body',
        includeStyles: params.includeStyles || false
      });

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    }
  );

  // Get selected text tool
  server.registerTool(
    'get_browser_selection',
    {
      description: 'Get the currently selected/highlighted text in the active browser tab. Use this when the user refers to "this text" or wants you to work with highlighted content.',
      inputSchema: GetSelectionSchema.shape
    },
    async () => {
      const response = await requestBrowserContext('getSelection');

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    }
  );

  // Get current URL tool
  server.registerTool(
    'get_browser_url',
    {
      description: 'Get the URL and title of the active browser tab. Use this to understand what page the user is currently viewing.',
      inputSchema: GetUrlSchema.shape
    },
    async () => {
      const response = await requestBrowserContext('getUrl');

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    }
  );

  // Screenshot tool
  server.registerTool(
    'capture_browser_screenshot',
    {
      description: 'Capture a screenshot of the active browser tab. Returns base64-encoded PNG image. Use this when you need to see the visual appearance of the page.',
      inputSchema: ScreenshotSchema.shape
    },
    async () => {
      const response = await requestBrowserContext('screenshot');

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      const data = response.data as { dataUrl: string; format: string };
      const base64Data = data.dataUrl.split(',')[1];

      return {
        content: [
          {
            type: 'image',
            data: base64Data,
            mimeType: 'image/png'
          }
        ]
      };
    }
  );

  // Execute script tool
  server.registerTool(
    'execute_browser_script',
    {
      description: 'Execute JavaScript code in the active browser tab context. Use with caution - for simple DOM changes, prefer modify_dom instead.',
      inputSchema: ExecuteScriptSchema.shape
    },
    async (params) => {
      const response = await requestBrowserContext('executeScript', {
        script: params.script
      });

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result: response.data,
              success: true
            }, null, 2)
          }
        ]
      };
    }
  );

  // Modify DOM tool - safer alternative to execute_browser_script
  server.registerTool(
    'modify_dom',
    {
      description: 'Modify DOM elements in the active browser tab. Preferred over execute_browser_script for DOM changes. Actions: setHTML, setOuterHTML, setText, setAttribute, removeAttribute, addClass, removeClass, remove, insertBefore, insertAfter.',
      inputSchema: ModifyDomSchema.shape
    },
    async (params) => {
      const response = await requestBrowserContext('modifyDom', {
        selector: params.selector,
        action: params.action,
        value: params.value,
        attributeName: params.attributeName,
        all: params.all || false
      });

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      const data = response.data as { modifiedCount?: number; message?: string } | undefined;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              modifiedCount: data?.modifiedCount || 0,
              message: data?.message || 'DOM modified successfully'
            }, null, 2)
          }
        ]
      };
    }
  );

  // Get console logs tool - captures errors, warnings, and logs from DevTools console
  server.registerTool(
    'get_console_logs',
    {
      description: 'Get console logs (errors, warnings, info) from the active browser tab. This attaches a debugger to capture what you would see in DevTools console. First call starts capture; subsequent calls return accumulated logs. Use level filter to get only errors or warnings.',
      inputSchema: GetConsoleLogsSchema.shape
    },
    async (params) => {
      const response = await requestBrowserContext('getConsoleLogs', {
        level: params.level || 'all',
        clear: params.clear || false
      });

      if (!response.success) {
        return {
          content: [{ type: 'text', text: `Error: ${response.error}` }],
          isError: true
        };
      }

      const data = response.data as {
        logs: Array<{
          level: string;
          text: string;
          timestamp: number;
          url?: string;
          lineNumber?: number;
          stackTrace?: string;
        }>;
        tabId: number;
        url: string;
        isCapturing: boolean;
      };

      // Format logs for readability
      const formattedLogs = data.logs.map(log => {
        let entry = `[${log.level.toUpperCase()}] ${log.text}`;
        if (log.url) {
          entry += `\n  Source: ${log.url}${log.lineNumber ? `:${log.lineNumber}` : ''}`;
        }
        if (log.stackTrace) {
          entry += `\n${log.stackTrace}`;
        }
        return entry;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: data.logs.length > 0
              ? `Console logs from ${data.url} (${data.logs.length} entries):\n\n${formattedLogs}`
              : `No console logs captured yet from ${data.url}. Debugger is ${data.isCapturing ? 'attached and capturing' : 'not attached'}. Interact with the page to generate logs.`
          }
        ]
      };
    }
  );

  // Connection status resource
  server.resource(
    'browser://connection/status',
    'Current browser extension connection status',
    async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/status`);
        const status = await response.json();
        return {
          contents: [
            {
              uri: 'browser://connection/status',
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: 'browser://connection/status',
              mimeType: 'application/json',
              text: JSON.stringify({
                connected: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        };
      }
    }
  );

  // Start with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[BrowserMCPServer] Started with stdio transport');
}

main().catch((error) => {
  console.error('[BrowserMCPServer] Fatal error:', error);
  process.exit(1);
});
