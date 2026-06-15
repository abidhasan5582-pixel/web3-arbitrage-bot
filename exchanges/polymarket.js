const config = require('../config');

let ClobClient, createWalletClient, http, privateKeyToAccount;
try {
  ({ ClobClient } = require('@polymarket/clob-client-v2'));
  ({ createWalletClient, http } = require('viem'));
  ({ privateKeyToAccount } = require('viem/accounts'));
} catch (_) {}

class PolymarketExchange {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.creds = null;
  }

  async init() {
    if (this.initialized) return true;
    if (!ClobClient) throw new Error('Dependencies missing: @polymarket/clob-client-v2, viem');

    const pk = config.polyPrivateKey;
    if (!pk) throw new Error('POLY_PRIVATE_KEY not set');

    const account = privateKeyToAccount(`0x${pk}`);
    const signer = createWalletClient({ account, transport: http(config.polyRpcUrl) });

    this.client = new ClobClient({
      host: 'https://clob.polymarket.com',
      chain: 137,
      signer,
    });

    try {
      this.creds = await this.client.createOrDeriveApiKey();
      this.client.creds = this.creds;
      this.initialized = true;
      return true;
    } catch (err) {
      throw new Error(`Polymarket init failed: ${err.message}`);
    }
  }

  async getMarkets() {
    await this.init();
    const resp = await fetch('https://gamma-api.polymarket.com/markets?limit=200');
    const data = await resp.json();
    return Array.isArray(data) ? data : data.data || [];
  }

  async getMarketData(marketId) {
    await this.init();
    const resp = await fetch(`https://gamma-api.polymarket.com/markets/${marketId}`);
    return resp.json();
  }

  async getTokenId(eventName, outcome) {
    const markets = await this.getMarkets();
    const market = markets.find(m => m.question === eventName || m.description === eventName);
    if (!market) return null;

    const outcomeIdx = outcome.toLowerCase().includes('yes') ? 0 : 1;
    return market.tokens?.[outcomeIdx]?.token_id || null;
  }

  async getTickSize(tokenId) {
    await this.init();
    return this.client.getTickSize(tokenId);
  }

  async getNegRisk(tokenId) {
    await this.init();
    return this.client.getNegRisk(tokenId);
  }

  async placeOrder(tokenId, side, price, size, options = {}) {
    await this.init();
    const tickSize = await this.getTickSize(tokenId);
    const negRisk = await this.getNegRisk(tokenId);

    const orderParams = {
      tokenID: tokenId,
      price: Number(price),
      size: Number(size),
      side: side === 'BUY' ? 0 : 1,
    };

    const response = await this.client.createAndPostOrder(orderParams, {
      tickSize,
      negRisk,
    }, options.orderType || 0);

    return {
      orderId: response.orderID,
      status: response.status,
      filledSize: response.filledSize || 0,
    };
  }

  async placeMarketOrder(tokenId, side, amount, maxPrice) {
    await this.init();
    const tickSize = await this.getTickSize(tokenId);
    const negRisk = await this.getNegRisk(tokenId);

    const response = await this.client.createAndPostMarketOrder(
      {
        tokenID: tokenId,
        side: side === 'BUY' ? 0 : 1,
        amount: Number(amount),
        price: Number(maxPrice),
      },
      { tickSize, negRisk },
      1
    );

    return {
      orderId: response.orderID,
      status: response.status,
      filledSize: response.filledSize || 0,
    };
  }

  async getOrderStatus(orderId) {
    await this.init();
    return this.client.getOrder(orderId);
  }

  async getOpenOrders() {
    await this.init();
    return this.client.getOrders();
  }

  async cancelOrder(orderId) {
    await this.init();
    return this.client.cancel(orderId);
  }

  async cancelAllOrders() {
    await this.init();
    return this.client.cancelAll();
  }

  async getBalance() {
    await this.init();
    const resp = await this.client.getBalanceAllowance({ assetType: 'COLLATERAL' });
    return {
      balance: parseFloat(resp.balance),
      allowance: parseFloat(resp.allowance),
    };
  }

  async getPositions() {
    await this.init();
    return this.client.getPositions();
  }

  async hasGas() {
    try {
      const bal = await this.getBalance();
      return bal.balance > 1;
    } catch {
      return false;
    }
  }
}

module.exports = PolymarketExchange;