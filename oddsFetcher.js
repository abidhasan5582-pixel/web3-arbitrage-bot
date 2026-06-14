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
      console.error(`[OddsFetcher] ${sport.name}: ${err.message}`, err.stack?.split('\n')[1]);
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
    const data = Array.isArray(markets) ? markets : markets.data || [];

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
      });
    }
  } catch (err) {
    console.error(`[OddsFetcher] SX Bet: ${err.message}`, err.stack?.split('\n')[1]);
  }

  return results;
}

async function scanAll() {
  const [sportsOdds, polymarketOdds, sxbetOdds] = await Promise.all([
    scanAllSports(),
    scanPolymarket(),
    scanSXBet(),
  ]);

  return [...sportsOdds, ...polymarketOdds, ...sxbetOdds];
}

module.exports = { scanAll, scanAllSports, scanPolymarket, scanSXBet };
