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

  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 4,
    content: '',
    tags: true,
    style: { fg: 'white', bg: 'blue' },
  });

  const tableBox = blessed.box({
    top: 4, left: 0, width: '100%', height: '60%',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: { fg: 'white', bg: 'black' },
  });

  const logBox = blessed.box({
    top: '60%', left: 0, width: '100%', height: '25%',
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
    style: { fg: 'white', bg: 'black' },
  });

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    logBox.pushLine(`[${time}] ${msg}`);
    logBox.setScrollPerc(100);
    screen.render();
  }

  function updateHeader() {
    const botStatus = botRunning ? '{green-fg}BOT ACTIVE{/green-fg}' : '{yellow-fg}BOT OFF{/yellow-fg}';
    const missing = config.validate();
    const botReady = missing.length === 0;
    header.setContent([
      `{bold}Web3 Sports Arbitrage Scanner{/bold}    Bankroll: $${config.bankroll}  |  ${botStatus}  |  Scans: ${scanCount}`,
      `Min ROI: ${(config.minArbROI * 100).toFixed(1)}%  |  Max Bet: $${(config.bankroll * config.maxBetPercent).toFixed(2)}`,
      `Telegram: ${botReady ? '{green-fg}Configured{/green-fg}' : '{red-fg}Missing: ' + missing.join(', ') + '{/red-fg}'}`,
    ].join('\n'));
    screen.render();
  }

  function updateHelp() {
    helpBox.setContent(' {bold}r{/bold} scan  {bold}b{/bold} toggle bot  {bold}d{/bold} recent bets  {bold}q{/bold} quit');
    screen.render();
  }

  function renderTable(arbs, label) {
    let content = `{bold}${label}{/bold}\n\n`;
    if (arbs.length === 0) {
      content += '{yellow-fg}No arbitrage opportunities found. Press r to scan.{/yellow-fg}\n';
      tableBox.setContent(content);
      screen.render();
      return;
    }

    const hdr = '{underline} #  Event                      Odds A    Odds B    ROI%   Stake A   Stake B   Profit  Risk{/underline}';
    content += hdr + '\n';

    arbs.slice(0, 15).forEach((a, i) => {
      const event = (a.event || '').substring(0, 24).padEnd(24);
      const oA = (a.oddsA || 0).toFixed(2).padStart(7);
      const oB = (a.oddsB || 0).toFixed(2).padStart(8);
      const roi = (a.roi || 0).toFixed(2).padStart(6) + '%';
      const sA = '$' + (a.stakeA || 0).toFixed(2).padStart(5);
      const sB = '$' + (a.stakeB || 0).toFixed(2).padStart(5);
      const profit = '$' + (a.profit || 0).toFixed(2).padStart(5);
      const risk = (a.riskLevel || '?').padStart(6);
      const color = a.riskLevel === 'high' ? 'red' : a.riskLevel === 'medium' ? 'yellow' : 'green';
      content += ` ${String(i + 1).padStart(2)}  ${event} ${oA} ${oB} ${roi} ${sA} ${sB} {${color}-fg}${profit}{/} {${color}-fg}${risk}{/}\n`;
    });
    tableBox.setContent(content);
    screen.render();
  }

  async function doScan() {
    scanCount++;
    updateHeader();
    log('Scan started...');
    tableBox.setContent('{yellow-fg}Scanning odds from all platforms...{/yellow-fg}');
    screen.render();

    try {
      const currentArbs = [];
      const oddsData = [];

      const allData = await odds.scanAll();
      if (Array.isArray(allData)) {
        oddsData.push(...allData);
      }

      log(`Fetched ${oddsData.length} odds entries`);
      const detected = arb.findArbitrages(oddsData);
      currentArbs.push(...detected);

      log(`Found ${detected.length} arbitrage opportunities`);
      detected.forEach(a => {
        log(`${a.riskLevel.toUpperCase()}: ${a.event} — ${a.roi.toFixed(2)}% ROI`);
      });

      renderTable(detected, ` Arbitrage Opportunities (${detected.length} found) `);
      updateHeader();
    } catch (err) {
      log(`{red-fg}Scan error: ${err.message}{/red-fg}`);
      tableBox.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
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
  screen.key(['d'], () => {
    const bets = db.getRecentBets(10);
    log(`Recent bets: ${bets.length} records`);
    bets.forEach(b => log(`  ${b.event}: $${b.profit} profit`));
    const arbs = db.getRecentArbs(10);
    log(`Recent arbs: ${arbs.length} opportunities`);
    arbs.forEach(a => log(`  ${a.event}: ${a.roi}% ROI`));
  });

  updateHeader();
  updateHelp();
  log('Press {bold}r{/bold} to scan  {bold}b{/bold} toggle Telegram bot  {bold}d{/bold} data  {bold}q{/bold} quit');
  log(`Bankroll: $${config.bankroll} | Max bet: $${(config.bankroll * config.maxBetPercent).toFixed(2)}`);
  screen.render();

  doScan();
}

startTUI().catch(err => {
  console.error('TUI Error:', err);
  process.exit(1);
});
