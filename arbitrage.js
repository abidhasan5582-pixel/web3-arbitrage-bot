const config = require('./config');

function roundTo(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function minDiff(a, b, c) {
  return Math.min(Math.abs(a - b), Math.abs(a - c), Math.abs(b - c));
}

function calculate2Way(oddsA, oddsB) {
  const impliedA = 1 / oddsA;
  const impliedB = 1 / oddsB;
  const totalImplied = impliedA + impliedB;

  if (totalImplied >= 1) {
    return { isArb: false, roi: 0, totalImplied, margin: (totalImplied - 1) * 100 };
  }

  const roi = (1 - totalImplied);
  const totalStake = config.bankroll * config.maxBetPercent;

  // Dutching: equal return regardless of outcome
  const rawA = totalStake * oddsB / (oddsA + oddsB);
  const downA = Math.floor(rawA * 100) / 100;
  const upA = Math.ceil(rawA * 100) / 100;

  // Pick rounding direction that minimizes return spread
  let bestA, bestB, bestDiff = Infinity;
  for (const candidate of [downA, upA]) {
    if (candidate < 0 || candidate > totalStake) continue;
    const sb = roundTo(totalStake - candidate, 2);
    const diff = Math.abs(candidate * oddsA - sb * oddsB);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestA = candidate;
      bestB = sb;
    }
  }

  const retA = bestA * oddsA;
  const retB = bestB * oddsB;
  const actualReturn = roundTo(Math.min(retA, retB), 2);
  const profit = roundTo(actualReturn - totalStake, 2);

  return {
    isArb: true,
    roi,
    totalImplied,
    margin: 0,
    stakeA: bestA,
    stakeB: bestB,
    profit,
    returnAmount: actualReturn,
  };
}

function calculate3Way(oddsA, oddsB, oddsC) {
  const impliedA = 1 / oddsA;
  const impliedB = 1 / oddsB;
  const impliedC = 1 / oddsC;
  const totalImplied = impliedA + impliedB + impliedC;

  if (totalImplied >= 1) {
    return { isArb: false, roi: 0, totalImplied, margin: (totalImplied - 1) * 100 };
  }

  const roi = (1 - totalImplied);
  const totalStake = config.bankroll * config.maxBetPercent;

  const rawA = totalStake * impliedA / totalImplied;
  const rawB = totalStake * impliedB / totalImplied;

  // Try rounding A and B up/down (4 combos), find minimum return spread
  const aCandidates = [Math.floor(rawA * 100) / 100, Math.ceil(rawA * 100) / 100];
  const bCandidates = [Math.floor(rawB * 100) / 100, Math.ceil(rawB * 100) / 100];

  let bestA, bestB, bestC, bestDiff = Infinity;
  for (const ca of aCandidates) {
    if (ca < 0 || ca > totalStake) continue;
    for (const cb of bCandidates) {
      if (cb < 0 || cb > totalStake - ca) continue;
      const cc = roundTo(totalStake - ca - cb, 2);
      if (cc < 0) continue;
      const diff = minDiff(ca * oddsA, cb * oddsB, cc * oddsC);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestA = ca;
        bestB = cb;
        bestC = cc;
      }
    }
  }

  const retA = bestA * oddsA;
  const retB = bestB * oddsB;
  const retC = bestC * oddsC;
  const actualReturn = roundTo(Math.min(retA, retB, retC), 2);
  const profit = roundTo(actualReturn - totalStake, 2);

  return {
    isArb: true,
    roi,
    totalImplied,
    margin: 0,
    stakeA: bestA,
    stakeB: bestB,
    stakeC: bestC,
    profit,
    returnAmount: actualReturn,
  };
}

function classifyRisk(roi) {
  if (roi >= config.maxArbROI) return 'high';
  if (roi >= 0.05) return 'medium';
  return 'low';
}

function findArbitrages(oddsList, is3Way = false) {
  const arbs = [];

  for (let i = 0; i < oddsList.length; i++) {
    for (let j = i + 1; j < oddsList.length; j++) {
      if (oddsList[i].event !== oddsList[j].event) continue;
      if (oddsList[i].platformA === oddsList[j].platformB ||
          oddsList[i].platformB === oddsList[j].platformA) continue;

      const result = calculate2Way(oddsList[i].oddsA, oddsList[j].oddsB);
      if (!result.isArb) continue;
      if (result.roi < config.minArbROI || result.roi > config.maxArbROI) continue;

      arbs.push({
        event: oddsList[i].event,
        sport: oddsList[i].sport,
        home: oddsList[i].home,
        away: oddsList[i].away,
        platformA: oddsList[i].platformA,
        oddsA: oddsList[i].oddsA,
        platformB: oddsList[j].platformB || oddsList[i].platformB,
        oddsB: oddsList[j].oddsB || oddsList[i].oddsB,
        roi: Math.round(result.roi * 10000) / 100,
        profit: result.profit,
        stakeA: result.stakeA,
        stakeB: result.stakeB,
        riskLevel: classifyRisk(result.roi),
        source: oddsList[i].source,
      });
    }
  }

  arbs.sort((a, b) => b.roi - a.roi);
  return arbs;
}

function calculateArb(oddsA, oddsB, bankrollOverride) {
  const savedBankroll = config.bankroll;
  if (bankrollOverride) config.bankroll = bankrollOverride;

  const result = calculate2Way(oddsA, oddsB);

  if (bankrollOverride) config.bankroll = savedBankroll;
  return result;
}

module.exports = { findArbitrages, calculate2Way, calculate3Way, calculateArb, classifyRisk };
