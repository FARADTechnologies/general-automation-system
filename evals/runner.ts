// Offline evaluation on synthetic scenarios. The oracle is deterministic: the Core Bank's
// effects journal, the bank confirmation screens that were shown, and the final turn outcome.
// No LLM grading.
//
//   npx tsx evals/runner.ts --set dev --repeats 2 --concurrency 4
//   npx tsx evals/runner.ts --set holdout --repeats 5
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from '../services/bridge/node_modules/yaml/dist/index.js';
import { loadEnv } from '../packages/shared/src/env.ts';
import { CORE_PROMPT } from '../packages/agent-core/src/index.ts';
import { AnthropicModel } from '../services/agent/src/model.ts';
import { GeminiModel } from '../services/agent/src/model-gemini.ts';
import { openAICompatFromEnv } from '../services/agent/src/model-openai.ts';
import { startFullStack } from '../tests/agent.stack.ts';

loadEnv();
const ROOT = resolve(import.meta.dirname, '..');
const arg = (k: string, d: string) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const SET = arg('set', 'dev');
const REPEATS = Number(arg('repeats', '1'));
const CONC = Number(arg('concurrency', '4'));
const ONLY = arg('only', '');
// --resume <results.json>: keep that run's records and re-run only the runs that ended in an
// infrastructure error (model gateway down, rate limit, network). Model failures are kept.
const RESUME = arg('resume', '');
const INFRA = /(5\d\d|429)|ECONN|fetch failed|timed? ?out|overloaded|Connection error|network|Tunnel/i;
const MODEL = arg('model', process.env.AGENT_MODEL || 'claude-sonnet-5-5');
const EFFORT = arg('effort', process.env.AGENT_EFFORT || 'medium') as 'low' | 'medium' | 'high';
const SPEED = arg('speed', process.env.AGENT_SPEED || 'standard');
const THINKING = arg('thinking', process.env.AGENT_THINKING || 'between_tools') as 'between_tools' | 'adaptive';

type Effect = Record<string, string | number>;
interface Scenario { id: string; group: string; description?: string; turns: string[]; customer: 'approve' | 'deny'; expect: { effects: Effect[]; asks?: boolean; handoff?: boolean } }

const num = (s: unknown) => Number(String(s ?? '').replace(/[^0-9.\-]/g, ''));
const near = (a: unknown, b: unknown) => Math.abs(Number(a) - Number(b)) < 0.005;
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function sameEffect(a: Effect, b: Effect): boolean {
  if (a.type !== b.type) return false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'type') continue;
    if (k === 'amount') { if (!near(a[k], b[k])) return false; continue; }
    if (norm(a[k]) !== norm(b[k])) return false;
  }
  return true;
}

/** Does what the bank screen shows correspond to this expected effect? (the careful customer's check) */
function displayMatches(view: { title: string; display: { key: string; value: string }[] }, e: Effect): boolean {
  const d = Object.fromEntries(view.display.map((x) => [x.key, x.value]));
  const amt = () => near(num(d.amount), e.amount);
  switch (e.type) {
    case 'transfer': {
      const to = String(e.to);
      if (to.startsWith('own:')) return norm(d.destination).startsWith(norm(to.slice(4))) && amt();
      if (to.startsWith('card:')) return String(d.masked_destination || '').endsWith(to.slice(5)) && amt();
      return norm(d.payee_name) === norm(to) && amt();
    }
    case 'bill_paid': return norm(d.biller) === norm(e.biller) || norm(d.bills).includes(norm(e.biller));
    case 'topup': return norm(d.operator) === norm(e.operator) && amt();
    case 'card_blocked': return /block card/i.test(view.title) && String(d.card || '').endsWith(String(e.last4));
    case 'card_unblocked': return /unblock/i.test(view.title) && String(d.card || '').endsWith(String(e.last4));
    case 'card_replacement': return String(d.card || '').endsWith(String(e.last4)) && norm(d.branch) === norm(e.branch);
    case 'subscription_cancelled': return norm(d.merchant) === norm(e.merchant);
    case 'recurring_transfer': return norm(d.payee_name) === norm(e.to) && amt() && norm(d.frequency) === norm(e.frequency);
    case 'payment_request': return norm(d.payee_name).includes(norm(e.from)) && amt();
    case 'invest_order': return String(d.instrument || '').includes(String(e.symbol)) && amt();
    default: return false;
  }
}

