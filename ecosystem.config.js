module.exports = {
  apps: [{
    name: 'arb-bot',
    script: 'bot.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '256M',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    autorestart: true,
    cron_restart: '0 0 * * *',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '.env',
  }],
};
