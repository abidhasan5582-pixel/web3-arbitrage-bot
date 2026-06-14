const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const config = require('./config');
const db = require('./database');
const oddsFetcher = require('./oddsFetcher');
const arbitrage = require('./arbitrage');
const ai = require('./aiAnalyzer');

const bot = new Telegraf(config.telegramBotToken);
let scanCount = 0;
let startTime = Date.now();
let autoScanTimer = null;
let isScanning = false;
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 2000;

// Rate limiting middleware
bot.use((ctx, next) => {
  if (!ctx.from) return next();
  const now = Date.now();
  const last = rateLimitMap.get(ctx.from.id) || 0;
  if (now - last < RATE_LIMIT_WINDOW) {
    return;
  }
  rateLimitMap.set(ctx.from.id, now);
  return next();
});

function truncateMsg(msg, maxLen = 4000) {
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen - 100) + `\n\n... (truncated, ${msg.length} total chars)`;
}

function formatArbMessage(arb, index) {
  const icons = { low: '🟢', medium: '🟡', high: '🔴' };
  const icon = icons[arb.riskLevel] || '⚪';

  let msg = `${icon} *Arb #${index} — ${arb.roi}% ROI*\n`;
  msg += `📅 *${arb.event}*\n`;
  msg += `🏠 ${arb.home} @ ${arb.oddsA} (${arb.platformA})\n`;
  msg += `✈️ ${arb.away} @ ${arb.oddsB} (${arb.platformB})\n`;
  msg += `💰 Est. Profit: $${arb.profit?.toFixed(2) || 'N/A'}\n`;
  msg += `📊 Risk: ${arb.riskLevel.toUpperCase()}\n`;

  if (arb.roi > config.maxArbROI * 100) {
    msg += `⚠️ *Warning:* ROI exceeds ${config.maxArbROI * 100}% — likely voided\n`;
  }

  return msg;
}

