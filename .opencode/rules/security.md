## Security Rules (MANDATORY)

### API Keys & Secrets
- Never hardcode API keys, tokens, or secrets in source code
- All secrets MUST be read from environment variables via `config.js`
- Never commit `.env` files — only `.env.example` with placeholder values
- Never log API keys, tokens, or secrets to console, files, or Telegram messages
- Never expose secrets in error messages returned to the user

### Input Validation
- Validate all Telegram command inputs (odds must be > 1.0, bankroll must be > 0)
- Sanitize user input before passing to SQL queries (use parameterized queries only)
- Validate odds API responses before processing (check for expected fields, valid types)

### Output Safety
- Never output raw database contents to Telegram without sanitization
- Limit sensitive data in reports (don't expose full API keys, even truncated)

### Telegram Bot
- The bot token is the gateway to your bot — protect it at the env var level
- Chat ID validation: verify the chat ID matches the configured owner
- Rate limit command handling to prevent abuse
