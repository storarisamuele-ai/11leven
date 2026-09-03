const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const configPath = path.join(__dirname, 'config.js');

if (!fs.existsSync(envPath)) {
    console.error('No .env file found. Copy .env.example to .env and add your credentials.');
    process.exit(1);
}

const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
    const idx = line.indexOf('=');
    if (idx === -1) return acc;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
    }

    if (key && value) acc[key] = value;
    return acc;
}, {});

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter(k => !env[k]);

if (missing.length) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
}

// Merge with an existing config.js if present, so values such as CAPTCHA_SITE_KEY
// are not accidentally removed when running this script locally.
const existingConfig = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf8')
    : '';

const existing = {};
const regex = /window\.(\w+)\s*=\s*['"]([^'"]*)['"];/g;
let match;
while ((match = regex.exec(existingConfig)) !== null) {
    existing[match[1]] = match[2];
}

const values = {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    CAPTCHA_SITE_KEY: env.CAPTCHA_SITE_KEY || existing.CAPTCHA_SITE_KEY || '',
    REGISTER_ENDPOINT: env.REGISTER_ENDPOINT || existing.REGISTER_ENDPOINT || '',
};

let config = `window.SUPABASE_URL = '${values.SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${values.SUPABASE_ANON_KEY}';
`;

if (values.CAPTCHA_SITE_KEY) {
    config += `window.CAPTCHA_SITE_KEY = '${values.CAPTCHA_SITE_KEY}';
`;
}

if (values.REGISTER_ENDPOINT) {
    config += `window.REGISTER_ENDPOINT = '${values.REGISTER_ENDPOINT}';
`;
}

fs.writeFileSync(configPath, config);
console.log('config.js generated from .env');
