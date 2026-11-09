// Production entry: runs Core Bank, Bridge, Agent and the gateway as separate processes.
// Each process gets only the environment it needs; the agent never receives the Core Bank's
// URL or service key.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const E = process.env;
// internal credentials: generated per boot unless provided
const secret = (k) => E[k] || randomBytes(24).toString('base64url');
const keys = { core: secret('CORE_BANK_SERVICE_KEY'), agent: secret('BRIDGE_AGENT_KEY'), admin: secret('BRIDGE_ADMIN_KEY'), hook: secret('BRIDGE_WEBHOOK_SECRET') };
const base = { PATH: E.PATH, NODE_ENV: 'production', SystemRoot: E.SystemRoot, HOME: E.HOME, USERPROFILE: E.USERPROFILE };

// Register tsx in-process (one node process per service instead of a cli wrapper plus a child),
// which halves memory on small hosts. No shell, so paths with spaces work on every OS.
const tsxLoader = pathToFileURL(resolve(root, 'node_modules/tsx/dist/loader.mjs')).href;
const node = process.execPath;
const ts = (entry) => ['--max-old-space-size=160', '--import', tsxLoader, entry];
const procs = [
  { name: 'core-bank', cwd: 'services/core-bank', cmd: node, args: ts('src/main.ts'), env: { CORE_BANK_PORT: '4100', CORE_BANK_SERVICE_KEY: keys.core } },
  { name: 'bridge', cwd: 'services/bridge', cmd: node, args: ts('src/main.ts'), env: { BRIDGE_PORT: '4200', CORE_BANK_URL: 'http://127.0.0.1:4100', CORE_BANK_SERVICE_KEY: keys.core, BRIDGE_AGENT_KEY: keys.agent, BRIDGE_ADMIN_KEY: keys.admin, AGENT_WEBHOOK_URL: 'http://127.0.0.1:4300/hooks/bridge', BRIDGE_WEBHOOK_SECRET: keys.hook, BRIDGE_CONSOLE_PASSCODE: E.BRIDGE_CONSOLE_PASSCODE || '' } },
  { name: 'agent', cwd: 'services/agent', cmd: node, args: ts('src/main.ts'), env: { AGENT_PORT: '4300', BRIDGE_URL: 'http://127.0.0.1:4200', BRIDGE_AGENT_KEY: keys.agent, BRIDGE_WEBHOOK_SECRET: keys.hook, ANTHROPIC_API_KEY: E.ANTHROPIC_API_KEY || '', ANTHROPIC_BASE_URL: E.ANTHROPIC_BASE_URL || '', ANTHROPIC_AUTH_TOKEN: E.ANTHROPIC_AUTH_TOKEN || '', AGENT_FALLBACK: E.AGENT_FALLBACK || '', AGENT_CACHE_TTL: E.AGENT_CACHE_TTL || '', AGENT_SPEED: E.AGENT_SPEED || '', TTS_PROVIDER: E.TTS_PROVIDER || '', TTS_VOICE_ID: E.TTS_VOICE_ID || '', TTS_MODELS: E.TTS_MODELS || '', TTS_SESSION_CHAR_CAP: E.TTS_SESSION_CHAR_CAP || '', MODEL_FALLBACK: E.MODEL_FALLBACK || '', AGENT_MAX_STRICT_TOOLS: E.AGENT_MAX_STRICT_TOOLS || '', AGENT_CACHE_MODE: E.AGENT_CACHE_MODE || '', MODEL_DEBUG: E.MODEL_DEBUG || '', AGENT_PROVIDER: E.AGENT_PROVIDER || 'anthropic', GEMINI_API_KEY: E.GEMINI_API_KEY || '', GEMINI_MODEL: E.GEMINI_MODEL || 'gemini-3.6-flash', GEMINI_FALLBACKS: E.GEMINI_FALLBACKS || 'gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-2.5-flash', GEMINI_THINKING: E.GEMINI_THINKING || 'low', AGENT_MODEL: E.AGENT_MODEL || 'claude-sonnet-5-5', AGENT_EFFORT: E.AGENT_EFFORT || 'medium', AGENT_THINKING: E.AGENT_THINKING || 'between_tools', AGENT_FALLBACK: E.AGENT_FALLBACK || '1', SESSION_CALL_CAP: E.SESSION_CALL_CAP || '40', SESSION_SPEND_CAP_USD: E.SESSION_SPEND_CAP_USD || '1.50', CHOREO_STEP_MS: E.CHOREO_STEP_MS || '220', STT_PRIMARY: E.STT_PRIMARY || 'scribe', STT_FALLBACK: E.STT_FALLBACK || 'whisper', STT_TIMEOUT_MS: E.STT_TIMEOUT_MS || '2500', ELEVENLABS_API_KEY: E.ELEVENLABS_API_KEY || '', GROQ_API_KEY: E.GROQ_API_KEY || '', GROQ_MODEL: E.GROQ_MODEL || '', MISTRAL_API_KEY: E.MISTRAL_API_KEY || '', MISTRAL_MODEL: E.MISTRAL_MODEL || '', MISTRAL_FALLBACKS: E.MISTRAL_FALLBACKS ?? '', OPENAI_COMPAT_BASE_URL: E.OPENAI_COMPAT_BASE_URL || '', OPENAI_COMPAT_API_KEY: E.OPENAI_COMPAT_API_KEY || '', OPENAI_COMPAT_MODEL: E.OPENAI_COMPAT_MODEL || '', MODEL_MAX_WAIT_MS: E.MODEL_MAX_WAIT_MS || '' } },
  { name: 'gateway', cwd: '.', cmd: node, args: ['services/gateway/src/server.mjs'], env: { PORT: E.PORT || '8080', WEB_DIST: resolve(root, 'apps/web/dist') } },
];

const children = [];
let stopping = false;
const restarts = new Map();
function start(p) {
  const child = spawn(p.cmd, p.args, { cwd: resolve(root, p.cwd), env: { ...base, ...p.env } });
  const tag = `[${p.name}]`.padEnd(12);
  const out = (d) => String(d).split(/\r?\n/).filter((l) => l && !l.includes('ExperimentalWarning') && !l.includes('--trace-warnings')).forEach((l) => console.log(tag + l));
  child.stdout.on('data', out); child.stderr.on('data', out);
  child.on('exit', (code) => {
    console.log(`${tag}exited with ${code}`);
    if (stopping) return;
    const recent = (restarts.get(p.name) || []).filter((t) => Date.now() - t < 60_000);
    recent.push(Date.now());
    restarts.set(p.name, recent);
    if (recent.length > 5) { console.log(`${tag}crashing repeatedly, giving up`); process.exit(1); }
    setTimeout(() => start(p), 1000);
  });
  children.push(child);
}
procs.forEach(start);
const stop = () => { stopping = true; for (const c of children) c.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
