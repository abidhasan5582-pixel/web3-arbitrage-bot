## Risk Management Rules (MANDATORY)

### The 5% Rule
- Never calculate a stake exceeding 5% of total bankroll per arb
- This is enforced in `arbitrage.js` — never bypass or override it
- If user requests a stake override, warn them explicitly

### ROI Filtering
- Skip arbs below 2% ROI (not worth it after fees/gas)
- Flag arbs above 10% ROI (likely bookmaker error, will be voided)
- Display risk level (LOW/MEDIUM/HIGH) with every opportunity

### Execution Risk
- Always recommend placing the slower-updating book FIRST
- Always recommend confirming both bets before closing
- Never auto-execute bets — require manual confirmation

### Platform Risk
- Never keep more than 20% of bankroll on a single platform in calculations
- Flag Web3 arbs as lower risk (no account limits)
- Flag traditional sportsbook arbs with anti-gubbing reminders

### Error Recovery
- If one leg of an arb fails to confirm, recommend cashing out the other immediately
- If the odds API fails, log the error and retry on next scan — don't crash
- If SQLite write fails, log and continue — don't lose in-memory state
