// Bank Bridge HTTP server.
//   POST /mcp                 MCP (Streamable HTTP, stateless) for the agent. Capabilities only.
//   /agent/*                  agent runtime helpers (ingress tokenizer, UI plan, reset). Agent key.
//   /bridge/*                 bank confirmation screen (browser). Device credential. Never the agent.
//   /admin/*                  bank-side console. Admin key.
import express, { type Request, type Response, type NextFunction } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadManifests, type LoadedCapability } from './manifest.ts';
import { Vault, maskPan, maskPhone } from './vault.ts';
import { Policy } from './policy.ts';
import { AuditLog } from './audit.ts';
import { Engine, CoreClient, type BridgeEvent } from './engine.ts';

export interface BridgeOptions {
  manifestDirs: string[];
  policyPath?: string;
  coreBankUrl: string;
  coreBankKey: string;
  agentKey: string;
  adminKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
  auditPath?: string;
  now?: () => number;
  secureCookies?: boolean;
}

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;
const safeEq = (a: string, b: string) => a.length === b.length && a.length > 0 && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const bearer = (req: Request) => (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
const cookie = (req: Request, name: string) => {
  const m = (req.header('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
};

export function createBridge(opts: BridgeOptions) {
  let caps: Map<string, LoadedCapability> = loadManifests(opts.manifestDirs);
  const vault = new Vault();
  const policy = new Policy(opts.policyPath);
  const audit = new AuditLog(opts.auditPath);
  const core = new CoreClient(opts.coreBankUrl, opts.coreBankKey);
  const devices = new Map<string, string>(); // device token -> session

  const notify = (e: BridgeEvent) => {
    if (!opts.webhookUrl) return;
    const body = JSON.stringify(e);
    const sig = createHmac('sha256', opts.webhookSecret || '').update(body).digest('hex');
    fetch(opts.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-signature': sig }, body, signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  };
  const engine = new Engine({ caps: () => caps, vault, policy, audit, core, notify, now: opts.now });
  const sweeper = setInterval(() => engine.sweep(), 2000);
  sweeper.unref();

  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => { res.json({ ok: true, service: 'bridge', capabilities: caps.size, disabled: policy.killedList() }); });

  const agentAuth = (req: Request, res: Response, next: NextFunction) => { if (!safeEq(bearer(req), opts.agentKey)) { res.status(401).json({ code: 'AUTH' }); return; } next(); };
  const adminAuth = (req: Request, res: Response, next: NextFunction) => { if (!safeEq(bearer(req), opts.adminKey)) { res.status(401).json({ code: 'AUTH' }); return; } next(); };

  // ---------------- MCP ----------------
  app.post('/mcp', agentAuth, async (req, res) => {
    const session = String(req.header('x-session-id') || '');
    if (!SESSION_RE.test(session)) { res.status(400).json({ code: 'SESSION_REQUIRED' }); return; }
    const server = new Server({ name: 'caspia-bank-bridge', version: '0.1.0' }, { capabilities: { tools: { listChanged: true } } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: engine.listTools() as never }));
    server.setRequestHandler(CallToolRequestSchema, async (r) => {
      const trace = String((r.params._meta as Record<string, unknown> | undefined)?.trace_id || req.header('x-trace-id') || 'tr_' + randomBytes(6).toString('hex'));
      const out = await engine.call(session, r.params.name, (r.params.arguments || {}) as Record<string, unknown>, trace);
      if (out.ok) return { content: [{ type: 'text', text: JSON.stringify(out.data) }] };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: out.error }) }] };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close().catch(() => undefined); server.close().catch(() => undefined); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.get('/mcp', (_req, res) => { res.status(405).end(); });
  app.delete('/mcp', (_req, res) => { res.status(405).end(); });

  // ---------------- agent helpers ----------------
  const agent = express.Router();
  agent.use(agentAuth);
  // Ingress tokenizer storage: the agent detects card/phone numbers in user input before the LLM
  // and swaps them for tokens minted here.
  agent.post('/vault/ingress', (req, res) => {
    const { session, kind, value } = req.body || {};
    if (!SESSION_RE.test(String(session))) { res.status(400).json({ code: 'SESSION_REQUIRED' }); return; }
    const v = String(value || '').replace(/\D/g, '');
    if (kind === 'pan' && (v.length < 13 || v.length > 19)) { res.status(400).json({ code: 'BAD_VALUE' }); return; }
    if (kind === 'phone' && (v.length < 9 || v.length > 15)) { res.status(400).json({ code: 'BAD_VALUE' }); return; }
    if (kind !== 'pan' && kind !== 'phone') { res.status(400).json({ code: 'BAD_KIND' }); return; }
    const e = vault.mint(String(session), kind, v, { provenance: 'ingress_token', masked: kind === 'pan' ? maskPan(v) : maskPhone(v), mintedBy: 'ingress' });
    audit.write({ trace_id: String(req.body.trace_id || 'ingress'), session: String(session), actor: 'agent', event: 'vault.ingress', capability: null, decision: 'tokenized', detail: { kind, token: e.token, masked: e.masked } });
    res.json({ token: e.token, masked: e.masked });
  });
  agent.get('/prepared/:id/ui', (req, res) => {
    const plan = engine.uiPlan(String(req.query.session || ''), req.params.id);
    if (!plan) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
    res.json(plan);
  });
  agent.post('/session/:session/reset', async (req, res) => {
    const s = req.params.session;
    if (!SESSION_RE.test(s)) { res.status(400).json({ code: 'SESSION_REQUIRED' }); return; }
    await core.reset(s);
    vault.clearSession(s); policy.clearSession(s); engine.clearSession(s);
    audit.write({ trace_id: 'reset', session: s, actor: 'operator', event: 'session.reset', decision: 'ok' });
    res.json({ ok: true });
  });
  agent.post('/audit', (req, res) => {
    const b = req.body || {};
    if (!SESSION_RE.test(String(b.session))) { res.status(400).json({ code: 'SESSION_REQUIRED' }); return; }
    const row = audit.write({ trace_id: String(b.trace_id || 'agent'), session: String(b.session), actor: 'agent', event: String(b.event || 'agent.step').slice(0, 64), capability: b.capability ? String(b.capability) : null, decision: b.decision ? String(b.decision).slice(0, 64) : null, detail: typeof b.detail === 'object' && b.detail ? b.detail : {} });
    res.json({ seq: row.seq });
  });
  app.use('/agent', agent);

  // ---------------- bank confirmation screen (device credential) ----------------
  const pub = express.Router();
  pub.post('/device/register', (req, res) => {
    const session = String(req.body?.session || '');
    if (!SESSION_RE.test(session)) { res.status(400).json({ code: 'SESSION_REQUIRED' }); return; }
    const existing = cookie(req, 'gas_dev');
    if (existing && devices.get(existing) === session) { res.json({ ok: true }); return; }
    const tok = randomBytes(24).toString('base64url');
    devices.set(tok, session);
    res.setHeader('set-cookie', `gas_dev=${tok}; Path=/bridge; HttpOnly; SameSite=Strict${opts.secureCookies ? '; Secure' : ''}; Max-Age=86400`);
    audit.write({ trace_id: 'device', session, actor: 'customer', event: 'device.register', decision: 'ok' });
    res.json({ ok: true });
  });
  const deviceSession = (req: Request) => devices.get(cookie(req, 'gas_dev')) || '';
  pub.get('/confirm/:id', (req, res) => {
    const s = deviceSession(req);
    if (!s) { res.status(401).json({ code: 'DEVICE_REQUIRED' }); return; }
    const po = engine.getForDevice(s, req.params.id);
    if ('error' in po) { res.status(po.error).json({ code: po.code }); return; }
    res.json(engine.confirmView(po));
  });
  pub.post('/confirm/:id', async (req, res) => {
    const s = deviceSession(req);
    if (!s) { res.status(401).json({ code: 'DEVICE_REQUIRED' }); return; }
    const r = await engine.resolveConfirm(s, req.params.id, req.body || {});
    res.status(r.status).json(r.body);
  });
  // Presentation view of what the bank side saw for one demo session: read-only, masked.
  pub.get('/session/:s/bank-view', (req, res) => {
    const s = req.params.s;
    if (!SESSION_RE.test(s)) { res.status(400).json({ code: 'SESSION_REQUIRED' }); return; }
    const rows = audit.list({ session: s, limit: 80 })
      .filter((r) => ['prepare', 'confirm', 'policy', 'confirm.expired', 'vault.ingress'].includes(r.event) || (r.event === 'tool.call' && r.decision !== 'ok'))
      .slice(0, 25)
      .map((r) => ({ seq: r.seq, ts: r.ts, trace_id: r.trace_id, actor: r.actor, event: r.event, capability: r.capability, decision: r.decision, detail: r.detail }));
    res.json({ items: rows });
  });
  app.use('/bridge', pub);

  // ---------------- bank console ----------------
  const admin = express.Router();
  admin.use(adminAuth);
  admin.get('/capabilities', (_req, res) => {
    res.json({ items: [...caps.values()].map((c) => ({ id: c.id, title: c.title, kind: c.kind, risk: c.risk, enabledInManifest: c.enabled !== false, killed: policy.isKilled(c.id), confirm: c.confirm?.level || 'none', file: c.source_file })) });
  });
  admin.post('/capabilities/:id', (req, res) => {
    if (!caps.has(req.params.id)) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
    policy.setEnabled(req.params.id, req.body?.enabled !== false);
    audit.write({ trace_id: 'console', session: 'bank', actor: 'operator', event: 'capability.toggle', capability: req.params.id, decision: req.body?.enabled !== false ? 'enabled' : 'disabled' });
    notify({ type: 'capabilities.changed' });
    res.json({ ok: true, killed: policy.isKilled(req.params.id) });
  });
  admin.post('/reload', (_req, res) => {
    caps = loadManifests(opts.manifestDirs);
    audit.write({ trace_id: 'console', session: 'bank', actor: 'operator', event: 'manifest.reload', decision: 'ok', detail: { count: caps.size } });
    notify({ type: 'capabilities.changed' });
    res.json({ ok: true, count: caps.size });
  });
  admin.get('/audit', (req, res) => {
    res.json({ items: audit.list({ session: req.query.session as string | undefined, trace_id: req.query.trace_id as string | undefined, after: Number(req.query.after) || undefined, limit: Number(req.query.limit) || 200 }) });
  });
  admin.post('/fault', async (req, res) => { await core.req('POST', '/internal/admin/flt', { body: req.body || {} }); res.json({ ok: true }); });
  app.use('/admin', admin);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ code: 'BRIDGE_ERROR', message: (err as Error)?.message?.slice(0, 200) });
  });

  return { app, engine, vault, policy, audit, core, reload: () => { caps = loadManifests(opts.manifestDirs); }, close: () => clearInterval(sweeper) };
}
