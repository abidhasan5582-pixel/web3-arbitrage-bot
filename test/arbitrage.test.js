const { describe, it } = require('node:test');
const assert = require('node:assert');
const { findArbitrages, calculate2Way, calculate3Way, calculateArb, classifyRisk } = require('../arbitrage');

describe('calculate2Way', () => {
  it('detects arbitrage when total implied < 1', () => {
    const result = calculate2Way(2.15, 2.20);
    assert.ok(result.isArb);
    assert.ok(result.roi > 0);
  });

  it('returns non-arb when total implied >= 1', () => {
    const result = calculate2Way(1.50, 2.00);
    assert.ok(!result.isArb);
    assert.strictEqual(result.roi, 0);
  });

  it('stakes sum to totalStake', () => {
    const result = calculate2Way(2.15, 2.20);
    assert.ok(Math.abs(result.stakeA + result.stakeB - 1.0) < 0.01);
  });

  it('stakes are positive', () => {
    const result = calculate2Way(2.15, 2.20);
    assert.ok(result.stakeA > 0);
    assert.ok(result.stakeB > 0);
  });

  it('returns are approximately equal (within $0.03 at $1 stake)', () => {
    const result = calculate2Way(2.15, 2.20);
    const retA = result.stakeA * 2.15;
    const retB = result.stakeB * 2.20;
    assert.ok(Math.abs(retA - retB) < 0.03);
  });

  it('even odds split evenly', () => {
    const result = calculate2Way(3.00, 3.00);
    assert.strictEqual(result.stakeA, result.stakeB);
    assert.strictEqual(result.stakeA, 0.50);
  });
});

describe('calculate3Way', () => {
  it('detects arbitrage when total implied < 1', () => {
    const result = calculate3Way(3.50, 4.00, 2.20);
    assert.ok(result.isArb);
    assert.ok(result.roi > 0);
  });

  it('stakes sum to totalStake', () => {
    const result = calculate3Way(3.50, 4.00, 2.20);
    assert.ok(Math.abs(result.stakeA + result.stakeB + result.stakeC - 1.0) < 0.01);
  });

  it('all stakes are positive', () => {
    const result = calculate3Way(3.50, 4.00, 2.20);
    assert.ok(result.stakeA > 0);
    assert.ok(result.stakeB > 0);
    assert.ok(result.stakeC > 0);
  });
});

describe('classifyRisk', () => {
  it('high risk above maxArbROI', () => {
    assert.strictEqual(classifyRisk(0.20), 'high');
  });

  it('medium risk between 0.05 and maxArbROI', () => {
    assert.strictEqual(classifyRisk(0.07), 'medium');
  });

  it('low risk below 0.05', () => {
    assert.strictEqual(classifyRisk(0.02), 'low');
  });
});

describe('findArbitrages', () => {
  const mockOdds = [
    { event: 'Team A vs Team B', sport: 'soccer', home: 'Team A', away: 'Team B', platformA: 'PlatformX', platformB: 'PlatformY', oddsA: 2.15, oddsB: 2.20, source: 'test' },
    { event: 'Team A vs Team B', sport: 'soccer', home: 'Team A', away: 'Team B', platformA: 'PlatformZ', platformB: 'PlatformW', oddsA: 1.90, oddsB: 2.10, source: 'test' },
  ];

  it('finds arb opportunities', () => {
    const arbs = findArbitrages(mockOdds);
    assert.ok(arbs.length > 0);
    assert.ok(arbs[0].roi > 0);
  });

  it('sorts by ROI descending', () => {
    const arbs = findArbitrages(mockOdds);
    for (let i = 1; i < arbs.length; i++) {
      assert.ok(arbs[i - 1].roi >= arbs[i].roi);
    }
  });

  it('deduplicates same platform pairs', () => {
    const samePlatform = [
      { event: 'Game X', sport: 'basketball', home: 'X', away: 'Y', platformA: 'SamePlat', platformB: 'SamePlat', oddsA: 2.00, oddsB: 2.10, source: 'test' },
      { event: 'Game X', sport: 'basketball', home: 'X', away: 'Y', platformA: 'SamePlat', platformB: 'SamePlat', oddsA: 1.90, oddsB: 2.20, source: 'test' },
    ];
    const arbs = findArbitrages(samePlatform);
    assert.strictEqual(arbs.length, 0);
  });
});

describe('calculateArb', () => {
  it('preserves config.bankroll after override', () => {
    const config = require('../config');
    const before = config.bankroll;
    const result = calculateArb(2.15, 2.20, 100);
    assert.strictEqual(config.bankroll, before);
    assert.ok(result.isArb);
  });
});
