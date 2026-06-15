const blessed = require('blessed');
const config = require('./config');
const arb = require('./arbitrage');
const db = require('./database');
const odds = require('./oddsFetcher');
const exchange = require('./exchange');
const risk = require('./risk');

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
  let showLivePositions = false;
  let autoScanEnabled = false;
  let liveGameCount = 0;
  let autoScanInterval = config.scanInterval || 60000;
  let nextScanTime = 0;
  let autoScanTimer = null;
  let headerTimer = null;
  let settingsMode = false;
  let settingsSelected = 0;
  let platformFilter = '';
  const settingsFields = [
    { name: 'Min ROI (%)', key: 'minROI', value: config.minArbROI * 100, step: 0.1, min: 0, max: 50 },
    { name: 'Max Bet (%)', key: 'maxBetPct', value: config.maxBetPercent * 100, step: 1, min: 1, max: 100 },
    { name: 'Demo Mode', key: 'demoMode', value: config.demoMode, type: 'toggle' },
    { name: 'Live Mode', key: 'liveMode', value: config.liveMode, type: 'toggle' },
    { name: 'Scan Speed (s)', key: 'scanSpeed', value: config.scanInterval / 1000, step: 5, min: 5, max: 300 },
    { name: 'Live Only', key: 'liveOnly', value: config.liveOnly, type: 'toggle' },
    { name: 'Platform Filter', key: 'platformFilter', value: '', type: 'string' },
  ];

  const logLines = [];

  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 4,
    content: '',
    tags: true,
    style: { fg: 'white', bg: 'blue' },
  });
  screen.append(header);

  const arbsBox = blessed.box({
    top: 4, left: 0, width: '60%', bottom: '30%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', fg: 'cyan' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'cyan' },
    label: ' Arbs ',
  });
  screen.append(arbsBox);

  const positionsBox = blessed.box({
    top: 4, right: 0, width: '40%', bottom: '30%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', fg: 'yellow' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'yellow' },
    label: ' Demo Positions ',
    hidden: true,
  });
  screen.append(positionsBox);

  const livePositionsBox = blessed.box({
    top: 4, right: 0, width: '40%', bottom: '30%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', fg: 'magenta' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'magenta' },
    label: ' Live Positions ',
    hidden: true,
  });
  screen.append(livePositionsBox);

  const logBox = blessed.box({
    bottom: 1, left: 0, width: '100%', height: '30%',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', fg: 'green' },
    style: { fg: 'green', bg: 'black' },
    border: { type: 'line', fg: 'cyan' },
    label: ' Log ',
  });
  screen.append(logBox);

  const helpBox = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    content: '',
    tags: true,
    style: { fg: 'cyan', bg: 'blue' },
  });
  screen.append(helpBox);

  const settingsBox = blessed.box({
    top: 'center', left: 'center',
    width: '40%', height: 10,
    content: '',
    tags: true,
    border: { type: 'line', fg: 'yellow' },
    label: ' Settings ',
    style: { fg: 'white', bg: 'black' },
    hidden: true,
    keys: false,
    vi: false,
  });
  screen.append(settingsBox);

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    logLines.push(`[${time}] ${msg}`);
    if (logLines.length > 200) logLines.shift();
    logBox.setContent(logLines.join('\n'));
    screen.render();
    try {
      logBox.setScrollPerc(100);
      screen.render();
    } catch (_) {}
  }

  function updateHeader() {
    const botStatus = botRunning ? '{green-fg}BOT{/green-fg}' : '{yellow-fg}BOT OFF{/yellow-fg}';
    const missing = config.validate();
    const demo = db.getDemoSummary();
    const real = db.getRealTradeSummary();
    const demoStatus = config.demoMode ? '{green-fg}DEMO{/green-fg}' : '{yellow-fg}DEMO OFF{/yellow-fg}';
    const liveStatus = config.liveMode ? '{magenta-fg}LIVE{/magenta-fg}' : '';
    const demoProfit = (demo.total_profit || 0) >= 0
      ? '{green-fg}+$' + (demo.total_profit || 0).toFixed(2) + '{/green-fg}'
      : '{red-fg}-$' + Math.abs(demo.total_profit || 0).toFixed(2) + '{/red-fg}';
    const autoStatus = autoScanEnabled
      ? `{cyan-fg}AUTO ${Math.max(0, Math.round((nextScanTime - Date.now()) / 1000))}s{/cyan-fg}`
      : '';
    const liveInfo = liveGameCount > 0 ? `{red-fg}●${liveGameCount}LIVE{/red-fg}` : '';
    const platformInfo = platformFilter ? `{yellow-fg}${platformFilter}{/yellow-fg}` : '';
    header.setContent([
      `{bold}Web3 Sports Arbitrage Scanner{/bold}    $${config.bankroll}  |  ${botStatus}  |  ${demoStatus}  |  ${liveStatus}  |  ${autoStatus}  ${liveInfo} |  Scan: ${scanCount}  ${platformInfo}`,
      `ROI: ${(config.minArbROI * 100).toFixed(1)}%  |  Bet: $${(config.bankroll * config.maxBetPercent).toFixed(2)}  |  Speed: ${autoScanInterval / 1000}s  |  Tg: ${missing.length === 0 ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}'}`,
      `Demo: ${demo.open_count || 0} open | ${demo.closed_count || 0} settled | ${demoProfit}`,
      `Live: ${real.open_count || 0} open | ${real.closed_count || 0} settled | P&L: $${(real.total_profit || 0).toFixed(2)}`,
    ].join('\n'));
    screen.render();
  }

  function updateHelp() {
    let mode = ' ARBS ';
    if (showPositions) mode = ' DEMO ';
    if (showLivePositions) mode = ' LIVE ';
    const autoLabel = autoScanEnabled ? '{bold}a{/bold} stop' : '{bold}a{/bold} auto';
    helpBox.setContent(
      ` {bold}r{/bold} scan  {bold}b{/bold} bot  {bold}p{/bold}${mode} {bold}l{/bold}live ${autoLabel}  {bold}d{/bold} data  {bold}c{/bold} clear  {bold}s{/bold} set  {bold}q{/bold} quit`
    );
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

    const platformColors = {
      'Polymarket': 'magenta',
      'SX Bet': 'cyan',
      'ESPN Bet': 'blue',
      'OddsPapi': 'white',
    };

    const hdr = '{underline} #  Event                      Odds A    Odds B    ROI%   Profit  Risk{/underline}';
    content += hdr + '\n';

    arbs.slice(0, 20).forEach((a, i) => {
      const event = (a.event || '').substring(0, 24).padEnd(24);
      const oA = (a.oddsA || 0).toFixed(2).padStart(7);
      const oB = (a.oddsB || 0).toFixed(2).padStart(8);
      const roi = (a.roi || 0).toFixed(2).padStart(6) + '%';
      const profit = '$' + (a.profit || 0).toFixed(2).padStart(5);
      const risk = (a.riskLevel || '?').padStart(6);
      const riskColor = a.riskLevel === 'high' ? 'red' : a.riskLevel === 'medium' ? 'yellow' : 'green';
      const colorA = platformColors[a.platformA] || 'white';
      const colorB = platformColors[a.platformB] || 'white';
      content += ` ${String(i + 1).padStart(2)}  ${event} {${colorA}-fg}${oA}{/} {${colorB}-fg}${oB}{/} ${roi} {${riskColor}-fg}${profit}{/} {${riskColor}-fg}${risk}{/}\n`;
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
        const event = (t.event || '').substring(0, 13).padEnd(13);
        const expPnl = t.expected_profit || 0;
        const held = Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000);
        const stake = t.total_staked || 0;
        const color = expPnl >= 0 ? 'green' : 'red';
        content += `${i + 1}. ${event} {${color}-fg}$${expPnl.toFixed(4)}{/} $${stake.toFixed(2)} ${held}m\n`;
      });
    }

    content += '\n{bold}Closed (last 5){/bold}\n\n';
    if (closed.length === 0) {
      content += '{yellow-fg}None yet{/yellow-fg}\n';
    } else {
      closed.slice(0, 5).forEach((t, i) => {
        const event = (t.event || '').substring(0, 13).padEnd(13);
        const color = t.profit >= 0 ? 'green' : 'red';
        const stake = t.total_staked || 0;
        content += `${i + 1}. ${event} {${color}-fg}$${t.profit.toFixed(4)}{/} $${stake.toFixed(2)} (${t.roi.toFixed(1)}%)\n`;
      });
    }

    positionsBox.setContent(content);
    screen.render();
  }

  function renderLivePositions() {
    const open = db.getOpenRealTrades();
    const closed = db.getClosedRealTrades(5);
    const summary = db.getRealTradeSummary();
    let content = '{bold}Live Positions{/bold}\n\n';

    content += `Total P&L: $${(summary.total_profit || 0).toFixed(2)}\n`;
    content += `Open: ${summary.open_count || 0} | Closed: ${summary.closed_count || 0}\n\n`;

    if (open.length === 0) {
      content += '{yellow-fg}No open live positions{/yellow-fg}\n';
    } else {
      content += '{bold}Open:{/bold}\n';
      open.slice(0, 8).forEach((t, i) => {
        const event = (t.event || '').substring(0, 13).padEnd(13);
        const stake = t.stake || 0;
        const side = t.side || '';
        content += `${i + 1}. ${event} ${side} $${stake.toFixed(2)}\n`;
      });
    }

    content += '\n{bold}Closed (last 5){/bold}\n\n';
    if (closed.length === 0) {
      content += '{yellow-fg}None yet{/yellow-fg}\n';
    } else {
      closed.slice(0, 5).forEach((t, i) => {
        const event = (t.event || '').substring(0, 13).padEnd(13);
        const color = t.profit >= 0 ? 'green' : 'red';
        content += `${i + 1}. ${event} {${color}-fg}$${t.profit.toFixed(4)}{/} (${t.roi.toFixed(1)}%)\n`;
      });
    }

    livePositionsBox.setContent(content);
    screen.render();
  }

  function togglePanel() {
    if (showPositions) {
      showPositions = false;
      showLivePositions = true;
    } else if (showLivePositions) {
      showLivePositions = false;
    } else {
      showPositions = true;
    }
    arbsBox.hidden = showPositions || showLivePositions;
    positionsBox.hidden = !showPositions;
    livePositionsBox.hidden = !showLivePositions;
    if (showPositions) renderPositions();
    if (showLivePositions) renderLivePositions();
    updateHelp();
    screen.render();
  }

  function toggleLivePanel() {
    showLivePositions = !showLivePositions;
    arbsBox.hidden = showPositions || showLivePositions;
    positionsBox.hidden = !showPositions;
    livePositionsBox.hidden = !showLivePositions;
    if (showLivePositions) renderLivePositions();
    updateHelp();
    screen.render();
  }

  function getActiveBox() {
    if (showLivePositions) return livePositionsBox;
    if (showPositions) return positionsBox;
    return arbsBox;
  }

  function scrollActiveBox(dir) {
    const box = getActiveBox();
    try {
      const current = box.getScrollPerc();
      const newPerc = Math.max(0, Math.min(100, current + dir * 10));
      box.setScrollPerc(newPerc);
      screen.render();
    } catch (_) {}
  }

  function scrollLogBox(dir) {
    try {
      const current = logBox.getScrollPerc();
      const newPerc = Math.max(0, Math.min(100, current + dir * 10));
      logBox.setScrollPerc(newPerc);
      screen.render();
    } catch (_) {}
  }

  function renderSettings() {
    let content = '{bold}↑↓ select  ←→ adjust  Space toggle  Enter save  Esc cancel{/bold}\n\n';
    settingsFields.forEach((f, i) => {
      const prefix = i === settingsSelected ? '{cyan-fg}▶ {/cyan-fg}' : '   ';
      let val;
      if (f.type === 'toggle') {
        val = f.value ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';
      } else if (f.type === 'string') {
        val = f.value || '(all)';
      } else {
        val = f.value.toFixed(f.step >= 1 ? 0 : 1);
      }
      content += `${prefix}${f.name}: ${val}\n`;
    });
    content += '\n {green-fg}[Enter]{/green-fg} Save  {red-fg}[Esc]{/red-fg} Cancel';
    settingsBox.setContent(content);
    settingsBox.hidden = false;
    screen.render();
  }

  function showSettings() {
    settingsSelected = 0;
    settingsMode = true;
    settingsFields[0].value = config.minArbROI * 100;
    settingsFields[1].value = config.maxBetPercent * 100;
    settingsFields[2].value = config.demoMode;
    settingsFields[3].value = config.liveMode;
    settingsFields[4].value = config.scanInterval / 1000;
    settingsFields[5].value = platformFilter;
    renderSettings();
  }

  function hideSettings() {
    settingsMode = false;
    settingsBox.hidden = true;
    screen.render();
  }

  function saveSettings() {
    config.minArbROI = settingsFields[0].value / 100;
    config.maxBetPercent = settingsFields[1].value / 100;
    config.demoMode = settingsFields[2].value;
    config.liveMode = settingsFields[3].value;
    autoScanInterval = settingsFields[4].value * 1000;
    config.liveOnly = settingsFields[5].value;
    platformFilter = settingsFields[6].value || '';
    log(`{green-fg}Settings saved: ROI ${(config.minArbROI * 100).toFixed(1)}%, Bet ${(config.maxBetPercent * 100).toFixed(0)}%, Demo ${config.demoMode ? 'ON' : 'OFF'}, Live ${config.liveMode ? 'ON' : 'OFF'}, Speed ${autoScanInterval / 1000}s, LiveOnly ${config.liveOnly ? 'ON' : 'OFF'}, Filter "${platformFilter || 'all'}"{/green-fg}`);
    hideSettings();
    updateHeader();
    updateHelp();
  }

  function startAutoScan() {
    if (autoScanTimer) return;
    autoScanEnabled = true;
    nextScanTime = Date.now() + autoScanInterval;
    log(`{green-fg}Auto-scan every ${Math.round(autoScanInterval / 1000)}s{/green-fg}`);
    updateHeader();
    updateHelp();
    const tick = () => {
      if (!autoScanEnabled) return;
      if (Date.now() >= nextScanTime) {
        doScan().then(() => {
          const interval = liveGameCount > 0 ? 15000 : (autoScanInterval || config.scanInterval);
          nextScanTime = Date.now() + interval;
          if (autoScanEnabled) autoScanTimer = setTimeout(tick, interval);
        });
        return;
      }
      autoScanTimer = setTimeout(tick, 1000);
      updateHeader();
    };
    autoScanTimer = setTimeout(tick, 1000);
  }

  function stopAutoScan() {
    autoScanEnabled = false;
    if (autoScanTimer) {
      clearTimeout(autoScanTimer);
      autoScanTimer = null;
    }
    log('{yellow-fg}Auto-scan stopped{/yellow-fg}');
    updateHeader();
    updateHelp();
  }

  function toggleAutoScan() {
    if (autoScanEnabled) stopAutoScan();
    else startAutoScan();
  }

  async function doScan() {
    scanCount++;
    updateHeader();
    log('Scan started...');
    const activeBox = getActiveBox();
    activeBox.setContent('{yellow-fg}Scanning odds from all platforms...{/yellow-fg}');
    screen.render();

    try {
      let allData = await odds.scanAll();
      let oddsData = Array.isArray(allData) ? allData : [];

      if (platformFilter) {
        const filter = platformFilter.toLowerCase();
        oddsData = oddsData.filter(o =>
          o.platformA?.toLowerCase().includes(filter) ||
          o.platformB?.toLowerCase().includes(filter) ||
          o.sport?.toLowerCase().includes(filter)
        );
      }

      log(`Fetched ${oddsData.length} odds entries`);
      liveGameCount = odds.countLiveGames(oddsData);
      const detected = arb.findArbitrages(oddsData);

      if ((config.demoMode || config.liveMode) && detected.length > 0) {
        const best = risk.selectBestArbs(detected, 3);
        for (const a of best) {
          if (risk.canExecute(a)) {
            const result = await exchange.executeArb(a, a);
            if (result.success) {
              log(`{green-fg}Executed: ${a.event} — $${result.totalProfit.toFixed(4)} ROI{/green-fg}`);
            }
          }
        }
      }

      log(`Found ${detected.length} arbitrage opportunities`);
      detected.slice(0, 5).forEach(a => {
        log(`${a.riskLevel.toUpperCase()} ${a.platformA}/${a.platformB}: ${a.event} — ${a.roi.toFixed(2)}%`);
      });

      const demo = db.getDemoSummary();
      if (config.demoMode && demo.open_count > 0) {
        log(`{bold}🎮 ${demo.open_count} open demo trades{/bold}`);
      }
      const real = db.getRealTradeSummary();
      if (config.liveMode && real.open_count > 0) {
        log(`{bold}🚀 ${real.open_count} open live trades{/bold}`);
      }

      renderArbs(detected, ` Arbitrage (${detected.length} found) `);
      renderPositions();
      renderLivePositions();
      updateHeader();
    } catch (err) {
      log(`{red-fg}Scan error: ${err.message}{/red-fg}`);
      const activeBox = getActiveBox();
      activeBox.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
      screen.render();
    }
  }

  async function toggleBot() {
    if (botRunning) {
      log('Stopping bot...');
      try {
        if (botModule && botModule.bot) {
          await botModule.bot.stop('user_stop');
        }
        botRunning = false;
        log('{yellow-fg}Bot stopped{/yellow-fg}');
      } catch (err) {
        log(`{red-fg}Error stopping bot: ${err.message}{/red-fg}`);
      }
    } else {
      log('{yellow-fg}Starting bot — Railway bot may conflict{/yellow-fg}');
      try {
        if (botModule && botModule.startBot) {
          await botModule.startBot();
          botRunning = true;
          log('{green-fg}Bot started{/green-fg}');
        } else {
          log('{red-fg}Bot module unavailable (missing TELEGRAM_BOT_TOKEN?){/red-fg}');
        }
      } catch (err) {
        log(`{red-fg}Bot start failed: ${err.message}{/red-fg}`);
      }
    }
    updateHeader();
  }

  screen.key(['q', 'C-c'], () => {
    if (settingsMode) return;
    if (autoScanEnabled) stopAutoScan();
    if (headerTimer) clearInterval(headerTimer);
    if (botRunning && botModule && botModule.bot) {
      botModule.bot.stop('user_quit');
    }
    db.close();
    process.exit(0);
  });

  screen.key(['r'], () => {
    if (settingsMode) return;
    doScan();
  });

  screen.key(['b'], () => {
    if (settingsMode) return;
    toggleBot();
  });

  screen.key(['p'], () => {
    if (settingsMode) return;
    togglePanel();
  });

  screen.key(['l'], () => {
    if (settingsMode) return;
    toggleLivePanel();
  });

  screen.key(['a'], () => {
    if (settingsMode) return;
    toggleAutoScan();
  });

  screen.key(['d'], () => {
    if (settingsMode) return;
    const demo = db.getDemoSummary();
    log(`Demo: ${demo.open_count} open, ${demo.closed_count} closed, P&L: $${(demo.total_profit || 0).toFixed(2)}`);
  });

  screen.key(['c'], () => {
    if (settingsMode) return;
    log('{red-fg}Clearing all demo data...{/red-fg}');
    db.clearDemoData();
    updateHeader();
    renderPositions();
    log('{green-fg}Demo data cleared{/green-fg}');
  });

  screen.key(['up', 'k'], () => {
    if (settingsMode) {
      settingsSelected = Math.max(0, settingsSelected - 1);
      renderSettings();
      return;
    }
    scrollActiveBox(-1);
  });

  screen.key(['down', 'j'], () => {
    if (settingsMode) {
      settingsSelected = Math.min(settingsFields.length - 1, settingsSelected + 1);
      renderSettings();
      return;
    }
    scrollActiveBox(1);
  });

  screen.key(['pageup'], () => {
    if (settingsMode) return;
    const box = getActiveBox();
    try {
      const current = box.getScrollPerc();
      box.setScrollPerc(Math.max(0, current - 25));
      screen.render();
    } catch (_) {}
  });

  screen.key(['pagedown'], () => {
    if (settingsMode) return;
    const box = getActiveBox();
    try {
      const current = box.getScrollPerc();
      box.setScrollPerc(Math.min(100, current + 25));
      screen.render();
    } catch (_) {}
  });

  screen.key(['\['], () => {
    if (settingsMode) return;
    scrollLogBox(-1);
  });

  screen.key(['\]'], () => {
    if (settingsMode) return;
    scrollLogBox(1);
  });

  screen.key(['left'], () => {
    if (!settingsMode) return;
    const f = settingsFields[settingsSelected];
    if (f.type !== 'toggle') {
      f.value = Math.max(f.min || 0, +(f.value - f.step).toFixed(2));
      renderSettings();
    }
  });

  screen.key(['right'], () => {
    if (!settingsMode) return;
    const f = settingsFields[settingsSelected];
    if (f.type !== 'toggle') {
      f.value = Math.min(f.max || 100, +(f.value + f.step).toFixed(2));
      renderSettings();
    }
  });

  screen.key(['enter'], () => {
    if (settingsMode) {
      saveSettings();
      return;
    }
  });

  screen.key(['escape'], () => {
    if (settingsMode) {
      hideSettings();
      log('{yellow-fg}Settings cancelled{/yellow-fg}');
      return;
    }
  });

  screen.key(['space'], () => {
    if (!settingsMode) return;
    const f = settingsFields[settingsSelected];
    if (f.type === 'toggle') {
      f.value = !f.value;
      renderSettings();
    }
  });

  updateHeader();
  updateHelp();
  logBox.setContent(
    `Web3 Sports Arbitrage Scanner v2\n` +
    `Bankroll: $${config.bankroll} | Max bet: $${(config.bankroll * config.maxBetPercent).toFixed(2)}\n` +
    `Press r to scan | p for positions | a for auto-scan | s for settings\n`
  );
  screen.render();
  log('Scanner started — press r to scan');

  headerTimer = setInterval(() => {
    if (autoScanEnabled) updateHeader();
  }, 1000);
}

process.on('uncaughtException', (err) => {
  console.error('[TUI] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[TUI] Unhandled rejection:', reason?.message || reason);
});

startTUI().catch(err => {
  console.error('TUI Error:', err);
  process.exit(1);
});
