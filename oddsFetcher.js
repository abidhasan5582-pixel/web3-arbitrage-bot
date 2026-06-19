const config = require('./config');
const { calculate2Way } = require('./arbitrage');
const { OddsAPIClient } = require('odds-api-io');

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



let ODDSAPIIO_SPORTS = [
  { slug: 'football', name: 'Football' },
  { slug: 'basketball', name: 'Basketball' },
  { slug: 'tennis', name: 'Tennis' },
  { slug: 'baseball', name: 'Baseball' },
  { slug: 'american-football', name: 'American Football' },
  { slug: 'ice-hockey', name: 'Ice Hockey' },
  { slug: 'esports', name: 'Esports' },
  { slug: 'mixed-martial-arts', name: 'MMA' },
  { slug: 'boxing', name: 'Boxing' },
  { slug: 'darts', name: 'Darts' },
  { slug: 'handball', name: 'Handball' },
  { slug: 'volleyball', name: 'Volleyball' },
  { slug: 'snooker', name: 'Snooker' },
  { slug: 'table-tennis', name: 'Table Tennis' },
  { slug: 'rugby', name: 'Rugby' },
  { slug: 'cricket', name: 'Cricket' },
  { slug: 'futsal', name: 'Futsal' },
  { slug: 'aussie-rules', name: 'Aussie Rules' },
  { slug: 'badminton', name: 'Badminton' },
  { slug: 'golf', name: 'Golf' },
  { slug: 'cross-country', name: 'Cross Country' },
  { slug: 'cycling', name: 'Cycling' },
  { slug: 'athletics', name: 'Athletics' },
];
if (config.oddsapiiSports) {
  const custom = config.oddsapiiSports.split(',').map(s => s.trim().toLowerCase());
  ODDSAPIIO_SPORTS = ODDSAPIIO_SPORTS.filter(s => custom.includes(s.slug));
}
const ODDSAPIIO_BOOKMAKERS = config.oddsapiiBookmakers || 'DraftKings,FanDuel';

// --- Odds-API.io Rate Limiter (sliding window) ---
const _rl = {
  calls: [],
  maxCalls: 85,
  windowMs: 3600000,
  limited: false,
  limitedAt: 0,
};
function _prune() {
  const now = Date.now();
  _rl.calls = _rl.calls.filter(t => now - t < _rl.windowMs);
  if (_rl.limited && now - _rl.limitedAt > _rl.windowMs) _rl.limited = false;
}
function _canCall() { _prune(); return !_rl.limited && _rl.calls.length < _rl.maxCalls; }
function _record() { _rl.calls.push(Date.now()); }
function _budget() { _prune(); return _rl.maxCalls - _rl.calls.length; }
function _hitLimit() { _rl.limited = true; _rl.limitedAt = Date.now(); console.log('[OddsAPI] Rate limited — pausing 1h'); }

// --- TTL Cache ---
const _cache = new Map();
async function _withCache(key, ttlMs, fn) {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && now - hit.ts < ttlMs) return hit.data;
  if (!_canCall()) {
    if (hit) return hit.data;
    return null;
  }
  _record();
  try {
    const data = await fn();
    _cache.set(key, { data, ts: now });
    return data;
  } catch (err) {
    if (err.name === 'RateLimitExceededError') _hitLimit();
    throw err;
  }
}

// --- Sport rotation (3 per scan) ---
let _sportPtr = 0;
const _SPORTS_PER_SCAN = 3;

let _oddsApiClient = null;
function getOddsAPIClient() {
  if (!_oddsApiClient && config.oddsapiiApiKey) {
    _oddsApiClient = new OddsAPIClient({ apiKey: config.oddsapiiApiKey });
  }
  return _oddsApiClient;
}

