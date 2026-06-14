const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('config validation', () => {
  it('config exports expected properties', () => {
    const config = require('../config');
    assert.ok(typeof config.bankroll === 'number');
    assert.ok(typeof config.minArbROI === 'number');
    assert.ok(typeof config.maxArbROI === 'number');
    assert.ok(typeof config.scanInterval === 'number');
    assert.ok(typeof config.maxBetPercent === 'number');
    assert.ok('aiAvailable' in config);
  });

  it('validate returns missing keys when empty', () => {
    const config = require('../config');
    const missing = config.validate();
    assert.ok(Array.isArray(missing));
    assert.ok(missing.includes('TELEGRAM_BOT_TOKEN'));
    assert.ok(missing.includes('TELEGRAM_CHAT_ID'));
    assert.ok(missing.includes('ODDS_API_KEY'));
  });
});

describe('oddsFetcher exports', () => {
  it('module loads without error', () => {
    const oddsFetcher = require('../oddsFetcher');
    assert.ok(typeof oddsFetcher.scanAll === 'function');
    assert.ok(typeof oddsFetcher.scanPolymarket === 'function');
    assert.ok(typeof oddsFetcher.scanSXBet === 'function');
    assert.ok(typeof oddsFetcher.scanESPN === 'function');
    assert.ok(typeof oddsFetcher.scanRapidAPI === 'function');
  });
});
