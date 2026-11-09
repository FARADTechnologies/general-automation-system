// Capability engine: executes manifest capabilities against Core Bank.
// The only path that commits anything is resolveConfirm(), reachable from the bank
// confirmation screen with a device credential. No MCP tool can reach it (I2, I3).
import { createHash, randomBytes } from 'node:crypto';
import type { LoadedCapability, FieldSpec, RequestSpec, ResponseSpec } from './manifest.ts';
import { render, getPath, basePipes, type Scope, type PipeFn } from './template.ts';
import { Vault, VaultError, type Provenance } from './vault.ts';
import type { Policy } from './policy.ts';
import type { AuditLog } from './audit.ts';

// ---------------- core bank client ----------------
export class CoreError extends Error {
  constructor(public status: number, public rsn_cd: string, msg: string) { super(msg); }
}

export class CoreClient {
  private custCache = new Map<string, string>();
  constructor(private baseUrl: string, private key: string) {}

  async req(method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown } = {}): Promise<any> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', 'x-cb-svc-key': this.key },
        body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new CoreError(503, 'UNREACHABLE', 'core bank unreachable');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new CoreError(res.status, json.rsn_cd || 'ERR', json.rsn_txt || 'core bank error');
    return json;
  }

  async resolveCust(session: string): Promise<string> {
    const c = this.custCache.get(session);
    if (c) return c;
    const r = await this.req('POST', '/internal/v3/cust/rslv', { body: { ext_ref: session } });
    this.custCache.set(session, r.cust_id);
    return r.cust_id;
  }

  async reset(session: string) { const r = await this.req('POST', '/internal/admin/rst', { body: { ext_ref: session } }); this.custCache.set(session, r.cust_id); }
}

// ---------------- types ----------------
export interface ToolError { code: string; message: string; retryable?: boolean }
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: ToolError };

export interface PreparedObject {
  id: string; session: string; capability: string; risk: string; title: string; level: 'none' | 'tap' | 'biometric';
  display: { key: string; label: string; value: string }[]; warnings: string[]; extraConfirmation: boolean;
  payloadHash: string; createdAt: number; expiresAt: number;
  status: 'awaiting_confirmation' | 'committing' | 'committed' | 'denied' | 'expired' | 'failed' | 'cancelled';
  verified: boolean; trace_id: string; error?: ToolError;
  ui?: { route: string; form?: string; fields: { target: string; value: string }[]; submit?: string };
  dedupeKey: string;
  scope: Scope; // internal only, never serialised to agent or UI
  policyRecord: { group?: string; currency?: string; amount?: number };
}

export interface BridgeEvent { type: 'confirm.resolved' | 'prepared.created' | 'capabilities.changed'; session?: string; [k: string]: unknown }

const DEFAULT_ERRORS: Record<string, ToolError> = {
  NSF: { code: 'INSUFFICIENT_FUNDS', message: 'Not enough money in the source account.' },
  CRD_STS_SAME: { code: 'ALREADY_IN_STATE', message: 'The card is already in that state.' },
  BLL_PAID: { code: 'ALREADY_PAID', message: 'This bill is already paid.' },
  CCY_MISMATCH: { code: 'CURRENCY_MISMATCH', message: 'The source account currency does not match.' },
  FAULT: { code: 'BANK_UNAVAILABLE', message: 'The bank system did not respond. Nothing was changed.', retryable: true },
  UNREACHABLE: { code: 'BANK_UNAVAILABLE', message: 'The bank system did not respond. Nothing was changed.', retryable: true },
};

const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------------- engine ----------------
export class Engine {
  prepared = new Map<string, PreparedObject>();
  constructor(private d: {
    caps: () => Map<string, LoadedCapability>;
    vault: Vault; policy: Policy; audit: AuditLog; core: CoreClient;
    notify?: (e: BridgeEvent) => void; now?: () => number;
  }) {}

  private now() { return this.d.now ? this.d.now() : Date.now(); }

  private pipes(session: string): Record<string, PipeFn> {
    return {
      ...basePipes,
      masked: (v) => {
        if (typeof v !== 'string') return v;
        const e = this.d.vault.peek(v);
        return e && e.session === session ? e.masked : v;
      },
    };
  }

  findByTool(toolName: string): LoadedCapability | undefined {
    for (const c of this.d.caps().values()) if (c.toolName === toolName) return c;
    return undefined;
  }

