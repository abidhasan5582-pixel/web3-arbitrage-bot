try { require('dotenv').config(); } catch (_) {}

const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  oddsApiKey: process.env.ODDS_API_KEY || '',
  oddsapiiApiKey: process.env.ODDSAPIIO_API_KEY || '',
  oddsapiiBookmakers: process.env.ODDSAPIIO_BOOKMAKERS || 'DraftKings,FanDuel',
  sharpApiKey: process.env.SHARPAPI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  puterApiKey: process.env.PUTER_API_KEY || '',

  bankroll: parseFloat(process.env.BANKROLL) || 20,
  demoMode: process.env.DEMO_MODE !== 'false',
  demoExecutionRate: parseFloat(process.env.DEMO_EXECUTION_RATE) || 0.3,
  demoBankroll: parseFloat(process.env.DEMO_BANKROLL) || 20,
  minArbROI: (parseFloat(process.env.MIN_ARB_ROI) || 2) / 100,
  maxArbROI: (parseFloat(process.env.MAX_ARB_ROI) || 10) / 100,
  scanInterval: (parseInt(process.env.SCAN_INTERVAL) || 60) * 1000,
  alertsEnabled: process.env.ALERTS_ENABLED !== 'false',
  maxBetPercent: 0.05,

  // Live trading
  liveMode: process.env.LIVE_MODE === 'true',
  liveOnly: process.env.LIVE_ONLY !== 'false',
  liveScanInterval: (parseInt(process.env.LIVE_SCAN_INTERVAL) || 15) * 1000,
  liveSlippageTolerance: (parseFloat(process.env.LIVE_SLIPPAGE_TOLERANCE) || 2) / 100,
  liveMinROI: (parseFloat(process.env.LIVE_MIN_ROI) || 5) / 100,
  executablePlatforms: (process.env.EXECUTABLE_PLATFORMS || 'polymarket,sxbet,azuro').split(',').map(s => s.trim()),

  // Wallet keys
  polyPrivateKey: process.env.POLY_PRIVATE_KEY || '',
  polyRpcUrl: process.env.POLY_RPC_URL || 'https://polygon-rpc.com',
  sxPrivateKey: process.env.SX_PRIVATE_KEY || '',
  sxRpcUrl: process.env.SX_RPC_URL || 'https://api.sx.bet',

  // Gas/fee simulation (demo)
  demoGasCostPoly: parseFloat(process.env.DEMO_GAS_COST_POLY) || 0.03,
  demoGasCostSol: parseFloat(process.env.DEMO_GAS_COST_SOL) || 0.001,
  demoPlatformFeePct: (parseFloat(process.env.DEMO_PLATFORM_FEE_PCT) || 0.5) / 100,

  get aiAvailable() {
    return !!(this.openaiApiKey || this.puterApiKey);
  },

  validate() {
    const missing = [];
    if (!this.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
    if (!this.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
    return missing;
  },

  validateLive() {
    const missing = [];
    if (this.liveMode) {
      if (!this.polyPrivateKey) missing.push('POLY_PRIVATE_KEY');
      if (!this.sxPrivateKey) missing.push('SX_PRIVATE_KEY');
    }
    return missing;
  }
};

module.exports = config;