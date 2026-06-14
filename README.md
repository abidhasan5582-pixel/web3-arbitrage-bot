# Web3 Sports Betting Arbitrage Telegram Bot

> 🤖 24/7 Arbitrage Scanner with Telegram Alerts  
> 🚀 Deploy on Railway via GitHub  
> 💰 Free to run (uses free OddsPapi API)

## Features

- 📡 **Auto-scanning** — Scans odds every 60 seconds across 12+ sports
- 🎯 **Arbitrage detection** — Finds 2-way moneyline surebets automatically
- 📱 **Telegram alerts** — Instant notifications when arbs are found
- 🌐 **Web3 support** — Polymarket, SX Bet, Overtime integration
- 💰 **Bankroll management** — 5% risk rule built-in
- 🧠 **AI strategy** — Daily strategy and risk analysis
- 📊 **Performance tracking** — Daily/weekly P&L reports
- 🏥 **Health check** — Railway-compatible keep-alive

## Quick Start

### 1. Get API Keys

| Key | Where to Get | Cost |
|-----|-------------|------|
| Telegram Bot Token | @BotFather on Telegram | Free |
| Telegram Chat ID | @userinfobot on Telegram | Free |
| OddsPapi Key | [the-odds-api.com](https://the-odds-api.com/) | Free (500 req/mo) |

### 2. Deploy on Railway

1. Fork this repo on GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your forked repo
5. Add environment variables (see below)
6. Railway auto-deploys!

### 3. Environment Variables

```
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
ODDS_API_KEY=your-oddsapi-key
BANKROLL=20
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/scan` | Scan all sports now |
| `/scan nba` | Scan NBA only |
| `/arbs` | Show recent opportunities |
| `/bankroll` | Show current bankroll |
| `/bankroll 50` | Update bankroll |
| `/calculate 2.15 2.20` | Calculate arb for two odds |
| `/strategy` | AI daily strategy |
| `/report` | Today's P&L |
| `/weekly` | Weekly performance |
| `/alerts on/off` | Toggle notifications |
| `/auto on/off` | Toggle auto-scanning |
| `/settings` | Current settings |
| `/platforms` | Supported platforms |
| `/riskcheck` | Risk assessment |
| `/status` | Bot uptime & stats |
| `/help` | All commands |

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your keys

# Run the bot
npm start

# Or with auto-restart for development
npm run dev
```

## Project Structure

```
├── bot.js           # Main Telegram bot
├── arbitrage.js     # Arb calculation engine
├── oddsFetcher.js   # API odds fetching
├── aiAnalyzer.js    # AI analysis & formatting
├── database.js      # SQLite data storage
├── config.js        # Configuration
├── package.json     # Dependencies
├── Procfile         # Railway process
├── railway.json     # Railway config
└── .env.example     # Env template
```

## Architecture

```
Railway (24/7) → bot.js → oddsFetcher.js → OddsPapi API
                            ↓
                      arbitrage.js → Calculate arbs
                            ↓
                      aiAnalyzer.js → Format messages
                            ↓
                      Telegram API → Your phone 📱
```

## Supported Platforms

**Web3 (No Limits):** Polymarket, SX Bet, Overtime, DexWin, Azuro, BetDEX  
**Crypto Sportsbooks:** Stake, Cloudbet, BC.Game, Rollbit  
**Traditional:** Pinnacle, Betfair, BetMGM, DraftKings, and 30+ more via OddsPapi

## Risk Management

- ✅ 5% rule: Never risk more than 5% of bankroll per arb
- ✅ ROI filter: Only alert 2-10% arbs (below 2% not worth it, above 10% likely voided)
- ✅ Net profit calculation: Factors in platform fees and gas costs
- ✅ GO/NO-GO verdict: Each arb includes a risk assessment

## License

MIT