  /** Tools visible to the agent: enabled, not kill-switched. */
  listTools() {
    const tools = [...this.d.caps().values()]
      .filter((c) => c.enabled !== false && !this.d.policy.isKilled(c.id))
      .map((c) => ({
        name: c.toolName,
        description: `${c.llm_description.trim()} [capability ${c.id}; kind ${c.kind}; risk ${c.risk}${c.kind === 'prepare' ? '; prepares only, the customer confirms on the bank screen' : ''}]`,
        inputSchema: c.input_schema,
        _meta: {
          capability: c.id, kind: c.kind, risk: c.risk, critical_args: c.critical_args || {},
          intent_terms: c.intent_terms || [], derived: !!c.derived,
          // the app screen that shows this capability's data, so the agent can show rather than tell
          ui_route: c.ui?.route,
          // which output fields carry tokens, and with what provenance (for the agent's evidence set)
          token_provenance: Object.fromEntries(Object.entries(c.response?.fields || {}).flatMap(([k, f]) => (typeof f === 'object' && f.token ? [[k, f.token.provenance]] : []))),
        },
      }));
    tools.push(
      { name: 'prepared_status', description: 'Read the status of a prepared action (awaiting_confirmation, committed, denied, expired, failed) and whether the bank verified the result. Read-only.', inputSchema: { type: 'object', properties: { prepared_id: { type: 'string' } }, required: ['prepared_id'], additionalProperties: false }, _meta: { capability: 'prepared.status', kind: 'read', risk: 'R0', critical_args: {} } },
      { name: 'prepared_cancel', description: 'Cancel a prepared action that the customer has not confirmed yet. Never executes anything.', inputSchema: { type: 'object', properties: { prepared_id: { type: 'string' } }, required: ['prepared_id'], additionalProperties: false }, _meta: { capability: 'prepared.cancel', kind: 'read', risk: 'R0', critical_args: {} } },
    );
    return tools;
  }

