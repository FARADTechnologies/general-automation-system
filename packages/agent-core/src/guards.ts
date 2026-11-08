// Guards that run between the model and every tool call. Deterministic.
// They verify form and origin, not intent: a correctly-formed call to the wrong "Ali" passes.
// That residual risk is handled by asking on ambiguity and by the bank confirmation screen.
import { Ajv, type ValidateFunction } from 'ajv';
import type { Ledger } from './ledger.ts';
import { intentStated, queryFromUser, isAffirmation } from './evidence.ts';

export interface ToolMeta {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  capability: string;
  kind: 'read' | 'prepare' | 'local';
  risk: string;
  criticalArgs: Record<string, { token?: string; provenance?: string[] }>;
  intentTerms: string[];
  tokenProvenance: Record<string, string>;
  derived?: boolean;
}

export type GuardDecision = { ok: true } | { ok: false; code: string; reason: string };

export interface GuardLimits { maxToolCallsPerTurn: number; maxIdenticalCalls: number }
export const DEFAULT_LIMITS: GuardLimits = { maxToolCallsPerTurn: 14, maxIdenticalCalls: 2 };

const ajv = new Ajv({ allErrors: false, strict: false });
const validators = new WeakMap<object, ValidateFunction>();
const validatorFor = (schema: Record<string, unknown>) => {
  let v = validators.get(schema);
  if (!v) { v = ajv.compile(schema); validators.set(schema, v); }
  return v;
};

export function guardToolCall(
  call: { name: string; input: Record<string, unknown> },
  meta: ToolMeta | undefined,
  ledger: Ledger,
  turn: { callsThisTurn: number; seen: Map<string, number> },
  limits: GuardLimits = DEFAULT_LIMITS,
): GuardDecision {
  // 1) capability exists and is enabled (the Bridge only lists enabled ones)
  if (!meta) return { ok: false, code: 'UNKNOWN_TOOL', reason: `There is no tool named ${call.name}.` };

  // 2) loop and step limits
  if (turn.callsThisTurn >= limits.maxToolCallsPerTurn) return { ok: false, code: 'STEP_LIMIT', reason: 'Too many tool calls in one turn.' };
  const key = call.name + JSON.stringify(call.input);
  const n = (turn.seen.get(key) || 0) + 1;
  turn.seen.set(key, n);
  if (n > limits.maxIdenticalCalls) return { ok: false, code: 'LOOP_DETECTED', reason: 'The same call was already made; use its result.' };

  // 3) strict schema, including constraints the model API cannot enforce
  const v = validatorFor(meta.inputSchema);
  if (!v(call.input)) return { ok: false, code: 'SCHEMA_INVALID', reason: `Invalid arguments: ${v.errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}` };

  if (meta.kind !== 'prepare') return { ok: true };

  // 4) risk rule: a state change needs the user's own request for it in this task. Accepted as:
  //    an intent word in the user's words (typos tolerated); or a plain "yes" to the agent's own
  //    question that named the action; or a payee and an amount that both come from the user's
  //    words ("To Nigar, 70 manat"). Payee and amount provenance are still checked below.
  const texts = ledger.evidence.user_texts;
  const lastUser = texts[texts.length - 1] || '';
  const byWords = intentStated(meta.intentTerms, texts);
  const byYes = isAffirmation(lastUser) && !!ledger.last_question && intentStated(meta.intentTerms, [ledger.last_question]);
  const byArgs = impliedByUserArgs(call.input, meta, ledger);
  if (!byWords && !byYes && !byArgs) {
    return { ok: false, code: 'INTENT_NOT_STATED', reason: `The user's words in this task do not ask for ${meta.capability}. Do not take actions the user did not request. If you believe they did, ask one short yes/no question naming the action.` };
  }

  // 5) provenance of every critical argument
  for (const [arg, spec] of Object.entries(meta.criticalArgs)) {
    const value = call.input[arg];
    if (value === undefined) continue;
    const allowed = spec.provenance || [];
    if (spec.token) {
      for (const one of Array.isArray(value) ? value : [value]) {
        const rec = ledger.evidence.tokens[String(one)];
        if (!rec) return { ok: false, code: 'PROVENANCE_REJECTED', reason: `${arg} must be a reference returned by a tool in this task or given by the user.` };
        if (allowed.length && !allowed.includes(rec.provenance)) return { ok: false, code: 'PROVENANCE_REJECTED', reason: `${arg} must come from ${allowed.join(' or ')}.` };
        // anything 'resolved_*' (a contact, an instrument) must have been looked up with the user's own words
        if (rec.provenance.startsWith('resolved_') && !queryFromUser(rec.query || '', ledger.evidence.user_texts)) {
          return rec.provenance === 'resolved_contact'
            ? { ok: false, code: 'PAYEE_NOT_FROM_USER', reason: `The contact was searched with "${rec.query}", which the user never said. A payee can only come from the user's own words.` }
            : { ok: false, code: 'REFERENCE_NOT_FROM_USER', reason: `${arg} was looked up with "${rec.query}", which the user never said.` };
        }
      }
    } else if (typeof value === 'number') {
      const near = (list: number[]) => list.some((a) => Math.abs(a - value) < 0.005);
      const ok = (allowed.includes('user_stated') && near(ledger.evidence.amounts))
        || (allowed.includes('derived') && near(ledger.evidence.derived))
        || (allowed.includes('template') && near(ledger.evidence.template_amounts));
      if (!ok) return { ok: false, code: 'AMOUNT_NOT_STATED', reason: `The amount ${value} was not stated by the user in this task. Ask the user for the amount.` };
    }
  }

  // 6) currency: USD needs an explicit mention; AZN is the default
  const ccy = call.input.currency;
  if (typeof ccy === 'string' && ccy !== 'AZN' && !ledger.evidence.currencies.includes(ccy)) {
    return { ok: false, code: 'CURRENCY_NOT_STATED', reason: `The user did not mention ${ccy}.` };
  }
  return { ok: true };
}

/** A payee (token looked up with the user's words, or typed by the user) and an amount the user stated. */
function impliedByUserArgs(input: Record<string, unknown>, meta: ToolMeta, ledger: Ledger): boolean {
  let amount = false, payee = false;
  for (const [arg, spec] of Object.entries(meta.criticalArgs)) {
    const v = input[arg];
    if (v === undefined) continue;
    if (spec.token) {
      const vals = Array.isArray(v) ? v : [v];
      payee = vals.length > 0 && vals.every((one) => {
        const rec = ledger.evidence.tokens[String(one)];
        return !!rec && ((rec.provenance.startsWith('resolved_') && queryFromUser(rec.query || '', ledger.evidence.user_texts)) || rec.provenance === 'ingress_token');
      });
    } else if (typeof v === 'number') {
      amount = ledger.evidence.amounts.some((a) => Math.abs(a - v) < 0.005);
    }
  }
  return amount && payee;
}
