// The Bridge is a core claim, so the separation must be real (brief section 4):
// the agent has no database access, no Core Bank URL, and no import of bridge or core-bank code.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const AGENT_DIRS = ['services/agent', 'packages/agent-core', 'apps/web/src'].map((d) => join(ROOT, d));

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|js|jsx|mjs|json)$/.test(f)) out.push(p);
  }
  return out;
}

const FORBIDDEN: [RegExp, string][] = [
  [/services\/bridge|@gas\/bridge/, 'imports bridge code'],
  [/services\/core-bank|@gas\/core-bank/, 'imports core-bank code'],
  [/node:sqlite|better-sqlite3|\bpg\b|mysql|mongodb/, 'database access'],
  [/CORE_BANK_URL|CORE_BANK_SERVICE_KEY|x-cb-svc-key/, 'knows the core bank'],
  [/\/internal\/v3\//, 'calls internal bank endpoints'],
];

describe('separation', () => {
  it('agent and web code never import bridge or core-bank, never touch a database or the core bank', () => {
    const offenders: string[] = [];
    for (const dir of AGENT_DIRS) {
      for (const f of files(dir)) {
        const src = readFileSync(f, 'utf8');
        for (const [re, why] of FORBIDDEN) if (re.test(src)) offenders.push(`${f.replace(ROOT, '')}: ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the agent package does not depend on bridge or core-bank packages', () => {
    const p = join(ROOT, 'services/agent/package.json');
    if (!existsSync(p)) return;
    const pkg = JSON.parse(readFileSync(p, 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /bridge|core-bank/.test(d))).toEqual([]);
  });

  it('the agent source exists, so this test is not vacuous', () => {
    expect(files(join(ROOT, 'services/agent')).length).toBeGreaterThan(0);
  });
});
