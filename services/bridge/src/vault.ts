// Token vault. Real identifiers (card numbers, account numbers, phone numbers, internal refs)
// stay here; the agent and the LLM only ever see tokens and masked values.
import { randomBytes } from 'node:crypto';

export type Provenance = 'resolved_contact' | 'ingress_token' | 'template' | 'bank_record' | 'derived';

export interface VaultEntry {
  token: string;
  session: string;
  kind: string;
  value: string;
  masked: string;
  label?: string;
  provenance: Set<Provenance>;
  meta: Record<string, unknown>;
  mintedBy: string;
  createdAt: number;
}

export class VaultError extends Error {
  constructor(public code: 'TOKEN_UNKNOWN' | 'TOKEN_FOREIGN' | 'TOKEN_KIND', msg: string) { super(msg); }
}

const PREFIX: Record<string, string> = { contact: 'ctc', account: 'acc', card: 'crd', bill: 'bll', subscription: 'sub', template: 'tpl', pan: 'pan', phone: 'tel', branch: 'brn', biller: 'blr' };

export class Vault {
  private byToken = new Map<string, VaultEntry>();
  private byValue = new Map<string, string>(); // session|kind|value -> token

  mint(session: string, kind: string, value: string, opts: { provenance: Provenance; masked: string; label?: string; meta?: Record<string, unknown>; mintedBy: string }): VaultEntry {
    const key = `${session}|${kind}|${value}`;
    const existing = this.byValue.get(key);
    if (existing) {
      const e = this.byToken.get(existing)!;
      e.provenance.add(opts.provenance);
      if (opts.meta) Object.assign(e.meta, opts.meta);
      if (opts.label) e.label = opts.label;
      return e;
    }
    const token = `${PREFIX[kind] || 'tok'}_${randomBytes(4).toString('hex')}`;
    const e: VaultEntry = { token, session, kind, value, masked: opts.masked, label: opts.label, provenance: new Set([opts.provenance]), meta: { ...(opts.meta || {}) }, mintedBy: opts.mintedBy, createdAt: Date.now() };
    this.byToken.set(token, e);
    this.byValue.set(key, token);
    return e;
  }

  /** Resolve a token for this session. Ownership and kind are enforced here (I4). */
  resolve(session: string, token: string, kind?: string): VaultEntry {
    const e = this.byToken.get(String(token));
    if (!e) throw new VaultError('TOKEN_UNKNOWN', `unknown token ${String(token).slice(0, 24)}`);
    if (e.session !== session) throw new VaultError('TOKEN_FOREIGN', 'token belongs to another session');
    if (kind && e.kind !== kind) throw new VaultError('TOKEN_KIND', `expected a ${kind} token`);
    return e;
  }

  peek(token: string): VaultEntry | undefined { return this.byToken.get(token); }

  clearSession(session: string) {
    for (const [t, e] of this.byToken) if (e.session === session) { this.byToken.delete(t); this.byValue.delete(`${e.session}|${e.kind}|${e.value}`); }
  }
}

export const maskPan = (pan: string) => `•••• ${pan.slice(-4)}`;
export const maskPhone = (p: string) => { const d = p.replace(/\D/g, ''); return `+${d.slice(0, 3)} •• ••• •• ${d.slice(-2)}`; };
export const maskAccount = (a: string) => `•••• ${a.slice(-4)}`;
