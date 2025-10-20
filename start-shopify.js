// start-shopify.js
import { spawn } from 'child_process';

console.log('🚀 Starting Shopify app...');
console.log('📍 Environment:', {
  HOST: process.env.HOST,
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT
});

const child = spawn('npx', ['react-router-serve', './build/server/index.js'], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`Process exited with code ${code}`);
  process.exit(code);
});
