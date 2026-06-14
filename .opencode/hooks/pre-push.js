const { execSync } = require('child_process');
const fs = require('fs');

const JS_FILES = ['bot.js', 'arbitrage.js', 'oddsFetcher.js', 'database.js', 'aiAnalyzer.js', 'config.js', 'tui.js'];
const SECRET_PATTERNS = [
  /TELEGRAM_BOT_TOKEN\s*=\s*['"][0-9]+:[A-Za-z0-9_-]+['"]/,
  /ODDS_API_KEY\s*=\s*['"][a-fA-F0-9]{20,}['"]/,
  /['"]\d{8,10}:AA[A-Za-z0-9_-]{20,}['"]/,
];

let errors = [];

// 1. Syntax check all JS files
for (const file of JS_FILES) {
  if (!fs.existsSync(file)) {
    errors.push(`Missing file: ${file}`);
    continue;
  }
  try {
    execSync(`node -c ${file}`, { stdio: 'pipe' });
    console.log(`  \u2713 ${file} syntax OK`);
  } catch (e) {
    errors.push(`Syntax error in ${file}: ${e.stderr?.toString().trim() || e.message}`);
  }
}

// 2. Check for hardcoded secrets
for (const file of JS_FILES) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`Possible hardcoded secret in ${file}`);
    }
  }
}

// 3. Verify .env.example matches config.js
if (fs.existsSync('config.js') && fs.existsSync('.env.example')) {
  const configContent = fs.readFileSync('config.js', 'utf8');
  const envContent = fs.readFileSync('.env.example', 'utf8');
  const envVars = configContent.match(/process\.env\.(\w+)/g) || [];
  for (const envVar of envVars) {
    const name = envVar.replace('process.env.', '');
    if (!envContent.includes(name)) {
      errors.push(`Missing env var in .env.example: ${name}`);
    }
  }
}

// 4. Check production deps are pinned (no ^ or ~)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.dependencies) {
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (version.startsWith('^') || version.startsWith('~')) {
      errors.push(`Unpinned dependency ${name}: ${version}`);
    }
  }
}

if (errors.length > 0) {
  console.error('\n\u274C Pre-push checks failed:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
} else {
  console.log('\n\u2713 All pre-push checks passed');
}
