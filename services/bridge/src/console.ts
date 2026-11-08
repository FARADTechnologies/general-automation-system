// Bank-side console API, served by the Bridge (it lives inside the bank's boundary).
// Operators sign in with a passcode; the session is an httpOnly cookie scoped to /bridge/console.
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { LoadedCapability } from './manifest.ts';
import type { Policy } from './policy.ts';
import type { AuditLog } from './audit.ts';

export interface ConsoleDeps {
  passcode: string;
  secureCookies?: boolean;
  caps: () => Map<string, LoadedCapability>;
  optional: () => { id: string; title: string; kind: string; risk: string; enabled: boolean }[];
  setOptional: (id: string, enabled: boolean) => boolean;
  policy: Policy;
  audit: AuditLog;
  handoffs: { ticket_id: string; session: string; created_at: string; status: string; record: Record<string, unknown> }[];
  notify: () => void;
}

const cookie = (req: Request, name: string) => {
  const m = (req.header('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
};

export function consoleRouter(d: ConsoleDeps) {
  const r = express.Router();
  const sessions = new Set<string>();
  const attempts = new Map<string, { n: number; at: number }>();

  r.post('/login', (req, res) => {
    const ip = req.ip || 'x';
    const a = attempts.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - a.at > 60_000) { a.n = 0; a.at = Date.now(); }
    if (++a.n > 10) { attempts.set(ip, a); res.status(429).json({ code: 'TOO_MANY_ATTEMPTS' }); return; }
    attempts.set(ip, a);
    const p = String(req.body?.passcode || '');
    if (!d.passcode || p.length !== d.passcode.length || !timingSafeEqual(Buffer.from(p), Buffer.from(d.passcode))) { res.status(401).json({ code: 'WRONG_PASSCODE' }); return; }
    const tok = randomBytes(24).toString('base64url');
    sessions.add(tok);
    res.setHeader('set-cookie', `gas_op=${tok}; Path=/bridge/console; HttpOnly; SameSite=Strict${d.secureCookies ? '; Secure' : ''}; Max-Age=43200`);
    d.audit.write({ trace_id: 'console', session: 'bank', actor: 'operator', event: 'console.login', decision: 'ok' });
    res.json({ ok: true });
  });

  r.use((req: Request, res: Response, next: NextFunction) => {
    if (!sessions.has(cookie(req, 'gas_op'))) { res.status(401).json({ code: 'SIGN_IN_REQUIRED' }); return; }
    next();
  });

  r.get('/overview', (_req, res) => {
    const caps = [...d.caps().values()].map((c) => ({ id: c.id, title: c.title, kind: c.kind, risk: c.risk, confirm: c.confirm?.level || 'none', killed: d.policy.isKilled(c.id), optional: c.source_file?.startsWith('optional:') || false }));
    const rows = d.audit.list({ limit: 2000 });
    const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;
    res.json({
      capabilities: caps,
      optional: d.optional(),
      limits: d.policy.cfg.limits,
      confirmation: { ttl_seconds: d.policy.cfg.confirmation.ttl_seconds },
      handoffs: d.handoffs,
      // counts come straight from the append-only audit log of this deployment
      stats: {
        audit_rows: rows.length,
        prepared: count((x) => x.event === 'prepare'),
        committed: count((x) => x.event === 'confirm' && x.decision === 'committed'),
        denied_or_expired: count((x) => (x.event === 'confirm' && x.decision === 'denied') || x.event === 'confirm.expired'),
        guard_holds: count((x) => x.event === 'agent.guard' && x.decision === 'held'),
        bridge_rejections: count((x) => x.event === 'tool.call' && x.decision === 'rejected'),
        policy_rejections: count((x) => x.event === 'policy' && x.decision === 'rejected'),
      },
    });
  });

  r.get('/audit', (req, res) => {
    res.json({ items: d.audit.list({ session: (req.query.session as string) || undefined, trace_id: (req.query.trace_id as string) || undefined, limit: Math.min(Number(req.query.limit) || 100, 500) }) });
  });

  r.post('/capabilities/:id', (req, res) => {
    if (!d.caps().has(req.params.id)) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
    const enabled = req.body?.enabled !== false;
    d.policy.setEnabled(req.params.id, enabled);
    d.audit.write({ trace_id: 'console', session: 'bank', actor: 'operator', event: 'capability.toggle', capability: req.params.id, decision: enabled ? 'enabled' : 'disabled' });
    d.notify();
    res.json({ ok: true, killed: d.policy.isKilled(req.params.id) });
  });

  r.post('/optional/:id', (req, res) => {
    const enabled = req.body?.enabled !== false;
    if (!d.setOptional(req.params.id, enabled)) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
    d.audit.write({ trace_id: 'console', session: 'bank', actor: 'operator', event: 'manifest.optional', capability: req.params.id, decision: enabled ? 'enabled' : 'disabled' });
    d.notify();
    res.json({ ok: true });
  });

  r.post('/limits', (req, res) => {
    const { group, currency, per_tx } = req.body || {};
    const g = d.policy.cfg.limits[String(group)];
    const v = Number(per_tx);
    if (!g || !(String(currency) in g.per_tx) || !(v > 0 && v <= 100000)) { res.status(400).json({ code: 'BAD_LIMIT' }); return; }
    g.per_tx[String(currency)] = v;
    d.audit.write({ trace_id: 'console', session: 'bank', actor: 'operator', event: 'limit.change', decision: 'ok', detail: { group, currency, per_tx: v } });
    res.json({ ok: true, limits: d.policy.cfg.limits });
  });

  r.post('/handoffs/:id/close', (req, res) => {
    const h = d.handoffs.find((x) => x.ticket_id === req.params.id);
    if (h) h.status = 'closed';
    d.audit.write({ trace_id: 'console', session: h?.session || 'bank', actor: 'operator', event: 'handoff.closed', decision: h ? 'ok' : 'not_found', detail: { ticket_id: req.params.id } });
    res.json({ ok: !!h });
  });

  return r;
}