  async call(session: string, toolName: string, args: Record<string, unknown>, trace_id: string): Promise<ToolResult> {
    const audit = (decision: string, detail: Record<string, unknown>, capability: string | null = null) =>
      this.d.audit.write({ trace_id, session, actor: 'agent', event: 'tool.call', capability, decision, detail });

    if (toolName === 'prepared_status' || toolName === 'prepared_cancel') return this.builtin(session, toolName, args, trace_id);

    const cap = this.findByTool(toolName);
    if (!cap) { audit('rejected', { tool: toolName, code: 'UNKNOWN_CAPABILITY' }); return fail('UNKNOWN_CAPABILITY', `No capability named ${toolName}.`); }
    if (cap.enabled === false || this.d.policy.isKilled(cap.id)) { audit('rejected', { code: 'CAPABILITY_DISABLED' }, cap.id); return fail('CAPABILITY_DISABLED', 'This capability is switched off by the bank.'); }
    if (!cap.validate(args)) { audit('rejected', { code: 'SCHEMA_INVALID', errors: cap.validate.errors?.slice(0, 3) }, cap.id); return fail('SCHEMA_INVALID', `Invalid arguments: ${cap.validate.errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`); }

    try {
      const cust_id = await this.d.core.resolveCust(session);
      const scope: Scope = { input: args, ctx: { cust_id, session, idempotency_key: 'IK' + randomBytes(8).toString('hex') }, args: {}, meta: {}, masked: {}, lookup: {}, result: {} };
      const pipes = this.pipes(session);

      // 1) tokens -> internal values, with ownership, kind and provenance checks (I4, I7)
      const tokenArgs: Record<string, { kind: string; allowed?: string[] }> = {};
      for (const [k, v] of Object.entries(cap.token_args || {})) tokenArgs[k] = { kind: v };
      for (const [k, v] of Object.entries(cap.critical_args || {})) if (v.token) tokenArgs[k] = { kind: v.token, allowed: v.provenance };
      for (const [name, spec] of Object.entries(tokenArgs)) {
        const tok = args[name];
        if (tok === undefined || tok === null || tok === '') continue;
        const list = Array.isArray(tok) ? tok : [tok];
        const entries = [];
        for (const one of list) {
          const e = this.d.vault.resolve(session, String(one), spec.kind);
          if (spec.allowed && ![...e.provenance].some((p) => spec.allowed!.includes(p))) {
            audit('rejected', { code: 'PROVENANCE_REJECTED', arg: name, token_provenance: [...e.provenance] }, cap.id);
            return fail('PROVENANCE_REJECTED', `The ${name} must come from ${spec.allowed.join(' or ')}.`);
          }
          entries.push(e);
        }
        (scope.args as Record<string, unknown>)[name] = Array.isArray(tok) ? entries.map((e) => e.value) : entries[0].value;
        (scope.meta as Record<string, unknown>)[name] = Array.isArray(tok) ? entries.map((e) => e.meta) : entries[0].meta;
        (scope.masked as Record<string, unknown>)[name] = entries.map((e) => e.label || e.masked).join(', ');
      }

      // 2) amounts: at most two decimals, positive
      for (const [k, v] of Object.entries(args)) {
        if (typeof v === 'number' && /amount/i.test(k) && (v <= 0 || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6)) {
          audit('rejected', { code: 'AMOUNT_INVALID', arg: k }, cap.id);
          return fail('AMOUNT_INVALID', 'Amounts must be positive with at most two decimals.');
        }
      }

      // 3) lookups (current bank state, re-read every time)
      for (const [name, lk] of Object.entries(cap.lookups || {})) {
        const raw = await this.request(lk, scope, pipes);
        const items = (getPath(raw, lk.items) as Record<string, unknown>[]) || [];
        const where = render(lk.where, scope, pipes) as Record<string, unknown>;
        const item = items.find((it) => Object.entries(where).every(([k, v]) => v === undefined || String(it[k]) === String(v)));
        if (!item && lk.required !== false) {
          const err = lk.error || { code: 'NOT_FOUND', message: `Could not find ${name}.` };
          audit('rejected', { code: err.code, lookup: name }, cap.id);
          return fail(err.code, err.message);
        }
        (scope.lookup as Record<string, unknown>)[name] = item;
      }

      if (cap.kind === 'read') {
        const raw = await this.request(cap.request, scope, pipes);
        const data = this.mapResponse(cap.response, raw, session, cap.id, pipes);
        audit('ok', { kind: 'read', count: Array.isArray((data as { items?: unknown[] }).items) ? (data as { items: unknown[] }).items.length : undefined }, cap.id);
        return { ok: true, data };
      }
      return await this.prepare(cap, scope, session, trace_id, pipes);
    } catch (e) {
      if (e instanceof VaultError) { audit('rejected', { code: e.code }, cap.id); return fail(e.code, e.code === 'TOKEN_FOREIGN' ? 'That reference does not belong to this customer.' : e.message); }
      if (e instanceof CoreError) { const m = (cap.errors && cap.errors[e.rsn_cd]) || DEFAULT_ERRORS[e.rsn_cd] || { code: 'BANK_REJECTED', message: e.message }; audit('bank_error', { rsn_cd: e.rsn_cd, code: m.code }, cap.id); return { ok: false, error: m }; }
      audit('error', { message: (e as Error).message }, cap.id);
      return fail('BRIDGE_ERROR', 'The bank bridge could not complete this request.');
    }
  }

