const config = require('../config');

let WebSocket;
try {
  WebSocket = require('ws');
} catch (_) {
  WebSocket = global.WebSocket;
}

const API_BASE = 'https://api.sx.bet';
const WS_URL = 'wss://centrifugo.sx.bet/connection/websocket';

class SXBetExchange {
  constructor() {
    this.ws = null;
    this.wsConnected = false;
    this.wsReconnectTimer = null;
    this.marketCache = new Map();
    this.orderCache = new Map();
    this.onOddsUpdate = null;
  }

  async init() {
    if (!config.sxPrivateKey) throw new Error('SX_PRIVATE_KEY not set');
    return true;
  }

  async getMarkets() {
    const resp = await fetch(`${API_BASE}/markets/active`);
    if (!resp.ok) throw new Error(`SX Bet markets: ${resp.status}`);
    const data = await resp.json();
    return Array.isArray(data) ? data : data.data || [];
  }

  async getMarket(marketId) {
    const resp = await fetch(`${API_BASE}/markets/${marketId}`);
    if (!resp.ok) throw new Error(`SX Bet market: ${resp.status}`);
    return resp.json();
  }

  async getOrderBook(marketId) {
    const resp = await fetch(`${API_BASE}/orders/book?market=${marketId}`);
    if (!resp.ok) throw new Error(`SX Bet orderbook: ${resp.status}`);
    return resp.json();
  }

  async placeOrder(marketId, outcome, price, size, isMaker = true) {
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(config.sxPrivateKey);

    const order = {
      marketHash: marketId,
      outcome,
      price: Math.round(price * 10000),
      size: size.toString(),
      side: 0,
      signatureType: 0,
      maker: wallet.address,
      signer: wallet.address,
    };

    const domain = {
      name: 'SX Bet',
      version: '1',
      chainId: 416,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    };

    const types = {
      Order: [
        { name: 'marketHash', type: 'bytes32' },
        { name: 'outcome', type: 'uint8' },
        { name: 'price', type: 'uint16' },
        { name: 'size', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
      ],
    };

    const signature = await wallet._signTypedData(domain, types, order);
    order.signature = signature;

    const resp = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order, isMaker }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(`SX Bet order failed: ${resp.status} ${JSON.stringify(err)}`);
    }

    const result = await resp.json();
    return {
      orderId: result.orderHash,
      status: 'open',
      filledSize: 0,
    };
  }

  async placeMarketOrder(marketId, outcome, size) {
    const ob = await this.getOrderBook(marketId);
    const bestPrice = outcome === 0 ? ob.bids[0]?.price : ob.asks[0]?.price;
    if (!bestPrice) throw new Error('No liquidity for market order');
    return this.placeOrder(marketId, outcome, bestPrice / 10000, size, false);
  }

  async getOrderStatus(orderId) {
    const resp = await fetch(`${API_BASE}/orders/${orderId}`);
    if (!resp.ok) throw new Error(`SX Bet order status: ${resp.status}`);
    return resp.json();
  }

  async getOpenOrders() {
    const wallet = new (require('ethers').Wallet)(config.sxPrivateKey);
    const resp = await fetch(`${API_BASE}/orders?maker=${wallet.address}&status=open`);
    if (!resp.ok) throw new Error(`SX Bet open orders: ${resp.status}`);
    return resp.json();
  }

  async cancelOrder(orderId) {
    const wallet = new (require('ethers').Wallet)(config.sxPrivateKey);
    const resp = await fetch(`${API_BASE}/orders/${orderId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maker: wallet.address }),
    });
    if (!resp.ok) throw new Error(`SX Bet cancel: ${resp.status}`);
    return resp.json();
  }

  async getBalance() {
    const wallet = new (require('ethers').Wallet)(config.sxPrivateKey);
    const resp = await fetch(`${API_BASE}/users/${wallet.address}/balance`);
    if (!resp.ok) throw new Error(`SX Bet balance: ${resp.status}`);
    return resp.json();
  }

  connectWebSocket(onOddsUpdate) {
    if (!WebSocket) return false;
    this.onOddsUpdate = onOddsUpdate;

    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      this.wsConnected = true;
      this.subscribeToMarkets();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'publish' && msg.params?.channel?.startsWith('market:')) {
          const marketId = msg.params.channel.split(':')[1];
          const data = msg.params.data;
          this.marketCache.set(marketId, { ...this.marketCache.get(marketId), ...data, updated: Date.now() });
          if (this.onOddsUpdate) this.onOddsUpdate(marketId, data);
        }
      } catch (_) {}
    };

    this.ws.onclose = () => {
      this.wsConnected = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {};
    return true;
  }

  subscribeToMarkets() {
    if (!this.wsConnected) return;
    const msg = { method: 1, params: { channel: 'markets:active' } };
    this.ws.send(JSON.stringify(msg));
  }

  scheduleReconnect() {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket(this.onOddsUpdate);
    }, 5000);
  }

  disconnectWebSocket() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
  }

  isWsConnected() {
    return this.wsConnected;
  }

  getCachedMarket(marketId) {
    return this.marketCache.get(marketId);
  }

  async hasGas() {
    try {
      const bal = await this.getBalance();
      return bal.available > 1;
    } catch {
      return false;
    }
  }
}

module.exports = SXBetExchange;