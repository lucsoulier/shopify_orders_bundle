// start.js
import { spawn } from 'child_process';

console.log('🚀 Starting OP Orders Bundle...');

const child = spawn('npm', ['start'], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`Process exited with code ${code}`);
  process.exit(code);
});
