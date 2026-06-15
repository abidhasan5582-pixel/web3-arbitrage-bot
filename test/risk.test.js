const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('risk module', () => {
  let risk;

  before(() => {
    process.env.DEMO_MODE = 'true';
    process.env.MIN_ARB_ROI = '2';
    process.env.MAX_ARB_ROI = '10';
    process.env.BANKROLL = '20';
    process.env.LIVE_MODE = 'false';
    delete require.cache[require.resolve('../config')];
    delete require.cache[require.resolve('../risk')];
    risk = require('../risk');
  });

  describe('getPlatformFee', () => {
    it('returns polymarket fee for polymarket', () => {
      assert.strictEqual(risk.getPlatformFee('polymarket'), 0.001);
    });

    it('returns sxbet fee for sx.bet', () => {
      assert.strictEqual(risk.getPlatformFee('sx.bet'), 0.002);
    });

    it('returns azuro fee for azuro', () => {
      assert.strictEqual(risk.getPlatformFee('azuro'), 0.005);
    });

    it('returns default fee for unknown platform', () => {
      assert.strictEqual(risk.getPlatformFee('unknown'), 0.005);
    });
  });

  describe('estimateGasCost', () => {
    it('returns demo gas cost for polymarket in demo mode', () => {
      const cost = risk.estimateGasCost('polymarket');
      assert.strictEqual(cost, 0.03);
    });

    it('returns estimate for sxbet', () => {
      const cost = risk.estimateGasCost('sxbet');
      assert.strictEqual(cost, 0.03);
    });

    it('returns estimate for azuro', () => {
      const cost = risk.estimateGasCost('azuro');
      assert.strictEqual(cost, 0.03);
    });

    it('returns default for unknown platform', () => {
      const cost = risk.estimateGasCost('unknown');
      assert.strictEqual(cost, 0.03);
    });
  });

  describe('estimateTotalCost', () => {
    it('returns all cost fields', () => {
      const costs = risk.estimateTotalCost('polymarket', 'sxbet', 10, 10);
      assert.ok(typeof costs.gasA === 'number');
      assert.ok(typeof costs.gasB === 'number');
      assert.ok(typeof costs.feeA === 'number');
      assert.ok(typeof costs.feeB === 'number');
      assert.ok(typeof costs.totalGas === 'number');
      assert.ok(typeof costs.totalFees === 'number');
      assert.ok(typeof costs.totalCost === 'number');
      assert.ok(costs.totalCost > 0);
    });

    it('totalCost equals sum of parts', () => {
      const costs = risk.estimateTotalCost('polymarket', 'sxbet', 10, 10);
      const expected = costs.gasA + costs.gasB + costs.feeA + costs.feeB;
      assert.strictEqual(costs.totalCost, expected);
    });
  });

  describe('calculateNetROI', () => {
    it('returns positive net profit for high ROI', () => {
      const result = risk.calculateNetROI(15, 'polymarket', 'sxbet', 10, 10);
      assert.ok(result.netProfit > 0);
      assert.ok(result.netROI > 0);
      assert.ok(result.costs.totalCost > 0);
    });

    it('returns negative net profit for low ROI', () => {
      const result = risk.calculateNetROI(0.1, 'polymarket', 'sxbet', 10, 10);
      assert.ok(result.netProfit < 0);
      assert.ok(result.netROI < 0);
    });
  });

  describe('assessArbRisk', () => {
    it('marks high risk arb as not recommended', () => {
      const arb = { roi: 20, riskLevel: 'high', platformA: 'polymarket', platformB: 'sxbet', stakeA: 1, stakeB: 1 };
      const result = risk.assessArbRisk(arb);
      assert.strictEqual(result.recommended, false);
    });

    it('marks profitable arb as recommended', () => {
      const arb = { roi: 6, riskLevel: 'medium', platformA: 'polymarket', platformB: 'sxbet', stakeA: 10, stakeB: 10 };
      const result = risk.assessArbRisk(arb);
      assert.strictEqual(result.recommended, true);
    });

    it('returns calculated netROI and netProfit', () => {
      const arb = { roi: 6, riskLevel: 'medium', platformA: 'polymarket', platformB: 'sxbet', stakeA: 10, stakeB: 10 };
      const result = risk.assessArbRisk(arb);
      assert.ok(typeof result.netROI === 'number');
      assert.ok(typeof result.netProfit === 'number');
    });
  });

  describe('assessBatchRisk', () => {
    it('filters and sorts by netROI descending', () => {
      const arbs = [
        { roi: 6, riskLevel: 'medium', platformA: 'polymarket', platformB: 'sxbet', stakeA: 10, stakeB: 10 },
        { roi: 20, riskLevel: 'high', platformA: 'azuro', platformB: 'polymarket', stakeA: 10, stakeB: 10 },
        { roi: 8, riskLevel: 'low', platformA: 'sxbet', platformB: 'azuro', stakeA: 10, stakeB: 10 },
      ];
      const result = risk.assessBatchRisk(arbs);
      assert.ok(result.length >= 1);
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i - 1].netROI >= result[i].netROI);
      }
    });
  });

  describe('canExecute', () => {
    it('returns false for high risk arb', () => {
      const arb = { roi: 20, riskLevel: 'high', platformA: 'polymarket', platformB: 'sxbet' };
      assert.strictEqual(risk.canExecute(arb), false);
    });

    it('returns true for profitable medium risk arb', () => {
      const arb = { roi: 6, riskLevel: 'medium', platformA: 'polymarket', platformB: 'sxbet', profit: 1.5, stakeA: 0.5, stakeB: 0.5 };
      assert.strictEqual(risk.canExecute(arb), true);
    });

    it('returns false when net profit is negative', () => {
      const arb = { roi: 0.1, riskLevel: 'medium', platformA: 'polymarket', platformB: 'sxbet', profit: -0.5, stakeA: 1, stakeB: 1 };
      assert.strictEqual(risk.canExecute(arb), false);
    });
  });

  describe('selectBestArbs', () => {
    it('returns limited number of best arbs', () => {
      const arbs = [
        { roi: 6, riskLevel: 'medium', platformA: 'polymarket', platformB: 'sxbet', stakeA: 10, stakeB: 10 },
        { roi: 8, riskLevel: 'low', platformA: 'sxbet', platformB: 'azuro', stakeA: 10, stakeB: 10 },
        { roi: 4, riskLevel: 'medium', platformA: 'azuro', platformB: 'polymarket', stakeA: 10, stakeB: 10 },
      ];
      const result = risk.selectBestArbs(arbs, 2);
      assert.ok(result.length <= 2);
    });
  });
});
