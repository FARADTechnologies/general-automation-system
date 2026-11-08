// Task ledger: server-side state injected every turn so the agent keeps track.
import { randomBytes } from 'node:crypto';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting_confirmation';
export interface LedgerStep { id: string; title: string; capability?: string; status: StepStatus; prepared_id?: string; result_ref?: string }
export interface TokenRecord { provenance: string; capability: string; query?: string; label?: string }

export interface Ledger {
  task_id: string;
  goal: string;
  steps: LedgerStep[];
  pending: null | { type: 'clarification' | 'confirmation' | 'handoff'; detail?: string; prepared_id?: string };
  evidence: {
    user_texts: string[];
    amounts: number[];
    derived: number[];
    template_amounts: number[];
    currencies: string[];
    tokens: Record<string, TokenRecord>;
    tool_numbers: number[];
  };
  risk_flags: string[];
  guard_holds: number;
  /** The agent's last clarifying question in this task, so a plain "yes" can be read against it. */
  last_question?: string;
}

export function newLedger(goal: string): Ledger {
  return {
    task_id: 'task_' + randomBytes(5).toString('hex'), goal, steps: [], pending: null,
    evidence: { user_texts: [], amounts: [], derived: [], template_amounts: [], currencies: [], tokens: {}, tool_numbers: [] },
    risk_flags: [], guard_holds: 0,
  };
}

/** Compact text for the model. Contains no raw identifiers: tokens and masked values only. */
export function renderLedger(l: Ledger): string {
  const steps = l.steps.length ? l.steps.map((s, i) => `${i + 1}. [${s.status}] ${s.title}${s.capability ? ` (${s.capability})` : ''}${s.prepared_id ? ` prepared=${s.prepared_id}` : ''}`).join('\n') : '(no plan recorded)';
  const toks = Object.entries(l.evidence.tokens).slice(-20).map(([t, r]) => `${t}=${r.label || r.capability}${r.provenance === 'resolved_contact' ? ' (contact)' : ''}`).join(', ') || 'none';
  return [
    `Task ledger (runtime state, not user text). Task ${l.task_id}.`,
    `Goal: ${l.goal}`,
    `Steps:\n${steps}`,
    `Pending: ${l.pending ? `${l.pending.type}${l.pending.detail ? ' - ' + l.pending.detail : ''}` : 'none'}`,
    `Amounts the user stated in this task: ${l.evidence.amounts.join(', ') || 'none'}. Currencies mentioned: ${l.evidence.currencies.join(', ') || 'none (AZN is the default)'}.`,
    `Known references: ${toks}`,
    l.risk_flags.length ? `Risk flags: ${l.risk_flags.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}
