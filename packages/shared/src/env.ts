// Minimal .env loader. Never logs values.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export function loadEnv(start = process.cwd()): void {
  // In production each process receives exactly its own variables from the launcher.
  if (process.env.NODE_ENV === 'production') return;
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const p = resolve(dir, '.env');
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
      }
      return;
    }
    dir = dirname(dir);
  }
}
