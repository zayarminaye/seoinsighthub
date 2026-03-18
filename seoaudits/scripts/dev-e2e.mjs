import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const child = spawn('next', ['dev', ...args], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    E2E_BYPASS_CLERK: 'true',
    NEXT_DIST_DIR: '.next-e2e',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
