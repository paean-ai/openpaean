# OpenPaean

> Open source AI agent CLI with fullscreen TUI and local MCP integration

<p align="center">
  <img src="https://img.shields.io/npm/v/openpaean?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/npm/l/openpaean?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="node version" />
</p>

**OpenPaean** is a powerful command-line AI agent that provides:

- **🖥️ Fullscreen TUI**: Immersive terminal experience like opencode and claude-code
- **🤖 Agent Mode**: Interactive AI chat with streaming responses
- **🔗 Local MCP Integration**: Connect to local MCP servers for tool calling
- **📋 Task Management**: View, create, and manage tasks from the command line

## Installation

```bash
# Install globally with bun (recommended)
bun add -g openpaean

# Or use npm
npm install -g openpaean

# Or use directly with npx
npx openpaean
```

## Quick Start

### 1. Authenticate

```bash
openpaean login
```

### 2. Start Agent Mode

```bash
# Start fullscreen TUI mode (default)
openpaean

# Disable fullscreen mode
openpaean --no-fullscreen

# Send a single message
openpaean -m "What can you help me with?"
```

### 3. Configure Local MCP Servers

Create `~/.openpaean/mcp_config.json`:

```json
{
  "mcpServers": {
    "vibe_kanban": {
      "command": "npx",
      "args": ["-y", "vibe-kanban@latest", "--mcp"]
    }
  }
}
```

## Options

```bash
openpaean                    # Start fullscreen TUI mode
openpaean --no-fullscreen   # Disable fullscreen mode
openpaean --no-mcp          # Disable local MCP integration
openpaean -d, --debug       # Enable debug logging
openpaean -m "message"      # Send a single message
```

## Configuration

Config stored in `~/.openpaean/`:

- `config.json` - Auth and preferences
- `mcp_config.json` - MCP server configuration

### Environment Variables

```bash
# Override API endpoint (for self-hosted backends)
OPENPAEAN_API_URL=https://your-api.com

# Override Web URL (for OAuth callbacks)
OPENPAEAN_WEB_URL=https://your-web.com
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   You (CLI)     │────▶│   API Backend   │────▶│   AI Agent      │
│   (Fullscreen)  │     │                 │     │   (ADK)         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         │                       │ SSE: mcp_tool_call    │
         ▼                       ▼                       │
┌─────────────────┐◀────────────────────────────────────┘
│  Local MCP      │
│  Servers        │ ← Executes locally, returns result
└─────────────────┘
```

## Security

- **No hardcoded secrets**: All credentials stored locally in `~/.openpaean/`
- **Environment variable support**: Override API URLs for self-hosted deployments
- **MCP server trust**: Only configure MCP servers from trusted sources

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Requirements

- Node.js 18+ or Bun
- Paean AI account (or self-hosted backend)

## License

MIT © [Paean AI](https://paean.ai)
