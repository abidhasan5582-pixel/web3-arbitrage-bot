const config = require('./config');

const GAS_ESTIMATES = {
  polymarket: { base: 0.02, perOrder: 0.01 },
  sxbet: { base: 0.001, perOrder: 0.0005 },
  azuro: { base: 0.03, perOrder: 0.015 },
};

const PLATFORM_FEES = {
  polymarket: 0.001,
  sxbet: 0.002,
  azuro: 0.005,
  default: 0.005,
};

function getPlatformFee(platformName) {
  const key = platformName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [k, v] of Object.entries(PLATFORM_FEES)) {
    if (key.includes(k)) return v;
  }
  return PLATFORM_FEES.default;
}

function estimateGasCost(platformName) {
  const key = platformName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [k, v] of Object.entries(GAS_ESTIMATES)) {
    if (key.includes(k)) {
      return config.demoMode ? config.demoGasCostPoly : v.base + v.perOrder;
    }
  }
  return config.demoGasCostPoly;
}

function estimateTotalCost(platformA, platformB, stakeA, stakeB) {
  const gasA = estimateGasCost(platformA);
  const gasB = estimateGasCost(platformB);
  const feeA = getPlatformFee(platformA) * stakeA;
  const feeB = getPlatformFee(platformB) * stakeB;
  return {
    gasA,
    gasB,
    feeA,
    feeB,
    totalGas: gasA + gasB,
    totalFees: feeA + feeB,
    totalCost: gasA + gasB + feeA + feeB,
  };
}

function calculateNetROI(roi, platformA, platformB, stakeA, stakeB) {
  const costs = estimateTotalCost(platformA, platformB, stakeA, stakeB);
  const grossProfit = (stakeA + stakeB) * (roi / 100);
  const netProfit = grossProfit - costs.totalCost;
  const totalStake = stakeA + stakeB;
  const netROI = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;
  return { netProfit, netROI, costs };
}

function assessArbRisk(arb) {
  const net = calculateNetROI(arb.roi, arb.platformA, arb.platformB, arb.stakeA || 1, arb.stakeB || 1);

  if (arb.riskLevel === 'high') {
    return { ...arb, riskLevel: 'high', netROI: net.netROI, netProfit: net.netProfit, recommended: false };
  }

  if (config.liveMode && arb.roi < config.liveMinROI * 100) {
    return { ...arb, riskLevel: 'high', netROI: net.netROI, netProfit: net.netProfit, recommended: false };
  }

  if (net.netROI <= 0) {
    return { ...arb, riskLevel: 'high', netROI: net.netROI, netProfit: net.netProfit, recommended: false };
  }

  const recommended = arb.roi >= config.minArbROI * 100 && arb.roi <= config.maxArbROI * 100;

  return { ...arb, netROI: net.netROI, netProfit: net.netProfit, costs: net.costs, recommended };
}

function assessBatchRisk(arbs) {
  return arbs.map(assessArbRisk).filter(a => a.recommended).sort((a, b) => b.netROI - a.netROI);
}

function getExposure() {
  const exchange = require('./exchange');
  const balances = exchange.getBalances();
  return { balances };
}

function canExecute(arb) {
  if (arb.riskLevel === 'high') return false;

  const stakeA = arb.stakeA || (config.bankroll * config.maxBetPercent) / 2;
  const stakeB = arb.stakeB || (config.bankroll * config.maxBetPercent) / 2;
  const totalStake = stakeA + stakeB;

  if (totalStake > config.bankroll * config.maxBetPercent * 2) return false;

  const costs = estimateTotalCost(arb.platformA, arb.platformB, stakeA, stakeB);
  const netProfit = arb.profit - costs.totalCost;
  if (netProfit <= 0) return false;

  const netROI = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;
  if (netROI < config.minArbROI * 100) return false;

  return true;
}

function selectBestArbs(arbs, maxCount = 3) {
  const assessed = assessBatchRisk(arbs);
  return assessed.slice(0, maxCount);
}

module.exports = {
  estimateGasCost,
  estimateTotalCost,
  calculateNetROI,
  assessArbRisk,
  assessBatchRisk,
  getExposure,
  canExecute,
  selectBestArbs,
  getPlatformFee,
};
