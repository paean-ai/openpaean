# OpenPaean

> Open source AI agent CLI with fullscreen TUI and local MCP integration
>
> **[Project Overview & Vision](docs/OVERVIEW.md)** — Architecture, roadmap, and the full story behind Open Paean.

<p align="center">
  <a href="https://www.producthunt.com/products/paean?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-paean" target="_blank" rel="noopener noreferrer"><img alt="Paean - Stop prompting. Hire your 24/7 proactive AI agent. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1079645&theme=light&t=1771141715852" /></a>
</p>

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
# Quick install (recommended)
curl -fsSL https://paean.ai/openpaean/install.sh | bash
```

Or install manually with a package manager:

```bash
# Install globally with bun
bun add -g openpaean

# Or use npm
npm install -g openpaean

# Or use directly with npx
npx openpaean
```

### Update

```bash
openpaean update
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
openpaean update             # Update to the latest version
openpaean update --check     # Check for updates without installing
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

## Documentation

- **[Project Overview & Vision](docs/OVERVIEW.md)** — Architecture deep-dive, design philosophy, and roadmap.
- **[Contributing Guide](CONTRIBUTING.md)** — Development setup and guidelines.
- **[Security Policy](SECURITY.md)** — Vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Requirements

- Node.js 18+ or Bun
- Paean AI account (or self-hosted backend)

## License

MIT © [Paean AI](https://paean.ai)
