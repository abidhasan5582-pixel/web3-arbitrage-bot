const config = require('./config');
const { calculate2Way } = require('./arbitrage');

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

const POLYMARKET_API = 'https://gamma-api.polymarket.com';
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPolymarketMarkets() {
  const res = await fetchWithTimeout(`${POLYMARKET_API}/markets?active=true&closed=false&limit=100`);
  if (!res.ok) throw new Error(`Polymarket: ${res.status}`);
  return res.json();
}



function isSportsMarket(market) {
  const text = `${market.question || ''} ${market.description || ''} ${market.groupItemTitle || ''}`.toLowerCase();
  const SPORTS_KEYWORDS = [
    'nba', 'nfl', 'mlb', 'nhl', 'ncaaf', 'ncaab', 'wnba', 'ufc', 'mls',
    'soccer', 'football', 'basketball', 'baseball', 'hockey', 'tennis',
    'f1', 'formula', 'boxing', 'mma', 'championship', 'playoff', 'finals',
    'world cup', 'premier league', 'la liga', 'serie a', 'bundesliga',
    'epl', 'copa', 'champions league', 'europa league', 'masters',
    'open championship', 'wimbledon', 'us open', 'french open',
  ];
  return SPORTS_KEYWORDS.some(kw => text.includes(kw));
}