  private async prepare(cap: LoadedCapability, scope: Scope, session: string, trace_id: string, pipes: Record<string, PipeFn>): Promise<ToolResult> {
    // policy (limits, new payee) before anything is created
    const p = cap.policy || {};
    const amount = p.amount ? Number(render(p.amount, scope, pipes)) : undefined;
    const currency = p.currency ? String(render(p.currency, scope, pipes)) : undefined;
    const newPayee = p.new_payee ? Boolean(render(p.new_payee, scope, pipes)) : false;
    const balance = p.balance ? Number(render(p.balance, scope, pipes)) : undefined;
    const decision = this.d.policy.check(session, { group: p.limit_group, amount, currency, newPayee, balance });
    if (!decision.ok) {
      this.d.audit.write({ trace_id, session, actor: 'bridge', event: 'policy', capability: cap.id, decision: 'rejected', detail: { code: decision.code } });
      return fail(decision.code!, decision.message!);
    }

    // de-duplicate an identical pending preparation
    const dedupeKey = sha256(canonical({ cap: cap.id, session, input: scope.input }));
    for (const po of this.prepared.values()) {
      if (po.dedupeKey === dedupeKey && po.status === 'awaiting_confirmation' && po.expiresAt > this.now()) return { ok: true, data: this.agentView(po) };
    }

    const body = render(cap.request.body || {}, scope, pipes);
    const raw = await this.request(cap.request, scope, pipes);
    const result: Record<string, unknown> = {};
    for (const [k, spec] of Object.entries(cap.result || {})) result[k] = this.mapField(spec, raw as Record<string, unknown>, session, cap.id, pipes).value;
    scope.result = result;

    const display = (cap.confirm?.display || []).map((d) => ({ key: d.key, label: d.label, value: String(render(d.value, scope, pipes) ?? '') }));
    const byKey = Object.fromEntries(display.map((d) => [d.key, d.value]));
    const ttl = this.d.policy.cfg.confirmation.ttl_seconds * 1000;
    const id = 'prp_' + randomBytes(9).toString('hex');
    const po: PreparedObject = {
      id, session, capability: cap.id, risk: cap.risk, title: cap.confirm!.title, level: cap.confirm!.level,
      display, warnings: decision.warnings, extraConfirmation: decision.extraConfirmation,
      payloadHash: sha256(canonical({ id, cap: cap.id, session, body, display, warnings: decision.warnings })),
      createdAt: this.now(), expiresAt: this.now() + ttl, status: 'awaiting_confirmation', verified: false, trace_id,
      ui: cap.ui ? { route: cap.ui.route, form: cap.ui.form, submit: cap.ui.submit, fields: (cap.ui.fields || []).map((f) => ({ target: f.target, value: byKey[f.display] ?? '' })) } : undefined,
      dedupeKey, scope, policyRecord: { group: p.limit_group, currency, amount },
    };
    this.prepared.set(id, po);
    this.d.audit.write({ trace_id, session, actor: 'bridge', event: 'prepare', capability: cap.id, decision: 'awaiting_confirmation', detail: {
      prepared_id: id, risk: cap.risk, level: po.level, display, warnings: po.warnings, payload_hash: po.payloadHash,
      // what the bank's internal API received, with identifiers cut to their last four characters
      internal_request: { method: cap.request.method, path: cap.request.path, body: maskDeep(body) },
    } });
    this.d.notify?.({ type: 'prepared.created', session, prepared_id: id, capability: cap.id });
    return { ok: true, data: this.agentView(po) };
  }

  /** What the agent (and therefore the LLM) sees about a prepared action. Masked values only. */
  agentView(po: PreparedObject) {
    return {
      prepared_id: po.id, capability: po.capability, status: po.status === 'awaiting_confirmation' ? 'awaiting_customer_confirmation' : po.status,
      title: po.title, details: Object.fromEntries(po.display.map((d) => [d.key, d.value])), warnings: po.warnings,
      expires_in_seconds: Math.max(0, Math.round((po.expiresAt - this.now()) / 1000)), verified: po.verified,
      note: po.status === 'committed' ? 'Executed and verified by the bank.' : 'Nothing has been executed. The customer must confirm on the bank screen.',
    };
  }

  /** What the bank confirmation screen renders (I6). */
  confirmView(po: PreparedObject) {
    return { id: po.id, title: po.title, level: po.level, risk: po.risk, display: po.display, warnings: po.warnings, extraConfirmation: po.extraConfirmation, payloadHash: po.payloadHash, expiresAt: po.expiresAt, now: this.now(), status: po.status, verified: po.verified };
  }

  uiPlan(session: string, id: string) {
    const po = this.prepared.get(id);
    if (!po || po.session !== session) return null;
    return { prepared_id: po.id, capability: po.capability, ui: po.ui, level: po.level, status: po.status };
  }

  private async builtin(session: string, toolName: string, args: Record<string, unknown>, trace_id: string): Promise<ToolResult> {
    const po = this.prepared.get(String(args.prepared_id || ''));
    if (!po || po.session !== session) return fail('NOT_FOUND', 'No such prepared action in this session.');
    this.expireIfDue(po);
    if (toolName === 'prepared_cancel' && po.status === 'awaiting_confirmation') {
      await this.cancelAtCore(po).catch(() => undefined);
      po.status = 'cancelled';
      this.d.audit.write({ trace_id, session, actor: 'agent', event: 'prepared.cancel', capability: po.capability, decision: 'cancelled', detail: { prepared_id: po.id } });
      this.d.notify?.({ type: 'confirm.resolved', session, prepared_id: po.id, capability: po.capability, outcome: 'cancelled', verified: false });
    }
    return { ok: true, data: this.agentView(po) };
  }

  private expireIfDue(po: PreparedObject) {
    if (po.status === 'awaiting_confirmation' && this.now() > po.expiresAt) {
      po.status = 'expired';
      this.cancelAtCore(po).catch(() => undefined);
      this.d.audit.write({ trace_id: po.trace_id, session: po.session, actor: 'bridge', event: 'confirm.expired', capability: po.capability, decision: 'expired', detail: { prepared_id: po.id } });
      this.d.notify?.({ type: 'confirm.resolved', session: po.session, prepared_id: po.id, capability: po.capability, outcome: 'expired', verified: false });
      return true;
    }
    return false;
  }

