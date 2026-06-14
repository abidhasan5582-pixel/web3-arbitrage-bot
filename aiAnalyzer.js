const config = require('./config');
const db = require('./database');

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const PUTER_CHAT_ENDPOINT = 'https://api.puter.com/v2/ai/chat';

async function callAI(systemPrompt, userPrompt) {
  if (config.openaiApiKey) {
    return callOpenAI(systemPrompt, userPrompt);
  }
  if (config.puterApiKey) {
    return callPuterAI(systemPrompt, userPrompt);
  }
  return null;
}

async function callOpenAI(systemPrompt, userPrompt) {
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error(`[AI] OpenAI call failed: ${err.message}`, err.stack?.split('\n')[1]);
    return null;
  }
}

async function callPuterAI(systemPrompt, userPrompt) {
  try {
    const res = await fetch(PUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-nano',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const data = await res.json();
    return data?.message?.content || data?.response || null;
  } catch (err) {
    console.error(`[AI] Puter call failed: ${err.message}`, err.stack?.split('\n')[1]);
    return null;
  }
}

async function generateStrategy() {
  if (!config.aiAvailable) {
    console.log('[AI] No API key configured — using template fallback');
  }
  const aiResponse = await callAI(
    'You are an expert Web3 sports betting arbitrage analyst. Give concise, actionable daily strategy.',
    `Create a daily arbitrage strategy for a trader with $${config.bankroll} bankroll. 
     Include: 1) Which platforms to check first (SX Bet has 0% fees) 
     2) Suggested stake sizes (max ${config.maxBetPercent * 100}% per arb) 
     3) Risk management reminders 4) Daily profit target. Keep it under 300 words.`
  );

  if (aiResponse) return aiResponse;

  console.log('[AI] AI response was null — using template fallback');
  const recentArbs = db.getRecentArbs(5);
  const bets = db.getRecentBets(10);

  let strategy = `📋 *Daily Strategy*\n\n`;
  strategy += `💰 Bankroll: $${config.bankroll.toFixed(2)}\n`;
  strategy += `⚠️ Max stake per arb: $${(config.bankroll * config.maxBetPercent).toFixed(2)}\n\n`;

  strategy += `*Priority Platforms:*\n`;
  strategy += `1. SX Bet (0%% fee) → Best arb leg\n`;
  strategy += `2. Polymarket → Cross-platform arbs\n`;
  strategy += `3. OddsPapi sportsbooks → Traditional odds\n\n`;

  strategy += `*Today's Targets:*\n`;
  strategy += `• Scan NBA, NFL, EPL, and Tennis for 2-way moneyline arbs\n`;
  strategy += `• Focus on 2-5%% ROI opportunities (lower risk of void)\n`;
  strategy += `• Check Polymarket for lagging markets after news\n\n`;

  strategy += `*Risk Rules:*\n`;
  strategy += `• Never exceed ${config.maxBetPercent * 100}% of bankroll per arb\n`;
  strategy += `• Skip arbs > 10% ROI (likely bookmaker errors)\n`;
  strategy += `• Verify both legs confirmed before walking away\n`;

  if (bets.length > 0) {
    const totalProfit = bets.reduce((s, b) => s + b.profit, 0);
    strategy += `\n*Recent Performance:* ${bets.length} bets | $${totalProfit.toFixed(2)} total profit`;
  }

  return strategy;
}

async function assessRisk(arb) {
  const aiResponse = await callAI(
    'You are a risk assessment expert for sports betting arbitrage. Give clear GO/NO-GO verdicts.',
    `Assess this arbitrage opportunity:
     Event: ${arb.event}
     ${arb.platformA}: ${arb.oddsA}
     ${arb.platformB}: ${arb.oddsB}
     ROI: ${arb.roi}%
     Risk Level: ${arb.riskLevel}
     Bankroll: $${config.bankroll}
     
     Give: 1) Risk score 1-10 2) GO or NO-GO 3) Brief reasoning.`
  );

  if (aiResponse) return aiResponse;

  if (config.aiAvailable) console.log('[AI] Risk assessment AI failed — using template');
  let assessment = `🔍 *Risk Assessment*\n\n`;
  assessment += `*Event:* ${arb.event}\n`;
  assessment += `*${arb.platformA}:* ${arb.oddsA}\n`;
  assessment += `*${arb.platformB}:* ${arb.oddsB}\n`;
  assessment += `*ROI:* ${arb.roi}%\n\n`;

  if (arb.roi > config.maxArbROI * 100) {
    assessment += `❌ *NO-GO* — ROI ${arb.roi}% exceeds ${config.maxArbROI * 100}% threshold. Likely voided.\n`;
  } else if (arb.riskLevel === 'high') {
    assessment += `⚠️ *CAUTION* — High ROI arbs have increased void risk.\n`;
    assessment += `Consider reducing stake by 50%.\n`;
  } else {
    assessment += `✅ *GO* — Clean arb within safe ROI range.\n`;
  }

  assessment += `\n*Execution Tips:*\n`;
  assessment += `• Place the slower-updating book FIRST\n`;
  assessment += `• Confirm both bets before closing\n`;
  assessment += `• Max stake: $${(config.bankroll * config.maxBetPercent).toFixed(2)}`;

  return assessment;
}

async function generateReport(days = 1) {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const weekAgo = new Date(date);
  weekAgo.setDate(weekAgo.getDate() - days);

  const bets = db.getBetsByDateRange(
    weekAgo.toISOString().split('T')[0],
    dateStr
  );

  const stats = db.getRecentDailyStats(days);

  const aiResponse = await callAI(
    'You are an arbitrage performance analyst. Generate concise daily/weekly P&L reports.',
    `Generate a ${days === 1 ? 'daily' : 'weekly'} performance report based on:
     Bets: ${JSON.stringify(bets)}
     Daily Stats: ${JSON.stringify(stats)}
     Bankroll: $${config.bankroll}
     
     Include: total P&L, best/worst platforms, recommendations.`
  );

  if (aiResponse) return aiResponse;

  if (config.aiAvailable) console.log('[AI] Report generation AI failed — using template');
  const totalStaked = bets.reduce((s, b) => s + b.total_staked, 0);
  const totalProfit = bets.reduce((s, b) => s + b.profit, 0);
  const totalBets = bets.length;
  const avgROI = totalBets > 0 ? (totalProfit / totalStaked * 100) : 0;

  const period = days === 1 ? 'Daily' : 'Weekly';

  let report = `📊 *${period} Performance Report*\n\n`;
  report += `*Period:* ${weekAgo.toISOString().split('T')[0]} to ${dateStr}\n`;
  report += `*Current Bankroll:* $${config.bankroll.toFixed(2)}\n`;
  report += `*Bets Placed:* ${totalBets}\n`;
  report += `*Total Staked:* $${totalStaked.toFixed(2)}\n`;
  report += `*Total Profit/Loss:* $${totalProfit.toFixed(2)}\n`;
  report += `*Average ROI:* ${avgROI.toFixed(2)}%\n\n`;

  if (stats.length > 0) {
    report += `*Best Day:* $${Math.max(...stats.map(s => s.profit)).toFixed(2)}\n`;
    report += `*Worst Day:* $${Math.min(...stats.map(s => s.profit)).toFixed(2)}\n`;
  }

  report += `\n*Recommendations:*\n`;
  if (totalBets === 0) {
    report += `• No bets this period — increase scan frequency\n`;
  }
  report += `• Maintain ${config.maxBetPercent * 100}% risk rule\n`;
  report += `• Withdraw 50% of profits to cold wallet\n`;

  return report;
}

module.exports = { generateStrategy, assessRisk, generateReport };
