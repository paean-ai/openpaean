# Use Case: Autonomous Credits Self-Top-Up

> An OpenPaean agent monitors its own credits balance and autonomously tops up via USDC on-chain transfer when running low — using `paean-pay-mcp`.

## Overview

AI agents running on Paean consume **credits** for every inference call. When credits run out, the agent stops working. This use case demonstrates how an agent can:

1. **Check its own credits balance** via the OpenPaean credits API
2. **Detect low-balance conditions** and decide to top up
3. **Send USDC** to the Paean deposit address using `paean-pay-mcp`
4. **Verify the deposit** was credited to its account

The result is a **self-sustaining agent** that never runs out of credits as long as its wallet has USDC.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   OpenPaean Agent                      │
│                                                        │
│  1. openpaean credits --json                           │
│     → { credits: 5, totalCredits: 100 }               │
│     → "Credits low, need to top up"                    │
│                                                        │
│  2. openpaean credits deposit-info --json              │
│     → { networks: { base: { depositAddress: "0x…" }}} │
│                                                        │
│  3. MCP: send_usdc(to: "0x…", amount: "10.00")        │
│     → { txHash: "0xabc…", explorerUrl: "…" }          │
│                                                        │
│  4. openpaean credits deposit-poll --json              │
│     → { credits: 105, deposits: [{ status: "confirmed" }] }│
│                                                        │
└──────────────────────────────────────────────────────┘
         │                           │
         │ Credits API               │ paean-pay-mcp
         ▼                           ▼
  ┌─────────────┐           ┌─────────────────┐
  │  Paean API   │           │  Base / Solana   │
  │  (zero-api)  │           │  Blockchain      │
  └─────────────┘           └─────────────────┘
```

## Prerequisites

1. **OpenPaean CLI** installed and logged in:

```bash
npm install -g openpaean
openpaean login
```

2. **paean-pay-mcp** configured in your MCP config with a funded wallet:

```json
// ~/.openpaean/mcp_config.json
{
  "mcpServers": {
    "payment": {
      "command": "npx",
      "args": ["-y", "paean-pay-mcp"],
      "env": {
        "PAYMENT_PRIVATE_KEY_BASE": "0xYourPrivateKey",
        "PAYMENT_NETWORK": "mainnet"
      }
    }
  }
}
```

Or using a mnemonic:

```json
{
  "mcpServers": {
    "payment": {
      "command": "npx",
      "args": ["-y", "paean-pay-mcp"],
      "env": {
        "PAYMENT_MNEMONIC": "your twelve word mnemonic phrase here ...",
        "PAYMENT_NETWORK": "mainnet"
      }
    }
  }
}
```

3. The wallet must hold **USDC** on Base or Solana (+ small amount of ETH/SOL for gas).

## Step-by-Step Walkthrough

### Step 1: Check Credits Balance

```bash
openpaean credits --json
```

Response:

```json
{
  "credits": 5,
  "totalCredits": 100,
  "subscriptionTier": "free",
  "canRecover": false,
  "nextRecoveryAt": "2026-03-01T00:00:00Z",
  "recoveryIntervalHours": 24
}
```

### Step 2: Get Deposit Address

```bash
openpaean credits deposit-info --json
```

Response:

```json
{
  "networks": {
    "base": {
      "name": "Base (Coinbase L2)",
      "depositAddress": "0xPaeanDepositAddress",
      "requiredConfirmations": 12,
      "usdcContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    },
    "solana": {
      "name": "Solana",
      "depositAddress": "PaeanSolanaDepositAddress",
      "requiredConfirmations": 32,
      "usdcMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    }
  },
  "conversionRate": "1 USDC = 10 credits",
  "conversionRateNumeric": 10,
  "minimumDeposit": 1
}
```

### Step 3: Send USDC via paean-pay-mcp

The agent calls the `send_usdc` MCP tool:

```
→ send_usdc(to: "0xPaeanDepositAddress", amount: "10.00", chain: "base")
```

Response:

```json
{
  "txHash": "0xabc123...",
  "chain": "base",
  "from": "0xAgentWallet",
  "to": "0xPaeanDepositAddress",
  "amount": "10.00",
  "explorerUrl": "https://basescan.org/tx/0xabc123..."
}
```

### Step 4: Verify Deposit Credited

```bash
openpaean credits deposit-poll --json
```

Response:

```json
{
  "credits": 105,
  "deposits": [
    {
      "network": "base",
      "txHash": "0xabc123...",
      "usdcAmount": 10,
      "creditsAwarded": 100,
      "status": "confirmed",
      "confirmations": 15,
      "requiredConfirmations": 12
    }
  ]
}
```

## Agent Prompt Template

Add this to your agent's system prompt or `AGENT.md`:

```markdown
## Credits Management

You have access to the `payment` MCP server for sending USDC.

**Before each major task**, check your credits balance:
- Run `openpaean credits --json`
- If credits < 20, initiate a top-up:
  1. Run `openpaean credits deposit-info --json` to get the deposit address
  2. Use `send_usdc` to send 10 USDC to the deposit address on Base
  3. Wait 30 seconds, then run `openpaean credits deposit-poll --json` to verify
  4. Continue with the task once credits are confirmed

Never spend more than 50 USDC per top-up. Always verify the deposit was credited
before proceeding.
```

## Testnet Testing

For development, use testnet mode:

```json
{
  "mcpServers": {
    "payment": {
      "command": "npx",
      "args": ["-y", "paean-pay-mcp"],
      "env": {
        "PAYMENT_MNEMONIC": "test test test test test test test test test test test junk",
        "PAYMENT_NETWORK": "testnet"
      }
    }
  }
}
```

Get test USDC from [Circle's faucet](https://faucet.circle.com/).

## Security Considerations

- The agent's wallet private key or mnemonic is stored only in the MCP config environment variables — never in prompts or tool outputs.
- Set a maximum top-up amount in your agent prompt to prevent runaway spending.
- Consider using a dedicated hot-wallet with limited funds for the agent.
- Monitor deposit history regularly: `openpaean credits deposit-history`.
