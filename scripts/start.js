/**
 * Bootstrap script for Chrome Extension Sync.
 * Ensures dependencies are installed and project is built before starting the MCP server.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    if (child.stderr) {
      child.stderr.pipe(process.stderr);
    }

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      } else {
        resolve();
      }
    });
    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    const backendDir = path.join(__dirname, '..');
    const nodeModulesExist = fs.existsSync(path.join(backendDir, 'node_modules'));

    if (!nodeModulesExist) {
        console.error('[Bootstrap] Dependencies missing, installing...');
        // Install dependencies (this also triggers the prepare script which builds)
        await runCommand('npm', ['install'], { 
            cwd: backendDir,
            stdio: ['ignore', 'ignore', 'pipe'] 
        });
    }

    // Start the MCP server
    const SERVER_PATH = path.join(backendDir, 'dist', 'mcp', 'mcp-server.js');
    
    if (!fs.existsSync(SERVER_PATH)) {
        console.error('[Bootstrap] Server binary missing, building...');
        await runCommand('npm', ['run', 'build'], { 
            cwd: backendDir,
            stdio: ['ignore', 'ignore', 'pipe'] 
        });
    }

    // Run the actual MCP server and inherit stdio for MCP communication
    await runCommand('node', [SERVER_PATH], { 
        cwd: backendDir,
        stdio: 'inherit' 
    });
  } catch (error) {
    console.error('[Bootstrap] Error:', error);
    process.exit(1);
  }
}

main();
