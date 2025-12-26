# Chrome Gemini Sync - Gemini Extension

**The Gemini CLI side of the Chrome/Gemini bridge.**

This extension runs a local WebSocket server and MCP server to allow Gemini CLI to communicate with your Chrome browser. It acts as the "brain" that translates Gemini's requests into actions in Chrome.

> **Note:** This project is currently tested and supported only on **macOS (Apple Silicon)**.

## Prerequisites

- **Node.js** (v20 or higher)
- **Gemini CLI** installed

## Installation

### 1. Install this Extension

```bash
# Clone the repository
git clone https://github.com/yourusername/ChromeGeminiSync-GeminiExtension.git

# Link it to Gemini
gemini extensions link ./ChromeGeminiSync-GeminiExtension
```

### 2. Install the Companion Chrome Extension

This server works in tandem with a Chrome Extension. You must install and build the frontend client as well.

👉 **[Go to ChromeGeminiSync-ChromeExtension](https://github.com/yourusername/ChromeGeminiSync-ChromeExtension)** and follow the setup instructions there.

## Usage

Once both parts are installed:

1.  Open Chrome and ensure the extension is loaded.
2.  Open your terminal with Gemini CLI.
3.  Ask Gemini to interact with your browser:

    - "Look at the active tab"
    - "Take a screenshot"
    - "What is the URL of this page?"

The backend server will **automatically start** when you make your first request. You don't need to run any manual start scripts.

## Architecture

- **MCP Server:** Runs locally and exposes tools (`get_browser_dom`, `screenshot`, etc.) to Gemini.
- **WebSocket Server:** Bridges the gap between the MCP server and the Chrome Extension.
- **Auto-Start:** The MCP server detects if the backend is running and spawns it automatically if needed.
