# Post-Edit Hook

Runs automatically after modifying project files.

## Checks by File Type

### .js files (any JavaScript)
1. Run syntax check: `node -c <filepath>`
2. If syntax error → fix immediately before proceeding
3. Check for `console.log` added in production paths (warn if new)

### bot.js
1. Verify no new commands added without help text in /help
2. Verify no hardcoded Telegram chat IDs
3. Verify all environment variables used are documented

### arbitrage.js
1. Verify the 5% rule is still enforced
2. Verify ROI filter still applies (2-10%)
3. Verify stake split math is correct

### oddsFetcher.js
1. Verify all fetch() calls have error handling
2. Verify no hardcoded API keys
3. Verify rate limiting is respected

### database.js
1. Verify all SQL uses parameterized queries ($variable syntax)
2. Verify no SQL injection vectors

## Action

- Syntax errors: auto-fix before continuing
- Style warnings: log but don't block
- Security violations (hardcoded secrets): alert and block
