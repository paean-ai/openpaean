# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT create a public GitHub issue

Security vulnerabilities should not be disclosed publicly until they have been addressed.

### 2. Email us directly

Send details to: **security@paean.ai**

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### 3. Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Depends on severity and complexity

## Security Best Practices for Users

### API Keys and Tokens

- **Never commit** `.env` files or config files containing tokens
- Store authentication in `~/.openpaean/config.json` (auto-excluded from git)
- Use environment variables for CI/CD: `OPENPAEAN_API_URL`

### MCP Server Configuration

Only configure MCP servers from **trusted sources**. The CLI executes commands defined in your MCP config file.

```json
// ~/.openpaean/mcp_config.json
{
  "mcpServers": {
    "trusted-server": {
      "command": "npx",
      "args": ["-y", "trusted-package@latest"]
    }
  }
}
```

### Network Security

- All API communication uses HTTPS by default
- JWT tokens are stored locally and transmitted via Authorization headers
- Tokens can be revoked server-side at any time

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities.
