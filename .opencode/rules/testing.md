## Testing Rules

### Arbitrage Math (CRITICAL)
- Every arb calculation must be verified: `1/oddsA + 1/oddsB < 1` must hold
- Stake split math must be tested: `stakeA * oddsA === stakeB * oddsB` (equal return)
- Edge cases: odds exactly at 1.0, negative odds input, NaN, Infinity
- The 5% rule enforcement must be verified: `maxStake = bankroll * 0.05`

### Database Layer
- Test all CRUD operations: insert, read, update, delete
- Test with empty database (fresh start)
- Test with corrupted/malformed data (graceful handling)
- Test concurrent access to SQLite

### Odds Fetcher
- Test with mock API responses (success, partial data, empty, error)
- Test timeout handling
- Test rate limit handling (OddsPapi: 500 req/month free tier)
- Test API key validation

### Bot Commands
- Test each of the 17 commands produces the expected output
- Test with missing/empty arguments
- Test with invalid arguments
- Test auto-scan loop doesn't crash on API failure

### Before Deployment
- Run `node -c` on every .js file (syntax check)
- Verify all env vars are documented in `.env.example`
- Verify Railway health endpoint returns 200
