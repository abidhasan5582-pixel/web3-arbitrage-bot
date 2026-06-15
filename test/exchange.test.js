const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'test_exchange_bot.db');

describe('exchange module', () => {
  let exchange;
  let config;

  before(async () => {
    process.env.DEMO_MODE = 'true';
    process.env.LIVE_MODE = 'false';
    process.env.MIN_ARB_ROI = '2';
    process.env.MAX_ARB_ROI = '10';
    process.env.BANKROLL = '20';
    process.env.ARB_DB_PATH = DB_PATH;

    delete require.cache[require.resolve('../config')];
    delete require.cache[require.resolve('../database')];
    delete require.cache[require.resolve('../exchange')];

    config = require('../config');
    const db = require('../database');
    await db.initDatabase();

    exchange = require('../exchange');
    await exchange.init();
  });

  after(() => {
    try {
      const db = require('../database');
      db.close();
    } catch (_) {}
    try { fs.unlinkSync(DB_PATH); } catch (_) {}
  });

  it('exports ExchangeOrchestrator singleton', () => {
    assert.ok(exchange);
    assert.ok(typeof exchange.executeArb === 'function');
    assert.ok(typeof exchange.executeDemoArb === 'function');
    assert.ok(typeof exchange.getExchange === 'function');
    assert.ok(typeof exchange.getBalances === 'function');
  });

  it('getExchange returns null for unknown exchange', () => {
    const ex = exchange.getExchange('nonexistent_exchange');
    assert.strictEqual(ex, null);
  });

  it('getExchange returns instance for known exchange', () => {
    const ex = exchange.getExchange('polymarket');
    assert.ok(ex);
    assert.ok(typeof ex.getBalance === 'function');
  });

  it('getBalances returns empty when exchanges not loaded', async () => {
    const balances = await exchange.getBalances();
    assert.ok(typeof balances === 'object');
  });

  it('getPositions returns empty when exchanges not loaded', async () => {
    const positions = await exchange.getPositions();
    assert.ok(typeof positions === 'object');
  });

  describe('executeDemoArb', () => {
    it('returns success with demo legs', async () => {
      const arb = {
        event: 'Test Event',
        sport: 'soccer',
        home: 'Team A',
        away: 'Team B',
        platformA: 'polymarket',
        platformB: 'sxbet',
        oddsA: 2.15,
        oddsB: 2.20,
        stakeA: 0.5,
        stakeB: 0.5,
        roi: 5.0,
        profit: 0.10,
        riskLevel: 'medium',
        source: 'test',
        commenceTime: new Date().toISOString(),
      };
      const result = await exchange.executeDemoArb(arb);
      assert.ok(result.success);
      assert.strictEqual(result.demo, true);
      assert.ok(Array.isArray(result.legs));
      assert.strictEqual(result.legs.length, 2);
      assert.ok(typeof result.totalProfit === 'number');
    });
  });

  describe('executeArb in demo mode', () => {
    it('returns success for valid arb', async () => {
      const arb = {
        event: 'Demo Event',
        sport: 'basketball',
        home: 'Team X',
        away: 'Team Y',
        platformA: 'polymarket',
        platformB: 'sxbet',
        oddsA: 2.10,
        oddsB: 2.20,
        stakeA: 0.5,
        stakeB: 0.5,
        roi: 6.0,
        profit: 0.12,
        riskLevel: 'medium',
        source: 'test',
        commenceTime: new Date().toISOString(),
      };
      const result = await exchange.executeArb(arb, {});
      assert.ok(result.success);
      assert.strictEqual(result.demo, true);
    });
  });
});

describe('exchange module live mode', () => {
  let exchange;

  before(async () => {
    process.env.DEMO_MODE = 'false';
    process.env.LIVE_MODE = 'true';
    process.env.MIN_ARB_ROI = '2';
    process.env.MAX_ARB_ROI = '10';
    process.env.BANKROLL = '20';
    process.env.ARB_DB_PATH = DB_PATH;

    delete require.cache[require.resolve('../config')];
    delete require.cache[require.resolve('../database')];
    delete require.cache[require.resolve('../exchange')];

    const db = require('../database');
    await db.initDatabase();

    exchange = require('../exchange');
    await exchange.init();
  });

  after(() => {
    try {
      const db = require('../database');
      db.close();
    } catch (_) {}
    try { fs.unlinkSync(DB_PATH); } catch (_) {}
  });

  it('executeArb returns missing keys when live but no wallets', async () => {
    const arb = {
      event: 'Live Event',
      platformA: 'polymarket',
      platformB: 'sxbet',
      oddsA: 2.10,
      oddsB: 2.20,
      stakeA: 0.5,
      stakeB: 0.5,
      roi: 6.0,
      profit: 0.12,
      riskLevel: 'medium',
      source: 'test',
    };
    const result = await exchange.executeArb(arb, {});
    assert.ok(!result.success);
    assert.ok(result.reason);
  });
});
