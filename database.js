const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.ARB_DB_PATH || path.join(__dirname, 'arbitrage.db');

let db;
let saveTimer = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode=WAL');

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      sport TEXT,
      platform_a TEXT NOT NULL,
      odds_a REAL NOT NULL,
      stake_a REAL NOT NULL,
      platform_b TEXT NOT NULL,
      odds_b REAL NOT NULL,
      stake_b REAL NOT NULL,
      total_staked REAL NOT NULL,
      guaranteed_return REAL NOT NULL,
      profit REAL NOT NULL,
      roi REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      sport TEXT,
      home TEXT,
      away TEXT,
      platform_a TEXT NOT NULL,
      odds_a REAL NOT NULL,
      platform_b TEXT NOT NULL,
      odds_b REAL NOT NULL,
      roi REAL NOT NULL,
      profit REAL,
      risk_level TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  try { db.run('ALTER TABLE bets ADD COLUMN is_demo INTEGER DEFAULT 0'); } catch (_) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS demo_stats (
      date TEXT PRIMARY KEY,
      profit REAL DEFAULT 0,
      trades INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      best_roi REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      profit REAL DEFAULT 0,
      arbs_found INTEGER DEFAULT 0,
      arbs_executed INTEGER DEFAULT 0,
      best_roi REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS demo_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      sport TEXT,
      home TEXT,
      away TEXT,
      platform_a TEXT NOT NULL,
      odds_a REAL NOT NULL,
      stake_a REAL NOT NULL,
      platform_b TEXT NOT NULL,
      odds_b REAL NOT NULL,
      stake_b REAL NOT NULL,
      total_staked REAL NOT NULL,
      expected_profit REAL NOT NULL,
      expected_roi REAL NOT NULL,
      profit REAL DEFAULT 0,
      roi REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      source TEXT,
      commence_time TEXT,
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS real_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arb_id TEXT,
      event TEXT NOT NULL,
      platform TEXT NOT NULL,
      market_id TEXT,
      side TEXT NOT NULL,
      odds REAL NOT NULL,
      stake REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_hash TEXT,
      order_id TEXT,
      error TEXT,
      profit REAL DEFAULT 0,
      roi REAL DEFAULT 0,
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    )
  `);

  saveDb();
  return db;
}

function flushDb() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
      console.error(`[Database] flushDb error: ${err.message}`, err.stack?.split('\n')[1]);
    }
  }
}

function saveDb() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushDb, 5000);
}

function queryAll(sql, params = {}) {
  try {
    const stmt = db.prepare(sql);
    if (Object.keys(params).length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (err) {
    console.error(`[Database] queryAll error: ${err.message}`, err.stack?.split('\n')[1]);
    return [];
  }
}

function queryOne(sql, params = {}) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSql(sql, params = {}) {
  try {
    if (Object.keys(params).length > 0) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
    } else {
      db.run(sql);
    }
    saveDb();
  } catch (err) {
    console.error(`[Database] runSql error: ${err.message}`, err.stack?.split('\n')[1]);
  }
}

module.exports = {
  initDatabase,

  getSetting(key, defaultValue = null) {
    const row = queryOne('SELECT value FROM settings WHERE key = $key', { $key: key });
    return row ? row.value : defaultValue;
  },

  saveSetting(key, value) {
    runSql('INSERT OR REPLACE INTO settings (key, value) VALUES ($key, $value)', {
      $key: key,
      $value: String(value),
    });
  },

  logBet(bet) {
    runSql(`INSERT INTO bets (event, sport, platform_a, odds_a, stake_a, platform_b, odds_b, stake_b, total_staked, guaranteed_return, profit, roi, status, is_demo)
      VALUES ($event, $sport, $platformA, $oddsA, $stakeA, $platformB, $oddsB, $stakeB, $totalStaked, $guaranteedReturn, $profit, $roi, $status, $isDemo)`, {
      $event: bet.event,
      $sport: bet.sport || '',
      $platformA: bet.platformA,
      $oddsA: bet.oddsA,
      $stakeA: bet.stakeA,
      $platformB: bet.platformB,
      $oddsB: bet.oddsB,
      $stakeB: bet.stakeB,
      $totalStaked: bet.stakeA + bet.stakeB,
      $guaranteedReturn: bet.guaranteedReturn,
      $profit: bet.profit,
      $roi: bet.roi,
      $status: bet.status || 'settled',
      $isDemo: bet.isDemo ? 1 : 0,
    });
  },

  getRecentBets(limit = 20, isDemo) {
    const sql = isDemo !== undefined
      ? `SELECT * FROM bets WHERE is_demo = ${isDemo ? 1 : 0} ORDER BY created_at DESC LIMIT $limit`
      : 'SELECT * FROM bets ORDER BY created_at DESC LIMIT $limit';
    return queryAll(sql, { $limit: limit });
  },

  getBetsByDate(date) {
    return queryAll("SELECT * FROM bets WHERE date(created_at) = $date ORDER BY created_at DESC", { $date: date });
  },

  getBetsByDateRange(startDate, endDate) {
    return queryAll("SELECT * FROM bets WHERE date(created_at) BETWEEN $start AND $end ORDER BY created_at DESC", {
      $start: startDate,
      $end: endDate,
    });
  },

  saveOpportunity(opp) {
    runSql(`INSERT INTO opportunities (event, sport, home, away, platform_a, odds_a, platform_b, odds_b, roi, profit, risk_level)
      VALUES ($event, $sport, $home, $away, $platformA, $oddsA, $platformB, $oddsB, $roi, $profit, $riskLevel)`, {
      $event: opp.event,
      $sport: opp.sport || '',
      $home: opp.home || '',
      $away: opp.away || '',
      $platformA: opp.platformA,
      $oddsA: opp.oddsA,
      $platformB: opp.platformB,
      $oddsB: opp.oddsB,
      $roi: opp.roi,
      $profit: opp.profit || 0,
      $riskLevel: opp.riskLevel || 'medium',
    });
  },

  getRecentArbs(limit = 20) {
    return queryAll('SELECT * FROM opportunities ORDER BY created_at DESC LIMIT $limit', { $limit: limit });
  },

  getDailyStats(date) {
    const row = queryOne('SELECT * FROM daily_stats WHERE date = $date', { $date: date });
    return row || { date, profit: 0, arbs_found: 0, arbs_executed: 0, best_roi: 0 };
  },

  updateDailyStats(date, stats) {
    const existing = this.getDailyStats(date);
    runSql(`INSERT INTO daily_stats (date, profit, arbs_found, arbs_executed, best_roi)
      VALUES ($date, $profit, $arbsFound, $arbsExecuted, $bestRoi)
      ON CONFLICT(date) DO UPDATE SET
        profit = profit + $profit2,
        arbs_found = arbs_found + $arbsFound2,
        arbs_executed = arbs_executed + $arbsExecuted2,
        best_roi = MAX(best_roi, $bestRoi2)`, {
      $date: date,
      $profit: (existing.profit || 0) + (stats.profit || 0),
      $arbsFound: (existing.arbs_found || 0) + (stats.arbsFound || 0),
      $arbsExecuted: (existing.arbs_executed || 0) + (stats.arbsExecuted || 0),
      $bestRoi: Math.max(existing.best_roi || 0, stats.bestRoi || 0),
      $profit2: stats.profit || 0,
      $arbsFound2: stats.arbsFound || 0,
      $arbsExecuted2: stats.arbsExecuted || 0,
      $bestRoi2: stats.bestRoi || 0,
    });
  },

  getRecentDailyStats(days = 7) {
    return queryAll('SELECT * FROM daily_stats ORDER BY date DESC LIMIT $days', { $days: days });
  },

  logDemoTrade(trade) {
    openDemoTrade(trade);
  },

  getDemoSummary() {
    const open = queryOne("SELECT COUNT(*) as count, COALESCE(SUM(expected_profit), 0) as expected_pnl FROM demo_trades WHERE status='open'");
    const closed = queryOne("SELECT COUNT(*) as count, COALESCE(SUM(profit), 0) as total_profit, COALESCE(SUM(total_staked), 0) as total_staked, COALESCE(AVG(roi), 0) as avg_roi FROM demo_trades WHERE status='closed'");
    const today = queryOne("SELECT COUNT(*) as today_trades, COALESCE(SUM(profit), 0) as today_profit FROM demo_trades WHERE status='closed' AND date(closed_at) = date('now')");
    return {
      open_count: open?.count || 0,
      expected_pnl: open?.expected_pnl || 0,
      closed_count: closed?.count || 0,
      total_profit: closed?.total_profit || 0,
      total_staked: closed?.total_staked || 0,
      avg_roi: closed?.avg_roi || 0,
      today_trades: today?.today_trades || 0,
      today_profit: today?.today_profit || 0,
    };
  },

  openDemoTrade(trade) {
    runSql(`INSERT INTO demo_trades (event, sport, home, away, platform_a, odds_a, stake_a, platform_b, odds_b, stake_b, total_staked, expected_profit, expected_roi, status, source, commence_time)
      VALUES ($event, $sport, $home, $away, $platformA, $oddsA, $stakeA, $platformB, $oddsB, $stakeB, $totalStaked, $expectedProfit, $expectedRoi, 'open', $source, $commenceTime)`, {
      $event: trade.event,
      $sport: trade.sport || '',
      $home: trade.home || '',
      $away: trade.away || '',
      $platformA: trade.platformA,
      $oddsA: trade.oddsA,
      $stakeA: trade.stakeA,
      $platformB: trade.platformB,
      $oddsB: trade.oddsB,
      $stakeB: trade.stakeB,
      $totalStaked: trade.stakeA + trade.stakeB,
      $expectedProfit: trade.expectedProfit || trade.profit || 0,
      $expectedRoi: trade.expectedRoi || trade.roi || 0,
      $source: trade.source || '',
      $commenceTime: trade.commenceTime || null,
    });
  },

  closeDemoTrade(id, actualProfit, actualRoi) {
    runSql("UPDATE demo_trades SET status='closed', profit=$profit, roi=$roi, closed_at=datetime('now') WHERE id=$id", {
      $id: id,
      $profit: actualProfit,
      $roi: actualRoi,
    });
  },

  getOpenDemoTrades() {
    return queryAll("SELECT * FROM demo_trades WHERE status='open' ORDER BY opened_at ASC");
  },

  getClosedDemoTrades(limit = 20) {
    return queryAll('SELECT * FROM demo_trades WHERE status=\'closed\' ORDER BY closed_at DESC LIMIT $limit', { $limit: limit });
  },

  getAllDemoTrades(limit = 20) {
    return queryAll('SELECT * FROM demo_trades ORDER BY opened_at DESC LIMIT $limit', { $limit: limit });
  },

  updateDemoStats(date, stats) {
    runSql(`INSERT INTO demo_stats (date, profit, trades, wins, losses, best_roi)
      VALUES ($date, $profit, $trades, $wins, $losses, $bestRoi)
      ON CONFLICT(date) DO UPDATE SET
        profit = profit + $profit2,
        trades = trades + $trades2,
        wins = wins + $wins2,
        losses = losses + $losses2,
        best_roi = MAX(best_roi, $bestRoi2)`, {
      $date: date,
      $profit: stats.profit || 0,
      $trades: stats.trades || 0,
      $wins: stats.wins || 0,
      $losses: stats.losses || 0,
      $bestRoi: stats.bestRoi || 0,
      $profit2: stats.profit || 0,
      $trades2: stats.trades || 0,
      $wins2: stats.wins || 0,
      $losses2: stats.losses || 0,
      $bestRoi2: stats.bestRoi || 0,
    });
  },

  getRecentDemoStats(days = 7) {
    return queryAll('SELECT * FROM demo_stats ORDER BY date DESC LIMIT $days', { $days: days });
  },

  clearDemoData() {
    runSql('DELETE FROM bets WHERE is_demo = 1');
    runSql('DELETE FROM demo_stats');
    runSql('DELETE FROM demo_trades');
  },

  openRealTrade(trade) {
    runSql(`INSERT INTO real_trades (arb_id, event, platform, market_id, side, odds, stake, status, tx_hash, order_id, error)
      VALUES ($arbId, $event, $platform, $marketId, $side, $odds, $stake, $status, $txHash, $orderId, $error)`, {
      $arbId: trade.arbId || null,
      $event: trade.event,
      $platform: trade.platform,
      $marketId: trade.marketId || null,
      $side: trade.side,
      $odds: trade.odds,
      $stake: trade.stake,
      $status: trade.status || 'open',
      $txHash: trade.txHash || null,
      $orderId: trade.orderId || null,
      $error: trade.error || null,
    });
  },

  closeRealTrade(id, actualProfit, actualRoi) {
    runSql("UPDATE real_trades SET status='closed', profit=$profit, roi=$roi, closed_at=datetime('now') WHERE id=$id", {
      $id: id,
      $profit: actualProfit,
      $roi: actualRoi,
    });
  },

  updateRealTrade(id, updates) {
    const fields = [];
    const params = { $id: id };
    if (updates.status !== undefined) { fields.push('status=$status'); params.$status = updates.status; }
    if (updates.txHash !== undefined) { fields.push('tx_hash=$txHash'); params.$txHash = updates.txHash; }
    if (updates.orderId !== undefined) { fields.push('order_id=$orderId'); params.$orderId = updates.orderId; }
    if (updates.error !== undefined) { fields.push('error=$error'); params.$error = updates.error; }
    if (updates.profit !== undefined) { fields.push('profit=$profit'); params.$profit = updates.profit; }
    if (updates.roi !== undefined) { fields.push('roi=$roi'); params.$roi = updates.roi; }
    if (fields.length === 0) return;
    runSql(`UPDATE real_trades SET ${fields.join(', ')} WHERE id=$id`, params);
  },

  getOpenRealTrades() {
    return queryAll("SELECT * FROM real_trades WHERE status IN ('pending', 'open') ORDER BY opened_at ASC");
  },

  getClosedRealTrades(limit = 20) {
    return queryAll('SELECT * FROM real_trades WHERE status=\'closed\' ORDER BY closed_at DESC LIMIT $limit', { $limit: limit });
  },

  getAllRealTrades(limit = 20) {
    return queryAll('SELECT * FROM real_trades ORDER BY opened_at DESC LIMIT $limit', { $limit: limit });
  },

  getRealTradeSummary() {
    const open = queryOne("SELECT COUNT(*) as count, COALESCE(SUM(stake), 0) as total_staked FROM real_trades WHERE status IN ('pending', 'open')");
    const closed = queryOne("SELECT COUNT(*) as count, COALESCE(SUM(profit), 0) as total_profit, COALESCE(SUM(stake), 0) as total_staked, COALESCE(AVG(roi), 0) as avg_roi FROM real_trades WHERE status='closed'");
    const today = queryOne("SELECT COUNT(*) as today_trades, COALESCE(SUM(profit), 0) as today_profit FROM real_trades WHERE status='closed' AND date(closed_at) = date('now')");
    return {
      open_count: open?.count || 0,
      total_staked: open?.total_staked || 0,
      closed_count: closed?.count || 0,
      total_profit: closed?.total_profit || 0,
      avg_roi: closed?.avg_roi || 0,
      today_trades: today?.today_trades || 0,
      today_profit: today?.today_profit || 0,
    };
  },

  clearRealData() {
    runSql('DELETE FROM real_trades');
  },

  close() {
    flushDb();
    if (db) db.close();
  },
};
