const config = require('./config');

const OVERTIME_SPORTS = {
  10: 'NFL', 11: 'NCAAF', 20: 'NBA', 21: 'NCAAB',
  30: 'MLB', 40: 'NHL', 50: 'UEFA', 60: 'EPL',
  61: 'La Liga', 62: 'Serie A', 63: 'Bundesliga', 64: 'Ligue 1',
  70: 'MLS', 80: 'UFC', 90: 'WNBA', 100: 'Tennis',
};

const ESPN_SPORTS = [
  { slug: 'baseball/mlb', name: 'MLB' },
  { slug: 'basketball/nba', name: 'NBA' },
  { slug: 'hockey/nhl', name: 'NHL' },
  { slug: 'americanfootball/nfl', name: 'NFL' },
  { slug: 'americanfootball/ncaaf', name: 'NCAAF' },
  { slug: 'basketball/ncaab', name: 'NCAAB' },
  { slug: 'soccer/eng.1', name: 'EPL' },
  { slug: 'soccer/esp.1', name: 'La Liga' },
  { slug: 'soccer/ita.1', name: 'Serie A' },
  { slug: 'soccer/ger.1', name: 'Bundesliga' },
  { slug: 'soccer/fra.1', name: 'Ligue 1' },
];

const OVERTIME_API = 'https://api.overtime.io/overtime-v2';
const POLYMARKET_API = 'https://clob.polymarket.com';
const SXBET_API = 'https://api.sx.bet';

const FETCH_TIMEOUT = 15000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPolymarketMarkets() {
  const res = await fetchWithTimeout(`${POLYMARKET_API}/markets?tag=sports&limit=50`);
  if (!res.ok) throw new Error(`Polymarket: ${res.status}`);
  return res.json();
}

async function fetchSXBetMarkets() {
  const res = await fetchWithTimeout(`${SXBET_API}/markets/active`);
  if (!res.ok) throw new Error(`SX Bet: ${res.status}`);
  return res.json();
}

async function scanOvertime() {
  const results = [];

  const networks = [42161, 10, 8453];

  for (const networkId of networks) {
    try {
      const prematchRes = await fetchWithTimeout(`${OVERTIME_API}/markets?network=${networkId}`);
      if (!prematchRes.ok) continue;
      const prematchData = await prematchRes.json();
      const prematchMarkets = Array.isArray(prematchData) ? prematchData : prematchData.markets || [];

      const liveRes = await fetchWithTimeout(`${OVERTIME_API}/live-markets?network=${networkId}`);
      const liveData = liveRes.ok ? await liveRes.json() : { markets: [] };
      const liveMarkets = Array.isArray(liveData) ? liveData : liveData.markets || [];

      const allMarkets = [...prematchMarkets, ...liveMarkets];

      for (const m of allMarkets) {
        const sportName = OVERTIME_SPORTS[m.subLeagueId] || OVERTIME_SPORTS[m.leagueId] || m.sport || 'Unknown';
        const homeName = m.homeTeam || 'Home';
        const awayName = m.awayTeam || 'Away';
        const eventName = m.game || `${homeName} vs ${awayName}`;

        if (!m.odds || m.odds.length < 2) continue;

        const homeDec = m.odds[0]?.decimal || (m.odds[0]?.normalizedImplied > 0 ? 1 / m.odds[0].normalizedImplied : 0);
        const awayDec = m.odds[1]?.decimal || (m.odds[1]?.normalizedImplied > 0 ? 1 / m.odds[1].normalizedImplied : 0);

        if (homeDec <= 1 || awayDec <= 1) continue;

        results.push({
          event: eventName,
          sport: sportName,
          home: homeName,
          away: awayName,
          platformA: 'Overtime',
          oddsA: homeDec,
          platformB: 'Overtime',
          oddsB: awayDec,
          source: 'overtime',
          commenceTime: m.maturity ? new Date(m.maturity * 1000).toISOString() : null,
          isLive: m.live || liveMarkets.includes(m) || m.status === 'Live',
          marketId: m.gameId,
        });
      }
    } catch (err) {
      if (!err.message?.includes('400') && !err.message?.includes('401')) {
        console.error(`[OddsFetcher] Overtime (net ${networkId}): ${err.message}`);
      }
    }
  }

  return results;
}

async function scanPolymarket() {
  const results = [];

  try {
    const markets = await fetchPolymarketMarkets();
    const data = Array.isArray(markets) ? markets : markets.data || [];

    for (const market of data) {
      const price = parseFloat(market.outcomePrices?.[0]);
      if (!price || price <= 0) continue;

      const decOdds = 1 / price;
      if (!isFinite(decOdds)) continue;
      const outcomeName = market.question || market.description || 'Unknown';

      results.push({
        event: outcomeName,
        sport: 'Polymarket',
        home: 'YES',
        away: 'NO',
        platformA: 'Polymarket',
        oddsA: decOdds,
        platformB: 'Polymarket',
        oddsB: 1 / (1 - price),
        source: 'polymarket',
      });
    }
  } catch (err) {
    console.error(`[OddsFetcher] Polymarket: ${err.message}`, err.stack?.split('\n')[1]);
  }

  return results;
}

