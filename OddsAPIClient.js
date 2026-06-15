const TIMEOUT = 15000;
const BASE_URL = 'https://api.odds-api.io/v3';

class OddsAPIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'OddsAPIError';
    this.status = status;
  }
}

class InvalidAPIKeyError extends OddsAPIError {
  constructor() {
    super('Invalid API key', 401);
    this.name = 'InvalidAPIKeyError';
  }
}

class RateLimitExceededError extends OddsAPIError {
  constructor() {
    super('Rate limit exceeded', 429);
    this.name = 'RateLimitExceededError';
  }
}

class NotFoundError extends OddsAPIError {
  constructor(msg) {
    super(msg || 'Resource not found', 404);
    this.name = 'NotFoundError';
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

class OddsAPIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  _url(path) {
    const key = this.apiKey ? `apiKey=${this.apiKey}` : '';
    const sep = path.includes('?') ? '&' : '?';
    return `${BASE_URL}${path}${key ? sep + key : ''}`;
  }

  async _get(url) {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      if (res.status === 401) throw new InvalidAPIKeyError();
      if (res.status === 429) throw new RateLimitExceededError();
      if (res.status === 404) throw new NotFoundError();
      throw new OddsAPIError(`HTTP ${res.status}`, res.status);
    }
    return res.json();
  }

  // Sports & Leagues
  async getSports() {
    return this._get(this._url('/sports'));
  }

  async getLeagues(sport, all = false) {
    return this._get(this._url(`/leagues?sport=${sport}&all=${all}`));
  }

  // Events
  async getEvents(sport, opts = {}) {
    const { league, status, from, to, limit, skip } = opts;
    const params = [`sport=${sport}`];
    if (league) params.push(`league=${league}`);
    if (status) params.push(`status=${status}`);
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    if (limit) params.push(`limit=${limit}`);
    if (skip) params.push(`skip=${skip}`);
    return this._get(this._url(`/events?${params.join('&')}`));
  }

  async getLiveEvents(sport) {
    const qs = sport ? `?sport=${sport}` : '';
    return this._get(this._url(`/events/live${qs}`));
  }

  async searchEvents(query) {
    return this._get(this._url(`/events/search?query=${encodeURIComponent(query)}`));
  }

  async getEventById(id) {
    return this._get(this._url(`/events/${id}`));
  }

  // Odds
  async getEventOdds(eventId, bookmakers) {
    return this._get(this._url(`/odds?eventId=${eventId}&bookmakers=${bookmakers}`));
  }

  async getOddsForMultipleEvents(eventIds, bookmakers) {
    return this._get(this._url(`/odds/multi?eventIds=${eventIds.join(',')}&bookmakers=${bookmakers}`));
  }

  async getUpdatedOddsSince(since, bookmaker, sport) {
    return this._get(this._url(`/odds/updated?since=${since}&bookmaker=${bookmaker}&sport=${sport}`));
  }

  async getOddsMovement(eventId, bookmaker, market, marketLine) {
    let url = `/odds/movements?eventId=${eventId}&bookmaker=${bookmaker}&market=${market}`;
    if (marketLine != null) url += `&marketLine=${marketLine}`;
    return this._get(this._url(url));
  }

  // Betting Analysis
  async getArbitrageBets(bookmakers, opts = {}) {
    const { limit, includeEventDetails } = opts;
    let url = `/arbitrage-bets?bookmakers=${bookmakers}`;
    if (limit) url += `&limit=${limit}`;
    if (includeEventDetails) url += `&includeEventDetails=true`;
    return this._get(this._url(url));
  }

  async getValueBets(bookmaker, opts = {}) {
    const { sport, league, includeEventDetails } = opts;
    let url = `/value-bets?bookmaker=${bookmaker}`;
    if (sport) url += `&sport=${sport}`;
    if (league) url += `&league=${league}`;
    if (includeEventDetails) url += `&includeEventDetails=true`;
    return this._get(this._url(url));
  }

  async getDroppingOdds(opts = {}) {
    const { sport, league, leagues, markets, timeWindow, sort, minDrop, limit, page, includeEventDetails } = opts;
    let url = '/dropping-odds';
    const params = [];
    if (sport) params.push(`sport=${sport}`);
    if (league) params.push(`league=${league}`);
    if (leagues) params.push(`leagues=${leagues}`);
    if (markets) params.push(`markets=${markets}`);
    if (timeWindow) params.push(`timeWindow=${timeWindow}`);
    if (sort) params.push(`sort=${sort}`);
    if (minDrop != null) params.push(`minDrop=${minDrop}`);
    if (limit) params.push(`limit=${limit}`);
    if (page) params.push(`page=${page}`);
    if (includeEventDetails) params.push(`includeEventDetails=true`);
    if (params.length) url += `?${params.join('&')}`;
    return this._get(this._url(url));
  }

  // Bookmakers
  async getBookmakers() {
    return this._get(this._url('/bookmakers'));
  }

  async getSelectedBookmakers() {
    return this._get(this._url('/bookmakers/selected'));
  }

  async selectBookmakers(bookmakers) {
    return this._get(this._url(`/bookmakers/selected/select?bookmakers=${bookmakers}`));
  }

  async clearSelectedBookmakers() {
    return this._get(this._url('/bookmakers/selected/clear'));
  }

  // Participants
  async getParticipants(sport, search) {
    let url = `/participants?sport=${sport}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return this._get(this._url(url));
  }

  async getParticipantById(id) {
    return this._get(this._url(`/participants/${id}`));
  }

  // Historical
  async getHistoricalEvents(sport, league, from, to) {
    return this._get(this._url(`/historical/events?sport=${sport}&league=${league}&from=${from}&to=${to}`));
  }

  async getHistoricalOdds(eventId, bookmakers) {
    return this._get(this._url(`/historical/odds?eventId=${eventId}&bookmakers=${bookmakers}`));
  }
}

module.exports = { OddsAPIClient, OddsAPIError, InvalidAPIKeyError, RateLimitExceededError, NotFoundError };