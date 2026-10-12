// npm run dev: the server and the Expo dev server together.
// Expo gets this terminal to itself, so it shows the QR code and answers its keys (r = reload).
// Under concurrently it did neither, which led people to start a second Metro. Server lines start with [api].
// Ctrl+C stops both, so no old server is left holding port 3001.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Node itself, not npm run: npm doesn't pass a stop on to what it started, which would leave them running.
const root = fileURLToPath(new URL('..', import.meta.url));
const api = spawn(process.execPath, ['--watch', 'src/index.js'], { cwd: `${root}server`, stdio: ['ignore', 'pipe', 'pipe'] });
for (const [from, to] of [[api.stdout, process.stdout], [api.stderr, process.stderr]]) {
  let rest = '';
  from.setEncoding('utf8');
  from.on('data', (chunk) => {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) to.write(`\x1b[33m[api]\x1b[0m ${line}\n`);
  });
}
const app = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--offline'], { cwd: `${root}mobile`, stdio: 'inherit' }); // = npm start in mobile/

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill('SIGINT');
  app.kill('SIGINT');
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
app.on('exit', (code) => stop(code ?? 0));
api.on('exit', (code) => { if (!stopping) console.error(`\x1b[33m[api]\x1b[0m The server stopped (exit ${code}). Expo keeps running; fix the error and run npm run dev again.`); });
