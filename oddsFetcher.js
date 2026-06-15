const config = require('./config');

const SPORTS = [
  { key: 'basketball_nba', name: 'NBA' },
  { key: 'basketball_ncaab', name: 'NCAAB' },
  { key: 'americanfootball_nfl', name: 'NFL' },
  { key: 'americanfootball_ncaaf', name: 'NCAAF' },
  { key: 'soccer_epl', name: 'EPL' },
  { key: 'soccer_uefa_champions_league', name: 'UCL' },
  { key: 'soccer_spain_la_liga', name: 'La Liga' },
  { key: 'soccer_italy_serie_a', name: 'Serie A' },
  { key: 'soccer_germany_bundesliga', name: 'Bundesliga' },
  { key: 'tennis_atp', name: 'ATP Tennis' },
  { key: 'tennis_wta', name: 'WTA Tennis' },
  { key: 'ice_nhl', name: 'NHL' },
  { key: 'baseball_mlb', name: 'MLB' },
  { key: 'mma_mixed_martial_arts', name: 'UFC' },
];

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

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
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

async function fetchOddsPapi(sport) {
  const url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${config.oddsApiKey}&regions=us,eu,uk&markets=h2h&oddsFormat=decimal`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OddsPapi ${sport}: ${res.status}`);
  return res.json();
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

async function scanAllSports() {
  const results = [];

  for (const sport of SPORTS) {
    try {
      const data = await fetchOddsPapi(sport.key);
      if (Array.isArray(data)) {
        for (const event of data) {
          if (!event.bookmakers || event.bookmakers.length < 2) continue;

          const outcomes = event.bookmakers[0]?.markets?.[0]?.outcomes;
          if (!outcomes || outcomes.length < 2) continue;

          const homeName = outcomes[0].name;
          const awayName = outcomes[1].name;

          const oddsByOutcome = {};
          for (const book of event.bookmakers) {
            const outcomes = book.markets?.[0]?.outcomes;
            if (!outcomes || outcomes.length < 2) continue;

            for (let i = 0; i < outcomes.length; i++) {
              const name = outcomes[i].name;
              if (!oddsByOutcome[name]) oddsByOutcome[name] = [];
              oddsByOutcome[name].push({
                book: book.title,
                odds: outcomes[i].price,
              });
            }
          }

          const outcomeNames = Object.keys(oddsByOutcome);
          if (outcomeNames.length < 2) continue;

          for (let i = 0; i < outcomeNames.length; i++) {
            for (let j = i + 1; j < outcomeNames.length; j++) {
              for (const a of oddsByOutcome[outcomeNames[i]]) {
                for (const b of oddsByOutcome[outcomeNames[j]]) {
                  if (a.book === b.book) continue;
                  results.push({
                    event: event.home_team
                      ? `${event.home_team} vs ${event.away_team}`
                      : event.sport_title,
                    sport: sport.name,
                    home: outcomeNames[i],
                    away: outcomeNames[j],
                    platformA: a.book,
                    oddsA: a.odds,
                    platformB: b.book,
                    oddsB: b.odds,
                    source: 'oddspapi',
                    commenceTime: event.commence_time,
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.message?.includes('404')) {
        // sport not available on free tier — skip silently
      } else {
        console.error(`[OddsFetcher] ${sport.name}: ${err.message}`, err.stack?.split('\n')[1]);
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
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport.slug}/scoreboard`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) {
        if (res.status !== 400 && res.status !== 404) console.error(`[ESPN] ${sport.name}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const events = data.events || [];
      if (events.length === 0) continue;

      for (const event of events) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const odds = comp.odds?.[0];
        if (!odds?.moneyline) continue;

        const homeTeam = comp.competitors?.find(c => c.homeAway === 'home');
        const awayTeam = comp.competitors?.find(c => c.homeAway === 'away');
        if (!homeTeam || !awayTeam) continue;

        const homeMoneyline = odds.moneyline.home?.close?.odds;
        const awayMoneyline = odds.moneyline.away?.close?.odds;
        if (!homeMoneyline || !awayMoneyline) continue;

        const homeDec = americanToDecimal(homeMoneyline);
        const awayDec = americanToDecimal(awayMoneyline);
        if (homeDec <= 1 || awayDec <= 1) continue;

        const homeName = homeTeam.team?.displayName || homeTeam.team?.name || 'Home';
        const awayName = awayTeam.team?.displayName || awayTeam.team?.name || 'Away';
        const eventName = event.name || `${awayName} at ${homeName}`;

        results.push({
          event: eventName,
          sport: sport.name,
          home: homeName,
          away: awayName,
          platformA: `ESPN (${odds.provider?.name || 'DraftKings'})`,
          oddsA: homeDec,
          platformB: `ESPN (${odds.provider?.name || 'DraftKings'})`,
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
  const [sportsOdds, espnOdds, polymarketOdds, sxbetOdds, azuroOdds] = await Promise.all([
    scanAllSports(),
    scanESPN(),
    scanPolymarket(),
    scanSXBet(),
    scanAzuro(),
  ]);

  const combined = [...sportsOdds, ...espnOdds, ...polymarketOdds, ...sxbetOdds, ...azuroOdds];
  return liveFilter(combined);
}

async function scanScoresOddsApi() {
  const results = [];
  if (!config.oddsApiKey) return results;

  for (const sport of SPORTS) {
    try {
      const url = `${ODDS_API_BASE}/sports/${sport.key}/scores/?apiKey=${config.oddsApiKey}&daysFrom=2`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      for (const event of data) {
        if (!event.completed) continue;
        const scores = event.scores;
        if (!scores || scores.length < 2) continue;

        const homeScore = parseInt(scores.find(s => s.name === event.home_team)?.score ?? 0);
        const awayScore = parseInt(scores.find(s => s.name === event.away_team)?.score ?? 0);
        const winner = homeScore > awayScore ? 'home' : 'away';
        const evName = event.home_team && event.away_team
          ? `${event.home_team} vs ${event.away_team}`
          : event.sport_title;

        results.push({
          event: evName,
          sport: sport.name,
          home: event.home_team || 'Home',
          away: event.away_team || 'Away',
          homeScore,
          awayScore,
          winner,
          winnerName: winner === 'home' ? event.home_team : event.away_team,
          completed: true,
          commenceTime: event.commence_time,
          source: 'oddspapi',
        });
      }
    } catch (_) {}
  }

  return results;
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
  const [espn, oddsApi] = await Promise.all([
    _scanScoresESPN(),
    scanScoresOddsApi(),
  ]);
  const seen = new Set();
  const merged = [];
  for (const s of [...espn, ...oddsApi]) {
    const key = `${s.event}|${s.home}|${s.away}`;
    if (!seen.has(key)) { seen.add(key); merged.push(s); }
  }
  return merged;
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

module.exports = { scanAll, scanAllSports, scanPolymarket, scanSXBet, scanESPN, scanAzuro, liveFilter, scanScores, scanScoresOddsApi };
