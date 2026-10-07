// Runs the API (with reload) and the Vite dev server together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const tasks = [
  ['api', 'tsx', ['watch', 'server/index.ts', '--dev']],
  ['web', 'vite', []],
];

const children = tasks.map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = (line) => `[${name}] ${line}`;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of chunk.split('\n')) if (line) console.log(prefix(line));
    });
  }
  child.on('exit', (code) => {
    console.log(prefix(`exited with code ${code}`));
    stop(code ?? 0);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
