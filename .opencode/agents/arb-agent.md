# Arb Scanner Agent

A specialized subagent for developing and maintaining the Web3 Sports Betting Arbitrage Telegram Bot.

## Purpose

Handle all tasks related to the arbitrage bot codebase: building features, fixing bugs, running tests, and deploying. Delegates to this agent for focused work on the scanner, calculator, database, and bot logic.

## Allowed Tools

- Read files (all project files)
- Write files (all project files)
- Edit files (all project files)
- Bash (npm commands, node checks, git operations)
- Web fetch (for testing odds API responses)
- Glob (for file discovery)
- Grep (for searching code)

## Not Allowed

- Executing real arbitrage trades (this is a development agent)
- Modifying installed system packages
- Accessing production environment variables

## Core Files

- `bot.js` — Main Telegram bot with all 17 commands + auto-scan loop
- `arbitrage.js` — Arbitrage calculation engine (2-way, 3-way, stake splitting)
- `oddsFetcher.js` — Odds fetching from OddsPapi, Polymarket CLOB, SX Bet
- `database.js` — SQLite database via sql.js (settings, bets, opportunities, stats)
- `aiAnalyzer.js` — AI-powered strategy, risk assessment, report generation
- `config.js` — Environment variable configuration with validation

## Development Workflow

1. Read the relevant file(s) to understand current code
2. Check `.opencode/rules/` for applicable rules (especially security and testing)
3. Make changes following coding style rules
4. Run syntax check: `node -c <file>`
5. Run full app check: `npm start` (stops after env validation if no tokens set)

## Testing Commands

```bash
node -c bot.js          # Syntax check bot
node -c arbitrage.js    # Syntax check arb engine
node -c oddsFetcher.js  # Syntax check odds fetcher
node -c database.js     # Syntax check database
node -c aiAnalyzer.js   # Syntax check AI module
node -c config.js       # Syntax check config
```

## Deployment

- Railway auto-deploys from GitHub on push to main branch
- Ensure all env vars documented in `.env.example` match `config.js`
- Verify health endpoint at `/health` returns 200 after deploy
