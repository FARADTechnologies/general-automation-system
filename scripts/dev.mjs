// Starts Core Bank, Bridge, Agent and the web client as separate processes with their own ports.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const procs = [
  ['core-bank', 'services/core-bank', ['tsx', 'src/main.ts']],
  ['bridge', 'services/bridge', ['tsx', 'src/main.ts']],
  ['agent', 'services/agent', ['tsx', 'src/main.ts']],
  ['web', 'apps/web', ['vite', '--host']],
];
const children = [];
for (const [name, dir, args] of procs) {
  const child = spawn(isWin ? 'npx.cmd' : 'npx', args, { cwd: resolve(root, dir), env: process.env, shell: isWin });
  const tag = `[${name}]`.padEnd(12);
  const out = (d) => String(d).split(/\r?\n/).filter((l) => l && !l.includes('ExperimentalWarning') && !l.includes('--trace-warnings')).forEach((l) => console.log(tag + l));
  child.stdout.on('data', out);
  child.stderr.on('data', out);
  child.on('exit', (code) => console.log(`${tag}exited with ${code}`));
  children.push(child);
}
const stop = () => { for (const c of children) c.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
