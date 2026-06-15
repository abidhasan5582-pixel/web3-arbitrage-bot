const config = require('./config');
const db = require('./database');
const risk = require('./risk');

class ExchangeOrchestrator {
  constructor() {
    this.exchanges = {};
  }

  async init() {
    const platforms = config.executablePlatforms;

    if (platforms.includes('polymarket')) {
      try {
        const PolymarketExchange = require('./exchanges/polymarket');
        this.exchanges.polymarket = new PolymarketExchange();
        await this.exchanges.polymarket.init();
      } catch (err) {
        console.error(`[Exchange] Polymarket init: ${err.message}`);
      }
    }

    if (platforms.includes('sxbet')) {
      try {
        const SXBetExchange = require('./exchanges/sxbet');
        this.exchanges.sxbet = new SXBetExchange();
        await this.exchanges.sxbet.init();
      } catch (err) {
        console.error(`[Exchange] SX Bet init: ${err.message}`);
      }
    }

    if (platforms.includes('azuro')) {
      try {
        const AzuroExchange = require('./exchanges/azuro');
        this.exchanges.azuro = new AzuroExchange();
        await this.exchanges.azuro.init();
      } catch (err) {
        console.error(`[Exchange] Azuro init: ${err.message}`);
      }
    }
  }

  getExchange(name) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(this.exchanges)) {
      if (key.includes(k)) return v;
    }
    return null;
  }

  async getBalances() {
    const result = {};
    for (const [name, ex] of Object.entries(this.exchanges)) {
      try {
        result[name] = await ex.getBalance();
      } catch (err) {
        result[name] = { error: err.message };
      }
    }
    return result;
  }

  async getPositions() {
    const result = {};
    for (const [name, ex] of Object.entries(this.exchanges)) {
      try {
        if (typeof ex.getPositions === 'function') {
          result[name] = await ex.getPositions();
        }
      } catch (_) {}
    }
    return result;
  }

  async hasGas() {
    const result = {};
    for (const [name, ex] of Object.entries(this.exchanges)) {
      try {
        result[name] = await ex.hasGas();
      } catch (_) {
        result[name] = false;
      }
    }
    return result;
  }

  async executeArb(arb, riskAssessment) {
    const result = { success: false, legs: [], totalProfit: 0 };

    if (config.demoMode) {
      return this.executeDemoArb(arb);
    }

    if (!config.liveMode) {
      return { success: false, legs: [], reason: 'Live mode not enabled' };
    }

    const missing = config.validateLive();
    if (missing.length > 0) {
      return { success: false, legs: [], reason: `Missing: ${missing.join(', ')}` };
    }

    const platformA = arb.platformA.toLowerCase();
    const platformB = arb.platformB.toLowerCase();
    const exA = this.getExchange(platformA);
    const exB = this.getExchange(platformB);

    if (!exA) return { success: false, legs: [], reason: `No exchange for ${arb.platformA}` };
    if (!exB) return { success: false, legs: [], reason: `No exchange for ${arb.platformB}` };

    const arbId = `arb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      const legA = await this.placeLeg(exA, arb, arb.platformA, 'home', arb.oddsA, arb.stakeA, arbId);
      if (legA.error) {
        await this.rollback(arbId, result.legs);
        return { success: false, legs: result.legs, reason: legA.error };
      }
      result.legs.push(legA);
    } catch (err) {
      await this.rollback(arbId, result.legs);
      return { success: false, legs: result.legs, reason: err.message };
    }

    try {
      const legB = await this.placeLeg(exB, arb, arb.platformB, 'away', arb.oddsB, arb.stakeB, arbId);
      if (legB.error) {
        await this.rollback(arbId, result.legs);
        return { success: false, legs: result.legs, reason: legB.error };
      }
      result.legs.push(legB);
    } catch (err) {
      await this.rollback(arbId, result.legs);
      return { success: false, legs: result.legs, reason: err.message };
    }

    result.success = true;
    result.totalProfit = arb.profit || 0;
    result.arbId = arbId;

    const today = new Date().toISOString().split('T')[0];
    db.updateDailyStats(today, {
      arbsExecuted: 1,
      bestRoi: arb.roi,
    });

    return result;
  }

  async placeLeg(exchange, arb, platform, side, odds, stake, arbId) {
    const leg = { platform, side, odds, stake, status: 'pending' };

    const exName = platform.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (exName.includes('polymarket')) {
      const tokenId = await exchange.getTokenId(arb.event, side);
      if (!tokenId) {
        leg.error = 'No token ID found';
        return leg;
      }
      const orderResult = await exchange.placeOrder(tokenId, 'BUY', odds, stake);
      leg.orderId = orderResult.orderId;
      leg.txHash = null;
      leg.status = orderResult.status === 'success' ? 'open' : 'failed';
    } else if (exName.includes('sxbet')) {
      const outcomeIdx = side === 'home' ? 0 : 1;
      const orderResult = await exchange.placeOrder(arb.marketId || arb.event, outcomeIdx, odds, stake < 1 ? 1 : Math.round(stake));
      leg.orderId = orderResult.orderId;
      leg.status = 'open';
    } else if (exName.includes('azuro')) {
      const conditions = await exchange.getLiveConditions(arb.sport);
      const condition = conditions.find(c => c.game?.includes(arb.event) || arb.event?.includes(c.game));
      if (!condition || !condition.outcomes?.length) {
        leg.error = 'No Azuro condition found';
        return leg;
      }
      const outcomeId = condition.outcomes[0].id;
      const txResult = await exchange.placeBet(condition.id, outcomeId, stake, odds);
      leg.txHash = txResult.txHash;
      leg.status = 'pending';
    }

    db.openRealTrade({
      arbId,
      event: arb.event,
      platform,
      side,
      odds,
      stake,
      status: leg.status,
      orderId: leg.orderId,
      txHash: leg.txHash,
    });

    return leg;
  }

  async rollback(arbId, placedLegs) {
    for (const leg of placedLegs) {
      if (!leg.orderId) continue;
      try {
        const exName = leg.platform.toLowerCase().replace(/[^a-z0-9]/g, '');
        const exchange = this.getExchange(exName);
        if (exchange && typeof exchange.cancelOrder === 'function') {
          await exchange.cancelOrder(leg.orderId);
        }
      } catch (_) {}
    }
  }

  _simOrderId(platform) {
    const key = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.includes('polymarket')) {
      return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async executeDemoArb(arb) {
    const bankStake = config.bankroll * config.maxBetPercent;
    const stakeA = arb.stakeA || (bankStake / 2);
    const stakeB = arb.stakeB || (bankStake / 2);
    const totalStake = stakeA + stakeB;

    const slippageA = (Math.random() * 2 - 1) * config.liveSlippageTolerance;
    const slippageB = (Math.random() * 2 - 1) * config.liveSlippageTolerance;
    const simOddsA = arb.oddsA * (1 + slippageA);
    const simOddsB = arb.oddsB * (1 + slippageB);

    const costs = risk.estimateTotalCost(arb.platformA, arb.platformB, stakeA, stakeB);
    const homePayout = stakeA * simOddsA;
    const awayPayout = stakeB * simOddsB;
    const guaranteedReturn = Math.min(homePayout, awayPayout);
    const netProfit = guaranteedReturn - totalStake - costs.totalCost;

    const legA = {
      platform: arb.platformA, side: 'home',
      odds: simOddsA, stake: stakeA,
      status: 'simulated',
      orderId: this._simOrderId(arb.platformA),
      simulatedSlippage: slippageA,
    };
    const legB = {
      platform: arb.platformB, side: 'away',
      odds: simOddsB, stake: stakeB,
      status: 'simulated',
      orderId: this._simOrderId(arb.platformB),
      simulatedSlippage: slippageB,
    };

    const demoTradeId = db.openDemoTrade({
      event: arb.event,
      sport: arb.sport || '',
      home: arb.home || '',
      away: arb.away || '',
      platformA: arb.platformA,
      oddsA: simOddsA,
      stakeA,
      platformB: arb.platformB,
      oddsB: simOddsB,
      stakeB,
      totalStaked: totalStake,
      expectedProfit: Math.max(0, netProfit),
      expectedRoi: totalStake > 0 ? (netProfit / totalStake) * 100 : 0,
      profit: 0,
      roi: 0,
      source: arb.source,
      commenceTime: arb.commenceTime,
      simSlippageA: slippageA,
      simSlippageB: slippageB,
      simOrderIdA: legA.orderId,
      simOrderIdB: legB.orderId,
      simGasCost: costs.totalGas,
      simFeeCost: costs.totalFees,
    });

    // Unified bets table record
    db.logBet({
      event: arb.event,
      sport: arb.sport || '',
      platformA: arb.platformA,
      oddsA: simOddsA,
      stakeA,
      platformB: arb.platformB,
      oddsB: simOddsB,
      stakeB,
      guaranteedReturn,
      profit: 0,
      roi: 0,
      status: 'pending',
      isDemo: 1,
      demo_trade_id: demoTradeId,
    });

    // Per-leg records matching real_trades structure
    db.openRealTrade({
      arbId: `demo_${demoTradeId}`,
      event: arb.event,
      platform: arb.platformA,
      side: 'home',
      odds: simOddsA,
      stake: stakeA,
      status: 'open',
      orderId: legA.orderId,
      is_demo: 1,
    });
    db.openRealTrade({
      arbId: `demo_${demoTradeId}`,
      event: arb.event,
      platform: arb.platformB,
      side: 'away',
      odds: simOddsB,
      stake: stakeB,
      status: 'open',
      orderId: legB.orderId,
      is_demo: 1,
    });

    console.log(
      `[Demo] EXECUTED #${arb.event} | ` +
      `Odds: ${simOddsA.toFixed(3)}/${simOddsB.toFixed(3)} (slip ${(slippageA*100).toFixed(1)}%/${(slippageB*100).toFixed(1)}%) | ` +
      `Gas: $${costs.totalGas.toFixed(4)} Fees: $${costs.totalFees.toFixed(4)} | ` +
      `Net P&L: $${netProfit.toFixed(4)}`
    );

    return {
      success: true,
      demo: true,
      demoTradeId,
      legs: [legA, legB],
      totalProfit: netProfit,
      costs,
    };
  }

  connectSXWebSocket(onOddsUpdate) {
    if (this.exchanges.sxbet && typeof this.exchanges.sxbet.connectWebSocket === 'function') {
      return this.exchanges.sxbet.connectWebSocket(onOddsUpdate);
    }
    return false;
  }

  disconnectSXWebSocket() {
    if (this.exchanges.sxbet && typeof this.exchanges.sxbet.disconnectWebSocket === 'function') {
      this.exchanges.sxbet.disconnectWebSocket();
    }
  }
}

module.exports = new ExchangeOrchestrator();
