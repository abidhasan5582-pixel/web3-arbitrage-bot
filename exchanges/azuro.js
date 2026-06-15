const config = require('../config');

let createWalletClient, http, privateKeyToAccount, parseEther, formatEther;
let AzuroToolkit;
try {
  ({ createWalletClient, http, privateKeyToAccount, parseEther, formatEther } = require('viem'));
  ({ AzuroToolkit } = require('@azuro-org/toolkit'));
} catch (_) {}

const AZURO_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/azuro-org/azuro-api-polygon';
const RELAYER_ADDRESS = '0x...';

class AzuroExchange {
  constructor() {
    this.toolkit = null;
    this.client = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return true;
    if (!AzuroToolkit) throw new Error('Dependencies missing: @azuro-org/toolkit, viem');

    const pk = config.polyPrivateKey;
    if (!pk) throw new Error('POLY_PRIVATE_KEY not set (shared with Polymarket)');

    const account = privateKeyToAccount(`0x${pk}`);
    const walletClient = createWalletClient({ account, transport: http(config.polyRpcUrl) });

    this.toolkit = new AzuroToolkit({
      chainId: 137,
      walletClient,
      relayerAddress: RELAYER_ADDRESS,
    });

    this.initialized = true;
    return true;
  }

  async getLiveConditions(sport = null) {
    let query = `
      query LiveConditions($first: Int, $where: Condition_filter) {
        conditions(first: $first, where: $where, orderBy: createdAt, orderDirection: desc) {
          id
          game
          status
          startsAt
          resolvedAt
          outcomes {
            id
            name
            odds
          }
          core {
            address
            game
            sport
            league
            participants
          }
        }
      }
    `;

    const where = {
      status_in: ['Pending', 'Live'],
    };

    if (sport) {
      where.core_ = { sport_contains_i: sport };
    }

    const resp = await fetch(AZURO_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { first: 100, where } }),
    });

    const { data } = await resp.json();
    return data?.conditions || [];
  }

  async getCondition(conditionId) {
    const query = `
      query Condition($id: ID!) {
        condition(id: $id) {
          id
          game
          status
          startsAt
          resolvedAt
          outcomes {
            id
            name
            odds
          }
          core {
            address
            game
            sport
            league
            participants
          }
        }
      }
    `;

    const resp = await fetch(AZURO_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: conditionId } }),
    });

    const { data } = await resp.json();
    return data?.condition || null;
  }

  async placeBet(conditionId, outcomeId, amount, minOdds) {
    await this.init();

    const usdcAmount = parseEther(amount.toString());

    const txHash = await this.toolkit.bet({
      conditionId,
      outcomeId,
      amount: usdcAmount,
      minOdds: minOdds || 1.01,
    });

    return {
      txHash,
      status: 'pending',
      filledAmount: amount,
    };
  }

  async checkBetStatus(txHash) {
    await this.init();
    const receipt = await this.client.waitForTransactionReceipt({ hash: txHash });
    return {
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      blockNumber: receipt.blockNumber,
    };
  }

  async getBalance() {
    await this.init();
    const balance = await this.client.readContract({
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [this.toolkit.walletClient.account.address],
    });
    return {
      balance: parseFloat(formatEther(balance)),
      currency: 'USDC',
    };
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

module.exports = AzuroExchange;