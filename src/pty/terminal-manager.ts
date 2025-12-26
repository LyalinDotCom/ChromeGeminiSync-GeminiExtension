/**
 * Terminal Manager
 * Manages the PTY process running Gemini CLI
 */

// @ts-ignore - Using homebridge fork for Node 22 + Apple Silicon compatibility
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { EventEmitter } from 'events';
import * as os from 'os';

export interface TerminalOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
}

export class TerminalManager extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private cols: number;
  private rows: number;
  private cwd: string;
  private shell: string;
  private env: Record<string, string>;

  constructor(options: TerminalOptions = {}) {
    super();
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.cwd = options.cwd || process.cwd();
    this.shell = options.shell || this.getDefaultShell();
    this.env = {
      ...process.env as Record<string, string>,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...options.env
    };
  }

  /**
   * Get the default shell for the current platform
   */
  private getDefaultShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Start the PTY process
   */
  start(): void {
    if (this.ptyProcess) {
      console.log('[TerminalManager] PTY already running');
      return;
    }

    console.log('[TerminalManager] Starting PTY process');
    console.log(`[TerminalManager] Shell: ${this.shell}`);
    console.log(`[TerminalManager] CWD: ${this.cwd}`);
    console.log(`[TerminalManager] Size: ${this.cols}x${this.rows}`);

    try {
      this.ptyProcess = pty.spawn(this.shell, [], {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: this.env
      });

      // Handle PTY output
      this.ptyProcess.onData((data) => {
        this.emit('data', data);
      });

      // Handle PTY exit
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[TerminalManager] PTY exited with code ${exitCode}, signal ${signal}`);
        this.ptyProcess = null;
        this.emit('exit', { exitCode, signal });
      });

      console.log('[TerminalManager] PTY process started successfully');
      this.emit('ready');
    } catch (error) {
      console.error('[TerminalManager] Failed to start PTY:', error);
      this.emit('error', error);
    }
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    } else {
      console.warn('[TerminalManager] Cannot write, PTY not running');
    }
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (cols > 0 && rows > 0) {
      this.cols = cols;
      this.rows = rows;
      if (this.ptyProcess) {
        this.ptyProcess.resize(cols, rows);
        console.log(`[TerminalManager] Resized to ${cols}x${rows}`);
      }
    }
  }

  /**
   * Kill the PTY process
   */
  kill(): void {
    if (this.ptyProcess) {
      console.log('[TerminalManager] Killing PTY process');
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  /**
   * Check if PTY is running
   */
  isRunning(): boolean {
    return this.ptyProcess !== null;
  }

  /**
   * Get current dimensions
   */
  getDimensions(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  /**
   * Run a specific command (like gemini)
   */
  runCommand(command: string): void {
    if (this.ptyProcess) {
      this.write(command + '\r');
    }
  }
}
