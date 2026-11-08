// The agent loop, written directly against the Messages API so guards run between the
// model and every tool. Domain-agnostic: the domain arrives as tools, prompt text and manifests.
import type Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'node:crypto';
import { findSensitive, replaceHits } from './ingress.ts';
import { extractAmounts, mentionedCurrencies, numbersIn } from './evidence.ts';
import { newLedger, renderLedger, type Ledger } from './ledger.ts';
import { guardToolCall, DEFAULT_LIMITS, type ToolMeta, type GuardLimits } from './guards.ts';
import { lintAnswer } from './lint.ts';

export type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type Message = Anthropic.Beta.Messages.BetaMessage;
type ToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type ToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'acting' | 'waiting_confirmation' | 'paused' | 'handoff' | 'error';

export interface ModelRequest { system: string; tools: ToolMeta[]; messages: MessageParam[] }
export interface ModelResult { message: Message; costUsd: number; latencyMs: number }
export interface ModelClient { readonly model: string; create(req: ModelRequest, signal?: AbortSignal): Promise<ModelResult> }

export type CallOutcome = { ok: true; data: any; text: string } | { ok: false; error: { code: string; message: string; retryable?: boolean }; text: string };
export interface ToolPort {
  listTools(): Promise<ToolMeta[]>;
  call(name: string, input: Record<string, unknown>, traceId: string): Promise<CallOutcome>;
  tokenize(kind: 'pan' | 'phone', value: string, traceId: string): Promise<{ token: string; masked: string }>;
}

export interface TraceEvent {
  trace_id: string; at: number;
  kind: 'input' | 'ingress' | 'llm' | 'tool_call' | 'tool_result' | 'guard' | 'confirmation' | 'lint' | 'answer' | 'cap';
  name?: string; decision?: string; detail?: Record<string, unknown>;
}
export interface ConfirmationOutcome { outcome: 'committed' | 'denied' | 'expired' | 'failed' | 'cancelled' | 'stopped'; verified: boolean; error?: { code: string; message: string } }

export interface TurnEvents {
  status(s: AgentStatus, note?: string): void;
  ledger(l: Ledger): void;
  trace(e: TraceEvent): void;
  message(text: string): void;
  /** Called after a successful prepare: the runtime choreographs the UI and opens the bank screen. */
  prepared(p: { prepared_id: string; capability: string; data: any; traceId: string }): Promise<void>;
  /** Resolves when the customer decides on the bank screen (or the confirmation expires). */
  awaitConfirmation(prepared_id: string, signal: AbortSignal): Promise<ConfirmationOutcome>;
}

export interface SessionState { messages: MessageParam[]; ledger: Ledger | null; llmCalls: number; spendUsd: number }
export const newSessionState = (): SessionState => ({ messages: [], ledger: null, llmCalls: 0, spendUsd: 0 });

export interface LoopConfig { systemPrompt: string; maxIterations: number; sessionCallCap: number; sessionSpendCapUsd: number; limits: GuardLimits }
export const DEFAULT_CONFIG: Omit<LoopConfig, 'systemPrompt'> = { maxIterations: 10, sessionCallCap: 60, sessionSpendCapUsd: 2, limits: DEFAULT_LIMITS };

export interface TurnResult {
  text: string; traceId: string; outcome: 'answered' | 'clarification' | 'stopped' | 'capped' | 'error';
  toolCalls: { name: string; input: Record<string, unknown>; ok: boolean; code?: string }[];
  guardHolds: { name: string; code: string }[];
  confirmations: { prepared_id: string; capability: string; outcome: string; verified: boolean }[];
  llmCalls: number; costUsd: number; latencyMs: number; llmLatencyMs: number[];
}

export const TASK_PLAN_TOOL: ToolMeta = {
  name: 'task_plan',
  description: 'Record the plan for a request that needs more than one action, before starting it. Each step is one capability call or one question. The plan is shown to the user.',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The user goal in a few words' },
      steps: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, capability: { type: 'string' } }, required: ['title', 'capability'], additionalProperties: false } },
    },
    required: ['goal', 'steps'],
    additionalProperties: false,
  },
  capability: 'task_plan', kind: 'local', risk: 'R0', criticalArgs: {}, intentTerms: [], tokenProvenance: {},
};

