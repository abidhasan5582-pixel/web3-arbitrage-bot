const blessed = require('blessed');
const config = require('./config');
const arb = require('./arbitrage');
const db = require('./database');
const odds = require('./oddsFetcher');
const exchange = require('./exchange');
const risk = require('./risk');

let botModule;
try { botModule = require('./bot'); } catch (_) {}

function color(val, low, mid) {
  if (val >= mid) return 'green';
  if (val >= low) return 'yellow';
  return 'red';
}

function pnl(val) {
  return val >= 0 ? `{green-fg}+$${val.toFixed(2)}{/green-fg}` : `{red-fg}-$${Math.abs(val).toFixed(2)}{/red-fg}`;
}

function badge(text, fg, bg) {
  return `{${fg}-fg}{${bg}-bg} ${text} {/${bg}-bg}{/${fg}-fg}`;
}

function truncate(s, n) {
  if (!s) return ''.padEnd(n);
  s = String(s);
  return s.length > n ? s.substring(0, n - 1) + '\u2026' : s.padEnd(n);
}

async function startTUI() {
  await db.initDatabase();

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Web3 Sports Arbitrage Scanner',
    cursor: { artificial: true, blink: true },
    dockBorders: true,
    fullUnicode: true,
  });

  let botRunning = false;
  let scanCount = 0;
  let lastScanTime = 0;
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
  let isScanning = false;
  let lastScanResultCount = 0;
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
    top: 0, left: 0, width: '100%', height: 5,
    content: '',
    tags: true,
    style: { fg: 'white', bg: 'blue' },
  });
  screen.append(header);

  const arbsBox = blessed.box({
    top: 5, left: 0, width: '65%', bottom: '28%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '\u2588', fg: 'cyan' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'cyan' },
    label: '',
  });
  screen.append(arbsBox);

  const positionsBox = blessed.box({
    top: 5, right: 0, width: '35%', bottom: '28%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '\u2588', fg: 'yellow' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'yellow' },
    hidden: true,
  });
  screen.append(positionsBox);

  const livePositionsBox = blessed.box({
    top: 5, right: 0, width: '35%', bottom: '28%+1',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '\u2588', fg: 'magenta' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'magenta' },
    hidden: true,
  });
  screen.append(livePositionsBox);

  const logBox = blessed.box({
    bottom: 1, left: 0, width: '100%', height: '28%',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '\u2588', fg: 'green' },
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 'white' },
    label: '',
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
    width: 48, height: 13,
    content: '',
    tags: true,
    border: { type: 'line', fg: 'yellow' },
    style: { fg: 'white', bg: 'black' },
    hidden: true,
    keys: false,
    vi: false,
    shadow: true,
  });
  screen.append(settingsBox);

  function log(msg) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    logLines.push(`[${time}] ${msg}`);
    if (logLines.length > 500) logLines.shift();
    logBox.setContent(logLines.join('\n'));
    screen.render();
    try { logBox.setScrollPerc(100); screen.render(); } catch (_) {}
  }

  function sourceIndicator() {
    const missing = config.validate();
    const parts = ['ESPN', 'Poly', 'Azuro', 'Sharp', 'Odds.io'];
    return parts.map((s, i) => {
      const ok = !missing.includes(s.toLowerCase());
      return ok ? `{green-fg}\u25CF{/green-fg}${s}` : `{red-fg}\u25CB{/red-fg}${s}`;
    }).join(' ');
  }

  function updateHeader() {
    const missing = config.validate();
    const demo = db.getDemoSummary();
    const real = db.getRealTradeSummary();
    const demoProfit = (demo.total_profit || 0);
    const realProfit = (real.total_profit || 0);
    const botStatus = botRunning ? badge('BOT', 'green', 'black') : badge('BOT', 'yellow', 'black');
    const demoStatus = config.demoMode ? badge('DEMO', 'green', 'black') : '';
    const liveStatus = config.liveMode ? badge('LIVE', 'magenta', 'black') : '';
    const autoStatus = autoScanEnabled
      ? `{cyan-fg}AUTO {/cyan-fg}{bold}${Math.max(0, Math.round((nextScanTime - Date.now()) / 1000))}s{/bold}`
      : '';
    const liveInfo = liveGameCount > 0
      ? `{red-fg}\u25CF{/red-fg}{bold}${liveGameCount}LIVE{/bold}`
      : '';
    const scanCountStr = scanCount > 0 ? ` Scan:${scanCount}` : '';
    const lastScanStr = lastScanTime > 0
      ? ` ${Math.floor((Date.now() - lastScanTime) / 1000)}s ago`
      : '';
    const sources = sourceIndicator();
    const bar = '{black-bg}{white-fg} \u2502 {/white-fg}{/black-bg}';
    const profitColor = demoProfit >= 0 ? 'green' : 'red';
    const liveProfitColor = realProfit >= 0 ? 'green' : 'red';

    header.setContent([
      `{bold}Web3 Sports Arbitrage Scanner{/bold}  \u2502  {white-bg}{black-fg} $${config.bankroll.toFixed(2)} {/black-fg}{/white-bg}  \u2502  ${botStatus}  ${demoStatus}  ${liveStatus}  ${autoStatus}  ${liveInfo}`,
      `Min ROI: {bold}${(config.minArbROI * 100).toFixed(1)}%{/bold}${bar}Max Bet: {bold}$${(config.bankroll * config.maxBetPercent).toFixed(2)}{/bold}${bar}Speed: {bold}${autoScanInterval / 1000}s{/bold}${bar}Telegram: ${missing.length === 0 ? '{green-fg}\u2713{/green-fg}' : '{red-fg}\u2717{/red-fg}'}${bar}Scan#{bold}${scanCount}{/bold}${lastScanStr}`,
      `{bold}\uD83C\uDFB2 Demo{/bold} \u2502 Open: {bold}${demo.open_count || 0}{/bold}  Closed: {bold}${demo.closed_count || 0}{/bold}  P&L: {${profitColor}-fg}$${(demoProfit).toFixed(2)}{/${profitColor}-fg}`,
      `{bold}\uD83D\uDE80 Live{/bold}  \u2502 Open: {bold}${real.open_count || 0}{/bold}  Closed: {bold}${real.closed_count || 0}{/bold}  P&L: {${liveProfitColor}-fg}$${(realProfit).toFixed(2)}{/${liveProfitColor}-fg}`,
      `Scanners: ${sources}`,
    ].join('\n'));
    screen.render();
  }

  function updateHelp() {
    let mode = ' ARBS ';
    if (showPositions) mode = ' DEMO ';
    if (showLivePositions) mode = ' LIVE ';
    const autoLabel = autoScanEnabled ? '{bold}a{/bold} stop' : '{bold}a{/bold} auto';
    helpBox.setContent(
      `  {bold}r{/bold} scan  {bold}b{/bold} bot  {bold}p{/bold}${mode} {bold}l{/bold}live ${autoLabel}  {bold}d{/bold} stats  {bold}c{/bold} clear  {bold}s{/bold} set  {bold}q{/bold} quit  \u2502  {bold}\u2191\u2193{/bold} scroll  {bold}[ ]{/bold} log`
    );
    screen.render();
  }

  function formatEventName(event, maxLen) {
    const e = event || '';
    if (e.length <= maxLen) return e.padEnd(maxLen);
    return e.substring(0, maxLen - 1) + '\u2026';
  }

  function renderArbs(arbs, label) {
    let content = '';
    const liveCount = arbs.filter(a => a.isLive).length;
    const labelParts = [label || ` Arbitrage Opportunities (${arbs.length}) `];
    if (liveCount > 0) labelParts.push(`{red-fg}\u25CF ${liveCount} LIVE{/red-fg}`);
    arbsBox.setLabel(labelParts.join(' '));

    if (arbs.length === 0) {
      content = '{yellow-fg}  No opportunities found. Press r to scan.{/yellow-fg}\n';
      arbsBox.setContent(content);
      screen.render();
      return;
    }

    const platformColors = {
      'Polymarket': 'magenta', 'SX Bet': 'cyan', 'DraftKings': 'blue',
      'FanDuel': 'green', 'ESPN BET': 'yellow', 'Azuro': 'white',
      'SharpAPI': 'red',
    };

    const platformShort = (p) => {
      if (!p) return '?';
      if (p.includes('DraftKings')) return 'DK';
      if (p.includes('FanDuel')) return 'FD';
      if (p.includes('Polymarket')) return 'Poly';
      if (p.includes('SX Bet')) return 'SX';
      if (p.includes('ESPN')) return 'ESPN';
      if (p.includes('Azuro')) return 'Azu';
      if (p.includes('Sharp')) return 'SH';
      return p.substring(0, 4);
    };

    content += `  {bold}{underline}Event                      Platf  OddsA   Platf  OddsB    ROI%    Profit   Risk{/underline}{/bold}\n`;

    arbs.slice(0, 25).forEach((a, i) => {
      const event = formatEventName(a.event, 25);
      const pA = platformShort(a.platformA).padEnd(5);
      const pB = platformShort(a.platformB).padEnd(5);
      const oA = (a.oddsA || 0).toFixed(2).padStart(6);
      const oB = (a.oddsB || 0).toFixed(2).padStart(6);
      const roiStr = (a.roi || 0).toFixed(2).padStart(6) + '%';
      const profitStr = '$' + (a.profit || 0).toFixed(2).padStart(6);

      const roiColor = color(a.roi || 0, 2, 5);
      const riskColor = a.riskLevel === 'high' ? 'red' : a.riskLevel === 'medium' ? 'yellow' : 'green';
      const cA = platformColors[a.platformA] || 'white';
      const cB = platformColors[a.platformB] || 'white';
      const liveTag = a.isLive ? `{red-fg}\u25CF{/red-fg} ` : '  ';
      content += `${liveTag}${event} {${cA}-fg}${pA}{/}${oA} {${cB}-fg}${pB}{/}${oB} {${roiColor}-fg}${roiStr}{/} {${riskColor}-fg}${profitStr}{/} {${riskColor}-fg}${(a.riskLevel || '?').toUpperCase().padEnd(5)}{/}\n`;
    });
    if (arbs.length > 25) {
      content += `\n  {yellow-fg}... and ${arbs.length - 25} more. Press \u2193 to scroll.{/yellow-fg}\n`;
    }
    arbsBox.setContent(content);
    screen.render();
  }

  function renderPositions() {
    const open = db.getOpenDemoTrades();
    const closed = db.getClosedDemoTrades(10);
    const summary = db.getDemoSummary();

    positionsBox.setLabel(` Demo Positions (${open.length} open, ${summary.closed_count || 0} closed) `);
    let content = '';

    content += `{bold}Open Positions{/bold}\n\n`;
    if (open.length === 0) {
      content += '  {yellow-fg}No open demo positions{/yellow-fg}\n';
    } else {
      content += `  {underline}Event          Stake    P&L       Held{/underline}\n`;
      open.slice(0, 10).forEach((t, i) => {
        const event = truncate(t.event || '', 14);
        const expPnl = t.expected_profit || 0;
        const held = Math.floor((Date.now() - new Date(t.opened_at).getTime()) / 60000);
        const stake = t.total_staked || 0;
        const c = color(expPnl, 0, 0.001);
        const hStr = held >= 60 ? `${(held / 60).toFixed(1)}h` : `${held}m`;
        content += `  ${event} ${stake.toFixed(2).padStart(7)} {${c}-fg}${pnl(expPnl)}{/} ${hStr.padStart(5)}\n`;
      });
    }

    content += `\n{bold}Recently Closed{/bold}\n\n`;
    if (closed.length === 0) {
      content += '  {yellow-fg}No closed trades yet{/yellow-fg}\n';
    } else {
      content += `  {underline}Event          Result     ROI    {/underline}\n`;
      closed.slice(0, 10).forEach((t, i) => {
        const event = truncate(t.event || '', 14);
        const c = t.profit >= 0 ? 'green' : 'red';
        content += `  ${event} {${c}-fg}$${(t.profit || 0).toFixed(4).padStart(7)}{/} {${c}-fg}${(t.roi || 0).toFixed(1).padStart(5)}%{/}\n`;
      });
    }

    positionsBox.setContent(content);
    screen.render();
  }

  function renderLivePositions() {
    const open = db.getOpenRealTrades();
    const closed = db.getClosedRealTrades(10);
    const summary = db.getRealTradeSummary();

    livePositionsBox.setLabel(` Live Positions (${open.length} open) `);
    let content = '';

    content += `  Total P&L: ${pnl(summary.total_profit || 0)}\n`;
    content += `  Open: {bold}${summary.open_count || 0}{/bold}  |  Closed: {bold}${summary.closed_count || 0}{/bold}\n\n`;

    content += `{bold}Open Trades{/bold}\n\n`;
    if (open.length === 0) {
      content += '  {yellow-fg}No open live positions{/yellow-fg}\n';
    } else {
      content += `  {underline}Event          Stake    Side{/underline}\n`;
      open.slice(0, 10).forEach((t, i) => {
        const event = truncate(t.event || '', 14);
        const stake = t.stake || 0;
        const side = (t.side || '').substring(0, 4).toUpperCase();
        content += `  ${event} ${stake.toFixed(2).padStart(7)} {cyan-fg}${side.padStart(5)}{/cyan-fg}\n`;
      });
    }

    content += `\n{bold}Recently Closed{/bold}\n\n`;
    if (closed.length === 0) {
      content += '  {yellow-fg}None yet{/yellow-fg}\n';
    } else {
      content += `  {underline}Event          Result     ROI{/underline}\n`;
      closed.slice(0, 10).forEach((t, i) => {
        const event = truncate(t.event || '', 14);
        const c = t.profit >= 0 ? 'green' : 'red';
        content += `  ${event} {${c}-fg}$${(t.profit || 0).toFixed(4).padStart(7)}{/} {${c}-fg}${(t.roi || 0).toFixed(1).padStart(5)}%{/}\n`;
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
      box.setScrollPerc(Math.max(0, Math.min(100, current + dir * 8)));
      screen.render();
    } catch (_) {}
  }

  function scrollLogBox(dir) {
    try {
      const current = logBox.getScrollPerc();
      logBox.setScrollPerc(Math.max(0, Math.min(100, current + dir * 10)));
      screen.render();
    } catch (_) {}
  }

  function renderSettings() {
    let content = '{bold}\u2191\u2195 select  \u2190\u2192 adjust  Space toggle  Enter save  Esc cancel{/bold}\n\n';
    settingsFields.forEach((f, i) => {
      const prefix = i === settingsSelected ? '{cyan-fg}\u25B6{/cyan-fg} ' : '   ';
      let val;
      if (f.type === 'toggle') {
        val = f.value ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';
      } else if (f.type === 'string') {
        val = f.value ? `{yellow-fg}${f.value}{/yellow-fg}` : '{white-fg}(all){/white-fg}';
      } else {
        val = f.value.toFixed(f.step >= 1 ? 0 : 1);
      }
      content += `${prefix}${f.name}: {bold}${val}{/bold}\n`;
    });
    content += '\n {green-fg}\u23CE{/green-fg} Save  {red-fg}Esc{/red-fg} Cancel';
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
    log(`{green-fg}Settings saved{/green-fg} ROI ${(config.minArbROI * 100).toFixed(1)}%  Bet ${(config.maxBetPercent * 100).toFixed(0)}%  Demo ${config.demoMode ? 'ON' : 'OFF'}  Live ${config.liveMode ? 'ON' : 'OFF'}  Speed ${autoScanInterval / 1000}s  LiveOnly ${config.liveOnly ? 'ON' : 'OFF'}  Filter "${platformFilter || 'all'}"`);
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
    if (isScanning) return;
    isScanning = true;
    scanCount++;
    lastScanTime = Date.now();
    updateHeader();

    const activeBox = getActiveBox();
    activeBox.setContent('{yellow-fg}  Scanning odds from all platforms...{/yellow-fg}');
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

      log(`Fetched {bold}${oddsData.length}{/bold} odds entries`);
      liveGameCount = odds.countLiveGames(oddsData);
      const detected = arb.findArbitrages(oddsData);
      const internal = arb.findInternalArbs(oddsData);
      const allArbs = [...detected];
      for (const ia of internal) {
        if (!allArbs.find(a => a.event === ia.event && a.platformA === ia.platformA)) {
          allArbs.push(ia);
        }
      }
      allArbs.sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return (b.roi || 0) - (a.roi || 0);
      });
      lastScanResultCount = allArbs.length;

      if ((config.demoMode || config.liveMode) && allArbs.length > 0) {
        const bestPerEvent = {};
        for (const a of allArbs) {
          const assessed = risk.assessArbRisk(a);
          if (!assessed.recommended) continue;
          if (!bestPerEvent[a.event] || assessed.netROI > bestPerEvent[a.event].netROI) {
            bestPerEvent[a.event] = assessed;
          }
        }
        const uniqueArbs = Object.values(bestPerEvent);
        let executed = 0;
        for (const a of uniqueArbs) {
          if (!risk.canExecute(a)) continue;
          const result = await exchange.executeArb(a, a);
          if (result.success) {
            executed++;
            log(`{green-fg}Executed${a.isLive ? ' LIVE' : ''}: ${a.event} — $${result.totalProfit.toFixed(4)}{/green-fg}`);
          }
        }
        if (executed > 0) log(`{cyan-fg}Executed ${executed} trades in this scan{/cyan-fg}`);
      }

      const liveArbs = allArbs.filter(a => a.isLive);
      if (liveArbs.length > 0) {
        log('{red-fg}\u25CF ' + liveArbs.length + ' live arb(s){/red-fg} -- prioritized for execution');
      }

      log(`Found {bold}${allArbs.length}{/bold} arb opportunities (${liveArbs.length} live)`);
      allArbs.slice(0, 5).forEach(a => {
        const liveTag = a.isLive ? '{red-fg}\u25CF{/red-fg} ' : '';
        log(`${liveTag}${(a.riskLevel || '').toUpperCase().padEnd(5)} ${a.platformA}/${a.platformB}: ${a.event || ''} — {bold}${(a.roi || 0).toFixed(2)}%{/bold}`);
      });

      const demo = db.getDemoSummary();
      if (config.demoMode && demo.open_count > 0) {
        log(`{cyan-fg}\uD83C\uDFB2 ${demo.open_count} open demo trade(s){/cyan-fg}`);
      }
      const real = db.getRealTradeSummary();
      if (config.liveMode && real.open_count > 0) {
        log(`{magenta-fg}\uD83D\uDE80 ${real.open_count} open live trade(s){/magenta-fg}`);
      }

      renderArbs(allArbs, ` Arbitrage (${allArbs.length}) `);
      renderPositions();
      renderLivePositions();
      updateHeader();
    } catch (err) {
      log(`{red-fg}Scan error: ${err.message}{/red-fg}`);
      const activeBox = getActiveBox();
      activeBox.setContent(`{red-fg}  Error: ${err.message}{/red-fg}`);
      screen.render();
    } finally {
      isScanning = false;
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
      log('{yellow-fg}Starting bot...{/yellow-fg}');
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

  screen.key(['r'], () => { if (!settingsMode) doScan(); });
  screen.key(['b'], () => { if (!settingsMode) toggleBot(); });
  screen.key(['p'], () => { if (!settingsMode) togglePanel(); });
  screen.key(['l'], () => { if (!settingsMode) toggleLivePanel(); });
  screen.key(['a'], () => { if (!settingsMode) toggleAutoScan(); });
  screen.key(['s'], () => { if (!settingsMode) showSettings(); });
  screen.key(['d'], () => {
    if (settingsMode) return;
    const demo = db.getDemoSummary();
    const real = db.getRealTradeSummary();
    const bal = exchange.getBalances();
    log(`Demo: ${demo.open_count} open, ${demo.closed_count} closed, P&L $${(demo.total_profit || 0).toFixed(2)}  |  Live: ${real.open_count} open, ${real.closed_count} closed, P&L $${(real.total_profit || 0).toFixed(2)}`);
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
    try { box.setScrollPerc(Math.max(0, box.getScrollPerc() - 25)); screen.render(); } catch (_) {}
  });
  screen.key(['pagedown'], () => {
    if (settingsMode) return;
    const box = getActiveBox();
    try { box.setScrollPerc(Math.min(100, box.getScrollPerc() + 25)); screen.render(); } catch (_) {}
  });

  screen.key(['['], () => { if (!settingsMode) scrollLogBox(-1); });
  screen.key(['\]'], () => { if (!settingsMode) scrollLogBox(1); });

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
  screen.key(['enter'], () => { if (settingsMode) saveSettings(); });
  screen.key(['escape'], () => {
    if (settingsMode) { hideSettings(); log('{yellow-fg}Settings cancelled{/yellow-fg}'); }
  });
  screen.key(['space'], () => {
    if (!settingsMode) return;
    const f = settingsFields[settingsSelected];
    if (f.type === 'toggle') { f.value = !f.value; renderSettings(); }
  });

  updateHeader();
  updateHelp();
  logBox.setLabel(' Event Log ');
  logBox.setContent(
    `{cyan-fg}  Web3 Sports Arbitrage Scanner v2{/cyan-fg}\n` +
    `  Bankroll: {bold}$${config.bankroll}{/bold}  |  Max bet: {bold}$${(config.bankroll * config.maxBetPercent).toFixed(2)}{/bold}\n` +
    `  {yellow-fg}Press r to scan  |  p for positions  |  a for auto-scan  |  s for settings{/yellow-fg}\n`
  );
  screen.render();
  log('{green-fg}Scanner started — press r to scan{/green-fg}');

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