async function scanSXBet() {
  const results = [];

  try {
    const markets = await fetchSXBetMarkets();
    if (!markets) return results;
    const raw = Array.isArray(markets) ? markets : markets.data;
    const data = Array.isArray(raw) ? raw : [];

    for (const market of data) {
      const homeOdds = parseFloat(market.homeOdds) || 0;
      const awayOdds = parseFloat(market.awayOdds) || 0;
      if (homeOdds <= 1 || awayOdds <= 1) continue;

      results.push({
        event: market.homeTeam && market.awayTeam
          ? `${market.homeTeam} vs ${market.awayTeam}`
          : market.marketName || 'Unknown',
        sport: 'SX Bet',
        home: market.homeTeam || 'Home',
        away: market.awayTeam || 'Away',
        platformA: 'SX Bet',
        oddsA: homeOdds,
        platformB: 'SX Bet',
        oddsB: awayOdds,
        source: 'sxbet',
        marketId: market.id || market.marketHash,
      });
    }
  } catch (err) {
    if (!err.message?.includes('404') && !err.message?.includes('400')) {
      console.error(`[OddsFetcher] SX Bet: ${err.message}`, err.stack?.split('\n')[1]);
    }
  }

  return results;
}

function americanToDecimal(american) {
  if (!american) return 0;
  const v = parseInt(String(american).replace(/[+\s]/g, ''), 10);
  if (isNaN(v)) return 0;
  return v > 0 ? 1 + v / 100 : 1 + 100 / Math.abs(v);
}

async function scanESPN() {
  const results = [];

  for (const sport of ESPN_SPORTS) {
    try {
      const boardUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport.slug}/scoreboard`;
      const res = await fetchWithTimeout(boardUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) {
        if (res.status !== 400 && res.status !== 404) console.error(`[ESPN] ${sport.name}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const events = data.events || [];
      if (events.length === 0) continue;

      const [coreSport, coreLeague] = sport.slug.split('/');

      for (const event of events) {
        const comp = event.competitions?.[0];
        if (!comp) continue;

        const homeTeam = comp.competitors?.find(c => c.homeAway === 'home');
        const awayTeam = comp.competitors?.find(c => c.homeAway === 'away');
        if (!homeTeam || !awayTeam) continue;

        const homeName = homeTeam.team?.displayName || homeTeam.team?.name || 'Home';
        const awayName = awayTeam.team?.displayName || awayTeam.team?.name || 'Away';
        const eventName = event.name || `${awayName} at ${homeName}`;

        // Primary: Core API — returns decimal odds with provider names
        const coreUrl = `https://sports.core.api.espn.com/v2/sports/${coreSport}/leagues/${coreLeague}/events/${event.id}/competitions/${comp.id}/odds`;
        const coreRes = await fetchWithTimeout(coreUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });

        if (coreRes.ok) {
          const coreData = await coreRes.json();
          const items = coreData.items || [];
          let coreFound = false;

          for (const item of items) {
            const homeML = item.homeTeamOdds?.current?.moneyLine?.decimal;
            const awayML = item.awayTeamOdds?.current?.moneyLine?.decimal;
            if (!homeML || !awayML) continue;
            if (homeML <= 1 || awayML <= 1) continue;

            results.push({
              event: eventName,
              sport: sport.name,
              home: homeName,
              away: awayName,
              platformA: item.provider?.name || 'DraftKings',
              oddsA: homeML,
              platformB: item.provider?.name || 'DraftKings',
              oddsB: awayML,
              source: 'espn',
              commenceTime: event.date,
            });
            coreFound = true;
          }

          if (coreFound) continue; // skip scoreboard fallback
        }

        // Fallback: scoreboard odds (American format)
        const odds = comp.odds?.[0];
        if (!odds?.moneyline) continue;

        const homeMoneyline = odds.moneyline.home?.close?.odds;
        const awayMoneyline = odds.moneyline.away?.close?.odds;
        if (!homeMoneyline || !awayMoneyline) continue;

        const homeDec = americanToDecimal(homeMoneyline);
        const awayDec = americanToDecimal(awayMoneyline);
        if (homeDec <= 1 || awayDec <= 1) continue;

        results.push({
          event: eventName,
          sport: sport.name,
          home: homeName,
          away: awayName,
          platformA: odds.provider?.name || 'DraftKings',
          oddsA: homeDec,
          platformB: odds.provider?.name || 'DraftKings',
          oddsB: awayDec,
          source: 'espn',
          commenceTime: event.date,
        });
      }
    } catch (err) {
      if (err.message?.includes('400') || err.message?.includes('404')) {
        // out of season or no games — expected, skip silently
      } else {
        console.error(`[ESPN] ${sport.name}: ${err.message}`, err.stack?.split('\n')[1]);
      }
    }
  }

  return results;
}