async function scanOddsAPIio() {
  const results = [];
  const client = getOddsAPIClient();
  if (!client) return results;

  if (!_canCall()) {
    console.log(`[OddsAPI.io] Rate limited (budget: ${_budget()}/${_rl.maxCalls}), skipping`);
    return results;
  }

  // 1. Live events (always try first — highest value)
  try {
    const liveData = await _withCache('live_events', 30000, () => client.getLiveEvents());
    if (Array.isArray(liveData) && liveData.length > 0) {
      const liveIds = liveData.map(e => e.id).filter(Boolean);
      console.log(`[OddsAPI.io] ${liveIds.length} live events`);
      for (let i = 0; i < liveIds.length && _canCall(); i += 10) {
        const batch = liveIds.slice(i, i + 10);
        const odds = await _withCache(`odds_multi:${batch.join(',')}`, 60000,
          () => client.getOddsForMultipleEvents({ eventIds: batch.join(','), bookmakers: ODDSAPIIO_BOOKMAKERS })
        );
        if (odds) await _parseOddsBatch(odds, true, results);
      }
    }
  } catch (err) {
    if (err.name !== 'RateLimitExceededError' && !err.message?.includes('aborted')) {
      console.error(`[OddsAPI.io] live: ${err.message}`);
    }
  }

  // 2. Pending events — rotate through sports (3 per scan)
  const budget = _budget();
  const count = budget > 30 ? _SPORTS_PER_SCAN : budget > 10 ? 2 : 1;
  for (let i = 0; i < count && i < ODDSAPIIO_SPORTS.length; i++) {
    const sport = ODDSAPIIO_SPORTS[(_sportPtr + i) % ODDSAPIIO_SPORTS.length];
    if (!_canCall()) break;
    try {
      const events = await _withCache(`events:${sport.slug}:pending`, 120000,
        () => client.getEvents({ sport: sport.slug, status: 'pending', limit: 50 })
      );
      if (!Array.isArray(events) || events.length === 0) continue;
      const ids = events.map(e => e.id).filter(Boolean);
      for (let j = 0; j < ids.length && _canCall(); j += 10) {
        const batch = ids.slice(j, j + 10);
        const odds = await _withCache(`odds_multi:${batch.join(',')}`, 60000,
          () => client.getOddsForMultipleEvents({ eventIds: batch.join(','), bookmakers: ODDSAPIIO_BOOKMAKERS })
        );
        if (odds) await _parseOddsBatch(odds, false, results);
      }
    } catch (err) {
      if (err.name !== 'RateLimitExceededError' && !err.message?.includes('aborted')) {
        console.error(`[OddsAPI.io] ${sport.name}: ${err.message}`);
      }
    }
  }
  _sportPtr = (_sportPtr + count) % ODDSAPIIO_SPORTS.length;

  console.log(`[OddsAPI.io] ${results.length} events (budget: ${_budget()}/${_rl.maxCalls})`);
  return results;
}

async function _parseOddsBatch(data, isLive, results) {
  if (!Array.isArray(data)) return;
  for (const event of data) {
    if (!event.bookmakers || Object.keys(event.bookmakers).length === 0) continue;
    const homeName = event.home || 'Home';
    const awayName = event.away || 'Away';
    const normEvent = normalizeEventName(awayName, homeName);

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

async function scanArbitrageBets() {
  const results = [];
  const client = getOddsAPIClient();
  if (!client) return results;

  if (!_canCall()) return results;

  try {
    const data = await _withCache('arbitrage_bets', 60000,
      () => client.getArbitrageBets({ bookmakers: ODDSAPIIO_BOOKMAKERS, limit: 100, includeEventDetails: true })
    );
    if (!Array.isArray(data)) return results;

    for (const arb of data) {
      if (!arb.event || !arb.legs || arb.legs.length < 2) continue;
      if (arb.market?.name !== 'ML') continue;

      const homeLeg = arb.legs.find(l => l.label === 'home');
      const awayLeg = arb.legs.find(l => l.label === 'away');
      if (!homeLeg || !awayLeg) continue;

      const homeOdds = parseFloat(homeLeg.odds);
      const awayOdds = parseFloat(awayLeg.odds);
      if (!homeOdds || !awayOdds || homeOdds <= 1 || awayOdds <= 1) continue;

      const roi = arb.profitMargin != null ? arb.profitMargin / 100 : null;

      results.push({
        event: normalizeEventName(arb.event.away, arb.event.home),
        sport: arb.event.sport || 'Unknown',
        home: arb.event.home,
        away: arb.event.away,
        platformA: homeLeg.bookmaker,
        oddsA: homeOdds,
        platformB: awayLeg.bookmaker,
        oddsB: awayOdds,
        source: 'oddsapii-arb',
        isLive: false,
        commenceTime: arb.event.date || null,
        roi,
      });
    }

    if (results.length > 0) {
      console.log(`[ArbitrageBets] ${results.length} arb opportunities found`);
    }
  } catch (err) {
    if (err.name !== 'RateLimitExceededError' && !err.message?.includes('aborted') && !err.message?.includes('HTTP 401')) {
      console.log(`[ArbitrageBets] ${err.message}`);
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
    scanOddsAPIio(),
    scanSharpAPI(),
  ];
  const results = await Promise.allSettled(sources);

  const combined = [];
  const sourceLabels = ['ESPN', 'Polymarket', 'SX Bet', 'Azuro', 'OddsAPI.io', 'SharpAPI'];
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

module.exports = { scanAll, scanPolymarket, scanSXBet, scanESPN, scanAzuro, scanOddsAPIio, scanArbitrageBets, scanSharpAPI, liveFilter, scanScores, countLiveGames, normalizeEventName };
