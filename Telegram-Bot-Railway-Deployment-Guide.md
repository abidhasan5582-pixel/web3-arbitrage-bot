# Web3 Arbitrage Telegram Bot + Railway Deployment Guide

> **Control your arbitrage scanner from Telegram — anytime, anywhere**  
> **Deploy on Railway via GitHub — runs 24/7 in the cloud**  
> **Date:** June 2026  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Complete Project File Structure](#2-project-file-structure)
3. [Setup: Telegram Bot Creation](#3-telegram-bot-creation)
4. [Setup: GitHub Repository](#4-github-repository)
5. [Setup: Railway Deployment](#5-railway-deployment)
6. [Bot Commands Reference](#6-bot-commands-reference)
7. [Environment Variables Guide](#7-environment-variables-guide)
8. [How It All Connects](#8-how-it-all-connects)
9. [Advanced: Connect Puter.js Dashboard to Bot](#9-connect-puterjs-to-bot)
10. [Monitoring & Troubleshooting](#10-monitoring-troubleshooting)

---

## 1. Architecture Overview

### How Everything Connects

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR COMPLETE SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐       ┌──────────────────────┐        │
│  │   TELEGRAM BOT       │       │   PUTER.JS DASHBOARD  │        │
│  │   (Railway 24/7)     │◄─────►│   (Browser-based)     │        │
│  │                      │  sync │                       │        │
│  │  - /scan             │       │  - Visual UI          │        │
│  │  - /arbs             │       │  - AI Research        │        │
│  │  - /bankroll         │       │  - Manual Calculator  │        │
│  │  - /strategy         │       │  - Bet Tracker        │        │
│  │  - /report           │       │  - Cloud Storage      │        │
│  │  - /alerts on/off    │       │                       │        │
│  └──────────┬───────────┘       └───────────────────────┘        │
│             │                                                    │
│             │ fetches odds                                       │
│             ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐        │
│  │              ODDS & DATA SOURCES                      │        │
│  │                                                       │        │
│  │  - OddsPapi API (free) ─── NBA, NFL, Soccer, Tennis  │        │
│  │  - Polymarket CLOB ──────── Web3 prediction markets  │        │
│  │  - SX Bet API ───────────── 0% fee sportsbook        │        │
│  │  - Overtime Markets ──────── Arbitrum/Base betting    │        │
│  │  - CoinGecko API ────────── Crypto prices            │        │
│  └──────────────────────────────────────────────────────┘        │
│             │                                                    │
│             │ sends alerts                                       │
│             ▼                                                    │
│  ┌──────────────────────┐                                       │
│  │   YOUR PHONE          │                                       │
│  │   Telegram App        │                                       │
│  │                       │                                       │
│  │  🔔 Arb found: 4.2%  │                                       │
│  │  Lakers @ 2.15       │                                       │
│  │  Celtics @ 2.20      │                                       │
│  │  Profit: $0.84       │                                       │
│  │  /execute to confirm │                                       │
│  └──────────────────────┘                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Telegram Bot + Railway?

| Feature | Telegram Bot on Railway | Puter.js Dashboard Only |
|---------|------------------------|------------------------|
| **24/7 monitoring** | ✅ Always running on Railway | ❌ Only when browser is open |
| **Mobile alerts** | ✅ Push notifications to phone | ❌ Must check browser tab |
| **Instant execution** | ✅ One-tap from notification | ❌ Must open laptop |
| **Auto-scanning** | ✅ Every 60 seconds, always | ⚠️ Only while page is open |
| **Cost** | Railway free tier = $0 | Free |
| **Best of both** | Use BOTH for maximum coverage | |

---

## 2. Complete Project File Structure

```
arb-telegram-bot/
├── bot.js                  # Main Telegram bot (core engine)
├── arbitrage.js            # Arbitrage calculation module
├── oddsFetcher.js          # Odds fetching from all APIs
├── aiAnalyzer.js           # AI-powered analysis (Puter.js compatible)
├── database.js             # SQLite database for tracking
├── config.js               # Configuration management
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
├── Procfile                # Railway process definition
├── railway.json            # Railway configuration
├── .gitignore              # Git ignore file
└── README.md               # Project documentation
```

---

## 3. Setup: Telegram Bot Creation

### Step 1: Create Your Bot on Telegram

```
1. Open Telegram and search for @BotFather
2. Send the command: /newbot
3. BotFather asks for a name → Type: Web3 Arb Scanner
4. BotFather asks for a username → Type: web3_arb_yourname_bot
5. BotFather gives you a TOKEN like: 7123456789:AAH...
6. SAVE THIS TOKEN — you'll need it for Railway!
```

### Step 2: Get Your Chat ID

```
1. Search for @userinfobot on Telegram
2. Send any message to it
3. It replies with your Chat ID (a number like 123456789)
4. SAVE THIS — you'll need it to receive messages!
```

### Step 3: Test Your Bot

```
1. Open your bot on Telegram
2. Click "Start" or send /start
3. Your bot should reply (after deployment)
```

---

## 4. Setup: GitHub Repository

### Step 1: Create GitHub Repository

```
1. Go to github.com and sign in
2. Click "New Repository"
3. Name: arb-telegram-bot
4. Make it PRIVATE (your tokens will be in env vars, but still)
5. Don't initialize with README (we'll push our own)
6. Click "Create Repository"
```

### Step 2: Push Code to GitHub

```bash
# Navigate to your project
cd arb-telegram-bot

# Initialize git
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit - Web3 Arbitrage Telegram Bot"

# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/arb-telegram-bot.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## 5. Setup: Railway Deployment

### Step 1: Sign Up for Railway

```
1. Go to railway.app
2. Sign up with your GitHub account
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your arb-telegram-bot repository
6. Railway auto-detects Node.js and deploys!
```

### Step 2: Add Environment Variables

```
In Railway Dashboard → Your Project → Variables tab, add:

TELEGRAM_BOT_TOKEN=7123456789:AAH-your-token-here
TELEGRAM_CHAT_ID=123456789
ODDS_API_KEY=your-oddsapi-key
BANKROLL=20
MIN_ARB_ROI=2
MAX_ARB_ROI=10
SCAN_INTERVAL=60
ALERTS_ENABLED=true
```

### Step 3: Deploy

```
Railway auto-deploys when you push to GitHub!

Every time you run:
  git add .
  git commit -m "update"
  git push

Railway automatically redeploys your bot with the latest code.
```

---

## 6. Bot Commands Reference

| Command | What It Does | Example |
|---------|-------------|---------|
| `/start` | Welcome message + status | `/start` |
| `/scan` | Scan odds NOW for arbs | `/scan` |
| `/scan nba` | Scan specific sport | `/scan nba` |
| `/scan soccer` | Scan soccer odds | `/scan soccer` |
| `/arbs` | Show current arb opportunities | `/arbs` |
| `/bankroll` | Show current bankroll | `/bankroll` |
| `/bankroll 50` | Update bankroll to $50 | `/bankroll 50` |
| `/calculate 2.15 2.20` | Calculate arb for two odds | `/calculate 2.15 2.20` |
| `/strategy` | AI generates daily strategy | `/strategy` |
| `/report` | Get today's P&L report | `/report` |
| `/weekly` | Get weekly performance | `/weekly` |
| `/alerts on` | Enable push notifications | `/alerts on` |
| `/alerts off` | Disable notifications | `/alerts off` |
| `/platforms` | List all supported platforms | `/platforms` |
| `/settings` | Show current settings | `/settings` |
| `/auto on` | Start auto-scanning (60s) | `/auto on` |
| `/auto off` | Stop auto-scanning | `/auto off` |
| `/help` | Show all commands | `/help` |
| `/status` | Bot uptime + scan count | `/status` |

---

## 7. Environment Variables Guide

### Required Variables

| Variable | Where to Get | Example |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | @BotFather on Telegram | `7123456789:AAH...` |
| `TELEGRAM_CHAT_ID` | @userinfobot on Telegram | `123456789` |
| `ODDS_API_KEY` | the-odds-api.com (free) | `abc123def456` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BANKROLL` | `20` | Your starting bankroll |
| `MIN_ARB_ROI` | `2` | Minimum arb ROI to alert (percent) |
| `MAX_ARB_ROI` | `10` | Maximum arb ROI (likely voided above) |
| `SCAN_INTERVAL` | `60` | Auto-scan interval in seconds |
| `ALERTS_ENABLED` | `true` | Enable/disable Telegram alerts |
| `NODE_ENV` | `production` | Environment mode |

### How to Get a Free OddsPapi Key

```
1. Go to https://the-odds-api.com/
2. Sign up for free
3. Get your API key (500 free requests/month)
4. Add to Railway environment variables
```

---

## 8. How It All Connects

### The Complete Data Flow

```
[Railway Server - 24/7]
     │
     ├── Every 60 seconds:
     │   ├── Fetch NBA odds from OddsPapi
     │   ├── Fetch soccer odds from OddsPapi
     │   ├── Fetch tennis odds from OddsPapi
     │   ├── Fetch NFL odds from OddsPapi
     │   ├── Fetch Polymarket sports markets
     │   └── Fetch SX Bet active markets
     │
     ├── Calculate arbitrage for every odds pair:
     │   ├── For each event, compare all bookmaker odds
     │   ├── Check if implied probabilities sum to < 100%
     │   ├── Calculate optimal stake split
     │   ├── Filter by ROI range (2-10%)
     │   └── Save to SQLite database
     │
     ├── If arb found AND alerts enabled:
     │   └── Send Telegram notification:
     │       "🎯 ARB FOUND: 4.2% ROI
     │        Lakers vs Celtics
     │        Platform A: 2.15 | Platform B: 2.20
     │        Stake: $0.87 + $0.94 = $1.81
     │        Profit: $0.07 guaranteed
     │        ⚡ Execute NOW — window closing!"
     │
     └── When you send commands:
         ├── /scan → triggers immediate scan
         ├── /arbs → shows cached opportunities
         ├── /bankroll 50 → updates bankroll
         ├── /calculate 2.15 2.20 → runs calculator
         └── /strategy → calls AI for analysis

[Your Phone - Telegram App]
     │
     └── You receive alerts and control the bot
         from anywhere in the world!
```

---

## 9. Advanced: Connect Puter.js Dashboard to Bot

### How to Sync Both Systems

Your **Telegram bot** runs 24/7 on Railway and sends you alerts.  
Your **Puter.js dashboard** runs in your browser for deep research and visual analysis.

They share data through a simple API:

```
┌──────────────┐         ┌──────────────┐
│ Telegram Bot  │  HTTP   │ Puter.js App  │
│ (Railway)     │◄───────►│ (Browser)     │
│               │  API    │               │
│ - Scans 24/7  │         │ - Visual UI   │
│ - Sends alerts│         │ - AI Research │
│ - Quick cmds  │         │ - Deep analysis│
└──────────────┘         └──────────────┘
```

### Add a Simple API to Your Bot

Add this to `bot.js` to share data with your Puter.js dashboard:

```javascript
// Simple API endpoint for Puter.js dashboard
const express = require('express');
const apiApp = express();
apiApp.use(express.json());

// Get current opportunities
apiApp.get('/api/arbs', (req, res) => {
    res.json(db.getRecentArbs(20));
});

// Get bankroll
apiApp.get('/api/bankroll', (req, res) => {
    res.json({ bankroll: config.bankroll });
});

// Update bankroll from dashboard
apiApp.post('/api/bankroll', (req, res) => {
    config.bankroll = req.body.amount;
    db.saveSetting('bankroll', config.bankroll);
    res.json({ success: true, bankroll: config.bankroll });
});

// Get stats
apiApp.get('/api/stats', (req, res) => {
    res.json(db.getDailyStats());
});

const API_PORT = process.env.API_PORT || 3001;
apiApp.listen(API_PORT, () => {
    console.log(`API running on port ${API_PORT}`);
});
```

Then in your Puter.js dashboard, fetch from the bot's API:

```javascript
// In your Puter.js HTML file
async function fetchBotData() {
    const response = await puter.net.fetch(
        'https://your-bot.up.railway.app/api/arbs'
    );
    const arbs = await response.json();
    // Display in dashboard
}
```

---

## 10. Monitoring & Troubleshooting

### Check Bot Status on Railway

```
1. Go to railway.app → Your Project
2. Click on your bot service
3. Click "Deployments" tab — see all deployments
4. Click "Logs" tab — see real-time bot logs
5. Click "Variables" tab — update environment variables
```

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Bot not responding | Deployment failed | Check Railway logs for errors |
| No alerts received | Chat ID wrong | Re-check with @userinfobot |
| "API limit reached" | OddsPapi free tier (500/mo) | Reduce scan frequency or upgrade |
| Bot goes offline | Railway free tier sleeps | Add health check ping |
| Wrong arb calculations | Odds format mismatch | Ensure decimal odds (not American) |
| Duplicate alerts | Multiple instances running | Check Railway for duplicate deploys |

### Keep Bot Alive on Railway Free Tier

Railway free tier may sleep after inactivity. Add a keep-alive ping:

```javascript
// Add to bot.js
const keepAlive = () => {
    const url = `https://your-bot.up.railway.app/health`;
    fetch(url).catch(() => {});
};
setInterval(keepAlive, 300000); // Ping every 5 minutes
```

### Update Your Bot

```bash
# Make changes to your code
# Then push to GitHub:
git add .
git commit -m "Add new feature"
git push

# Railway auto-deploys from GitHub!
# Check Railway dashboard for deployment status
```

---

## Quick Deploy Checklist

```
□ Create Telegram bot via @BotFather → Get TOKEN
□ Get your Chat ID via @userinfobot → Get CHAT_ID
□ Get free OddsPapi API key → Get API_KEY
□ Create GitHub repo → Push code
□ Sign up for Railway → Connect GitHub repo
□ Add environment variables in Railway
□ Deploy → Bot starts running 24/7!
□ Send /start to your bot on Telegram → Verify it works
□ Send /auto on → Start auto-scanning
□ Send /alerts on → Enable push notifications
□ You're live! 🎉
```