async function performScan(ctx, sportFilter) {
  if (isScanning) {
    if (ctx) await ctx.reply('Scan already in progress. Please wait...');
    return [];
  }

  isScanning = true;
  scanCount++;

  try {
    if (ctx) await ctx.reply('🔍 Scanning odds across all sports...');

    let oddsData = await oddsFetcher.scanAll();

    if (sportFilter) {
      const filter = sportFilter.toLowerCase();
      const matched = oddsData.filter(o =>
        o.sport?.toLowerCase().includes(filter) ||
        o.event?.toLowerCase().includes(filter)
      );
      if (matched.length === 0 && ctx) {
        await ctx.reply(`No events found matching "${sportFilter}". Running full scan.`);
      } else {
        oddsData = matched;
        if (ctx) await ctx.reply(`🔍 Filtering by "${sportFilter}" (${matched.length} events)...`);
      }
    }

    const arbs = arbitrage.findArbitrages(oddsData);

    for (const arb of arbs) {
      db.saveOpportunity(arb);
    }

    const today = new Date().toISOString().split('T')[0];
    db.updateDailyStats(today, {
      arbsFound: arbs.length,
      arbsExecuted: 0,
      bestRoi: arbs.length > 0 ? Math.max(...arbs.map(a => a.roi)) : 0,
    });

    if (ctx) {
      if (arbs.length === 0) {
        await ctx.reply('✅ Scan complete. No arbitrage opportunities found this round.');
      } else {
        let msg = `🎯 *Found ${arbs.length} arbitrage opportunities!*\n\n`;
        const topArbs = arbs.slice(0, 5);
        topArbs.forEach((arb, i) => {
          msg += formatArbMessage(arb, i + 1) + '\n';
        });
        if (arbs.length > 5) {
          msg += `...and ${arbs.length - 5} more. Use /arbs to see all.`;
        }
        await ctx.reply(truncateMsg(msg), { parse_mode: 'Markdown' });
      }
    }

    if (config.alertsEnabled && arbs.length > 0 && !ctx) {
      const topArb = arbs[0];
      const alertMsg = `🚨 *ARB ALERT!*\n\n` +
        `${topArb.event}\n` +
        `${topArb.platformA}: ${topArb.oddsA} | ${topArb.platformB}: ${topArb.oddsB}\n` +
        `*ROI: ${topArb.roi}%* | Profit: ~$${topArb.profit?.toFixed(2)}\n` +
        `Risk: ${topArb.riskLevel.toUpperCase()}\n\n` +
        `Use /arbs to see all opportunities.`;

      try {
        await bot.telegram.sendMessage(config.telegramChatId, alertMsg, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Alert send failed:', err.message);
      }
    }

    return arbs;
  } catch (err) {
    console.error('Scan error:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
    if (ctx) await ctx.reply(`❌ Scan error: ${err.message}`);
    return [];
  } finally {
    isScanning = false;
  }
}

// Chat ID authorization middleware
bot.use((ctx, next) => {
  if (ctx.from && ctx.from.id.toString() !== config.telegramChatId) {
    return ctx.reply('Unauthorized. This bot is private.');
  }
  return next();
});

bot.start(async (ctx) => {
  const msg = `🤖 *Web3 Arbitrage Scanner Bot*\n\n` +
    `I scan ${config.scanInterval / 1000}s across 15+ sports for arbitrage opportunities.\n\n` +
    `*Quick Start:*\n` +
    `• /scan — Scan all sports now\n` +
    `• /arbs — View recent opportunities\n` +
    `• /bankroll — Check bankroll\n` +
    `• /calculate 2.15 2.20 — Calculate arb\n` +
    `• /strategy — AI daily strategy\n` +
    `• /auto on — Start auto-scanning\n` +
    `• /help — All commands\n\n` +
    `*Your bankroll:* $${config.bankroll.toFixed(2)}`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.help(async (ctx) => {
  const helpMsg = `*Commands*\n\n` +
    `*Scanning*\n` +
    `/scan — Scan all sports for arbs\n` +
    `/scan nba — Scan specific sport\n` +
    `/arbs — Show recent opportunities\n` +
    `/auto on/off — Toggle auto-scanning\n\n` +
    `*Bankroll*\n` +
    `/bankroll — Show bankroll\n` +
    `/bankroll 50 — Update bankroll to $50\n` +
    `/calculate 2.15 2.20 — Calculate arb for two odds\n\n` +
    `*Analysis*\n` +
    `/strategy — AI daily strategy\n` +
    `/riskcheck — Risk assessment of latest arb\n` +
    `/report — Today's P&L\n` +
    `/weekly — Weekly performance\n\n` +
    `*Settings*\n` +
    `/alerts on/off — Toggle notifications\n` +
    `/settings — Show current config\n` +
    `/platforms — Supported platforms\n` +
    `/status — Bot uptime & stats`;

  await ctx.reply(helpMsg, { parse_mode: 'Markdown' });
});

bot.command('scan', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  await performScan(ctx, args[0]);
});

bot.command('arbs', async (ctx) => {
  const arbs = db.getRecentArbs(10);

  if (arbs.length === 0) {
    await ctx.reply('No arbitrage opportunities found yet. Run /scan to search.');
    return;
  }

  let msg = `🎯 *Recent Opportunities*\n\n`;
  arbs.forEach((arb, i) => {
    msg += formatArbMessage(arb, i + 1) + '\n';
  });

  await ctx.reply(truncateMsg(msg), { parse_mode: 'Markdown' });
});

bot.command('bankroll', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);

  if (args.length > 0) {
    const amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('Please enter a valid amount. Example: /bankroll 50');
      return;
    }
    config.bankroll = amount;
    db.saveSetting('bankroll', String(amount));
    await ctx.reply(`💰 Bankroll updated to $${amount.toFixed(2)}`);
    return;
  }

  await ctx.reply(
    `💰 *Bankroll*\n\nCurrent: $${config.bankroll.toFixed(2)}\n` +
    `Max per arb (5%): $${(config.bankroll * config.maxBetPercent).toFixed(2)}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('calculate', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);

  if (args.length < 2) {
    await ctx.reply('Usage: /calculate 2.15 2.20');
    return;
  }

  const oddsA = parseFloat(args[0]);
  const oddsB = parseFloat(args[1]);

  if (isNaN(oddsA) || isNaN(oddsB) || oddsA <= 1 || oddsB <= 1) {
    await ctx.reply('Please enter valid decimal odds (> 1.0). Example: /calculate 2.15 2.20');
    return;
  }

  const result = arbitrage.calculateArb(oddsA, oddsB);

  if (!result.isArb) {
    await ctx.reply(
      `❌ *No Arbitrage*\n\n` +
      `Implied Probability: ${(result.totalImplied * 100).toFixed(2)}%\n` +
      `Margin: ${result.margin.toFixed(2)}% in favor of the house`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const riskLevel = result.roi > config.maxArbROI ? '🔴 HIGH (likely voided)' : result.roi > 0.05 ? '🟡 MEDIUM' : '🟢 LOW';

  await ctx.reply(
    `✅ *Arbitrage Found!*\n\n` +
    `*ROI:* ${(result.roi * 100).toFixed(2)}%\n` +
    `*Risk:* ${riskLevel}\n\n` +
    `*Execution Plan (on $${config.bankroll} bankroll):*\n` +
    `Bet A: $${result.stakeA.toFixed(2)} @ ${oddsA} → $${(result.stakeA * oddsA).toFixed(2)}\n` +
    `Bet B: $${result.stakeB.toFixed(2)} @ ${oddsB} → $${(result.stakeB * oddsB).toFixed(2)}\n\n` +
    `*Guaranteed Profit: $${result.profit.toFixed(2)}*\n\n` +
    `5% Rule: $${(config.bankroll * config.maxBetPercent).toFixed(2)} max stake ✅`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('strategy', async (ctx) => {
  try {
    await ctx.reply('🧠 Generating daily strategy...');
    const strategy = await ai.generateStrategy();
    await ctx.reply(truncateMsg(strategy), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('/strategy error:', err.message, err.stack?.split('\n')[1]);
    await ctx.reply('❌ Failed to generate strategy.');
  }
});

bot.command('report', async (ctx) => {
  try {
    await ctx.reply('📊 Generating daily report...');
    const report = await ai.generateReport(1);
    await ctx.reply(truncateMsg(report), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('/report error:', err.message, err.stack?.split('\n')[1]);
    await ctx.reply('❌ Failed to generate report.');
  }
});

bot.command('weekly', async (ctx) => {
  try {
    await ctx.reply('📊 Generating weekly report...');
    const report = await ai.generateReport(7);
    await ctx.reply(truncateMsg(report), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('/weekly error:', err.message, err.stack?.split('\n')[1]);
    await ctx.reply('❌ Failed to generate weekly report.');
  }
});

bot.command('alerts', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const state = args[0]?.toLowerCase();

  if (state === 'on') {
    config.alertsEnabled = true;
    db.saveSetting('alerts_enabled', 'true');
    await ctx.reply('🔔 Alerts enabled. You will be notified when arbs are found.');
  } else if (state === 'off') {
    config.alertsEnabled = false;
    db.saveSetting('alerts_enabled', 'false');
    await ctx.reply('🔕 Alerts disabled. No notifications will be sent.');
  } else {
    await ctx.reply(`Alerts are currently ${config.alertsEnabled ? 'ON' : 'OFF'}. Use /alerts on or /alerts off.`);
  }
});

bot.command('auto', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const state = args[0]?.toLowerCase();

  if (state === 'on') {
    if (autoScanTimer) {
      await ctx.reply('Auto-scan is already running.');
      return;
    }
    autoScanTimer = setInterval(() => performScan(null), config.scanInterval);
    performScan(null);
    await ctx.reply(`▶️ Auto-scan started (every ${config.scanInterval / 1000}s). New arbs will be alerted automatically.`);
  } else if (state === 'off') {
    if (autoScanTimer) {
      clearInterval(autoScanTimer);
      autoScanTimer = null;
    }
    await ctx.reply('⏹ Auto-scan stopped.');
  } else {
    await ctx.reply(`Auto-scan is currently ${autoScanTimer ? 'RUNNING' : 'STOPPED'}. Use /auto on or /auto off.`);
  }
});

bot.command('settings', async (ctx) => {
  await ctx.reply(
    `⚙️ *Settings*\n\n` +
    `Bankroll: $${config.bankroll.toFixed(2)}\n` +
    `Min ROI: ${(config.minArbROI * 100).toFixed(0)}%\n` +
    `Max ROI: ${(config.maxArbROI * 100).toFixed(0)}%\n` +
    `Scan Interval: ${config.scanInterval / 1000}s\n` +
    `Max Bet: ${config.maxBetPercent * 100}% of bankroll\n` +
    `Alerts: ${config.alertsEnabled ? 'ON' : 'OFF'}\n` +
    `Auto-Scan: ${autoScanTimer ? 'RUNNING' : 'STOPPED'}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('platforms', async (ctx) => {
  await ctx.reply(
    `🌐 *Supported Platforms*\n\n` +
    `*Web3 (No Limits):*\n` +
    `Polymarket, SX Bet, Overtime, DexWin, Azuro, BetDEX\n\n` +
    `*Crypto Sportsbooks:*\n` +
    `Stake, Cloudbet, BC.Game, Rollbit\n\n` +
    `*Traditional (via OddsPapi):*\n` +
    `Pinnacle, Betfair, BetMGM, DraftKings, FanDuel, Bet365, and 30+ more`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('riskcheck', async (ctx) => {
  try {
    const arbs = db.getRecentArbs(1);
    if (arbs.length === 0) {
      await ctx.reply('No arbs found yet. Run /scan first.');
      return;
    }

    const assessment = await ai.assessRisk(arbs[0]);
    await ctx.reply(assessment, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('/riskcheck error:', err.message, err.stack?.split('\n')[1]);
    await ctx.reply('❌ Risk assessment failed.');
  }
});

bot.command('status', async (ctx) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const uptimeStr = `${hours}h ${minutes}m`;

  const recentArbs = db.getRecentArbs(1);
  const bets = db.getRecentBets(1);

  await ctx.reply(
    `📡 *Bot Status*\n\n` +
    `⏱ Uptime: ${uptimeStr}\n` +
    `📊 Scans Run: ${scanCount}\n` +
    `🎯 Latest Arb: ${recentArbs.length > 0 ? `${recentArbs[0].roi}% ROI` : 'None yet'}\n` +
    `📝 Total Bets Logged: ${bets.length > 0 ? bets[0].id : 0}\n` +
    `🔔 Alerts: ${config.alertsEnabled ? 'ON' : 'OFF'}\n` +
    `🔄 Auto-Scan: ${autoScanTimer ? 'RUNNING' : 'STOPPED'}`,
    { parse_mode: 'Markdown' }
  );
});

// Health check endpoint for Railway
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      scans: scanCount,
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Web3 Arbitrage Bot Running');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});

// Global error handler for uncaught command errors
bot.catch((err) => {
  console.error('[Bot] Unhandled error:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

async function startBot() {
  console.log('=== Starting bot ===');
  console.log('Node version:', process.version);
  console.log('Platform:', process.platform);
  console.log('PORT:', process.env.PORT || '3000');
  console.log('Chat ID configured:', config.telegramChatId ? 'YES' : 'NO');
  console.log('Odds API:', config.oddsApiKey ? 'SET' : 'MISSING');
  console.log('Bankroll: $' + config.bankroll);

  const missing = config.validate();
  if (missing.length > 0) {
    console.warn(`Missing env vars for Telegram bot: ${missing.join(', ')}`);
    console.warn('Bot commands will not work until these are set.');
    return;
  }

  await db.initDatabase();
  console.log('Database initialized');

  const savedBankroll = db.getSetting('bankroll');
  if (savedBankroll) {
    config.bankroll = parseFloat(savedBankroll);
    console.log(`Loaded saved bankroll: $${config.bankroll}`);
  }

  const savedAlerts = db.getSetting('alerts_enabled');
  if (savedAlerts === 'false') config.alertsEnabled = false;

  console.log('Launching Telegram bot...');
  await bot.launch();
  console.log('Bot started successfully');
  console.log(`Bankroll: $${config.bankroll}`);
  console.log(`Scan interval: ${config.scanInterval / 1000}s`);
  console.log(`Alerts: ${config.alertsEnabled ? 'ON' : 'OFF'}`);
}

async function main() {
  await startBot();
}

if (require.main === module) {
  main().catch(err => {
    console.error('Bot launch failed:', err);
    process.exit(1);
  });
}

module.exports = { startBot, bot };

process.once('SIGINT', () => {
  if (autoScanTimer) clearInterval(autoScanTimer);
  db.close();
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  if (autoScanTimer) clearInterval(autoScanTimer);
  db.close();
  bot.stop('SIGTERM');
});
