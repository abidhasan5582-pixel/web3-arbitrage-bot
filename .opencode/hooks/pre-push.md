# Pre-Push Hook

Runs before git push to ensure code quality.

## Checks

1. **Syntax check all JS files**
   ```
   node -c bot.js
   node -c arbitrage.js
   node -c oddsFetcher.js
   node -c database.js
   node -c aiAnalyzer.js
   node -c config.js
   ```

2. **Verify .env.example matches config.js**
   - Every `process.env.X` in config.js must have a corresponding entry in .env.example
   - No placeholder values contain real secrets

3. **Check for hardcoded secrets**
   - Grep for: `api_key` pattern not in config.js, token strings that look real
   - Grep for: hardcoded URLs containing API keys

4. **Verify package.json dependencies are pinned**
   - No `^` or `~` range prefixes on production dependencies

5. **Run a minimal integration check**
   - Verify the health endpoint test would pass
   - Verify the database schema is valid SQLite

## Fail Conditions

- Any syntax check fails → block push
- Hardcoded secret found → block push
- Missing env var in .env.example → warn