const SAFE_ANSWER = 'I could not put that answer together reliably. The details are on your screen; I can also connect you with a bank specialist.';

export async function runTurn(
  state: SessionState,
  userText: string,
  deps: { model: ModelClient; tools: ToolPort; events: TurnEvents; config: LoopConfig; signal?: AbortSignal },
): Promise<TurnResult> {
  const t0 = Date.now();
  const traceId = 'tr_' + randomBytes(6).toString('hex');
  const { events, config } = deps;
  const signal = deps.signal ?? new AbortController().signal;
  const res: TurnResult = { text: '', traceId, outcome: 'answered', toolCalls: [], guardHolds: [], confirmations: [], llmCalls: 0, costUsd: 0, latencyMs: 0, llmLatencyMs: [] };
  const trace = (e: Omit<TraceEvent, 'trace_id' | 'at'>) => events.trace({ trace_id: traceId, at: Date.now(), ...e });
  events.status('thinking');

  // ---- 1) ingress tokenizer: raw card and phone numbers never reach the model ----
  const hits = findSensitive(userText);
  const minted: { token: string; masked: string; kind: string }[] = [];
  for (const h of hits) minted.push({ ...(await deps.tools.tokenize(h.kind, h.digits, traceId)), kind: h.kind });
  const llmText = replaceHits(userText, hits, (h, i) => `${h.kind === 'pan' ? 'card' : 'phone'} ${minted[i].token} (${minted[i].masked})`);
  const textForEvidence = replaceHits(userText, hits, () => ' ');
  trace({ kind: 'input', detail: { agent_sees: llmText } });
  if (hits.length) trace({ kind: 'ingress', decision: 'tokenized', detail: { count: hits.length, kinds: hits.map((h) => h.kind) } });

  // ---- 2) ledger: continue a task after a clarification, otherwise start a new one ----
  if (!state.ledger || state.ledger.pending?.type !== 'clarification') state.ledger = newLedger(textForEvidence.slice(0, 140));
  const ledger = state.ledger;
  ledger.pending = null;
  ledger.evidence.user_texts.push(textForEvidence);
  ledger.evidence.amounts = [...new Set([...ledger.evidence.amounts, ...extractAmounts(textForEvidence)])];
  ledger.evidence.currencies = [...new Set([...ledger.evidence.currencies, ...mentionedCurrencies(textForEvidence)])];
  for (const m of minted) ledger.evidence.tokens[m.token] = { provenance: 'ingress_token', capability: 'ingress', label: m.masked };
  events.ledger(ledger);

  state.messages.push({ role: 'user', content: llmText });
  state.messages.push({ role: 'system', content: renderLedger(ledger) } as MessageParam);

  // ---- 3) tools ----
  let tools: ToolMeta[] = [TASK_PLAN_TOOL, ...(await deps.tools.listTools())].sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const turnState = { callsThisTurn: 0, seen: new Map<string, number>() };
  let linted = false;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    if (signal.aborted) { res.outcome = 'stopped'; res.text = 'Stopped.'; break; }
    if (state.llmCalls >= config.sessionCallCap || state.spendUsd >= config.sessionSpendCapUsd) {
      trace({ kind: 'cap', decision: 'session_cap', detail: { llmCalls: state.llmCalls, spendUsd: state.spendUsd } });
      res.outcome = 'capped'; res.text = 'This demo session has reached its usage limit. Please reset the session to continue.';
      break;
    }

    events.status('thinking');
    const r = await deps.model.create({ system: config.systemPrompt, tools, messages: state.messages }, signal);
    state.llmCalls++; state.spendUsd += r.costUsd; res.llmCalls++; res.costUsd += r.costUsd; res.llmLatencyMs.push(r.latencyMs);
    const msg = r.message;
    trace({ kind: 'llm', detail: { model: msg.model, stop_reason: msg.stop_reason, ms: r.latencyMs, usage: msg.usage, cost_usd: Number(r.costUsd.toFixed(5)) } });

    if (msg.stop_reason === 'refusal') {
      state.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'I cannot help with that request.' }] });
      res.text = 'I cannot help with that request here. I can connect you with a bank specialist.';
      break;
    }

    const toolUses = msg.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (!toolUses.length) {
      // ---- final answer: lint figures before anything reaches the user ----
      const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim();
      const evidence = new Set<number>([...ledger.evidence.amounts, ...ledger.evidence.derived, ...ledger.evidence.tool_numbers]);
      const lint = lintAnswer(text, evidence);
      trace({ kind: 'lint', decision: lint.ok ? 'ok' : 'unsupported_figures', detail: { unsupported: lint.unsupported } });
      if (!lint.ok && !linted) {
        linted = true;
        // Discard the draft (never sent back), ask once for a rewrite. History stays append-only.
        state.messages.push({ role: 'system', content: `Your draft answer stated figures that are not in the tool results or the user's words: ${lint.unsupported.join(', ')}. Rewrite it using only figures that appear in tool results. Do not calculate.` } as MessageParam);
        continue;
      }
      const finalText = lint.ok ? text : SAFE_ANSWER;
      state.messages.push({ role: 'assistant', content: lint.ok ? msg.content : [{ type: 'text', text: SAFE_ANSWER }] } as MessageParam);
      res.text = finalText;
      // a question with nothing executed in this turn means we are waiting for the user's answer
      if (lint.ok && /\?/.test(finalText) && res.confirmations.length === 0) { ledger.pending = { type: 'clarification', detail: finalText.slice(0, 160) }; res.outcome = 'clarification'; }
      break;
    }

    state.messages.push({ role: 'assistant', content: msg.content } as MessageParam);
    const results: ToolResultBlockParam[] = [];
    let injectLedger = false;

    // reads in parallel, everything else in order
    const decisions = toolUses.map((tu) => {
      const input = (tu.input || {}) as Record<string, unknown>;
      const meta = byName.get(tu.name);
      const d = guardToolCall({ name: tu.name, input }, meta, ledger, turnState, config.limits);
      turnState.callsThisTurn++;
      return { tu, input, meta, d };
    });

    const runOne = async ({ tu, input, meta, d }: (typeof decisions)[number]): Promise<ToolResultBlockParam> => {
      if (!d.ok) {
        ledger.guard_holds++;
        res.guardHolds.push({ name: tu.name, code: d.code });
        trace({ kind: 'guard', name: tu.name, decision: 'held', detail: { code: d.code, reason: d.reason, input } });
        res.toolCalls.push({ name: tu.name, input, ok: false, code: d.code });
        return { type: 'tool_result', tool_use_id: tu.id, is_error: true, content: JSON.stringify({ guard: d.code, reason: d.reason }) };
      }
      trace({ kind: 'guard', name: tu.name, decision: 'allowed', detail: { capability: meta!.capability, risk: meta!.risk } });
      if (signal.aborted) return { type: 'tool_result', tool_use_id: tu.id, is_error: true, content: '{"error":"stopped by the user"}' };

      if (tu.name === TASK_PLAN_TOOL.name) {
        const steps = (input.steps as { title: string; capability: string }[]) || [];
        ledger.goal = String(input.goal || ledger.goal);
        ledger.steps = steps.map((s, i) => ({ id: `s${i + 1}`, title: s.title, capability: s.capability, status: 'pending' }));
        events.ledger(ledger);
        res.toolCalls.push({ name: tu.name, input, ok: true });
        return { type: 'tool_result', tool_use_id: tu.id, content: '{"ok":true,"note":"Plan recorded and shown to the user."}' };
      }

      events.status('acting', meta!.capability);
      const step = ledger.steps.find((s) => s.capability === meta!.capability && (s.status === 'pending' || s.status === 'running'));
      if (step) { step.status = 'running'; events.ledger(ledger); }
      trace({ kind: 'tool_call', name: tu.name, detail: { agent_sends: input } });
      const out = await deps.tools.call(tu.name, input, traceId);
      trace({ kind: 'tool_result', name: tu.name, decision: out.ok ? 'ok' : out.error.code, detail: { agent_sees: out.text.slice(0, 4000) } });
      res.toolCalls.push({ name: tu.name, input, ok: out.ok, code: out.ok ? undefined : out.error.code });

      if (!out.ok) {
        if (step) { step.status = 'failed'; events.ledger(ledger); }
        return { type: 'tool_result', tool_use_id: tu.id, is_error: true, content: out.text };
      }

      // evidence: tokens and numbers returned by the bank
      recordEvidence(ledger, meta!, input, out.data);

      if (meta!.kind !== 'prepare') {
        if (step) { step.status = 'done'; events.ledger(ledger); }
        return { type: 'tool_result', tool_use_id: tu.id, content: out.text };
      }

      // ---- prepared: show it on the real screens, then wait for the customer ----
      const preparedId = String(out.data.prepared_id);
      if (step) { step.status = 'waiting_confirmation'; step.prepared_id = preparedId; }
      ledger.pending = { type: 'confirmation', prepared_id: preparedId };
      events.ledger(ledger);
      await events.prepared({ prepared_id: preparedId, capability: meta!.capability, data: out.data, traceId });
      events.status('waiting_confirmation', meta!.capability);
      const conf = await events.awaitConfirmation(preparedId, signal);
      // the final state always comes from the Bridge, never from the event alone (I8)
      const status = await deps.tools.call('prepared_status', { prepared_id: preparedId }, traceId);
      const verified = status.ok && status.data.status === 'committed' && status.data.verified === true;
      const outcome = conf.outcome === 'committed' && !verified ? 'failed' : conf.outcome;
      ledger.pending = null;
      if (step) { step.status = outcome === 'committed' ? 'done' : 'failed'; step.result_ref = outcome; }
      events.ledger(ledger);
      res.confirmations.push({ prepared_id: preparedId, capability: meta!.capability, outcome, verified });
      trace({ kind: 'confirmation', name: meta!.capability, decision: outcome, detail: { prepared_id: preparedId, verified } });
      injectLedger = true;
      const content = { prepared: out.data, customer_decision: outcome, executed_and_verified: verified, error: conf.error || (status.ok ? undefined : status.error) };
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(content), is_error: outcome !== 'committed' };
    };

    const parallel = decisions.every((x) => !x.d.ok || x.meta?.kind !== 'prepare');
    if (parallel) results.push(...(await Promise.all(decisions.map(runOne))));
    else for (const x of decisions) results.push(await runOne(x));

    state.messages.push({ role: 'user', content: results });
    if (ledger.guard_holds >= 3 && !ledger.risk_flags.includes('repeated_guard_holds')) { ledger.risk_flags.push('repeated_guard_holds'); injectLedger = true; }
    if (injectLedger) state.messages.push({ role: 'system', content: renderLedger(ledger) } as MessageParam);
    if (signal.aborted) { res.outcome = 'stopped'; res.text = 'Stopped. Nothing else will be done.'; break; }
    if (iter === config.maxIterations - 1) { res.text = 'I stopped because the request took too many steps. Here is where things stand on your screen.'; }
  }

  // keep the transcript valid if we left the loop without a final assistant message
  const last = state.messages[state.messages.length - 1];
  if (last && last.role !== 'assistant' && res.text) state.messages.push({ role: 'assistant', content: [{ type: 'text', text: res.text }] });

  res.latencyMs = Date.now() - t0;
  events.message(res.text);
  trace({ kind: 'answer', detail: { text: res.text, ms: res.latencyMs, llm_calls: res.llmCalls, cost_usd: Number(res.costUsd.toFixed(5)) } });
  events.status('idle');
  return res;
}

function recordEvidence(ledger: Ledger, meta: ToolMeta, input: Record<string, unknown>, data: any) {
  const rows: any[] = Array.isArray(data?.items) ? data.items : [data];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [field, provenance] of Object.entries(meta.tokenProvenance || {})) {
      const tok = row[field];
      if (typeof tok !== 'string') continue;
      ledger.evidence.tokens[tok] = { provenance, capability: meta.capability, query: typeof input.query === 'string' ? input.query : undefined, label: row.name || row.biller || row.label || undefined };
    }
  }
  const nums = numbersIn(data);
  ledger.evidence.tool_numbers = [...new Set([...ledger.evidence.tool_numbers, ...nums])].slice(-2000);
}