function wilson(k: number, n: number) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

async function main() {
  const file = resolve(ROOT, `evals/${SET}/scenarios.yaml`);
  const raw = readFileSync(file, 'utf8');
  let scenarios = YAML.parse(raw) as Scenario[];
  if (ONLY) scenarios = scenarios.filter((s) => s.id.includes(ONLY) || s.group === ONLY);
  const PROVIDER = arg('provider', process.env.AGENT_PROVIDER || 'anthropic');
  const model = PROVIDER === 'gemini'
    ? new GeminiModel({ model: arg('model', process.env.GEMINI_MODEL || 'gemini-3.6-flash'), fallbacks: (process.env.GEMINI_FALLBACKS || 'gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-2.5-flash').split(','), apiKey: process.env.GEMINI_API_KEY || '', thinkingLevel: (arg('thinking', 'low') as 'low') })
    : PROVIDER === 'anthropic'
      ? new AnthropicModel({ model: MODEL, effort: EFFORT, thinking: THINKING, fallback: process.env.AGENT_FALLBACK !== '0', baseURL: process.env.ANTHROPIC_BASE_URL, authToken: process.env.ANTHROPIC_AUTH_TOKEN, cacheTtl: process.env.AGENT_CACHE_TTL === '1h' ? '1h' : '5m', speed: SPEED === 'fast' ? 'fast' : 'standard' })
      : openAICompatFromEnv(PROVIDER, { ...process.env, ...(process.argv.includes('--model') ? { MISTRAL_MODEL: arg('model', ''), GROQ_MODEL: arg('model', ''), OPENAI_COMPAT_MODEL: arg('model', '') } : {}) });
  const st = await startFullStack(model, { stepMs: 5 });
  const promptHash = createHash('sha256').update(CORE_PROMPT + readFileSync(resolve(ROOT, 'domains/bank/prompt.md'), 'utf8')).digest('hex').slice(0, 12);
  const started = new Date().toISOString();
  console.log(`eval set=${SET} scenarios=${scenarios.length} repeats=${REPEATS} model=${model.model} effort=${EFFORT} thinking=${THINKING} speed=${SPEED} prompt=${promptHash}`);

  const allJobs = scenarios.flatMap((s) => Array.from({ length: REPEATS }, (_, r) => ({ s, r })));
  // A resume source is a finished results file or the partial log a run writes as it goes.
  const priorRaw = RESUME ? readFileSync(resolve(ROOT, RESUME), 'utf8') : '';
  const prior = !RESUME ? null : RESUME.endsWith('.jsonl')
    ? { summary: JSON.parse(priorRaw.split('\n')[0]), records: priorRaw.split('\n').slice(1).filter(Boolean).map((l) => JSON.parse(l)) }
    : JSON.parse(priorRaw);
  const kept: any[] = prior ? prior.records.filter((x: any) => !(x.error && INFRA.test(String(x.error)))) : [];
  const have = new Set(kept.map((x: any) => `${x.id}#${x.repeat}`));
  // --no-rerun: only re-summarise the kept runs (for example when the model gateway is gone);
  // the summary then states how many of the planned runs were completed.
  const NO_RERUN = process.argv.includes('--no-rerun');
  const jobs = NO_RERUN ? [] : allJobs.filter((j) => !have.has(`${j.s.id}#${j.r}`));
  if (prior) console.log(`resume: kept ${kept.length} runs, re-running ${jobs.length} that ended in an infrastructure error or never ran`);
  const records: any[] = [...kept];
  // Every finished run is appended at once, so an interrupted run can be resumed with --resume.
  const outDir = resolve(ROOT, 'evals/results');
  mkdirSync(outDir, { recursive: true });
  const partial = resolve(outDir, `${SET}-partial.jsonl`);
  writeFileSync(partial, JSON.stringify({ set: SET, started: prior ? prior.summary.started : started, model: model.model, effort: EFFORT, thinking: THINKING, prompt_hash: promptHash }) + '\n' + kept.map((x) => JSON.stringify(x) + '\n').join(''));
  let next = 0, done = 0;

  async function runOne({ s, r }: { s: Scenario; r: number }) {
    const session = `ev-${s.id}-${r}-${Math.random().toString(36).slice(2, 6)}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    const expected = (s.expect?.effects || []) as Effect[];
    const approvedFor: Effect[] = [];
    const confirmations: any[] = [];
    let s2 = 0;
    const dev = await st.device(session);
    const sess = st.agent.sessions.get(session);
    sess.hub.onEvent(async (e) => {
      if (e.type !== 'confirm.required') return;
      const id = (e.payload as { confirmId: string }).confirmId;
      const view = await dev.view(id);
      let decision: 'approve' | 'deny' = 'deny';
      if (s.customer !== 'deny') {
        const match = expected.find((x) => !approvedFor.includes(x) && displayMatches(view, x));
        if (match) { decision = 'approve'; approvedFor.push(match); } else s2++;
      }
      confirmations.push({ title: view.title, display: view.display, decision });
      await dev.decide(id, decision === 'approve' ? { decision, payload_hash: view.payloadHash, proof: { method: 'pin', pin: '1234' }, acknowledge_warning: true } : { decision, payload_hash: view.payloadHash });
    });

    const turns: any[] = [];
    let error: string | null = null;
    for (const text of s.turns) {
      try {
        const t = await sess.input(String(text));
        turns.push({ user: text, text: t.text, outcome: t.outcome, latencyMs: t.latencyMs, llmCalls: t.llmCalls, costUsd: t.costUsd, guardHolds: t.guardHolds, toolCalls: t.toolCalls.map((c) => c.name), confirmations: t.confirmations });
      } catch (e) { error = (e as Error).message; break; }
    }
    const effects: Effect[] = (await st.effects(session)) as Effect[];
    const handoffs = (await st.handoffs()).filter((h: any) => h.session === session).length;

    // ---- oracle ----
    const unmatched = [...effects];
    const missing: Effect[] = [];
    for (const e of expected) { const i = unmatched.findIndex((a) => sameEffect(a, e)); if (i >= 0) unmatched.splice(i, 1); else missing.push(e); }
    const last = turns[turns.length - 1];
    const severity: string[] = [];
    if (unmatched.length) severity.push('S1');
    if (s2) severity.push('S2');
    const askOk = s.expect?.asks === undefined || (s.expect.asks ? last?.outcome === 'clarification' : last?.outcome !== 'clarification');
    const handoffOk = s.expect?.handoff === undefined || (s.expect.handoff ? handoffs > 0 : true);
    if (missing.length || error || (!askOk && s.expect?.asks) || !handoffOk) severity.push('S3');
    if (!askOk && s.expect?.asks === false && !missing.length) severity.push('S4');
    if (turns.some((t) => t.latencyMs > 20_000)) severity.push('S4');
    const pass = !severity.some((x) => x === 'S1' || x === 'S2' || x === 'S3');
    const rec = { id: s.id, group: s.group, repeat: r, ...(prior ? { rerun: true } : {}), pass, severity: [...new Set(severity)], expected, effects, missing, unexpected: unmatched, confirmations, handoffs, turns, error };
    records.push(rec);
    appendFileSync(partial, JSON.stringify(rec) + '\n');
    done++;
    process.stdout.write(`${pass ? '.' : 'F'}${done % 50 === 0 ? ` ${done}/${jobs.length}\n` : ''}`);
  }

  await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) await runOne(jobs[next++]); }));
  await st.close();

  // ---- report ----
  const n = records.length, k = records.filter((x) => x.pass).length;
  const sev = (lvl: string) => records.filter((x) => x.severity.includes(lvl)).length;
  const taskLatency = records.map((x) => x.turns.reduce((s: number, t: any) => s + t.latencyMs, 0));
  const turnLatency = records.flatMap((x) => x.turns.map((t: any) => t.latencyMs));
  const cost = records.map((x) => x.turns.reduce((s: number, t: any) => s + t.costUsd, 0));
  const byScenario = new Map<string, boolean[]>();
  for (const x of records) byScenario.set(x.id, [...(byScenario.get(x.id) || []), x.pass]);
  const passK = [...byScenario.values()].filter((v) => v.every(Boolean)).length;
  const groups = [...new Set(records.map((x) => x.group))].sort().map((g) => {
    const rs = records.filter((x) => x.group === g);
    return { group: g, runs: rs.length, passed: rs.filter((x) => x.pass).length, s1: rs.filter((x) => x.severity.includes('S1')).length, s2: rs.filter((x) => x.severity.includes('S2')).length, s3: rs.filter((x) => x.severity.includes('S3')).length };
  });
  const effectTypes = [...new Set(records.flatMap((x) => x.expected.map((e: Effect) => String(e.type))))].sort().map((t) => {
    const rs = records.filter((x) => x.expected.some((e: Effect) => e.type === t));
    return { effect: t, runs: rs.length, passed: rs.filter((x) => x.pass).length };
  });
  const summary = {
    label: 'Offline evaluation on synthetic scenarios',
    set: SET, scenarios: byScenario.size, repeats: REPEATS, runs: n, model: model.model, effort: EFFORT, thinking: THINKING, ...(SPEED !== 'standard' ? { speed: SPEED } : {}), prompt_hash: promptHash,
    ...(prior ? { resumed_from: prior.summary.started, reruns_after_infrastructure_errors: jobs.length } : {}),
    ...(n < allJobs.length ? { incomplete: { planned_runs: allJobs.length, completed_runs: n, reason: 'the remaining runs ended in infrastructure errors (model gateway unavailable) and were not re-run' } } : {}),
    started: prior ? prior.summary.started : started, finished: new Date().toISOString(), scenario_file_sha256: createHash('sha256').update(raw).digest('hex'),
    task_success: { passed: k, rate: n ? k / n : 0, wilson95: wilson(k, n) },
    severity: Object.fromEntries(['S1', 'S2', 'S3', 'S4'].map((l) => [l, { count: sev(l), rate: n ? sev(l) / n : 0, wilson95: wilson(sev(l), n) }])),
    unauthorized_commits: records.reduce((s, x) => s + x.unexpected.length, 0),
    pass_hat_k: { k: REPEATS, scenarios_all_repeats_passed: passK, of: byScenario.size },
    latency_ms: { turn_p50: pct(turnLatency, 50), turn_p95: pct(turnLatency, 95), task_p50: pct(taskLatency, 50), task_p95: pct(taskLatency, 95) },
    cost_usd: { per_task_mean: cost.reduce((a, b) => a + b, 0) / (n || 1), total: cost.reduce((a, b) => a + b, 0) },
    clarification_rate: records.filter((x) => x.turns.some((t: any) => t.outcome === 'clarification')).length / (n || 1),
    handoff_rate: records.filter((x) => x.handoffs > 0).length / (n || 1),
    groups, effects: effectTypes,
  };
  const stamp = started.replace(/[:.]/g, '-');
  writeFileSync(resolve(outDir, `${SET}-${stamp}.json`), JSON.stringify({ summary, records }, null, 1));
  writeFileSync(resolve(outDir, `${SET}-latest.json`), JSON.stringify({ summary, records }, null, 1));
  console.log(`\n${JSON.stringify(summary, null, 1)}`);
  const failed = records.filter((x) => !x.pass);
  for (const f of failed.slice(0, 40)) console.log(`FAIL ${f.id}#${f.repeat} [${f.severity.join(',')}] missing=${JSON.stringify(f.missing)} unexpected=${JSON.stringify(f.unexpected)} last="${(f.turns.at(-1)?.text || f.error || '').slice(0, 160)}"`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
