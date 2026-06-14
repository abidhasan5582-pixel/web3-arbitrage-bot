try { require('dotenv').config(); } catch (_) {}

const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  oddsApiKey: process.env.ODDS_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  puterApiKey: process.env.PUTER_API_KEY || '',

  bankroll: parseFloat(process.env.BANKROLL) || 20,
  minArbROI: (parseFloat(process.env.MIN_ARB_ROI) || 2) / 100,
  maxArbROI: (parseFloat(process.env.MAX_ARB_ROI) || 10) / 100,
  scanInterval: (parseInt(process.env.SCAN_INTERVAL) || 60) * 1000,
  alertsEnabled: process.env.ALERTS_ENABLED !== 'false',
  maxBetPercent: 0.05,

  get aiAvailable() {
    return !!(this.openaiApiKey || this.puterApiKey);
  },

  validate() {
    const missing = [];
    if (!this.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
    if (!this.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
    if (!this.oddsApiKey) missing.push('ODDS_API_KEY');
    return missing;
  }
};

module.exports = config;
