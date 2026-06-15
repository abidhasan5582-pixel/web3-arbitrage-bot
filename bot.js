const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const config = require('./config');
const db = require('./database');
const oddsFetcher = require('./oddsFetcher');
const arbitrage = require('./arbitrage');
const ai = require('./aiAnalyzer');
const exchange = require('./exchange');
const risk = require('./risk');

const bot = new Telegraf(config.telegramBotToken);
let scanCount = 0;
let startTime = Date.now();
let autoScanTimer = null;
let autoScanEnabled = false;
let liveGameCount = 0;
let settlementTimer = null;
let isScanning = false;
let pollingRunning = false;
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
  const liveTag = arb.isLive ? '🔴 LIVE ' : '';

  let msg = `${icon} *${liveTag}Arb #${index} — ${arb.roi}% ROI*\n`;
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

async function settleTrades() {
  const settled = { demo: [], real: [] };

  const scores = await oddsFetcher.scanScores();
  if (scores.length === 0) return settled;

  // Settle demo trades (combined demo_trades records)
  const demoOpen = db.getUnsettledDemoTrades();
  for (const trade of demoOpen) {
    const match = scores.find(s =>
      s.event === trade.event ||
      (s.home === trade.home && s.away === trade.away) ||
      (s.home === trade.away && s.away === trade.home)
    );
    if (!match) continue;

    const stakeA = trade.stake_a;
    const stakeB = trade.stake_b;
    const totalStake = stakeA + stakeB;
    const isHomeWinner = match.winner === 'home';
    const betOnHome = trade.home === match.home || trade.home === match.homeName;

    let payout;
    if ((isHomeWinner && betOnHome) || (!isHomeWinner && !betOnHome)) {
      payout = stakeA * trade.odds_a;
    } else {
      payout = stakeB * trade.odds_b;
    }
    const gasFee = (trade.sim_gas_cost || 0) + (trade.sim_fee_cost || 0);
    const actualProfit = payout - totalStake - gasFee;
    const actualRoi = totalStake > 0 ? (actualProfit / totalStake) * 100 : 0;

    db.closeDemoTrade(trade.id, actualProfit, actualRoi);
    db.markSettlementChecked('demo_trades', trade.id);
    db.closeDemoBet(trade.id, actualProfit, actualRoi);

    // Close per-leg real_trades records
    const perLegRecords = db.queryAll("SELECT id FROM real_trades WHERE arb_id = $arbId AND is_demo = 1", {
      $arbId: `demo_${trade.id}`,
    });
    for (const leg of perLegRecords) {
      db.closeRealTrade(leg.id, actualProfit, actualRoi);
      db.markSettlementChecked('real_trades', leg.id);
    }

    settled.demo.push({ ...trade, actualProfit, actualRoi });
    console.log(`[Settlement] Demo #${trade.id}: ${trade.event} | P&L: $${actualProfit.toFixed(4)} (${actualRoi.toFixed(2)}%)`);
  }

  // Settle real per-leg records (is_demo excluded by query)
  const realOpen = db.getUnsettledRealTrades();
  for (const trade of realOpen) {
    const match = scores.find(s =>
      s.event === trade.event ||
      (s.home === trade.home && s.away === trade.away)
    );
    if (!match) continue;

    const stake = trade.stake;
    const isHomeWinner = match.winner === 'home';
    const betOnHome = trade.side === 'home';
    let actualProfit;
    if ((isHomeWinner && betOnHome) || (!isHomeWinner && !betOnHome)) {
      actualProfit = stake * trade.odds - stake;
    } else {
      actualProfit = -stake;
    }
    const actualRoi = stake > 0 ? (actualProfit / stake) * 100 : 0;

    db.closeRealTrade(trade.id, actualProfit, actualRoi);
    db.markSettlementChecked('real_trades', trade.id);
    settled.real.push({ ...trade, actualProfit, actualRoi });
    console.log(`[Settlement] Real #${trade.id}: ${trade.event} | P&L: $${actualProfit.toFixed(4)} (${actualRoi.toFixed(2)}%)`);
  }

  return settled;
}

