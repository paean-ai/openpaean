# Open Paean: The Open Platform for Agentic Life

> Empowering global developers to orchestrate 24/7 autonomous life assistants across the edge-cloud computing continuum.

## Introduction

Welcome to the official repository of **Open Paean**.

Open Paean is an open-source, cross-platform **Generative AI Agent Orchestration Framework**. Unlike traditional frameworks that focus solely on stateless, chat-based interaction flows, Open Paean is engineered from the ground up for the "Always-On" era—building deep agent systems that combine persistent context, local tool execution, and hybrid edge-cloud inference routing.

At its core, Open Paean provides a powerful **CLI-native AI agent** with a rich Terminal UI, seamless integration with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for local tool orchestration, and a streaming connection to the Paean AI cloud for high-performance reasoning. Independent developers and enterprise R&D teams can use Open Paean to fuse state-of-the-art LLMs with local data stores, MCP-compatible toolchains, and—in future releases—diverse hardware sensor interfaces.

Stop building chatbots. Start building Life OS. Open Paean lowers the engineering barrier to deploying your own definition of a "Chief Life Assistant."

## Key Architectural Features

### Agentic Workflow Orchestration

Move beyond fragile, linear prompt chains. Open Paean implements a real-time agent loop with tool-calling capabilities.

- **MCP-Powered Tool Execution**: The built-in MCP client connects to any standards-compliant MCP server, enabling agents to read files, query databases, manage tasks, and interact with external services—all executed locally on the user's machine.
- **Streaming Agent Loop**: Server-Sent Events (SSE) deliver real-time inference streaming, with automatic interleaving of cloud reasoning and local tool calls within a single conversation turn.
- **Multi-Agent Protocol** *(Roadmap)*: Standardized communication protocols for heterogeneous agents to collaborate on complex, long-running tasks with goal decomposition and self-reflection.

### Dynamic Edge-Cloud Compute Routing

Open Paean solves the latency vs. privacy trade-off through a split-execution architecture.

- **Privacy-First Edge**: MCP tool calls execute entirely on the user's local machine. Sensitive data—file contents, database records, environment variables—never leaves the device unless explicitly sent to the cloud.
- **High-Performance Cloud**: Complex reasoning, generation, and multi-step planning are dispatched to the Paean AI cloud backend, which orchestrates inference across optimized model clusters.
- **Seamless Handover**: The framework transparently manages state synchronization between local MCP execution and cloud-side inference within a unified conversation context.

### CLI-First Developer Experience

A fluid, terminal-native experience designed for developers who live in the shell.

- **Rich Terminal UI**: Choose between an immersive fullscreen TUI or a Claude Code-style scrolling mode—both with real-time Markdown rendering, syntax highlighting, and streaming output.
- **Slash Commands**: Built-in commands (`/reset`, `/help`, `/compact`) for conversation management, with extensible command registration.
- **Zero-Config Quick Start**: `npx openpaean` gets you a working agent session in seconds. MCP servers are configured via a simple JSON file.

### Cross-Platform Vision *(Roadmap)*

Develop once, deploy across the physical world.

- **Current**: Modern CLI with Node.js 18+ / Bun support across macOS, Linux, and Windows.
- **Planned**: Native adapters for Web, Desktop (Electron/Tauri), and Wearable platforms (WearOS, WatchOS).
- **Hardware Abstraction Layer (HAL)** *(Roadmap)*: High-level interfaces to bind physical hardware sensors (heart rate, GPS, accelerometer) directly to agent inputs—bridging software agents and physical reality.

### Modular Architecture & Extensibility

Inspired by enterprise-grade architectural patterns, Open Paean provides a decoupled, composable component system.

- **MCP Server Ecosystem**: Leverage the growing ecosystem of MCP servers—or build your own—to extend agent capabilities without modifying the core framework.
- **Pluggable Inference Backend**: Environment variables (`OPENPAEAN_API_URL`) allow seamless switching between the managed Paean AI cloud and self-hosted backends.
- **Modular RAG & Data Pipelines** *(Roadmap)*: Plug-and-play Vector Search and Retrieval Augmented Generation pipelines, with specialized parsers for physiological, schedule, and time-series data.

## Commercial & Hardware Ecosystem

The Open Paean core framework is released under the permissive **MIT License**. We encourage commercial distribution, modification, and integration.

### For Enterprise & Power Users

For those seeking a turnkey, managed experience with SLA guarantees, we offer the **Paean Agent Hire** platform—a fully hosted agent orchestration service built on the Open Paean core.

### The Paean Pal Zero Program

We are bridging the gap between software agents and physical reality. Subscribers to our Commercial Partner Program or Premium Developer Plan are eligible to receive the **Paean Pal Zero** hardware prototype.

- **Unlock the Metal**: Partners receive API-level root access to the Pal Zero hardware.
- **Custom Firmware**: Compile and run your custom Open Paean agent branches directly on a cellular-enabled, long-endurance wearable device.

## Quick Start

```bash
# Install globally with bun (recommended)
bun add -g openpaean

# Or use npm
npm install -g openpaean

# Or run directly with npx
npx openpaean
```

```bash
# Authenticate with your Paean AI account
openpaean login

# Launch the interactive agent
openpaean
```

For MCP server configuration and advanced usage, see the main [README](../README.md).

## License

This project is licensed under the MIT License—see the [LICENSE](../LICENSE) file for details.

<p align="center">
<sub>Built with care by the Paean Team. Redefining Human-Machine Symbiosis.</sub>
</p>
