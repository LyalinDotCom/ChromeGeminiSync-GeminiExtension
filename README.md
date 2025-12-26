# Chrome Gemini Sync - Gemini Extension

**The Gemini CLI side of the Chrome/Gemini bridge.**

This extension runs a local WebSocket server and MCP server to allow Gemini CLI to communicate with your Chrome browser.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ChromeGeminiSync-GeminiExtension.git

# Link it to Gemini
gemini extensions link ./ChromeGeminiSync-GeminiExtension
```

## Setup

1.  **Install this extension** (see above).
2.  **Install the companion Chrome Extension**: You need the `ChromeGeminiSync-ChromeExtension` installed in your browser.
3.  **Start using it**: Ask Gemini to "Look at this page" or "Take a screenshot". The server starts automatically.

## Architecture

This project contains:
- **MCP Server**: Translates Gemini tool calls into WebSocket messages.
- **WebSocket Server**: Maintains a persistent connection to the Chrome Extension.