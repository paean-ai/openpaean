# Use Case: Autonomous DEX Arbitrage

> An OpenPaean agent uses `paean-dex-mcp` for on-chain swap execution and `bitget-wallet-mcp` for cross-DEX price discovery, security audits, and aggregated routing — enabling fully autonomous arbitrage strategies.

## Overview

DEX arbitrage opportunities arise when the same token is priced differently across exchanges or routing paths. This use case demonstrates how an AI agent can:

1. **Discover price discrepancies** using `bitget-wallet-mcp` market data
2. **Verify token safety** via security audits before trading
3. **Get optimal swap quotes** from both Jupiter/Uniswap (via `paean-dex-mcp`) and Bitget's aggregated router
4. **Execute trades** to capture the spread
5. **Monitor positions** and adjust strategy

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      OpenPaean Agent                          │
│                                                                │
│  ┌─────────────────────┐     ┌──────────────────────────┐    │
│  │  bitget-wallet-mcp   │     │    paean-dex-mcp          │    │
│  │                       │     │                            │    │
│  │  • token_price        │     │  • get_token_price         │    │
│  │  • batch_token_info   │     │  • get_swap_quote          │    │
│  │  • kline              │     │  • execute_swap            │    │
│  │  • tx_info            │     │  • get_token_balance       │    │
│  │  • rankings           │     │  • get_transaction_status  │    │
│  │  • security_audit     │     │  • list_common_tokens      │    │
│  │  • swap_quote         │     │                            │    │
│  │  • liquidity          │     └──────────┬─────────────────┘    │
│  └──────────┬────────────┘                │                      │
│             │                              │                      │
│     Price Discovery              DEX Execution                   │
│     Security Checks              (Uniswap v3 / Jupiter)         │
│     Cross-DEX Quotes                                             │
└─────────────┼──────────────────────┼─────────────────────────┘
              │                      │
              ▼                      ▼
    ┌─────────────────┐    ┌─────────────────┐
    │  Bitget API      │    │  Base / Solana   │
    │  (market data)   │    │  Blockchain      │
    └─────────────────┘    └─────────────────┘
```

## Prerequisites

### 1. OpenPaean CLI

```bash
npm install -g openpaean
openpaean login
```

### 2. MCP Configuration

Add both MCP servers to `~/.openpaean/mcp_config.json`:

```json
{
  "mcpServers": {
    "dex": {
      "command": "npx",
      "args": ["-y", "paean-dex-mcp"],
      "env": {
        "DEX_MNEMONIC": "${WALLET_MNEMONIC}",
        "DEX_NETWORK": "mainnet",
        "DEX_SLIPPAGE_BPS": "50"
      }
    },
    "bitget": {
      "command": "uvx",
      "args": ["bitget-wallet-mcp"],
      "env": {
        "BITGET_WALLET_API_KEY": "${BITGET_API_KEY}",
        "BITGET_WALLET_API_SECRET": "${BITGET_API_SECRET}"
      }
    }
  }
}
```

You can also use private keys instead of mnemonic:

```json
{
  "dex": {
    "env": {
      "DEX_PRIVATE_KEY_BASE": "0xYourBaseKey",
      "DEX_PRIVATE_KEY_SOLANA": "YourSolanaBase58Key"
    }
  }
}
```

### 3. Funded Wallet

The wallet needs:
- **USDC** and **ETH** on Base (for gas + trading capital)
- **USDC** and **SOL** on Solana (for gas + trading capital)

## Arbitrage Strategy: Step by Step

### Phase 1: Market Scanning

Use `bitget-wallet-mcp` for broad market intelligence.

**Find trending tokens:**

```
→ bitget: rankings(chain: "base", type: "gainers", limit: 20)
```

**Get batch price data:**

```
→ bitget: batch_token_info(tokens: [
    { chain: "base", address: "0x..." },
    { chain: "solana", address: "..." }
  ])
```

**Check trading volume:**

```
→ bitget: tx_info(chain: "base", address: "0xTokenAddress")
```

### Phase 2: Opportunity Identification

Compare prices across sources.

**Get Uniswap price (via paean-dex-mcp):**

```
→ dex: get_token_price(chain: "base", token_address: "0xTokenAddress")
→ Result: { priceUsd: "1.52", source: "uniswap-v3" }
```

**Get Bitget aggregated price:**

```
→ bitget: token_price(chain: "base", address: "0xTokenAddress")
→ Result: { price: 1.48 }
```

**Spread = (1.52 - 1.48) / 1.48 = 2.7%** — potential arbitrage if > gas + slippage costs.

### Phase 3: Pre-Trade Verification

**Security audit (critical — never skip this):**

```
→ bitget: security_audit(chain: "base", address: "0xTokenAddress")
→ Result: {
    isHoneypot: false,
    canTakeBackOwnership: false,
    hasBlacklist: false,
    buyTax: "0%",
    sellTax: "0%"
  }