  sweep() { for (const po of this.prepared.values()) this.expireIfDue(po); }

  private async cancelAtCore(po: PreparedObject) {
    const cap = this.d.caps().get(po.capability);
    if (cap?.cancel) await this.request(cap.cancel, po.scope, this.pipes(po.session));
  }

  getForDevice(session: string, id: string): PreparedObject | { error: number; code: string } {
    const po = this.prepared.get(id);
    if (!po) return { error: 404, code: 'NOT_FOUND' };
    if (po.session !== session) return { error: 403, code: 'WRONG_SESSION' };
    this.expireIfDue(po);
    return po;
  }

  /** Called only from the bank confirmation screen route, behind a device credential. */
  async resolveConfirm(session: string, id: string, req: { decision: string; payload_hash: string; proof?: { method?: string; assertion?: string; pin?: string }; acknowledge_warning?: boolean }) {
    const got = this.getForDevice(session, id);
    if ('error' in got) return { status: got.error, body: { code: got.code } };
    const po = got;
    const audit = (decision: string, detail: Record<string, unknown> = {}) => this.d.audit.write({ trace_id: po.trace_id, session, actor: 'customer', event: 'confirm', capability: po.capability, decision, detail: { prepared_id: id, ...detail } });

    if (po.status === 'expired') { audit('rejected', { code: 'EXPIRED' }); return { status: 410, body: { code: 'EXPIRED' } }; }
    if (po.status !== 'awaiting_confirmation') { audit('rejected', { code: 'ALREADY_USED', status: po.status }); return { status: 409, body: { code: 'ALREADY_USED', status: po.status } }; }
    if (req.payload_hash !== po.payloadHash) { audit('rejected', { code: 'HASH_MISMATCH' }); return { status: 409, body: { code: 'HASH_MISMATCH' } }; }

    if (req.decision === 'deny') {
      po.status = 'denied';
      await this.cancelAtCore(po).catch(() => undefined);
      audit('denied');
      this.d.notify?.({ type: 'confirm.resolved', session, prepared_id: id, capability: po.capability, outcome: 'denied', verified: false });
      return { status: 200, body: { status: 'denied' } };
    }
    if (req.decision !== 'approve') return { status: 400, body: { code: 'BAD_DECISION' } };

    const pin = this.d.policy.cfg.confirmation.demo_pin;
    const proofOk = po.level === 'tap'
      || (po.level === 'biometric' && ((req.proof?.method === 'biometric' && req.proof.assertion === 'mock-biometric-ok') || (req.proof?.method === 'pin' && req.proof.pin === pin)));
    if (!proofOk) { audit('rejected', { code: 'PROOF_REQUIRED' }); return { status: 401, body: { code: 'PROOF_REQUIRED' } }; }
    if (po.extraConfirmation && req.acknowledge_warning !== true) { audit('rejected', { code: 'WARNING_NOT_ACKNOWLEDGED' }); return { status: 422, body: { code: 'WARNING_NOT_ACKNOWLEDGED' } }; }

    // Re-validate policy at commit time: other actions may have been committed since prepare (I4).
    const pr = po.policyRecord;
    const again = this.d.policy.check(session, { group: pr.group, amount: pr.amount, currency: pr.currency });
    if (!again.ok) {
      po.status = 'failed';
      po.error = { code: again.code!, message: again.message! };
      await this.cancelAtCore(po).catch(() => undefined);
      audit('failed', { code: again.code });
      this.d.notify?.({ type: 'confirm.resolved', session, prepared_id: id, capability: po.capability, outcome: 'failed', verified: false, error: po.error });
      return { status: 422, body: { status: 'failed', verified: false, error: po.error } };
    }

    po.status = 'committing';
    const cap = this.d.caps().get(po.capability)!;
    const pipes = this.pipes(session);
    try {
      await this.request(cap.commit!, po.scope, pipes);
      const pc = await this.request(cap.postcondition!, po.scope, pipes);
      const expect = render(cap.postcondition!.expect, po.scope, pipes) as Record<string, unknown>;
      po.verified = Object.entries(expect).every(([k, v]) => String(getPath(pc, k)) === String(v));
      po.status = po.verified ? 'committed' : 'failed';
      if (!po.verified) po.error = { code: 'POSTCONDITION_FAILED', message: 'The bank did not confirm the expected result.' };
      if (po.verified) this.d.policy.recordCommit(session, po.policyRecord.group, po.policyRecord.currency, po.policyRecord.amount);
    } catch (e) {
      po.status = 'failed';
      po.error = e instanceof CoreError ? (DEFAULT_ERRORS[e.rsn_cd] || { code: 'BANK_REJECTED', message: e.message }) : { code: 'BRIDGE_ERROR', message: 'Commit failed.' };
    }
    audit(po.status, { verified: po.verified, method: req.proof?.method, error: po.error?.code });
    this.d.notify?.({ type: 'confirm.resolved', session, prepared_id: id, capability: po.capability, outcome: po.status, verified: po.verified, error: po.error });
    return { status: po.status === 'committed' ? 200 : 502, body: { status: po.status, verified: po.verified, error: po.error } };
  }