async function scanPolymarket() {
  const results = [];

  try {
    const markets = await fetchPolymarketMarkets();
    const data = Array.isArray(markets) ? markets : [];

    for (const market of data) {
      if (!isSportsMarket(market)) continue;

      let prices;
      try {
        prices = JSON.parse(market.outcomePrices || '[]');
      } catch (_) {
        continue;
      }

      const price = parseFloat(prices?.[0]);
      if (!price || price <= 0) continue;

      const decOdds = 1 / price;
      if (!isFinite(decOdds)) continue;

      const noPrice = parseFloat(prices?.[1]);
      if (!noPrice || noPrice <= 0) continue;
      const noOdds = 1 / noPrice;
      if (!isFinite(noOdds)) continue;

      const question = market.question || market.groupItemTitle || 'Unknown';

      results.push({
        event: question,
        sport: 'Polymarket',
        home: 'YES',
        away: 'NO',
        platformA: 'Polymarket',
        oddsA: decOdds,
        platformB: 'Polymarket',
        oddsB: noOdds,
        source: 'polymarket',
        marketId: market.id,
        commenceTime: market.endDate || market.endDateIso || null,
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
    const resp = await fetchWithTimeout(`${SXBET_API}/markets/active`);
    if (!resp.ok) throw new Error(`SX Bet: ${resp.status}`);
    const body = await resp.json();
    const markets = body?.data?.markets || [];
    if (!Array.isArray(markets) || markets.length === 0) return results;

    for (const market of markets) {
      if (market.type !== 226) continue;
      const homeTeam = market.teamOneName || 'Home';
      const awayTeam = market.teamTwoName || 'Away';

      const gameTime = market.gameTime ? new Date(market.gameTime * 1000).toISOString() : null;

      results.push({
        event: normalizeEventName(awayTeam, homeTeam),
        sport: market.sportLabel || 'SX Bet',
        home: homeTeam,
        away: awayTeam,
        platformA: 'SX Bet',
        oddsA: 0,
        platformB: 'SX Bet',
        oddsB: 0,
        source: 'sxbet',
        marketId: market.marketHash,
        commenceTime: gameTime,
        hasOdds: false,
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

      const eventResults = await Promise.allSettled(events.map(async (event) => {
        const comp = event.competitions?.[0];
        if (!comp) return [];

        const homeTeam = comp.competitors?.find(c => c.homeAway === 'home');
        const awayTeam = comp.competitors?.find(c => c.homeAway === 'away');
        if (!homeTeam || !awayTeam) return [];

        const homeName = homeTeam.team?.displayName || homeTeam.team?.name || 'Home';
        const awayName = awayTeam.team?.displayName || awayTeam.team?.name || 'Away';
        const eventName = event.name || `${awayName} at ${homeName}`;
        const normEvent = normalizeEventName(awayName, homeName);

        // Primary: Core API — returns decimal odds with provider names
        const coreUrl = `https://sports.core.api.espn.com/v2/sports/${coreSport}/leagues/${coreLeague}/events/${event.id}/competitions/${comp.id}/odds`;
        const coreRes = await fetchWithTimeout(coreUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });

        if (coreRes.ok) {
          const coreData = await coreRes.json();
          const items = coreData.items || [];
          const parsed = [];

          for (const item of items) {
            const homeML = item.homeTeamOdds?.current?.moneyLine?.decimal;
            const awayML = item.awayTeamOdds?.current?.moneyLine?.decimal;
            if (!homeML || !awayML) continue;
            if (homeML <= 1 || awayML <= 1) continue;

            parsed.push({
              event: normEvent,
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
          }

          if (parsed.length > 0) return parsed; // skip scoreboard fallback
        }

        // Fallback: scoreboard odds (American format)
        const odds = comp.odds?.[0];
        if (!odds?.moneyline) return [];

        const homeMoneyline = odds.moneyline.home?.close?.odds;
        const awayMoneyline = odds.moneyline.away?.close?.odds;
        if (!homeMoneyline || !awayMoneyline) return [];

        const homeDec = americanToDecimal(homeMoneyline);
        const awayDec = americanToDecimal(awayMoneyline);
        if (homeDec <= 1 || awayDec <= 1) return [];

        return [{
          event: normEvent,
          sport: sport.name,
          home: homeName,
          away: awayName,
          platformA: odds.provider?.name || 'DraftKings',
          oddsA: homeDec,
          platformB: odds.provider?.name || 'DraftKings',
          oddsB: awayDec,
          source: 'espn',
          commenceTime: event.date,
        }];
      }));

      for (const r of eventResults) {
        if (r.status === 'fulfilled') results.push(...r.value);
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

// Odds API keys and sport-to-slug mapping
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const ODDS_API_SPORTS = [
  { key: 'basketball_nba', name: 'NBA' },
  { key: 'americanfootball_nfl', name: 'NFL' },
  { key: 'baseball_mlb', name: 'MLB' },
  { key: 'icehockey_nhl', name: 'NHL' },
  { key: 'americanfootball_ncaaf', name: 'NCAAF' },
  { key: 'basketball_ncaab', name: 'NCAAB' },
  { key: 'soccer_epl', name: 'EPL' },
  { key: 'soccer_esp_la_liga', name: 'La Liga' },
  { key: 'soccer_italy_serie_a', name: 'Serie A' },
  { key: 'soccer_germany_bundesliga', name: 'Bundesliga' },
  { key: 'soccer_france_ligue_one', name: 'Ligue 1' },
  { key: 'mma_mixed_martial_arts', name: 'MMA' },
  { key: 'boxing_boxing', name: 'Boxing' },
];

async function scanOddsAPI() {
  const results = [];
  const apiKey = config.oddsApiKey;
  if (!apiKey) return results;

  for (const sport of ODDS_API_SPORTS) {
    try {
      const url = `${ODDS_API_BASE}/sports/${sport.key}/odds/?regions=us&markets=h2h&apiKey=${apiKey}`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          console.log(`[OddsAPI] ${sport.name}: invalid API key — skipping`);
          return results;
        }
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      for (const event of data) {
        const homeName = event.home_team || 'Home';
        const awayName = event.away_team || 'Away';
        const normEvent = normalizeEventName(awayName, homeName);

        for (const bookmaker of (event.bookmakers || [])) {
          const platform = bookmaker.title || bookmaker.key || 'Unknown';
          for (const market of (bookmaker.markets || [])) {
            if (market.key !== 'h2h') continue;
            const outcomes = market.outcomes || [];
            const homeOutcome = outcomes.find(o => o.name === event.home_team);
            const awayOutcome = outcomes.find(o => o.name === event.away_team);
            if (!homeOutcome?.price || !awayOutcome?.price) continue;

            results.push({
              event: normEvent,
              sport: sport.name,
              home: homeName,
              away: awayName,
              platformA: platform,
              oddsA: homeOutcome.price,
              platformB: platform,
              oddsB: awayOutcome.price,
              source: 'oddsapi',
              isLive: false,
              commenceTime: event.commence_time || null,
            });
          }
        }
      }
    } catch (err) {
      if (!err.message?.includes('aborted')) {
        console.error(`[OddsAPI] ${sport.name}: ${err.message}`);
      }
    }
  }
  return results;
}

const ODDSAPIIO_BASE = 'https://api.odds-api.io/v3';
const ODDSAPIIO_SPORTS = [
  { slug: 'baseball', name: 'MLB' },
  { slug: 'american-football', name: 'NFL' },
  { slug: 'basketball', name: 'NBA' },
  { slug: 'ice-hockey', name: 'NHL' },
  { slug: 'football', name: 'EPL' },
  { slug: 'mixed-martial-arts', name: 'MMA' },
];
const ODDSAPIIO_BOOKMAKERS = 'DraftKings,FanDuel';

async function scanOddsAPIio() {
  const results = [];
  const apiKey = config.oddsapiiApiKey;
  if (!apiKey) return results;

  // Fetch live events across all sports first (live game focus)
  try {
    const liveUrl = `${ODDSAPIIO_BASE}/events/live?apiKey=${apiKey}`;
    const liveRes = await fetchWithTimeout(liveUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (liveRes.ok) {
      const liveData = await liveRes.json();
      if (Array.isArray(liveData) && liveData.length > 0) {
        const liveIds = liveData.map(e => e.id).filter(Boolean);
        console.log(`[OddsAPI.io] ${liveIds.length} live events found`);
        // Batch fetch odds for live events (10 per request)
        for (let i = 0; i < liveIds.length; i += 10) {
          const batch = liveIds.slice(i, i + 10);
          await fetchOddsAPIIOBatch(batch, true, results, apiKey);
        }
      }
    }
  } catch (err) {
    if (!err.message?.includes('aborted')) console.error(`[OddsAPI.io] live: ${err.message}`);
  }

  // Then pending events per sport
  for (const sport of ODDSAPIIO_SPORTS) {
    try {
      const url = `${ODDSAPIIO_BASE}/events?apiKey=${apiKey}&sport=${sport.slug}&status=pending&limit=50`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const ids = data.map(e => e.id).filter(Boolean);
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        await fetchOddsAPIIOBatch(batch, false, results, apiKey);
      }
    } catch (err) {
      if (!err.message?.includes('aborted')) console.error(`[OddsAPI.io] ${sport.name}: ${err.message}`);
    }
  }
  return results;
}

async function fetchOddsAPIIOBatch(eventIds, isLive, results, apiKey) {
  try {
    const url = `${ODDSAPIIO_BASE}/odds/multi?apiKey=${apiKey}&eventIds=${eventIds.join(',')}&bookmakers=${ODDSAPIIO_BOOKMAKERS}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    for (const event of data) {
      if (!event.bookmakers || Object.keys(event.bookmakers).length === 0) continue;
      const homeName = event.home || 'Home';
      const awayName = event.away || 'Away';
      const normEvent = normalizeEventName(awayName, homeName);

      // Map sport name from event.sport.slug
      const sport = ODDSAPIIO_SPORTS.find(s => s.slug === event.sport?.slug);
      const sportName = sport?.name || event.sport?.name || 'Unknown';

      for (const [bookmaker, markets] of Object.entries(event.bookmakers)) {
        const ml = Array.isArray(markets) ? markets.find(m => m.name === 'ML') : null;
        if (!ml?.odds?.[0]) continue;
        const odds = ml.odds[0];
        const homeOdds = parseFloat(odds.home);
        const awayOdds = parseFloat(odds.away);
        if (!homeOdds || !awayOdds || homeOdds <= 1 || awayOdds <= 1) continue;

        results.push({
          event: normEvent,
          sport: sportName,
          home: homeName,
          away: awayName,
          platformA: bookmaker,
          oddsA: homeOdds,
          platformB: bookmaker,
          oddsB: awayOdds,
          source: 'oddsapii',
          isLive,
          commenceTime: event.date || null,
        });
      }
    }
  } catch (err) {
    if (!err.message?.includes('aborted')) console.error(`[OddsAPI.io] batch: ${err.message}`);
  }
}

const SHARPAPI_LEAGUES = [
  { key: 'NBA', name: 'NBA' },
  { key: 'NFL', name: 'NFL' },
  { key: 'MLB', name: 'MLB' },
  { key: 'NHL', name: 'NHL' },
  { key: 'NCAAF', name: 'NCAAF' },
  { key: 'NCAAB', name: 'NCAAB' },
  { key: 'EPL', name: 'EPL' },
  { key: 'LALIGA', name: 'La Liga' },
  { key: 'SERIE_A', name: 'Serie A' },
  { key: 'BUNDESLIGA', name: 'Bundesliga' },
  { key: 'LIGUE_1', name: 'Ligue 1' },
  { key: 'MLS', name: 'MLS' },
  { key: 'UFC', name: 'MMA' },
];

async function scanSharpAPI() {
  const results = [];
  const apiKey = config.sharpApiKey;
  if (!apiKey) return results;
  const baseUrl = 'https://api.sharpapi.io/api/v1';

  // Free tier: 12 req/min, so we rate-limit to 1 req per 6s (10/min)
  const RATE_DELAY_MS = 6000;

  for (const league of SHARPAPI_LEAGUES) {
    try {
      const url = `${baseUrl}/odds?league=${league.key}`;
      const res = await fetchWithTimeout(url, {
        headers: { 'X-API-Key': apiKey, 'User-Agent': 'Mozilla/5.0' },
      });
      const body = await res.json();

      // Check for rate-limit or error in body
      if (body?.error) {
        console.log(`[SharpAPI] ${league.name}: ${body.error.code || 'error'} — ${body.error.message || ''}`);
        // Rate limited — stop early to avoid wasting requests
        if (body.error.code === 'rate_limited') break;
        continue;
      }

      const selections = body?.data;
      if (!Array.isArray(selections) || selections.length === 0) {
        await sleep(RATE_DELAY_MS);
        continue;
      }

      // Group by (sportsbook, home_team, away_team)
      const groups = {};
      for (const s of selections) {
        if (s.market_type !== 'moneyline') continue;
        if (!s.odds_decimal || s.odds_decimal <= 1) continue;
        const key = `${s.sportsbook}|${s.home_team}|${s.away_team}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
      }

      for (const [gk, group] of Object.entries(groups)) {
        const [rawSportsbook, homeName, awayName] = gk.split('|');
        // Normalize sportsbook name to title case (ESPN uses "DraftKings", SharpAPI uses "draftkings")
        const sportsbook = rawSportsbook.charAt(0).toUpperCase() + rawSportsbook.slice(1);
        const homeSel = group.find(s => s.selection === homeName);
        const awaySel = group.find(s => s.selection === awayName);
        if (!homeSel?.odds_decimal || !awaySel?.odds_decimal) continue;

        const normEvent = normalizeEventName(awayName, homeName);
        results.push({
          event: normEvent,
          sport: league.name,
          home: homeName,
          away: awayName,
          platformA: sportsbook,
          oddsA: homeSel.odds_decimal,
          platformB: sportsbook,
          oddsB: awaySel.odds_decimal,
          source: 'sharpapi',
          isLive: !!homeSel.is_live,
          commenceTime: null,
        });
      }

      // Rate-limit delay between leagues
      await sleep(RATE_DELAY_MS);
    } catch (err) {
      if (!err.message?.includes('aborted')) {
        console.error(`[SharpAPI] ${league.name}: ${err.message}`);
      }
    }
  }
  return results;
}

async function scanAll() {
  const sources = [
    scanESPN(),
    scanPolymarket(),
    scanSXBet(),
    scanAzuro(),
    scanOddsAPI(),
    scanOddsAPIio(),
    scanSharpAPI(),
  ];
  const results = await Promise.allSettled(sources);

  const combined = [];
  const sourceLabels = ['ESPN', 'Polymarket', 'SX Bet', 'Azuro', 'OddsAPI', 'OddsAPI.io', 'SharpAPI'];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      combined.push(...r.value);
      console.log(`[Scanner] ${sourceLabels[i]}: ${r.value.length} events`);
    } else {
      console.log(`[Scanner] ${sourceLabels[i]}: FAILED — ${r.reason?.message || 'unknown error'}`);
    }
  }
  console.log(`[Scanner] ${combined.length} raw events before liveFilter`);

  // Normalize isLive for all entries: if not set by scanner, compute from commenceTime
  const now = Date.now();
  for (const o of combined) {
    if (o.isLive === undefined && o.commenceTime) {
      const t = new Date(o.commenceTime).getTime();
      o.isLive = t <= now && t >= now - 14400000; // started within last 4 hours
    }
  }

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

const AZURO_SUBGRAPH = 'https://thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3';

async function scanAzuro() {
  const results = [];
  try {
    const query = `
      query LiveConditions($first: Int) {
        conditions(first: $first, where: { status: Created }, orderBy: createdBlockTimestamp, orderDirection: desc) {
          id
          title
          core
          internalStartsAt
          game {
            id
          }
          outcomes {
            id
            title
            currentOdds
          }
        }
      }
    `;
    const resp = await fetchWithTimeout(AZURO_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { first: 100 } }),
    });
    const body = await resp.json();
    const conditions = body?.data?.conditions || [];

    // First pass: return individual conditions as normal entries
    for (const c of conditions) {
      if (!c.outcomes || c.outcomes.length < 2) continue;
      const homeOutcome = c.outcomes[0];
      const awayOutcome = c.outcomes[1];
      const homeOdds = parseFloat(homeOutcome.currentOdds);
      const awayOdds = parseFloat(awayOutcome.currentOdds);
      if (!homeOdds || !awayOdds || homeOdds <= 1 || awayOdds <= 1) continue;

      const homeName = homeOutcome.title || 'Home';
      const awayName = awayOutcome.title || 'Away';
      const eventName = normalizeEventName(awayName, homeName);

      results.push({
        event: eventName,
        sport: 'Azuro',
        home: homeName,
        away: awayName,
        platformA: 'Azuro',
        oddsA: homeOdds,
        platformB: 'Azuro',
        oddsB: awayOdds,
        source: 'azuro',
        conditionId: c.id,
        commenceTime: c.internalStartsAt ? new Date(parseInt(c.internalStartsAt) * 1000).toISOString() : null,
      });
    }

    // Second pass: detect internal arbs across different cores for the same game
    const byGame = {};
    for (const c of conditions) {
      if (!c.outcomes || c.outcomes.length < 2) continue;
      if (!c.game?.id) continue;
      if (!c.core) continue;
      if (!byGame[c.game.id]) byGame[c.game.id] = [];
      // Normalize outcome titles for matching
      const outcomes = c.outcomes.map(o => ({ title: o.title?.trim().toLowerCase(), odds: parseFloat(o.currentOdds), raw: o.title }));
      byGame[c.game.id].push({ core: c.core, outcomes, title: c.title });
    }

    for (const gameId of Object.keys(byGame)) {
      const conditions = byGame[gameId];
      if (conditions.length < 2) continue;

      // Compare each pair of conditions from different cores
      for (let i = 0; i < conditions.length; i++) {
        for (let j = i + 1; j < conditions.length; j++) {
          const a = conditions[i];
          const b = conditions[j];
          if (a.core === b.core) continue;

          // Match outcomes by title (same-named outcomes across cores)
          for (const oa of a.outcomes) {
            const ob = b.outcomes.find(o => o.title === oa.title);
            if (!ob) continue;
            // Found same outcome on different cores with different odds
            const lower = Math.min(oa.odds, ob.odds);
            const higher = Math.max(oa.odds, ob.odds);
            if (lower <= 1 || higher <= 1) continue;
            // Calculate arb: back the higher odds, lay the lower
            const calc = calculate2Way(higher, lower);
            if (calc.isArb) {
              const roi = Math.round(calc.roi * 10000) / 100;
              // Only emit if odds truly differ by at least 0.5% to avoid noise
              if (Math.abs(higher - lower) / lower < 0.005) continue;
              const highCore = oa.odds === higher ? a.core : b.core;
              const lowCore = oa.odds === lower ? a.core : b.core;
              results.push({
                event: conditions[0].title || gameId,
                sport: 'Azuro',
                home: oa.raw || oa.title,
                away: ob.raw || ob.title,
                platformA: `Azuro:${highCore.slice(0, 10)}`,
                oddsA: higher,
                platformB: `Azuro:${lowCore.slice(0, 10)}`,
                oddsB: lower,
                roi,
                source: 'azuro-internal',
                commenceTime: null,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    if (!err.message?.includes('400') && !err.message?.includes('404') && !err.message?.includes('aborted')) {
      console.error(`[OddsFetcher] Azuro: ${err.message}`, err.stack?.split('\n')[1]);
    }
  }
  return results;
}

function normalizeEventName(awayName, homeName) {
  const away = awayName.trim().replace(/\s+/g, ' ');
  const home = homeName.trim().replace(/\s+/g, ' ');
  return `${away} @ ${home}`;
}

function liveFilter(oddsData) {
  const liveOnly = config.liveOnly;
  if (!liveOnly) return oddsData;
  const now = Math.floor(Date.now() / 1000);
  return oddsData.filter(o => {
    if (o.isLive) return true;
    if (!o.commenceTime) return false;
    const t = new Date(o.commenceTime).getTime() / 1000;
    return t <= now + 7200 && t >= now - 7200;
  });
}

module.exports = { scanAll, scanPolymarket, scanSXBet, scanESPN, scanAzuro, scanOddsAPI, scanOddsAPIio, scanSharpAPI, liveFilter, scanScores, countLiveGames, normalizeEventName };
