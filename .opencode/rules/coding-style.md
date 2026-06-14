## Coding Style Rules

### Structure
- One module per concern: bot logic, arb math, odds fetching, database, config, AI
- Keep files under 300 lines where possible
- Extract reusable logic into helper functions
- Use consistent error handling pattern: try/catch with specific error messages

### Naming
- camelCase for variables and functions
- PascalCase for classes
- UPPER_SNAKE_CASE for constants and configuration keys
- File names match their primary export (kebab-case)

### Dependencies
- Minimize external dependencies — prefer built-in Node.js APIs
- Currently approved: `telegraf`, `sql.js`
- Any new dependency must be justified (is there a built-in alternative?)
- Pin exact versions in `package.json`

### Async
- Use async/await, never raw callbacks or .then() chains
- Use Promise.all() for parallel independent operations (multi-sport scanning)
- Implement timeout guards on all fetch() calls

### Error Handling
- Every async function should have a try/catch at its boundary
- API errors: log, don't crash, retry on next interval
- User errors: reply with clear message, suggest correct usage
- Fatal errors (missing env vars): exit immediately with clear message

### Logging
- Use `console.log` with `[ModuleName]` prefix for structured logs
- Log important lifecycle events: start, stop, scan complete, arb found, error
- Don't log sensitive data (API keys, tokens)
- Railway captures stdout — use it effectively for debugging