async function scanAll() {
  const [espnOdds, polymarketOdds, sxbetOdds, azuroOdds] = await Promise.all([
    scanESPN(),
    scanPolymarket(),
    scanSXBet(),
    scanAzuro(),
  ]);

  const combined = [...espnOdds, ...polymarketOdds, ...sxbetOdds, ...azuroOdds];
  return liveFilter(combined);
}

function countLiveGames(oddsData) {
  const now = Math.floor(Date.now() / 1000);
  return oddsData.filter(o => {
    if (o.isLive) return true;
    if (!o.commenceTime) return false;
    const t = new Date(o.commenceTime).getTime() / 1000;
    return t <= now && t >= now - 14400;
  }).length;
}

async function _scanScoresESPN() {
  const results = [];

  for (const sport of ESPN_SPORTS) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport.slug}/scoreboard`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;

      const data = await res.json();
      const events = data.events || [];
      if (events.length === 0) continue;

      for (const event of events) {
        const status = event.status?.type;
        if (!status?.completed && status?.name !== 'Final' && status?.name !== 'Finished') continue;

        const comp = event.competitions?.[0];
        if (!comp) continue;

        const homeTeam = comp.competitors?.find(c => c.homeAway === 'home');
        const awayTeam = comp.competitors?.find(c => c.homeAway === 'away');
        if (!homeTeam || !awayTeam) continue;

        const homeName = homeTeam.team?.displayName || homeTeam.team?.name || 'Home';
        const awayName = awayTeam.team?.displayName || awayTeam.team?.name || 'Away';
        const homeScore = parseInt(homeTeam.score) || 0;
        const awayScore = parseInt(awayTeam.score) || 0;
        const winner = homeScore > awayScore ? 'home' : 'away';
        const winnerName = winner === 'home' ? homeName : awayName;
        const eventName = event.name || `${awayName} at ${homeName}`;

        results.push({
          event: eventName,
          sport: sport.name,
          home: homeName,
          away: awayName,
          homeScore,
          awayScore,
          winner,
          winnerName,
          completed: true,
          commenceTime: event.date,
        });
      }
    } catch (_) {}
  }

  return results;
}

async function scanScores() {
  return _scanScoresESPN();
}

const AZURO_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/azuro-org/azuro-api-polygon';

async function scanAzuro() {
  const results = [];
  try {
    const query = `
      query LiveConditions($first: Int) {
        conditions(first: $first, where: { status_in: ["Pending", "Live"] }, orderBy: createdAt, orderDirection: desc) {
          id
          game
          status
          startsAt
          outcomes {
            id
            name
            odds
          }
          core {
            sport
            participants
          }
        }
      }
    `;
    const resp = await fetch(AZURO_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { first: 100 } }),
    });
    const { data } = await resp.json();
    const conditions = data?.conditions || [];
    for (const c of conditions) {
      if (!c.outcomes || c.outcomes.length < 2) continue;
      const homeOutcome = c.outcomes[0];
      const awayOutcome = c.outcomes[1];
      const homeOdds = parseInt(homeOutcome.odds) / 1e18;
      const awayOdds = parseInt(awayOutcome.odds) / 1e18;
      if (homeOdds <= 1 || awayOdds <= 1) continue;

      const participants = c.core?.participants || [];
      const homeName = participants[0] || homeOutcome.name || 'Home';
      const awayName = participants[1] || 'Away';
      const eventName = c.game || `${homeName} vs ${awayName}`;

      results.push({
        event: eventName,
        sport: c.core?.sport || 'Azuro',
        home: homeName,
        away: awayName,
        platformA: 'Azuro',
        oddsA: homeOdds,
        platformB: 'Azuro',
        oddsB: awayOdds,
        source: 'azuro',
        conditionId: c.id,
      });
    }
  } catch (err) {
    if (!err.message?.includes('400') && !err.message?.includes('404')) {
      console.error(`[OddsFetcher] Azuro: ${err.message}`, err.stack?.split('\n')[1]);
    }
  }
  return results;
}

function liveFilter(oddsData) {
  const liveOnly = config.liveOnly;
  if (!liveOnly) return oddsData;
  const now = Math.floor(Date.now() / 1000);
  return oddsData.filter(o => {
    if (!o.commenceTime) return false;
    const t = new Date(o.commenceTime).getTime() / 1000;
    return t <= now + 7200 && t >= now - 7200;
  });
}

module.exports = { scanAll, scanPolymarket, scanSXBet, scanESPN, scanAzuro, liveFilter, scanScores, countLiveGames };