```

**Check liquidity depth:**

```
→ bitget: liquidity(chain: "base", address: "0xTokenAddress")
→ Result: { totalLiquidity: "$2.5M", pools: [...] }
```

**Get swap quote with slippage estimate:**

```
→ dex: get_swap_quote(
    chain: "base",
    input_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
    output_token: "0xTokenAddress",
    input_amount: "100",
    slippage_bps: 50
  )
→ Result: {
    outputAmount: "65.78",
    minOutputAmount: "65.45",
    priceImpactPct: "0.12"
  }
```

### Phase 4: Execution

**Buy on the cheaper source:**

```
→ dex: execute_swap(
    chain: "base",
    input_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
    output_token: "0xTokenAddress",
    input_amount: "100",
    slippage_bps: 50
  )
→ Result: { txHash: "0x...", outputAmount: "65.78 TOKEN" }
```

**Sell on the more expensive source (or same DEX after price moves):**

```
→ dex: execute_swap(
    chain: "base",
    input_token: "0xTokenAddress",
    output_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
    input_amount: "65.78",
    slippage_bps: 50
  )
→ Result: { txHash: "0x...", outputAmount: "102.35 USDC" }
```

**Profit: 2.35 USDC (2.35%) minus gas fees.**

### Phase 5: Monitoring

**Check wallet balance:**

```
→ dex: get_token_balance(chain: "base", token_address: "0x833589...USDC")
```

**Verify transaction status:**

```
→ dex: get_transaction_status(chain: "base", tx_hash: "0x...")
```

## Agent Prompt Template

Add this to your agent's system prompt or `AGENT.md`:

```markdown
## DEX Arbitrage Strategy

You are an autonomous trading agent with access to two MCP servers:
- `dex` (paean-dex-mcp): Execute swaps on Uniswap v3 (Base) and Jupiter (Solana)
- `bitget` (bitget-wallet-mcp): Market data, security audits, cross-DEX quotes

### Rules

1. **Never trade without a security audit.** Always call `security_audit` first.
   Abort if: isHoneypot=true, sellTax > 5%, hasBlacklist=true, or canTakeBackOwnership=true.

2. **Minimum spread threshold: 1.5%** after estimated gas + slippage.
   Skip if price impact > 0.5%.

3. **Maximum position size: 500 USDC per trade.** Never risk more than 5% of wallet.

4. **Always get a quote before executing.** Call `get_swap_quote` and verify
   the output before calling `execute_swap`.

5. **Monitor after execution.** Check `get_transaction_status` within 60 seconds.

6. **Abort conditions:**
   - 3 consecutive failed trades → pause for 1 hour
   - Wallet balance < 50 USDC → stop trading
   - Any security audit fails → blacklist the token

### Scanning Loop

Every 5 minutes:
1. Check `rankings` for top gainers on Base and Solana
2. For each candidate: `security_audit` → `token_price` comparison → `get_swap_quote`
3. If spread > threshold and checks pass → `execute_swap`
4. Log all trades with timestamps and P&L
```

## Cross-Chain Arbitrage

Same token on Base vs Solana can have price discrepancies. The agent can:

1. Buy USDC→TOKEN on the cheaper chain via `paean-dex-mcp`
2. Bridge TOKEN cross-chain (manual or via bridge MCP)
3. Sell TOKEN→USDC on the more expensive chain

For same-chain arbitrage (different DEX routing), use `bitget-wallet-mcp`'s `swap_quote` for Bitget's aggregated routing vs `paean-dex-mcp`'s Uniswap/Jupiter direct routing.

## Risk Management

| Risk | Mitigation |
|------|-----------|
| Honeypot tokens | Always run `security_audit` before first trade |
| High sell tax | Check `buyTax`/`sellTax` in security audit |
| Low liquidity | Check `liquidity` depth; skip if < $100K |
| MEV / sandwich attacks | Use reasonable slippage (50-100 bps); avoid very large trades |
| Smart contract risk | Only trade tokens with verified contracts |
| Stale prices | Always get a fresh `get_swap_quote` immediately before execution |
| Gas spikes | Monitor ETH/SOL balance; pause if gas costs erode profits |

## Security Considerations

- Private keys and mnemonics are stored only in MCP config env vars — never exposed in agent output.
- Use a **dedicated hot-wallet** with limited capital for automated trading.
- Set conservative position limits in the agent prompt.
- Review trade logs regularly.
- Test thoroughly on testnet before mainnet deployment:

```json
{
  "env": {
    "DEX_MNEMONIC": "test mnemonic ...",
    "DEX_NETWORK": "testnet"
  }
}
```
