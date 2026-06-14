const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'test_arb_bot.db');

let db;
describe('database module', () => {
  before(async () => {
    process.env.ARB_DB_PATH = DB_PATH;
    delete require.cache[require.resolve('../database')];
    db = require('../database');
    await db.initDatabase();
  });

  after(() => {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(DB_PATH); } catch (_) {}
  });

  it('creates tables on init', () => {
    const tables = db.getRecentBets(1);
    const arbs = db.getRecentArbs(1);
    const stats = db.getDailyStats('2025-01-01');
    assert.ok(tables !== undefined);
    assert.ok(arbs !== undefined);
    assert.ok(stats !== undefined);
  });

  it('getSetting returns defaults', () => {
    const val = db.getSetting('test_key', 'default_val');
    assert.strictEqual(val, 'default_val');
  });

  it('saveSetting stores and retrieves', () => {
    db.saveSetting('test_key', 'hello');
    const val = db.getSetting('test_key', 'fallback');
    assert.strictEqual(val, 'hello');
  });

  it('logBet stores a bet record', () => {
    db.logBet({ event: 'Test Game', oddsA: 2.0, oddsB: 2.2, stakeA: 0.5, stakeB: 0.5, platformA: 'P1', platformB: 'P2', profit: 0.05, roi: 5.0, guaranteedReturn: 1.0 });
    const bets = db.getRecentBets(10);
    assert.ok(bets.length >= 1);
    assert.strictEqual(bets[0].event, 'Test Game');
  });

  it('runSql handles errors gracefully via public API', () => {
    db.saveSetting(null, 'test');
    const val = db.getSetting(null, 'default');
    assert.strictEqual(val, 'default');
  });

  it('queryAll handles errors gracefully', () => {
    const result = db.getRecentDailyStats(-1);
    assert.ok(Array.isArray(result));
  });
});