  clearSession(session: string) { for (const [k, v] of this.prepared) if (v.session === session) this.prepared.delete(k); }

  // ---------------- mapping helpers ----------------
  private async request(spec: RequestSpec, scope: Scope, pipes: Record<string, PipeFn>) {
    const path = String(render(spec.path, scope, pipes)).replace(/\{[^}]*\}/g, '');
    const query = spec.query ? (render(spec.query, scope, pipes) as Record<string, unknown>) : undefined;
    const body = spec.body ? render(spec.body, scope, pipes) : undefined;
    return this.d.core.req(spec.method, path, { query, body });
  }

  private mapField(spec: FieldSpec | string, raw: Record<string, unknown>, session: string, capId: string, pipes: Record<string, PipeFn>) {
    const s: FieldSpec = typeof spec === 'string' ? { from: spec } : spec;
    const itemScope = { item: raw };
    let v: unknown = s.value !== undefined ? render(s.value, itemScope, pipes) : getPath(raw, s.from || '');
    if (s.transform) for (const t of s.transform.split('|')) v = pipes[t.trim()]?.(v, undefined, itemScope) ?? v;
    if (s.map && v !== undefined && v !== null) v = s.map[String(v)] ?? v;
    if (s.token && v !== undefined && v !== null) {
      const meta: Record<string, unknown> = {};
      for (const [k, expr] of Object.entries(s.token.meta || {})) meta[k] = render(expr, itemScope, pipes);
      const e = this.d.vault.mint(session, s.token.kind, String(v), {
        provenance: s.token.provenance as Provenance,
        masked: s.token.masked ? String(render(s.token.masked, itemScope, pipes)) : '••••',
        label: s.token.label ? String(render(s.token.label, itemScope, pipes)) : undefined,
        meta, mintedBy: capId,
      });
      v = e.token;
    }
    return { value: v, untrusted: !!s.untrusted };
  }

  private mapResponse(spec: ResponseSpec | undefined, raw: unknown, session: string, capId: string, pipes: Record<string, PipeFn>) {
    if (!spec) return {};
    const mapOne = (item: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      const untrusted: Record<string, unknown> = {};
      for (const [name, fs] of Object.entries(spec.fields)) {
        const { value, untrusted: u } = this.mapField(fs, item, session, capId, pipes);
        if (u) { if (value) untrusted[name] = value; } else out[name] = value;
      }
      if (Object.keys(untrusted).length) out.untrusted_text = untrusted;
      return out;
    };
    if (spec.items) {
      let list = (getPath(raw, spec.items) as Record<string, unknown>[]) || [];
      if (spec.where) list = list.filter((it) => Object.entries(spec.where!).every(([k, v]) => String(it[k]) === String(v)));
      const total = list.length;
      if (spec.limit) list = list.slice(0, spec.limit);
      const extra = spec.extra ? (render(spec.extra, { raw }, pipes) as Record<string, unknown>) : {};
      return { ...extra, items: list.map(mapOne), total };
    }
    return { ...mapOne(raw as Record<string, unknown>), ...(spec.extra ? (render(spec.extra, { raw }, pipes) as Record<string, unknown>) : {}) };
  }
}

const fail = (code: string, message: string): ToolResult => ({ ok: false, error: { code, message } });

/** Cut long identifiers (account numbers, card numbers, internal refs) to their last four characters. */
export function maskDeep(v: unknown): unknown {
  if (typeof v === 'string') return /\d{6,}/.test(v) || /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(v) ? '…' + v.slice(-4) : v;
  if (Array.isArray(v)) return v.map(maskDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'idmp_key' ? '…' + String(x).slice(-4) : maskDeep(x)]));
  return v;
}
