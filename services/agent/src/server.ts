// Agent Service HTTP + WebSocket server. Knows the Bridge, never the Core Bank.
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, type Server } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { SessionManager, type RuntimeConfig } from './session.ts';
import type { SttService } from './stt.ts';

export function createAgentServer(cfg: RuntimeConfig & { webhookSecret: string; tryCommands?: string[]; stt?: SttService }) {
  const sessions = new SessionManager(cfg);
  const app = express();
  app.use('/hooks/bridge', express.raw({ type: '*/*', limit: '64kb' }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => { res.json({ ok: true, service: 'agent', model: cfg.model.model, sessions: sessions.list().length }); });

  // Bridge webhook, HMAC-signed
  app.post('/hooks/bridge', (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const sig = String(req.header('x-bridge-signature') || '');
    const expect = createHmac('sha256', cfg.webhookSecret).update(body).digest('hex');
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) { res.status(401).end(); return; }
    const e = JSON.parse(body.toString('utf8'));
    if (e.session && SessionManager.valid(e.session)) sessions.peek(e.session)?.onBridgeEvent(e);
    res.json({ ok: true });
  });

  const withSession = (req: Request, res: Response, next: NextFunction) => {
    if (!SessionManager.valid(String(req.params.s))) { res.status(400).json({ error: 'bad session id' }); return; }
    next();
  };

  app.get('/api/agent/config', (_req, res) => { res.json({ tryCommands: cfg.tryCommands || [], model: cfg.model.model, stt: !!cfg.stt?.enabled }); });

  // Push-to-talk: one whole utterance in, its transcript out. The client then sends the text as a
  // normal voice turn, so it shows on every screen and passes the same ingress tokenizer and guards.
  // Audio is held in memory for this request only (I10).
  const sttHits = new Map<string, number[]>();
  app.post('/api/agent/sessions/:s/stt', withSession, express.raw({ type: () => true, limit: '3mb' }), async (req, res) => {
    const id = String(req.params.s);
    if (!cfg.stt?.enabled) { res.status(503).json({ error: 'STT_DISABLED' }); return; }
    const recent = (sttHits.get(id) || []).filter((t) => Date.now() - t < 60_000);
    if (recent.length >= 20) { res.status(429).json({ error: 'RATE_LIMIT' }); return; }
    recent.push(Date.now()); sttHits.set(id, recent);
    const mime = String(req.header('content-type') || '');
    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!/^audio\//i.test(mime)) { res.status(415).json({ error: 'AUDIO_ONLY' }); return; }
    if (audio.length < 1200) { res.status(400).json({ error: 'TOO_SHORT' }); return; }
    const session = sessions.get(id);
    try {
      const r = await cfg.stt.transcribe(audio, mime);
      session.noteStt(true, { provider: r.provider, latency_ms: r.latencyMs, fallback_used: r.fallbackUsed, bytes: audio.length, format: mime.split(';')[0], attempts: r.attempts });
      res.json({ text: r.text, provider: r.provider, latencyMs: r.latencyMs, fallbackUsed: r.fallbackUsed });
    } catch (e) {
      const attempts = ((e as { attempts?: unknown[] }).attempts || []) as { provider: string; status: string; ms: number }[];
      session.noteStt(false, { bytes: audio.length, format: mime.split(';')[0], attempts: attempts.map((a) => ({ provider: a.provider, status: a.status, ms: a.ms })) });
      res.status(502).json({ error: 'STT_FAILED' });
    }
  });

  app.post('/api/agent/sessions/:s/input', withSession, async (req, res) => {
    const s = sessions.get(String(req.params.s));
    const wait = req.query.wait === '1';
    const run = s.input(String(req.body?.text || ''), req.body?.source === 'voice' ? 'voice' : 'text');
    if (!wait) {
      run.catch(() => undefined);
      // let BUSY / RATE_LIMIT surface synchronously
      await new Promise((r) => setImmediate(r));
      res.status(202).json({ accepted: true });
      return;
    }
    try { res.json(await run); } catch (e) {
      const m = (e as Error).message;
      res.status(m === 'BUSY' ? 409 : m === 'RATE_LIMIT' ? 429 : m === 'EMPTY' ? 400 : 500).json({ error: m });
    }
  });
  app.post('/api/agent/sessions/:s/stop', withSession, (req, res) => { res.json({ stopped: sessions.get(String(req.params.s)).stop() }); });
  app.post('/api/agent/sessions/:s/reset', withSession, async (req, res) => { await sessions.get(String(req.params.s)).reset(); res.json({ ok: true }); });
  app.post('/api/agent/sessions/:s/intent', withSession, (req, res) => { void sessions.get(String(req.params.s)).uiIntent(req.body || {}); res.json({ ok: true }); });
  app.get('/api/agent/sessions/:s/state', withSession, (req, res) => {
    const s = sessions.get(String(req.params.s));
    res.json({ ui: s.hub.state, ledger: s.state.ledger, busy: s.busy, llmCalls: s.state.llmCalls, spendUsd: s.state.spendUsd, last: s.lastResult });
  });
  app.get('/api/agent/sessions/:s/traces', withSession, (req, res) => { res.json({ items: sessions.get(String(req.params.s)).traces }); });
  app.get('/api/agent/sessions', (_req, res) => {
    res.json({ items: sessions.list().map((s) => ({ id: s.id, busy: s.busy, status: s.hub.state.agent.status, screens: s.hub.clientCount(), llmCalls: s.state.llmCalls, spendUsd: Number(s.state.spendUsd.toFixed(4)), lastText: s.hub.state.transcript.at(-1)?.text })) });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => { res.status(500).json({ error: (err as Error)?.message?.slice(0, 200) }); });

  const server: Server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://x');
    const sid = url.searchParams.get('s') || '';
    if (!url.pathname.endsWith('/ws') || !SessionManager.valid(sid)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const s = sessions.get(sid);
      s.hub.attach(ws);
      ws.on('message', (raw) => {
        let m: { type?: string; [k: string]: unknown };
        try { m = JSON.parse(String(raw)); } catch { return; }
        if (m.type === 'ui.intent' && m.intent && typeof m.intent === 'object') void s.uiIntent(m.intent as { type: string });
        else if (m.type === 'agent.input') s.input(String(m.text || ''), m.source === 'voice' ? 'voice' : 'text').catch((e) => ws.send(JSON.stringify({ type: 'agent.error', payload: { error: (e as Error).message } })));
        else if (m.type === 'agent.stop') s.stop();
      });
    });
  });

  return { app, server, sessions };
}
