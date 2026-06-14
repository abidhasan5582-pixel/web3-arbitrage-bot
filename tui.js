const blessed = require('blessed');
const config = require('./config');
const arb = require('./arbitrage');
const db = require('./database');
const odds = require('./oddsFetcher');

let botModule;
try { botModule = require('./bot'); } catch (_) {}

async function startTUI() {
  await db.initDatabase();

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Web3 Arbitrage Scanner',
    cursor: { artificial: true, blink: true },
  });

  let botRunning = false;
  let scanCount = 0;
  let showPositions = false;
  const logLines = [];

  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 4,
    content: '',
    tags: true,
    style: { fg: 'white', bg: 'blue' },
  });

  const arbsBox = blessed.box({
    top: 4, left: 0, width: '60%', bottom: '30%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'cyan' },
    label: ' Arbs ',
  });

  const positionsBox = blessed.box({
    top: 4, right: 0, width: '40%', bottom: '30%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'yellow' },
    label: ' Open Positions ',
    hidden: true,
  });

  const logBox = blessed.box({
    bottom: 1, left: 0, width: '100%', height: '30%',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: { fg: 'green', bg: 'black' },
    border: { type: 'line', fg: 'cyan' },
    label: ' Log ',
  });

  const helpBox = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    content: '',
    tags: true,
    style: { fg: 'cyan', bg: 'blue' },
  });

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    logLines.push(`[${time}] ${msg}`);
    if (logLines.length > 100) logLines.shift();
    logBox.setContent(logLines.join('\n'));
    screen.render();
    try { logBox.setScrollPerc(100); screen.render(); } catch (_) {}
  }

  function updateHeader() {
    const botStatus = botRunning ? '{green-fg}BOT ACTIVE{/green-fg}' : '{yellow-fg}BOT OFF{/yellow-fg}';
    const missing = config.validate();
    const botReady = missing.length === 0;
    const demo = db.getDemoSummary();
    const demoStatus = config.demoMode ? '{green-fg}DEMO ON{/green-fg}' : '{yellow-fg}DEMO OFF{/yellow-fg}';
    const demoProfit = (demo.total_profit || 0) >= 0 ? '{green-fg}+$' + (demo.total_profit || 0).toFixed(2) + '{/green-fg}' : '{red-fg}-$' + Math.abs(demo.total_profit || 0).toFixed(2) + '{/red-fg}';
    header.setContent([
      `{bold}Web3 Sports Arbitrage Scanner{/bold}    Bankroll: $${config.bankroll}  |  ${botStatus}  |  ${demoStatus}  |  Scans: ${scanCount}`,
      `Min ROI: ${(config.minArbROI * 100).toFixed(1)}%  |  Max Bet: $${(config.bankroll * config.maxBetPercent).toFixed(2)}  |  Telegram: ${botReady ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}'}`,
      `Demo: ${demo.open_count || 0} open | ${demo.closed_count || 0} closed | P&L: ${demoProfit}`,
    ].join('\n'));
    screen.render();
  }

  function updateHelp() {
    const mode = showPositions ? ' [POSITIONS] ' : ' [ARBS] ';
    helpBox.setContent(' {bold}r{/bold} scan  {bold}b{/bold} bot  {bold}p{/bold}' + mode + ' {bold}d{/bold} data  {bold}q{/bold} quit');
    screen.render();
  }

  function renderArbs(arbs, label) {
    let content = `{bold}${label}{/bold}\n\n`;
    if (arbs.length === 0) {
      content += '{yellow-fg}No opportunities found. Press r to scan.{/yellow-fg}\n';
      arbsBox.setContent(content);
      screen.render();
      return;
    }

    const hdr = '{underline} #  Event                      Odds A    Odds B    ROI%   Profit  Risk{/underline}';
    content += hdr + '\n';

    arbs.slice(0, 12).forEach((a, i) => {
      const event = (a.event || '').substring(0, 24).padEnd(24);
      const oA = (a.oddsA || 0).toFixed(2).padStart(7);
      const oB = (a.oddsB || 0).toFixed(2).padStart(8);
      const roi = (a.roi || 0).toFixed(2).padStart(6) + '%';
      const profit = '$' + (a.profit || 0).toFixed(2).padStart(5);
      const risk = (a.riskLevel || '?').padStart(6);
      const color = a.riskLevel === 'high' ? 'red' : a.riskLevel === 'medium' ? 'yellow' : 'green';
      content += ` ${String(i + 1).padStart(2)}  ${event} ${oA} ${oB} ${roi} {${color}-fg}${profit}{/} {${color}-fg}${risk}{/}\n`;
    });
    arbsBox.setContent(content);
    screen.render();
  }

  function renderPositions() {
    const open = db.getOpenDemoTrades();
    const closed = db.getClosedDemoTrades(5);
    let content = '{bold}Open Positions{/bold}\n\n';

    if (open.length === 0) {
      content += '{yellow-fg}No open positions{/yellow-fg}\n';
    } else {
      open.slice(0, 8).forEach((t, i) => {
        const event = (t.event || '').substring(0, 18).padEnd(18);
        const expPnl = (t.expected_profit || 0);
        const held = Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000);
        const color = expPnl >= 0 ? 'green' : 'red';
        content += `${i + 1}. ${event} {${color}-fg}$${expPnl.toFixed(4)}{/} ${held}m\n`;
      });
    }

    content += '\n{bold}Recent Closed{/bold}\n\n';
    if (closed.length === 0) {
      content += '{yellow-fg}None yet{/yellow-fg}\n';
    } else {
      closed.slice(0, 5).forEach((t, i) => {
        const event = (t.event || '').substring(0, 18).padEnd(18);
        const color = t.profit >= 0 ? 'green' : 'red';
        content += `${i + 1}. ${event} {${color}-fg}$${t.profit.toFixed(4)}{/} (${t.roi.toFixed(1)}%)\n`;
      });
    }

    positionsBox.setContent(content);
    screen.render();
  }

  function togglePanel() {
    showPositions = !showPositions;
    arbsBox.hidden = showPositions;
    positionsBox.hidden = !showPositions;
    if (showPositions) renderPositions();
    updateHelp();
    screen.render();
  }

  async function doScan() {
    scanCount++;
    updateHeader();
    log('Scan started...');
    arbsBox.setContent('{yellow-fg}Scanning odds from all platforms...{/yellow-fg}');
    screen.render();

    try {
      const allData = await odds.scanAll();
      const oddsData = Array.isArray(allData) ? allData : [];

      log(`Fetched ${oddsData.length} odds entries`);
      const detected = arb.findArbitrages(oddsData);

      log(`Found ${detected.length} arbitrage opportunities`);
      detected.forEach(a => {
        log(`${a.riskLevel.toUpperCase()}: ${a.event} — ${a.roi.toFixed(2)}% ROI`);
      });

      const demo = db.getDemoSummary();
      if (config.demoMode && demo.open_count > 0) {
        log(`{bold}🎮 ${demo.open_count} open demo trades{/bold}`);
      }

      renderArbs(detected, ` Arbitrage Opportunities (${detected.length} found) `);
      renderPositions();
      updateHeader();
    } catch (err) {
      log(`{red-fg}Scan error: ${err.message}{/red-fg}`);
      arbsBox.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
      screen.render();
    }
  }

  async function toggleBot() {
    if (botRunning) {
      log('Stopping Telegram bot...');
      try {
        if (botModule && botModule.bot) {
          botModule.bot.stop('user_stop');
        }
        botRunning = false;
        log('{yellow-fg}Telegram bot stopped{/yellow-fg}');
      } catch (err) {
        log(`{red-fg}Error stopping bot: ${err.message}{/red-fg}`);
      }
    } else {
      log('Starting Telegram bot...');
      try {
        if (botModule && botModule.startBot) {
          botModule.startBot().then(() => {
            botRunning = true;
            log('{green-fg}Telegram bot started{/green-fg}');
            updateHeader();
          }).catch(err => {
            log(`{red-fg}Bot start failed: ${err.message}{/red-fg}`);
          });
        } else {
          log('{red-fg}Bot module not available (missing TELEGRAM_BOT_TOKEN?){/red-fg}');
        }
      } catch (err) {
        log(`{red-fg}Error: ${err.message}{/red-fg}`);
      }
    }
    updateHeader();
  }

  screen.key(['q', 'C-c'], () => {
    if (botRunning && botModule && botModule.bot) {
      botModule.bot.stop('user_quit');
    }
    db.close();
    process.exit(0);
  });

  screen.key(['r'], () => doScan());
  screen.key(['b'], () => toggleBot());
  screen.key(['p'], () => togglePanel());
  screen.key(['d'], () => {
    const demo = db.getDemoSummary();
    log(`Demo: ${demo.open_count} open, ${demo.closed_count} closed, P&L: $${(demo.total_profit || 0).toFixed(2)}`);
    const arbs = db.getRecentArbs(5);
    arbs.forEach(a => log(`  Arb: ${a.event} — ${a.roi}% ROI`));
  });

  updateHeader();
  updateHelp();
  logBox.setContent(
    `Web3 Sports Arbitrage Scanner v2\n` +
    `Bankroll: $${config.bankroll} | Max bet: $${(config.bankroll * config.maxBetPercent).toFixed(2)}\n` +
    `Press r to scan | p to toggle positions panel\n`
  );
  screen.render();

  log('Scanner started — press r to scan, p for positions');

  doScan();
}

startTUI().catch(err => {
  console.error('TUI Error:', err);
  process.exit(1);
});