async function performScan(ctx, sportFilter) {
  if (isScanning) {
    if (ctx) await ctx.reply('Scan already in progress. Please wait...');
    return [];
  }

  isScanning = true;
  scanCount++;

  try {
    const settled = await settleTrades();
    if ((settled.demo.length > 0 || settled.real.length > 0) && !ctx) {
      for (const t of settled.demo) {
        const emoji = t.actualProfit >= 0 ? '🟢' : '🔴';
        const held = Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000);
        const closeMsg = `${emoji} *Demo Trade CLOSED*\n\n📅 ${t.event}\n💰 P&L: $${t.actualProfit.toFixed(4)} (${t.actualRoi.toFixed(2)}%)\n⏱ Held ${held}m`;
        try { await bot.telegram.sendMessage(config.telegramChatId, closeMsg, { parse_mode: 'Markdown' }); } catch (_) {}
      }
      for (const t of settled.real) {
        const emoji = t.actualProfit >= 0 ? '🟢' : '🔴';
        const held = Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000);
        const closeMsg = `${emoji} *Real Trade CLOSED*\n\n📅 ${t.event}\n💰 P&L: $${t.actualProfit.toFixed(4)} (${t.actualRoi.toFixed(2)}%)\n⏱ Held ${held}m`;
        try { await bot.telegram.sendMessage(config.telegramChatId, closeMsg, { parse_mode: 'Markdown' }); } catch (_) {}
      }
    }

    if (ctx) await ctx.reply('🔍 Scanning odds across all sports...');

    let oddsData = await oddsFetcher.scanAll();
    liveGameCount = oddsFetcher.countLiveGames(oddsData);
    console.log(`[Scan] ${oddsData.length} events after liveFilter (${liveGameCount} live)`);

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
    const internalArbs = arbitrage.findInternalArbs(oddsData);
    // Merge and deduplicate by event+platforms
    const allArbs = [...arbs];
    for (const ia of internalArbs) {
      const dup = allArbs.find(a => a.event === ia.event && a.platformA === ia.platformA && a.platformB === ia.platformB);
      if (!dup) allArbs.push(ia);
    }
    allArbs.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return b.roi - a.roi;
    });

    for (const arb of allArbs) {
      db.saveOpportunity(arb);
    }

    let executedCount = 0;
    let executionProfitTotal = 0;
    let openedTrades = [];
    if ((config.demoMode || config.liveMode) && allArbs.length > 0) {
      const bestPerEvent = {};
      for (const arb of allArbs) {
        const assessed = risk.assessArbRisk(arb);
        if (!assessed.recommended) continue;
        const key = arb.event;
        if (!bestPerEvent[key] || assessed.netROI > bestPerEvent[key].netROI) {
          bestPerEvent[key] = assessed;
        }
      }
      const uniqueArbs = Object.values(bestPerEvent);
      for (const arb of uniqueArbs) {
        if (!config.liveMode && Math.random() > config.demoExecutionRate) continue;
        if (!risk.canExecute(arb)) continue;
        const result = await exchange.executeArb(arb, arb);
        if (result.success) {
          executedCount++;
          executionProfitTotal += result.totalProfit;
          openedTrades.push({ ...arb, result });
          console.log(`[${config.liveMode ? 'LIVE' : 'Demo'}] Executed: ${arb.event} | P&L: $${result.totalProfit.toFixed(4)}`);
        }
      }
      if (executedCount > 0 && !config.liveMode) {
        const today = new Date().toISOString().split('T')[0];
        db.updateDemoStats(today, {
          profit: executionProfitTotal,
          trades: executedCount,
          wins: executionProfitTotal > 0 ? executedCount : 0,
          losses: executionProfitTotal <= 0 ? executedCount : 0,
          bestRoi: Math.max(...allArbs.map(a => a.roi)),
        });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    db.updateDailyStats(today, {
      arbsFound: allArbs.length,
      arbsExecuted: executedCount,
      bestRoi: allArbs.length > 0 ? Math.max(...allArbs.map(a => a.roi)) : 0,
    });

    if (ctx) {
      const liveInfo = liveGameCount > 0 ? ` 🔴 ${liveGameCount} live games` : '';
      if (allArbs.length === 0) {
        await ctx.reply(`✅ Scan complete. No arbitrage opportunities found this round.${liveInfo}`);
      } else {
        if (executedCount > 0) {
          const mode = config.liveMode ? '🚀 *Live' : '🎮 *Demo';
          await ctx.reply(`${mode}: ${executedCount} trades executed!*\nEstimated P&L: $${executionProfitTotal.toFixed(2)}`, { parse_mode: 'Markdown' });
        }
        let msg = `🎯 *Found ${allArbs.length} arbitrage opportunities!*\n\n`;
        const topArbs = allArbs.slice(0, 5);
        topArbs.forEach((arb, i) => {
          msg += formatArbMessage(arb, i + 1) + '\n';
        });
        if (allArbs.length > 5) {
          msg += `...and ${allArbs.length - 5} more. Use /arbs to see all.`;
        }
        await ctx.reply(truncateMsg(msg), { parse_mode: 'Markdown' });
      }
    }

    if (config.alertsEnabled && allArbs.length > 0 && !ctx) {
      const topArb = allArbs[0];
      const liveTag = topArb.isLive ? '🔴 LIVE ' : '';
      const alertMsg = `🚨 *ARB ALERT!*\n\n` +
        `${liveTag}${topArb.event}\n` +
        `${topArb.platformA}: ${topArb.oddsA} | ${topArb.platformB}: ${topArb.oddsB}\n` +
        `*ROI: ${topArb.roi}%* | Profit: ~$${topArb.profit?.toFixed(2)}\n` +
        `Risk: ${topArb.riskLevel.toUpperCase()}\n\n` +
        `Use /arbs to see all opportunities.`;

      try {
        await bot.telegram.sendMessage(config.telegramChatId, alertMsg, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Alert send failed:', err.message);
      }

      if (openedTrades.length > 0) {
        for (const arb of openedTrades) {
          const mode = config.liveMode ? '🚀 *LIVE Trade' : '🎮 *Demo Trade';
          const openMsg = `${mode} OPEN*\n\n📅 ${arb.event}\n🏠 ${arb.platformA} @ ${arb.oddsA}\n✈️ ${arb.platformB} @ ${arb.oddsB}\n💰 P&L: $${(arb.result?.totalProfit || 0).toFixed(4)} (${arb.roi}%)`;
          try {
            await bot.telegram.sendMessage(config.telegramChatId, openMsg, { parse_mode: 'Markdown' });
            await new Promise(r => setTimeout(r, 500));
          } catch (_) {}
        }
      }
    }

    return allArbs;
  } catch (err) {
    console.error('Scan error:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
    if (ctx) await ctx.reply(`❌ Scan error: ${err.message}`);
    return [];
  } finally {
    isScanning = false;
  }
}

function startSettlementLoop() {
  if (settlementTimer) clearInterval(settlementTimer);
  const interval = config.liveMode ? 30000 : 60000;
  settlementTimer = setInterval(async () => {
    try {
      const settled = await settleTrades();
      if (settled.demo.length > 0 || settled.real.length > 0) {
        console.log(`[Settlement] Cycle complete: ${settled.demo.length} demo + ${settled.real.length} real settled`);
        if (config.alertsEnabled) {
          for (const t of settled.demo) {
            const emoji = t.actualProfit >= 0 ? '🟢' : '🔴';
            const msg = `${emoji} *Demo Settled*\n📅 ${t.event}\n💰 $${t.actualProfit.toFixed(4)} (${t.actualRoi.toFixed(2)}%)`;
            try { await bot.telegram.sendMessage(config.telegramChatId, msg, { parse_mode: 'Markdown' }); } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.error(`[Settlement] Cycle error: ${err.message}`);
    }
  }, interval);
  console.log(`[Settlement] Loop started (${interval / 1000}s interval)`);
}

function scheduleNextScan() {
  if (!autoScanEnabled) return;
  const interval = liveGameCount > 0 ? 15000 : config.scanInterval;
  autoScanTimer = setTimeout(async () => {
    await performScan(null);
    if (autoScanEnabled) scheduleNextScan();
  }, interval);
  if (autoScanEnabled) {
    console.log(`[AutoScan] Next scan in ${interval / 1000}s (live games: ${liveGameCount})`);
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
    `• /demo — Demo trading mode & P&L\n` +
    `• /live — Live trading mode & positions\n` +
    `• /positions — View open demo trades\n` +
    `• /trades — View recent demo trades\n` +
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
    `/status — Bot uptime & stats\n\n` +
    `*Demo Trading*\n` +
    `/demo — Show demo status & P&L\n` +
    `/demo on/off — Toggle demo mode\n` +
    `/demo rate 0.3 — Set execution rate\n` +
    `/positions — View open positions\n` +
    `/trades — View closed trades\n\n` +
    `*Live Trading*\n` +
    `/live — Show live trading status & positions\n` +
    `/live on/off — Toggle live mode`;

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
    autoScanEnabled = true;
    scheduleNextScan();
    performScan(null);
    await ctx.reply(`▶️ Auto-scan started. Live games adjust interval dynamically.`);
  } else if (state === 'off') {
    if (autoScanTimer) {
      clearTimeout(autoScanTimer);
      autoScanTimer = null;
    }
    autoScanEnabled = false;
    await ctx.reply('⏹ Auto-scan stopped.');
  } else {
    await ctx.reply(`Auto-scan is currently ${autoScanEnabled ? 'RUNNING' : 'STOPPED'}. Use /auto on or /auto off.`);
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
    `Auto-Scan: ${autoScanTimer ? 'RUNNING' : 'STOPPED'}\n` +
    `Demo Mode: ${config.demoMode ? 'ON' : 'OFF'}\n` +
    `Demo Rate: ${(config.demoExecutionRate * 100).toFixed(0)}%\n` +
    `Live Games: ${liveGameCount || 0}`,
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
  const demoSummary = db.getDemoSummary();
  const realSummary = db.getRealTradeSummary();
  const settlement = db.getSettlementSummary();

  await ctx.reply(
    `📡 *Bot Status*\n\n` +
    `⏱ Uptime: ${uptimeStr}\n` +
    `📊 Scans Run: ${scanCount}\n` +
    `🎯 Latest Arb: ${recentArbs.length > 0 ? `${recentArbs[0].roi}% ROI` : 'None yet'}\n` +
    `📝 Total Bets Logged: ${bets.length > 0 ? bets[0].id : 0}\n` +
    `🔔 Alerts: ${config.alertsEnabled ? 'ON' : 'OFF'}\n` +
    `🔄 Auto-Scan: ${autoScanEnabled ? 'RUNNING' : 'STOPPED'}\n` +
    `🎮 Demo Mode: ${config.demoMode ? 'ON' : 'OFF'}\n` +
    `🔴 Live Games: ${liveGameCount || 0}\n` +
    `🔁 Settlement: ${settlementTimer ? 'RUNNING' : 'STOPPED'}\n` +
    `📊 Demo: ${demoSummary.open_count || 0} open | ${demoSummary.closed_count || 0} settled | P&L: $${(demoSummary.total_profit || 0).toFixed(2)}\n` +
    `📊 Real: ${realSummary.open_count || 0} open | ${realSummary.closed_count || 0} settled | P&L: $${(realSummary.total_profit || 0).toFixed(2)}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('demo', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const sub = args[0]?.toLowerCase();

  if (sub === 'on') {
    config.demoMode = true;
    config.demoExecutionRate = 1.0;
    db.saveSetting('demo_mode', 'true');
    db.saveSetting('demo_execution_rate', '1');
    startSettlementLoop();
    await ctx.reply('🟢 Demo mode enabled (100% execution rate). Arbs simulated with real slippage, gas, and settlement.');
    return;
  }
  if (sub === 'off') {
    config.demoMode = false;
    db.saveSetting('demo_mode', 'false');
    await ctx.reply('🔴 Demo mode disabled.');
    return;
  }
  if (sub === 'rate' && args[1]) {
    const rate = parseFloat(args[1]);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      await ctx.reply('Rate must be between 0 and 1. Example: /demo rate 0.3');
      return;
    }
    config.demoExecutionRate = rate;
    db.saveSetting('demo_execution_rate', String(rate));
    await ctx.reply(`📊 Demo execution rate set to ${(rate * 100).toFixed(0)}%`);
    return;
  }

  const summary = db.getDemoSummary();
  const msg =
    `🎮 *Demo Trading*\n\n` +
    `Status: ${config.demoMode ? '🟢 ON' : '🔴 OFF'}\n` +
    `Execution Rate: ${(config.demoExecutionRate * 100).toFixed(0)}%\n` +
    `Bankroll: $${config.bankroll.toFixed(2)}\n` +
    `Open Trades: ${summary.open_count || 0} (est. $${(summary.expected_pnl || 0).toFixed(2)})\n` +
    `Settled Trades: ${summary.closed_count || 0}\n` +
    `Total P&L: $${(summary.total_profit || 0).toFixed(2)}\n` +
    `Avg ROI: ${(summary.avg_roi || 0).toFixed(2)}%\n` +
    `Today: ${summary.today_trades || 0} trades | $${(summary.today_profit || 0).toFixed(2)}\n\n` +
    `*Settlement:* ${settlementTimer ? '🟢 RUNNING' : '🔴 STOPPED'}\n\n` +
    `*Commands:*\n` +
    `• /demo on/off — Toggle (on = 100% execution)\n` +
    `• /demo rate 0.3 — Set execution rate\n` +
    `• /positions — View open trades\n` +
    `• /trades — View settled trades`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('trades', async (ctx) => {
  const trades = db.getClosedDemoTrades(10);
  if (trades.length === 0) {
    await ctx.reply('No closed demo trades yet. Enable demo mode with /demo on and run /scan.');
    return;
  }

  let msg = `📋 *Last 10 Settled Trades*\n\n`;
  trades.forEach((t, i) => {
    const emoji = t.profit >= 0 ? '🟢' : '🔴';
    const held = t.closed_at ? Math.floor((new Date(t.closed_at) - new Date(t.opened_at)) / 60000) : '?';
    msg += `${emoji} ${i + 1}. ${t.event}\n`;
    msg += `   P&L: $${t.profit.toFixed(4)} (${t.roi.toFixed(2)}%) | Held: ${held}m\n\n`;
  });
  await ctx.reply(truncateMsg(msg), { parse_mode: 'Markdown' });
});

bot.command('positions', async (ctx) => {
  const open = db.getOpenDemoTrades();
  if (open.length === 0) {
    await ctx.reply('No open demo positions. Run /scan with demo mode on.');
    return;
  }

  let msg = `📊 *Open Positions (${open.length})*\n\n`;
  let totalExposure = 0;
  let totalExpected = 0;
  open.forEach((t, i) => {
    const held = Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000);
    msg += `${i + 1}. ${t.event}\n`;
    msg += `   ${t.platform_a} @ ${t.odds_a} | ${t.platform_b} @ ${t.odds_b}\n`;
    msg += `   Stake: $${t.total_staked.toFixed(2)} | Exp: $${t.expected_profit.toFixed(4)} (${t.expected_roi.toFixed(2)}%)\n`;
    msg += `   ⏱ ${held}m ago\n\n`;
    totalExposure += t.total_staked;
    totalExpected += t.expected_profit;
  });
  msg += `*Total Exposure:* $${totalExposure.toFixed(2)}\n`;
  msg += `*Expected P&L:* $${totalExpected.toFixed(4)}`;
  await ctx.reply(truncateMsg(msg), { parse_mode: 'Markdown' });
});

bot.command('live', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const sub = args[0]?.toLowerCase();

  if (sub === 'on') {
    config.liveMode = true;
    db.saveSetting('live_mode', 'true');
    await exchange.init();
    startSettlementLoop();
    await ctx.reply('🚀 Live mode enabled. Arbs will be executed on-chain.');
    return;
  }
  if (sub === 'off') {
    config.liveMode = false;
    db.saveSetting('live_mode', 'false');
    exchange.disconnectSXWebSocket();
    await ctx.reply('🔴 Live mode disabled.');
    return;
  }

  const realSummary = db.getRealTradeSummary();
  const gasCheck = await exchange.hasGas().catch(() => ({}));
  let gasMsg = '';
  for (const [platform, ok] of Object.entries(gasCheck)) {
    gasMsg += `${ok ? '✅' : '❌'} ${platform}\n`;
  }

  const msg =
    `🚀 *Live Trading*\n\n` +
    `Status: ${config.liveMode ? '🟢 ON' : '🔴 OFF'}\n` +
    `Live Only: ${config.liveOnly ? 'YES' : 'NO'}\n` +
    `Scan Interval: ${config.liveScanInterval / 1000}s\n` +
    `Min ROI: ${(config.liveMinROI * 100).toFixed(0)}%\n` +
    `Slippage Tol: ${(config.liveSlippageTolerance * 100).toFixed(0)}%\n\n` +
    `*Gas / Funds:*\n${gasMsg || 'No exchanges initialized'}\n\n` +
    `*Real Trades:*\n` +
    `Open: ${realSummary.open_count || 0}\n` +
    `Settled: ${realSummary.closed_count || 0}\n` +
    `Total P&L: $${(realSummary.total_profit || 0).toFixed(2)}\n` +
    `Avg ROI: ${(realSummary.avg_roi || 0).toFixed(2)}%\n` +
    `Today: ${realSummary.today_trades || 0} trades | $${(realSummary.today_profit || 0).toFixed(2)}\n\n` +
    `*Commands:*\n` +
    `• /live on/off — Toggle live trading\n` +
    `• /trades — View trades\n` +
    `• /positions — View open trades`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
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
  console.log('OddsAPI.io:', config.oddsapiiApiKey ? 'SET' : 'MISSING');
  console.log('SharpAPI:', config.sharpApiKey ? 'SET' : 'MISSING');
  console.log('Bankroll: $' + config.bankroll);

  // Always start health server first (for Railway)
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Health server running on port ${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} in use — health server skipped`);
    } else {
      console.error('Health server error:', err.message);
    }
  });

  const missing = config.validate();
  if (missing.length > 0) {
    console.warn(`Missing env vars for Telegram bot: ${missing.join(', ')}`);
    console.warn('Bot commands will not work until these are set.');
    console.warn('Health server is running — waiting for env vars to be set.');
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

  const savedDemoMode = db.getSetting('demo_mode');
  if (savedDemoMode === 'false') config.demoMode = false;
  if (savedDemoMode === 'true') config.demoMode = true;

  const savedDemoRate = db.getSetting('demo_execution_rate');
  if (savedDemoRate) config.demoExecutionRate = parseFloat(savedDemoRate);

  console.log('Launching Telegram bot...');
  // Test Telegram API connectivity first
  try {
    const testRes = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const testData = await testRes.json();
    if (!testData.ok) {
      console.warn(`Telegram API check failed: ${testData.description || 'unknown error'}. Skipping Telegram.`);
      return;
    }
    console.log(`Telegram API OK: @${testData.result.username}`);
  } catch (err) {
    console.warn(`Telegram API unreachable: ${err.message}. Skipping Telegram.`);
    return;
  }
  // Manual long polling (avoid bot.launch() which hangs on some Node versions)
  let pollOffset = 0;
  pollingRunning = true;
  const POLL_TIMEOUT = 30;
  const POLL_LIMIT = 100;
  async function pollLoop() {
    while (pollingRunning) {
      try {
        const updates = await bot.telegram.callApi('getUpdates', {
          offset: pollOffset,
          timeout: POLL_TIMEOUT,
          limit: POLL_LIMIT,
          allowed_updates: ['message', 'callback_query'],
        });
        if (updates.length > 0) {
          pollOffset = updates[updates.length - 1].update_id + 1;
          for (const update of updates) {
            bot.handleUpdate(update).catch(err => {
              console.error('[Poll] handleUpdate error:', err.message);
            });
          }
        }
      } catch (err) {
        if (err?.response?.error_code === 409) {
          // Another instance is polling — clear stale session and retry
          try {
            await bot.telegram.callApi('getUpdates', { offset: 0, limit: 1, timeout: 1 });
            pollOffset = 0;
          } catch (_) {}
        } else {
          console.error('[Poll] getUpdates error:', err.message);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
  }
  pollLoop();
  console.log('Bot started successfully');
  console.log(`Bankroll: $${config.bankroll}`);
  console.log(`Scan interval: ${config.scanInterval / 1000}s`);
  console.log(`Alerts: ${config.alertsEnabled ? 'ON' : 'OFF'}`);

  if (config.demoMode || config.liveMode) {
    startSettlementLoop();
  }

  // Initial scan on startup (runs async, no reply needed)
  setTimeout(() => {
    console.log('[Bot] Running initial scan...');
    performScan(null).then(results => {
      console.log(`[Bot] Initial scan complete: ${results.length} opportunities found`);
    }).catch(err => {
      console.error('[Bot] Initial scan error:', err.message);
    });
  }, 5000);
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

async function gracefulShutdown(signal) {
  console.log(`\n[Bot] Received ${signal}, shutting down gracefully...`);
  autoScanEnabled = false;
  pollingRunning = false;
  if (autoScanTimer) { clearTimeout(autoScanTimer); autoScanTimer = null; }
  if (settlementTimer) { clearInterval(settlementTimer); settlementTimer = null; }
  try { server.close(); } catch (_) {}
  try { exchange.disconnectSXWebSocket(); } catch (_) {}
  try { db.close(); } catch (_) {}
  console.log('[Bot] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[Bot] Uncaught exception:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});
process.on('unhandledRejection', (reason) => {
  console.error('[Bot] Unhandled rejection:', reason?.message || reason);
});
