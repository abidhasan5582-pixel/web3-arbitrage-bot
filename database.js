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

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      profit REAL DEFAULT 0,
      arbs_found INTEGER DEFAULT 0,
      arbs_executed INTEGER DEFAULT 0,
      best_roi REAL DEFAULT 0
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
    runSql(`INSERT INTO bets (event, sport, platform_a, odds_a, stake_a, platform_b, odds_b, stake_b, total_staked, guaranteed_return, profit, roi, status)
      VALUES ($event, $sport, $platformA, $oddsA, $stakeA, $platformB, $oddsB, $stakeB, $totalStaked, $guaranteedReturn, $profit, $roi, $status)`, {
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
      $status: bet.status || 'pending',
    });
  },

  getRecentBets(limit = 20) {
    return queryAll('SELECT * FROM bets ORDER BY created_at DESC LIMIT $limit', { $limit: limit });
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

  close() {
    flushDb();
    if (db) db.close();
  },
};
