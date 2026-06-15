const config = require('./config');
const db = require('./database');

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

  async executeDemoArb(arb) {
    const stake = config.bankroll * config.maxBetPercent;
    const arbProfit = (stake * arb.roi) / 100;

    db.openDemoTrade({
      event: arb.event,
      sport: arb.sport || '',
      home: arb.home || '',
      away: arb.away || '',
      platformA: arb.platformA,
      oddsA: arb.oddsA,
      stakeA: arb.stakeA || (stake / 2),
      platformB: arb.platformB,
      oddsB: arb.oddsB,
      stakeB: arb.stakeB || (stake / 2),
      expectedProfit: arbProfit,
      expectedRoi: arb.roi,
      profit: arbProfit,
      roi: arb.roi,
      source: arb.source,
      commenceTime: arb.commenceTime,
    });

    return {
      success: true,
      demo: true,
      legs: [
        { platform: arb.platformA, side: 'home', odds: arb.oddsA, stake: arb.stakeA || (stake / 2), status: 'simulated' },
        { platform: arb.platformB, side: 'away', odds: arb.oddsB, stake: arb.stakeB || (stake / 2), status: 'simulated' },
      ],
      totalProfit: arbProfit,
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
