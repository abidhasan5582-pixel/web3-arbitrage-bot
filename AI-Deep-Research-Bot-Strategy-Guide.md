# AI Deep Research & Bot Command Strategy Guide

> **Purpose:** How to command your AI (OpenCode / any AI assistant) to perform deep research and build an automated Web3 betting arbitrage system  
> **Goal:** Make your AI bot your personal research analyst, strategy builder, and eventually your arbitrage execution assistant  
> **Date:** June 2026  

---

## Table of Contents

1. [How to Use AI for Deep Research](#1-how-to-use-ai-for-deep-research)
2. [AI Command Templates (Copy-Paste Ready)](#2-ai-command-templates)
3. [Your Personal Research Pipeline](#3-your-personal-research-pipeline)
4. [Building an Arbitrage Bot with AI](#4-building-an-arbitrage-bot-with-ai)
5. [Best AI Skills/Capabilities for Success](#5-best-ai-skillscapabilities-for-success)
6. [Daily AI Workflow](#6-daily-ai-workflow)
7. [Advanced AI Strategies](#7-advanced-ai-strategies)
8. [AI Risk Management Prompts](#8-ai-risk-management-prompts)
9. [Bot Architecture Blueprint](#9-bot-architecture-blueprint)
10. [OpenCode-Specific Tips](#10-opencode-specific-tips)

---

## 1. How to Use AI for Deep Research

### The Power of AI-Assisted Research

Your AI assistant is the most powerful research tool available for betting arbitrage. It can:
- Search the web in real-time for the latest odds, platform updates, and opportunities
- Analyze and compare odds across 30+ platforms simultaneously
- Calculate arbitrage opportunities instantly with perfect math
- Monitor news feeds for events that create arb windows
- Build and maintain a custom database of odds and historical data
- Generate scripts and bots for automated monitoring

### The Key Principle: Iterative Deepening

Don't ask one massive question. Instead, use **iterative deepening** — start broad, then drill deeper into each finding:

```
Round 1: "Give me an overview of Web3 betting arbitrage in 2026"
Round 2: "Now tell me specifically about Polymarket vs sportsbook cross-arbitrage"
Round 3: "Show me the exact math for a Polymarket cross-arb with $20 bankroll"
Round 4: "What are the risks specific to this strategy?"
Round 5: "Write me a Python script to calculate these arbs automatically"
```

Each round builds on the previous one, going deeper and getting more actionable.

---

## 2. AI Command Templates

### Template 1: Market Research Commands

```
Command 1.1 — Platform Discovery:
"Search the web and give me a complete list of all Web3/crypto sports betting 
platforms available in 2026. For each platform, include: URL, supported 
blockchain, fee structure, whether they support live betting, minimum bet 
amount, and whether they require KYC. Sort by lowest fees first."

Command 1.2 — Odds Comparison:
"Compare the current odds for [EVENT NAME] across these platforms: 
Polymarket, SX Bet, Overtime, Stake, Cloudbet. Identify any arbitrage 
opportunities where the implied probabilities sum to less than 100%. 
Show the exact calculations and potential profit on a $20 bankroll."

Command 1.3 — Fee Analysis:
"Calculate the total cost (platform fee + gas fee + withdrawal fee + 
bridge fee if needed) for placing a $10 bet on each of these platforms: 
Polymarket, SX Bet, Overtime, DexWin, Stake. Show net profit for a 
2% gross arbitrage opportunity."

Command 1.4 — New Platform Evaluation:
"I found a new Web3 betting platform called [NAME]. Research it and tell me: 
1) Is it audited? By whom? 2) What is its TVL? 3) How long has it been 
operating? 4) Are there any reports of issues? 5) What is its fee structure? 
6) Would you recommend using it for arbitrage with a $20-$100 bankroll?"
```

### Template 2: Arbitrage Calculation Commands

```
Command 2.1 — Simple Arb Calculator:
"I found these odds for the same event:
- Platform A: Team X @ [ODDS_A]  
- Platform B: Team Y @ [ODDS_B]

Calculate: 1) Is this an arbitrage opportunity? 2) What is the ROI? 
3) How should I split my $[BANKROLL] between the two bets for equal 
profit regardless of outcome? 4) What is my guaranteed profit?"

Command 2.2 — 3-Way Arb Calculator:
"Calculate the arbitrage opportunity for this soccer match:
- Platform A: Home Win @ [ODDS_1]
- Platform B: Draw @ [ODDS_X]  
- Platform C: Away Win @ [ODDS_2]

Show me: 1) Implied probabilities 2) Whether arb exists 3) Optimal 
stake split 4) Guaranteed profit on $[BANKROLL]"

Command 2.3 — Web3 Specific Arb:
"Polymarket has [EVENT] with YES shares at $[PRICE]. A sportsbook has 
the opposite outcome at [ODDS]. Calculate: 1) Convert Polymarket share 
price to decimal odds 2) Is there an arb? 3) How to execute with $[AMOUNT] 
4) Factor in Polymarket's [FEE]% fee and gas costs"
```

### Template 3: Strategy Building Commands

```
Command 3.1 — Daily Plan:
"Today's date is [DATE]. Search for today's sports schedule and help me 
plan my arbitrage day. I have $[BANKROLL] spread across these platforms: 
[list]. Focus on: 1) Which events have the most books covering them 
2) Where am I most likely to find arbs 3) Specific games to target 
4) Recommended stake sizes (5% rule)"

Command 3.2 — Risk Assessment:
"I'm considering this arbitrage opportunity: [DETAILS]. Analyze the risks: 
1) Is the ROI suspiciously high (>10% = likely voided)? 2) Are both 
platforms reliable? 3) What is the execution risk? 4) Could one leg be 
voided? 5) What's my worst-case loss if one bet fails?"

Command 3.3 — Compounding Calculator:
"I'm starting with $20 and averaging [ROI]% per arb, executing [N] arbs 
per day. If I reinvest 50% of profits and withdraw 50%, project my 
bankroll growth over 6 months. Show weekly milestones and when I can 
realistically expect to reach $100, $500, and $1,000."
```

### Template 4: Bot Building Commands

```
Command 4.1 — Odds Scraper:
"Write a Python script that uses the OddsPapi free API to fetch odds 
from Polymarket and 5 major sportsbooks for NBA games today. The script 
should: 1) Fetch odds every 60 seconds 2) Calculate if any arbitrage 
exists 3) Print alerts when arb ROI > 2% 4) Save all data to a CSV file"

Command 4.2 — Arb Calculator Bot:
"Build a Node.js script that: 1) Connects to Polymarket's CLOB API 
2) Monitors sports markets 3) Compares prices with SX Bet API 4) 
Calculates arbitrage opportunities in real-time 5) Sends me a Telegram 
notification when an arb > 3% is found"

Command 4.3 — Wallet Manager:
"Create a Python script that: 1) Tracks my balances across 5 Web3 
platforms using their contracts 2) Calculates my total bankroll 3) 
Suggests rebalancing when one platform has >30% of total funds 
4) Generates a daily P&L report"
```

### Template 5: Deep Research Commands

```
Command 5.1 — Competitor Analysis:
"Research and analyze the top 10 most successful Web3 sports arbitrage 
bettors or groups. How do they operate? What tools do they use? What 
strategies have they shared publicly? What is their typical ROI and 
bankroll size? Include links to any forums, Twitter accounts, or blogs."

Command 5.2 — Regulatory Research:
"What are the current laws and regulations regarding: 1) Crypto sports 
betting in my country 2) Arbitrage betting legality 3) Tax implications 
of arbitrage profits 4) Any pending legislation that could affect Web3 
betting? Focus on the latest 2025-2026 updates."

Command 5.3 — Edge Research:
"Research statistical edges in sports betting that can be combined with 
arbitrage. Specifically: 1) Which sports have the most odds discrepancy 
between books? 2) What time of day/week has the most arb opportunities? 
3) Are there seasonal patterns? 4) What types of bets (moneyline, spread, 
totals) have the most frequent arbs? Provide data and sources."

Command 5.4 — Platform Deep Dive:
"Do a deep dive investigation of [PLATFORM NAME]. I need: 1) Smart 
contract addresses 2) Audit reports 3) Team background 4) Historical 
uptime and issues 5) User reviews from forums 6) Current TVL and volume 
7) Fee structure breakdown 8) API documentation links 9) Any known 
exploits or hacks 10) Comparison with top competitors"
```

---

## 3. Your Personal Research Pipeline

### Step-by-Step Research Workflow

Use your AI in this exact sequence to build your arbitrage operation from scratch:

```
PHASE 1: FOUNDATION RESEARCH (Day 1-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: "Give me a complete overview of Web3 sports betting arbitrage 
in 2026. Include how it works, key platforms, typical ROI, and risks."

Step 2: "List all Web3 betting platforms with their fees, chains, and 
features. Sort by which ones are best for arbitrage with a small bankroll."

Step 3: "Explain the exact math of a 2-way betting arbitrage. Show 
examples with $5, $10, and $20 bets. Include fee calculations."

Step 4: "What are the free tools available for finding arbitrage 
opportunities? Compare OddsShopper, OddsPapi, and any others."

Step 5: "What are the biggest risks in Web3 betting arbitrage and how 
do I protect my $20 investment? Give me a risk management framework."


PHASE 2: PLATFORM SETUP RESEARCH (Day 4-7)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 6: "Walk me through setting up accounts on Polymarket, SX Bet, 
and Overtime. What do I need? How do I deposit? What are the gas fees?"

Step 7: "How do I convert Polymarket share prices to decimal odds? 
Give me the exact formula and 5 worked examples."

Step 8: "Research the current welcome bonuses at crypto sportsbooks. 
Which ones can I exploit with $20 to grow my bankroll fastest?"

Step 9: "What's the cheapest way to bridge USDC from Ethereum to 
Polygon, Arbitrum, and Base? Compare bridge options and fees."

Step 10: "Create a bet tracking spreadsheet template for Google Sheets 
that tracks: event, platform A, odds A, stake A, platform B, odds B, 
stake B, total staked, return, profit, ROI%, and notes."


PHASE 3: STRATEGY RESEARCH (Week 2-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 11: "Research cross-platform arbitrage between Polymarket and 
traditional sportsbooks. How often do 3%+ arbs appear? What sports? 
What's the best execution method?"

Step 12: "What is 'news lag arbitrage' on Polymarket? How do I detect 
when Polymarket odds haven't updated after breaking news? What tools 
do I need?"

Step 13: "Explain live/in-play arbitrage step by step. Which Web3 
platforms support live betting? What's the execution speed required?"

Step 14: "How do I avoid getting my account limited (gubbed) at 
traditional sportsbooks while doing arbitrage? Give me 10 specific 
anti-gubbing techniques."

Step 15: "Research value betting as a complement to arbitrage. How is 
it different? What's the Kelly Criterion? Can I combine value betting 
with arbing for higher returns?"


PHASE 4: AUTOMATION RESEARCH (Week 3-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 16: "Does OddsPapi have a free API? Show me the documentation 
and write a Python script to fetch odds from it."

Step 17: "Write a Python arbitrage calculator that: takes two sets of 
odds, determines if an arb exists, calculates optimal stakes, and 
shows profit. Make it work for 2-way and 3-way markets."

Step 18: "How can I set up Telegram notifications from a Python script? 
Write a script that sends me a message when an arbitrage opportunity 
is detected."

Step 19: "Research Polymarket's CLOB API. Can I programmatically 
fetch market prices? Write example code to get current prices for 
sports markets."

Step 20: "Design a simple bot architecture that monitors odds across 
3 platforms, calculates arbs, and alerts me. What tech stack should 
I use? What are the costs?"
```

---

## 4. Building an Arbitrage Bot with AI

### Bot Evolution Roadmap

Your bot should evolve in stages. Don't try to build everything at once.

#### Stage 1: Manual + AI-Assisted (Month 1)

```
You do everything manually, but your AI:
- Finds arbitrage opportunities when you ask
- Calculates stakes and profits instantly  
- Tracks your bets in a spreadsheet
- Answers questions about specific opportunities
- Researches new platforms and strategies

Tools: Your AI assistant + OddsShopper free + Google Sheets
```

#### Stage 2: Semi-Automated Scanner (Month 2-3)

```
Your AI builds you a script that:
- Scrapes odds from OddsPapi API every 60 seconds
- Compares odds across platforms automatically
- Calculates arbitrage opportunities
- Sends you Telegram alerts when arbs > 2% appear
- Logs all opportunities to a CSV file

You still execute manually (place the bets yourself).

Tools: Python + OddsPapi API + Telegram Bot API + CSV
```

#### Stage 3: Full Monitoring Bot (Month 4-6)

```
Your AI builds an expanded system that:
- Monitors Polymarket CLOB + SX Bet + Overtime in real-time
- Cross-references with traditional sportsbook odds
- Calculates arbs including fees and gas
- Prioritizes opportunities by net ROI
- Sends formatted alerts with one-click execution details
- Tracks your portfolio balance across all platforms
- Generates daily/weekly P&L reports

You execute manually but have complete market awareness.

Tools: Python + Multiple APIs + Telegram + Google Sheets API + Web3 libraries
```

#### Stage 4: Auto-Execution Bot (Month 6+, Advanced)

```
⚠️ WARNING: Auto-execution is risky. Only attempt with $500+ bankroll 
and 3+ months of manual experience.

Your AI builds a bot that:
- Detects arbitrage opportunities automatically
- Executes trades on Web3 platforms via smart contracts
- Uses flashloans for zero-capital arbitrage (advanced)
- Hedges on DEXs or other platforms
- Has built-in safety limits (max bet, daily loss, etc.)

Tools: Python + Web3.py + Smart Contracts + Flashloan protocols
```

### AI Commands for Building Your Bot (Stage-by-Stage)

**Stage 2 Bot — Copy-Paste This to Your AI:**

```
"I want to build a semi-automated sports arbitrage scanner. Write me 
a Python script with the following features:

1. Use the OddsPapi free API (https://api.oddsapi.io/) to fetch odds 
   from at least 5 sportsbooks for NBA, NFL, soccer, and tennis
2. Also fetch Polymarket sports market prices if available via API
3. For each event, compare odds across all books
4. Calculate if any 2-way or 3-way arbitrage exists (implied prob < 100%)
5. For each arb found, calculate: optimal stake split, guaranteed profit, 
   ROI percentage
6. Filter out arbs below 1% ROI (not worth it after fees)
7. Flag arbs above 10% ROI (likely bookmaker error, will be voided)
8. Send a Telegram message to my chat ID [YOUR_CHAT_ID] for every arb 
   between 2-10% ROI
9. Log all opportunities with timestamps to a CSV file
10. Run in a loop, checking every 60 seconds

Include error handling, rate limiting, and clear comments. Also include 
setup instructions for getting the OddsPapi API key and Telegram bot token."
```

**Stage 3 Bot — Copy-Paste This to Your AI:**

```
"Expand my arbitrage scanner with these features:

1. Add Polymarket CLOB API integration to fetch real-time market prices
2. Add SX Bet API integration for their 0% fee odds
3. Implement cross-platform arbitrage detection (Polymarket vs sportsbooks)
4. Add fee calculation for each platform (Polymarket 0.75-1.8%, gas costs)
5. Add a dashboard (simple HTML page or terminal UI) showing:
   - Current bankroll across all platforms
   - Active arbitrage opportunities sorted by ROI
   - Today's executed arbs and P&L
   - Historical performance chart
6. Implement portfolio tracking using Web3.py to check wallet balances
   on Polygon, Arbitrum, and SX Network
7. Add a daily report generator (saved as PDF) summarizing:
   - Total arbs found vs executed
   - Total profit/loss
   - Bankroll growth chart
   - Top performing sports and platforms
   - Recommendations for tomorrow
8. Add alerts for bankroll rebalancing (when one platform has >30% of funds)
9. Add price movement alerts (when odds shift significantly, indicating 
   potential news lag arb on Polymarket)

Use: Python, web3.py, requests, pandas, matplotlib for charts, 
python-telegram-bot for alerts"
```

---

## 5. Best AI Skills/Capabilities for Success

### Essential AI Skills Ranked by Impact

| Rank | Skill/Capability | Why It's Critical | How to Activate |
|------|-----------------|-------------------|----------------|
| 1 | **Web Search** | Find real-time odds, platform updates, news | Ask "search the web for..." |
| 2 | **Code Generation** | Build scraping scripts, calculators, bots | Ask "write a Python script that..." |
| 3 | **Math/Calculation** | Instant arb calculations, compounding projections | Ask "calculate the arbitrage for..." |
| 4 | **Data Analysis** | Analyze your betting history, find patterns | Ask "analyze this CSV of my bets..." |
| 5 | **Document Creation** | Generate reports, strategy docs, tracking sheets | Ask "create a PDF report of..." |
| 6 | **API Integration** | Connect to OddsPapi, Polymarket, Telegram | Ask "write code using the X API..." |
| 7 | **Risk Assessment** | Evaluate platforms, bets, and strategies | Ask "what are the risks of..." |
| 8 | **Spreadsheet Management** | Build and maintain tracking spreadsheets | Ask "create a Google Sheets template..." |
| 9 | **Chart/Visualization** | Visualize bankroll growth, P&L trends | Ask "create a chart showing..." |
| 10 | **Monitoring/Alerts** | Set up notification systems | Ask "create a Telegram alert bot..." |

### Skill Activation Commands

Use these exact phrases to trigger your AI's best capabilities:

```
FOR WEB SEARCH:
"Search the web for the latest..."
"Find current information about..."
"What does the internet say about..."

FOR CODE GENERATION:
"Write a Python script that..."
"Build a Node.js application that..."
"Create an automation bot that..."

FOR CALCULATION:
"Calculate the exact arbitrage for..."
"Show me the math for..."
"What is the compound growth if..."

FOR ANALYSIS:
"Analyze this data and find patterns..."
"Compare these platforms and rank them..."
"Which strategy performs better and why..."

FOR DOCUMENTS:
"Generate a report about..."
"Create a PDF/DOCX document covering..."
"Build a spreadsheet template for..."

FOR CHARTS:
"Create a bar chart showing..."
"Visualize my bankroll growth..."
"Plot the comparison between..."

FOR RISK:
"What could go wrong if..."
"Assess the risk of..."
"Is [platform] safe to use? Research it."
```

### Advanced AI Skill Combinations

Combine multiple skills in one command for powerful results:

```
COMBO 1: Research + Calculate + Visualize
"Search for the top 10 NBA games today, find the best odds 
across 5 platforms, calculate all arbitrage opportunities, 
and create a chart showing potential profit by game."

COMBO 2: Code + Document + Alert
"Write a Python arbitrage scanner for Polymarket, create a 
PDF user guide for running it, and add Telegram notifications 
for when arbs are found."

COMBO 3: Analyze + Report + Strategy
"Analyze my last 30 days of betting data [attached CSV], 
identify my most profitable sports and platforms, generate 
a performance report, and suggest strategy optimizations 
for next month."
```

---

## 6. Daily AI Workflow

### Morning AI Session (15 minutes)

```
YOU SAY:
"Good morning. It's [DATE]. I have $[BANKROLL] spread across 
[PLATFORMS]. Search the web for today's sports schedule and 
help me plan my arbitrage day. Focus on: 1) Events with the 
most books covering them 2) Any breaking news that might create 
arb opportunities on Polymarket 3) My recommended daily plan 
with specific events to target and stake sizes."

AI WILL:
- Search today's sports schedule
- Check for breaking sports news
- Identify which events have most books = most arb potential
- Suggest your daily plan with specific events
- Calculate recommended stakes based on 5% rule
```

### Mid-Day AI Session (10 minutes)

```
YOU SAY:
"I've executed [N] arbs so far today. Here are the results: [DATA]. 
My current bankroll is $[AMOUNT]. Any new opportunities I should 
target this afternoon? Also check if Polymarket has any lagging 
markets based on recent news."

AI WILL:
- Analyze your morning performance
- Search for afternoon opportunities
- Check Polymarket for news-lag arbs
- Adjust your plan based on results so far
```

### Evening AI Session (15 minutes)

```
YOU SAY:
"Here's my complete day of betting data: [DATA]. Analyze my 
performance, calculate my daily P&L, update my tracking sheet, 
and give me 3 specific things I can improve tomorrow. Also, 
what events should I watch for live arbs tonight?"

AI WILL:
- Calculate exact daily P&L
- Identify which strategies worked and which didn't
- Suggest 3 actionable improvements
- Recommend tonight's live games to watch
- Generate a daily summary
```

### Weekly AI Session (30 minutes, every Sunday)

```
YOU SAY:
"Here's my full week of betting data: [DATA/CSV]. Do a complete 
weekly analysis: 1) Total P&L and ROI 2) Which sports were most 
profitable 3) Which platforms had the most arbs 4) My bankroll 
growth chart 5) Am I on track with my 6-month projection? 
6) Should I upgrade any tools? 7) What should I focus on next 
week? Generate a weekly report as a PDF."

AI WILL:
- Complete weekly performance analysis
- Create bankroll growth visualization
- Compare actual vs projected growth
- Recommend tool upgrades if justified by profit
- Generate PDF weekly report
- Plan next week's strategy
```

---

## 7. Advanced AI Strategies

### Strategy 1: News-Based Arb Detection

```
COMMAND TO AI:
"Monitor these sports news sources in real-time: 
ESPN, The Athletic, Twitter/X accounts of [TEAM beat reporters].
When breaking news hits (injury, weather, lineup change), immediately:
1) Check Polymarket for that event
2) Check 3 sportsbooks for updated odds
3) If Polymarket hasn't updated yet, calculate the arb
4) Alert me with exact execution instructions

Set up a Python script that scrapes these sources every 30 seconds 
and sends Telegram alerts."
```

### Strategy 2: Historical Odds Analysis

```
COMMAND TO AI:
"I've attached my CSV with 500+ past arbitrage opportunities. 
Analyze this data and tell me:
1) Which sports have the highest frequency of arbs?
2) Which time of day has the most arbs?
3) Which platform pairings produce the most arbs?
4) What is the average ROI by sport?
5) Are there any patterns I can exploit?
6) Based on this analysis, what should my optimal daily strategy be?
Create visualizations for each finding."
```

### Strategy 3: Multi-Platform Odds Matrix

```
COMMAND TO AI:
"Build me a real-time odds comparison matrix for today's events. 
The matrix should:
1) Show the best available odds for each outcome across all platforms
2) Highlight where the best odds combination creates an arbitrage
3) Calculate the exact arb ROI for each highlighted cell
4) Update every 60 seconds via the API
5) Display in a clean web dashboard I can keep open in my browser

Use Python + Flask/FastAPI for the backend, and simple HTML/JS for 
the frontend. Use OddsPapi API for sportsbook odds and Polymarket 
CLOB API for prediction market prices."
```

### Strategy 4: Kelly Criterion Position Sizing

```
COMMAND TO AI:
"Explain the Kelly Criterion for sports arbitrage position sizing. 
Then build me a calculator that:
1) Takes my current bankroll, the arb ROI, and my estimated edge
2) Calculates the optimal bet size using fractional Kelly (1/4 Kelly 
   for conservative approach)
3) Ensures I never bet more than 5% of bankroll on a single arb
4) Shows me the expected growth rate of my bankroll with this sizing
5) Compares full Kelly vs half Kelly vs quarter Kelly outcomes

Also create a backtest using my historical data [attached] to show 
which sizing strategy would have performed best."
```

### Strategy 5: Cross-Chain Arb Optimization

```
COMMAND TO AI:
"I have funds on Polygon, Arbitrum, and SX Network. Research and 
build a tool that:
1) Tracks my balances across all chains in real-time
2) Calculates the optimal fund allocation for maximum arb opportunity
3) Factors in bridge fees and bridge time for moving funds
4) Recommends when and how much to bridge
5) Calculates net profit after all bridge and gas fees
6) Alerts me when a cross-chain arb is profitable even after fees

Use Web3.py for on-chain balance tracking and the Stargate/1inch 
API for bridge cost estimation."
```

---

## 8. AI Risk Management Prompts

### Daily Risk Check

```
"Before I start today's arbitrage session, check these risks:
1) Are any of my platforms reporting issues? Search for '[platform] 
   down' or '[platform] problems' 
2) Are there any regulatory announcements affecting crypto betting?
3) Is there unusual market volatility that could affect my stablecoin 
   balances?
4) Have any of my regular sportsbooks changed their terms or limits?
5) Are there any smart contract alerts for the protocols I use?
Report any red flags immediately."
```

### Pre-Bet Risk Assessment

```
"I'm about to execute this arbitrage: [DETAILS].
Before I do, assess these risks:
1) Is the ROI suspiciously high? (>10% = likely voided)
2) Is either platform currently experiencing issues?
3) What is the execution risk (how fast do I need to be)?
4) Could either leg be voided?
5) What is my worst-case loss if one bet fails?
6) Am I violating the 5% rule with this stake size?
7) Are there any fees I'm missing that would eliminate the profit?
Give me a GO/NO-GO recommendation."
```

### Weekly Portfolio Risk Review

```
"Review my current portfolio and risk exposure:
- Bankroll: $[AMOUNT] spread across [PLATFORMS]
- Today's allocation: [BREAKDOWN]

Analyze:
1) Am I overexposed to any single platform? (Should be <20% each)
2) Am I overexposed to any single chain? (Should be <40% each)
3) Do I have enough gas reserves on each chain? ($5-10 minimum)
4) Should I withdraw any profits to cold storage?
5) Is my emergency fund (20% of bankroll) properly secured?
6) Are there any platform risks I should be aware of?
Provide specific rebalancing recommendations."
```

---

## 9. Bot Architecture Blueprint

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                 ARBITRAGE BOT SYSTEM                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  ODDS ENGINE  │  │  CALC ENGINE  │  │ ALERT SYS  │ │
│  │              │  │              │  │            │ │
│  │ - OddsPapi   │  │ - Arb detect │  │ - Telegram │ │
│  │ - Polymarket │  │ - Stake calc │  │ - Email    │ │
│  │ - SX Bet API │  │ - Fee calc   │  │ - Desktop  │ │
│  │ - DexWin     │  │ - ROI filter │  │ - Sound    │ │
│  │ - Web scrape │  │ - Risk check │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │         │
│         └────────┬────────┘─────────────────┘         │
│                  │                                     │
│         ┌────────▼────────┐                           │
│         │   DATA LAYER    │                           │
│         │                 │                           │
│         │ - SQLite DB     │                           │
│         │ - Bet history   │                           │
│         │ - Odds archive  │                           │
│         │ - P&L tracking  │                           │
│         └────────┬────────┘                           │
│                  │                                     │
│         ┌────────▼────────┐                           │
│         │  WALLET LAYER   │                           │
│         │                 │                           │
│         │ - Balance check │                           │
│         │ - Gas tracking  │                           │
│         │ - Rebalance     │                           │
│         │ - Withdraw      │                           │
│         └─────────────────┘                           │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### Tech Stack Recommendation

| Component | Technology | Why |
|-----------|-----------|-----|
| **Language** | Python 3.11+ | Best ecosystem for data, APIs, Web3 |
| **Odds Fetching** | requests + aiohttp | Sync and async HTTP clients |
| **Web3 Integration** | web3.py | Standard Ethereum/Polygon library |
| **Database** | SQLite → PostgreSQL | Start simple, scale when needed |
| **Alerts** | python-telegram-bot | Most reliable notification system |
| **Dashboard** | Streamlit or Flask | Quick to build, real-time updates |
| **Charts** | matplotlib + Plotly | Visualization and reporting |
| **Scheduling** | APScheduler or cron | Run scanner on schedule |
| **Deployment** | Raspberry Pi or VPS ($5/mo) | 24/7 uptime for scanner |
| **Version Control** | Git + GitHub | Track changes, backup code |

### Minimum Viable Bot (Build This First)

```python
# arb_scanner.py — Minimal Arbitrage Scanner
# Copy-paste this to your AI and ask: "Complete and improve this script"

import requests
import time
import json
from datetime import datetime

# Configuration
ODDS_API_KEY = "YOUR_ODDSAPI_KEY"
TELEGRAM_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"
TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"
MIN_ARB_ROI = 0.02  # 2% minimum
MAX_ARB_ROI = 0.10  # 10% maximum (likely voided above this)
CHECK_INTERVAL = 60  # seconds

def fetch_odds(sport="basketball_nba"):
    """Fetch odds from OddsPapi API"""
    url = f"https://api.the-odds-api.com/v4/sports/{sport}/odds/"
    params = {
        "api_key": ODDS_API_KEY,
        "regions": "us,eu,uk",
        "markets": "h2h,spreads",
        "oddsFormat": "decimal"
    }
    response = requests.get(url, params=params)
    return response.json()

def calculate_arb(odds_a, odds_b):
    """Calculate if arbitrage exists between two odds"""
    implied_prob_a = 1 / odds_a
    implied_prob_b = 1 / odds_b
    total_implied = implied_prob_a + implied_prob_b
    
    if total_implied < 1.0:
        arb_roi = 1 - total_implied
        return True, arb_roi, total_implied
    return False, 0, total_implied

def calculate_stakes(odds_a, odds_b, total_stake):
    """Calculate optimal stakes for guaranteed profit"""
    stake_a = total_stake / (1 + odds_a / odds_b)
    stake_b = total_stake - stake_a
    return stake_a, stake_b

def send_telegram_alert(message):
    """Send alert via Telegram"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": message}
    requests.post(url, json=payload)

def scan_for_arbs():
    """Main scanning loop"""
    sports = ["basketball_nba", "basketball_ncaab", "americanfootball_nfl",
              "soccer_epl", "tennis_atp", "ice_nhl"]
    
    for sport in sports:
        try:
            data = fetch_odds(sport)
            for event in data:
                # Compare odds across bookmakers
                bookmakers = event.get("bookmakers", [])
                for i in range(len(bookmakers)):
                    for j in range(i + 1, len(bookmakers)):
                        # Extract odds and check for arbs
                        # (Full implementation needed)
                        pass
        except Exception as e:
            print(f"Error scanning {sport}: {e}")

if __name__ == "__main__":
    print("Arbitrage Scanner Started!")
    while True:
        scan_for_arbs()
        time.sleep(CHECK_INTERVAL)
```

**Ask your AI to:**
1. Complete the odds comparison logic
2. Add Polymarket integration
3. Add fee calculations
4. Add proper error handling
5. Add CSV logging
6. Add stake calculation output

---

## 10. OpenCode-Specific Tips

### What Is OpenCode?

OpenCode is an AI-powered coding environment that lets you build applications using natural language. It's perfect for building your arbitrage bot because:

- You describe what you want in plain English
- The AI writes, tests, and debugs the code
- You can iterate quickly without being a programming expert
- It handles deployment and hosting

### How to Use OpenCode for Arbitrage Bot Development

#### Session 1: Foundation

```
TYPE IN OPENCODE:

"I want to build a Web3 sports betting arbitrage scanner. 
Start by creating a Python project structure with:

1. A configuration file (config.yaml) for API keys and settings
2. An odds fetcher module that uses the OddsPapi free API
3. An arbitrage calculator module
4. A Telegram alert module
5. A main scanner loop
6. Requirements.txt with all dependencies

The scanner should find arbitrage opportunities across multiple 
sportsbooks and alert me via Telegram when arbs > 2% ROI are found.
Start simple — just NBA moneyline odds for now."
```

#### Session 2: Expand

```
TYPE IN OPENCODE:

"Expand my arbitrage scanner with these features:

1. Add more sports: NFL, soccer (EPL, La Liga, Serie A), tennis, NHL
2. Add 3-way arbitrage detection for soccer (1X2 markets)
3. Add fee calculation for each platform
4. Add a SQLite database to log all opportunities
5. Add a daily summary report that gets emailed to me
6. Add error handling and retry logic for API failures
7. Make the check interval configurable per sport"
```

#### Session 3: Web3 Integration

```
TYPE IN OPENCODE:

"Add Web3 betting platform integration to my scanner:

1. Integrate Polymarket CLOB API to fetch sports market prices
2. Convert Polymarket share prices to decimal odds
3. Compare Polymarket odds with sportsbook odds for cross-platform arbs
4. Add SX Bet API integration (0% fee platform)
5. Calculate arbs factoring in Polymarket fees (0.75%) and gas costs
6. Prioritize Web3 arbs (no account limits, no gubbing risk)

Use web3.py for on-chain interactions where needed."
```

#### Session 4: Dashboard

```
TYPE IN OPENCODE:

"Build a web dashboard for my arbitrage scanner using Streamlit:

1. Live arbitrage opportunities table (auto-refreshing)
2. My portfolio balance across all platforms
3. Daily/weekly/monthly P&L chart
4. Most profitable sports and platforms pie charts
5. Bankroll growth projection chart
6. Settings panel for API keys and alert thresholds
7. Export to CSV/PDF button for reports

The dashboard should be clean, dark-themed, and mobile-responsive."
```

#### Session 5: Automation

```
TYPE IN OPENCODE:

"Add automated execution for Web3 platforms only (no traditional 
sportsbooks — too risky for auto-execution):

1. When a Polymarket vs SX Bet arb > 3% is detected:
   - Calculate optimal stakes
   - Execute buy on Polymarket CLOB
   - Execute bet on SX Bet
   - Record the transaction
2. Built-in safety limits:
   - Max single bet: 5% of bankroll
   - Max daily bets: 20
   - Max daily loss: 5% of bankroll
   - Kill switch: stop all trading if daily loss limit hit
3. All executions require manual confirmation first (safety)
4. Add detailed logging of every action
5. Add a manual override to pause/resume the bot
6. Emergency withdrawal function"
```

### OpenCode Best Practices

1. **Start Small:** Build the scanner first, test it thoroughly, then add execution
2. **Test with Fake Money:** Use testnet/sandbox mode before risking real funds
3. **Version Control:** Commit after each session so you can rollback if something breaks
4. **Security:** Never hardcode private keys — use environment variables
5. **Monitor:** Check the bot's logs daily, especially in the first week
6. **Iterate:** Ask OpenCode to improve specific modules based on real results
7. **Document:** Ask OpenCode to generate README files for each module

---

## Quick Reference: Copy-Paste Command Library

### Immediate Action Commands (Use Today)

```
1. "Search the web for the latest Web3 sports betting platforms in 2026 
   and compare their fees and features"

2. "Calculate the arbitrage opportunity for: Platform A offers Team X 
   @ 2.15, Platform B offers Team Y @ 2.20. I have $20 bankroll."

3. "Write a Python script that fetches NBA odds from the OddsPapi API 
   and finds arbitrage opportunities between sportsbooks"

4. "What are the best free arbitrage scanner tools available right now? 
   Compare their features."

5. "Create a Google Sheets template for tracking sports arbitrage bets 
   with formulas for ROI, profit, and bankroll growth"
```

### Weekly Strategy Commands

```
6. "Analyze this week's betting data [attach CSV] and tell me my 
   ROI by sport, by platform, and by arb type"

7. "Based on my current $[AMOUNT] bankroll and [N] months of data, 
   should I upgrade to a paid scanner tool? Calculate the ROI of 
   upgrading vs staying free."

8. "Search for any new Web3 betting platforms launched this month. 
   Evaluate if any are worth adding to my rotation."

9. "What regulatory changes have happened this week that could 
   affect my Web3 arbitrage operation?"

10. "Generate my weekly performance report as a PDF with charts"
```

### Bot Building Commands

```
11. "Add Polymarket CLOB API integration to my scanner. Show me 
   the API documentation and write the integration code."

12. "Build a Telegram bot that sends me arbitrage alerts. Include 
   setup instructions and a complete working script."

13. "Create a Streamlit dashboard that shows my arbitrage performance 
   with real-time updates and charts."

14. "Add automatic balance tracking across Polygon, Arbitrum, and 
   SX Network using web3.py."

15. "Implement the Kelly Criterion for optimal position sizing 
   in my arbitrage calculator, with a 1/4 fractional Kelly approach."
```

---

*This guide is for educational and informational purposes. Automated trading involves significant risk. Always test with small amounts and never risk more than you can afford to lose. Comply with all applicable laws in your jurisdiction.*
