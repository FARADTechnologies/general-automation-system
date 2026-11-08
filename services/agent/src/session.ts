// One demo session: conversation state, hub, Bridge connection, and the UI choreographer.
import { randomUUID } from 'node:crypto';
import { runTurn, newSessionState, type SessionState, type TurnResult, type ConfirmationOutcome, type ModelClient, type LoopConfig, type ToolPort, type ToolMeta, type Ledger, type TraceEvent } from '@gas/agent-core';
import { BridgeSession } from './bridgeClient.ts';
import { Hub } from './hub.ts';
import { localTools, type ScreenMap } from './local-tools.ts';

export interface RuntimeConfig {
  bridgeUrl: string;
  agentKey: string;
  model: ModelClient;
  loop: LoopConfig;
  choreographyStepMs: number;
  confirmTimeoutMs: number;
  maxInputsPerMinute: number;
  screens?: ScreenMap;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROUTE_RE = /^\/app(\/[A-Za-z0-9_\-/]*)?$/;

export class Session {
  readonly hub: Hub;
  readonly bridge: BridgeSession;
  state: SessionState = newSessionState();
  busy = false;
  private abort?: AbortController;
  private waiters = new Map<string, (o: ConfirmationOutcome) => void>();
  private inputTimes: number[] = [];
  private lastChooser: { options: { n: number; label: string }[] } | null = null;
  lastResult?: TurnResult;
  traces: TraceEvent[] = [];

  constructor(readonly id: string, private cfg: RuntimeConfig) {
    this.hub = new Hub(id);
    this.bridge = new BridgeSession(cfg.bridgeUrl, cfg.agentKey, id);
  }

  private toolPort(): ToolPort {
    return {
      listTools: async () => (await this.bridge.listTools()).map((t): ToolMeta => ({ ...t, kind: t.kind })),
      call: (name, input, traceId) => this.bridge.call(name, input, traceId),
      tokenize: (kind, value, traceId) => this.bridge.tokenize(kind, value, traceId),
    };
  }

  private setStatus(status: string, note?: string) { this.hub.patch({ agent: { status, note } }); }

  private transcript(role: 'user' | 'agent', text: string) {
    const t = [...this.hub.state.transcript, { id: `${role}-${Date.now()}`, role, text, at: Date.now() }].slice(-30);
    this.hub.patch({ transcript: t });
  }

  /** Run one user turn. Throws 'BUSY' or 'RATE_LIMIT' for the HTTP layer to map. */
  async input(text: string, source: 'text' | 'voice' = 'text'): Promise<TurnResult> {
    const clean = String(text || '').trim().slice(0, 600);
    if (!clean) throw new Error('EMPTY');
    if (this.busy) throw new Error('BUSY');
    const now = Date.now();
    this.inputTimes = this.inputTimes.filter((t) => now - t < 60_000);
    if (this.inputTimes.length >= this.cfg.maxInputsPerMinute) throw new Error('RATE_LIMIT');
    this.inputTimes.push(now);

    this.busy = true;
    this.abort = new AbortController();
    this.transcript('user', clean);
    this.hub.emit('agent.transcript', { role: 'user', text: clean, source });
    if (this.hub.state.modal?.kind === 'chooser') this.hub.patch({ modal: null });
    try {
      const res = await runTurn(this.state, clean, {
        model: this.cfg.model,
        tools: this.toolPort(),
        config: this.cfg.loop,
        signal: this.abort.signal,
        local: localTools({ hub: this.hub, bridge: this.bridge, screens: this.cfg.screens || {}, transcript: () => this.hub.state.transcript.map((x) => ({ role: x.role, text: x.text })) }),
        events: {
          status: (s, note) => this.setStatus(s, note),
          ledger: (l) => this.showPlan(l),
          trace: (e) => this.onTrace(e),
          message: (m) => { if (m) { this.transcript('agent', m); this.hub.emit('agent.message', { text: m }); } },
          prepared: (p) => this.choreograph(p.prepared_id, p.capability),
          awaitConfirmation: (id, signal) => this.waitForCustomer(id, signal),
        },
      });
      this.lastResult = res;
      this.maybeShowChooser(res);
      return res;
    } catch (e) {
      // Graceful failure: say plainly what is unavailable, on both screens. Nothing was executed:
      // every action needs the customer's confirmation on the bank screen.
      const msg = String((e as Error)?.message || '');
      const modelDown = /credit balance|overloaded|rate.?limit|api key|authentication|timed? ?out|ECONN|fetch failed|5\d\d/i.test(msg);
      const text = modelDown
        ? 'The assistant is unavailable right now. Nothing was changed. You can still use the app by hand.'
        : 'Something went wrong. Nothing was changed. Please try again.';
      this.transcript('agent', text);
      this.hub.emit('agent.message', { text });
      this.setStatus('error', text);
      throw e;
    } finally {
      this.busy = false;
      this.abort = undefined;
      if (this.hub.state.agent.status !== 'paused' && this.hub.state.agent.status !== 'error') this.setStatus('idle');
    }
  }

  stop(reason: 'stop' | 'manual_tap' = 'stop') {
    if (!this.abort) return false;
    this.abort.abort();
    this.setStatus(reason === 'manual_tap' ? 'paused' : 'idle', reason === 'manual_tap' ? 'Paused because you tapped the screen.' : 'Stopped.');
    return true;
  }

  private showPlan(l: Ledger) {
    const steps = l.steps.map((s) => ({ id: s.id, title: s.title, status: s.status }));
    this.hub.patch({ plan: steps.length ? { taskId: l.task_id, goal: l.goal, steps } : null });
    this.hub.emit('agent.step', { taskId: l.task_id, steps, pending: l.pending?.type || null });
  }

  /** Records a speech-to-text outcome (provider, timing, fallback; never the audio). */
  noteStt(ok: boolean, detail: Record<string, unknown>) {
    this.onTrace({ trace_id: `stt-${randomUUID()}`, at: Date.now(), kind: 'stt', name: String(detail.provider || 'stt'), decision: ok ? 'transcribed' : 'failed', detail });
  }

  private onTrace(e: TraceEvent) {
    this.traces.push(e);
    if (this.traces.length > 400) this.traces.shift();
    this.hub.emit('trace.event', e);
    // every step goes to the Bridge's append-only audit log, correlated by trace id (I10)
    void this.bridge.audit(`agent.${e.kind}`, e.trace_id, { name: e.name, ...(e.detail || {}) }, e.name, e.decision);
  }

  /** Deterministic UI choreography from the manifest's ui block. Display values come from the Bridge, never from the LLM. */
  private async choreograph(preparedId: string, capability: string) {
    const step = this.cfg.choreographyStepMs;
    let plan: { ui?: { route: string; form?: string; fields: { target: string; value: string }[]; submit?: string } } = {};
    try { plan = await this.bridge.uiPlan(preparedId); } catch { /* fall through to the confirmation screen */ }
    const ui = plan.ui;
    if (ui && ROUTE_RE.test(ui.route)) {
      this.hub.patch({ route: ui.route, modal: null, highlight: null });
      await sleep(step);
      for (const f of ui.fields || []) {
        this.hub.patch({ highlight: f.target });
        this.hub.emit('ui.highlight', { target: f.target });
        if (ui.form) this.hub.setField(ui.form, f.target, f.value);
        await sleep(step);
      }
      if (ui.submit) { this.hub.patch({ highlight: ui.submit }); this.hub.emit('ui.tap_echo', { target: ui.submit, by: 'agent' }); await sleep(step); }
    }
    this.hub.patch({ modal: { kind: 'confirm', confirmId: preparedId, capability }, highlight: null });
    this.hub.emit('confirm.required', { confirmId: preparedId, capability });
  }

  private waitForCustomer(preparedId: string, signal: AbortSignal): Promise<ConfirmationOutcome> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (o: ConfirmationOutcome) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.waiters.delete(preparedId);
        if (this.hub.state.modal?.kind === 'confirm' && this.hub.state.modal.confirmId === preparedId) this.hub.patch({ modal: null });
        this.hub.emit('confirm.resolved', { confirmId: preparedId, outcome: o.outcome, verified: o.verified });
        if (o.outcome === 'committed') { this.hub.patch({ bankVersion: this.hub.state.bankVersion + 1 }); this.hub.emit('bank.changed', { reason: 'commit' }); }
        resolve(o);
      };
      const timer = setTimeout(() => finish({ outcome: 'expired', verified: false }), this.cfg.confirmTimeoutMs);
      this.waiters.set(preparedId, finish);
      signal.addEventListener('abort', () => {
        void this.bridge.call('prepared_cancel', { prepared_id: preparedId }, 'stop').finally(() => finish({ outcome: 'stopped', verified: false }));
      }, { once: true });
    });
  }

  /** Bridge webhook: the customer decided on the bank screen. */
  onBridgeEvent(e: { type: string; prepared_id?: string; outcome?: string; verified?: boolean; error?: { code: string; message: string } }) {
    if (e.type !== 'confirm.resolved' || !e.prepared_id) return;
    const w = this.waiters.get(e.prepared_id);
    const outcome = (['committed', 'denied', 'expired', 'failed', 'cancelled'].includes(String(e.outcome)) ? e.outcome : 'failed') as ConfirmationOutcome['outcome'];
    if (w) w({ outcome, verified: !!e.verified, error: e.error });
    else if (outcome === 'committed') { this.hub.patch({ bankVersion: this.hub.state.bankVersion + 1 }); this.hub.emit('bank.changed', { reason: 'commit' }); }
  }

  private maybeShowChooser(res: TurnResult) {
    // several contacts matched and the agent asked which one: show a chooser the user can tap
    if (res.outcome !== 'clarification') { this.lastChooser = null; return; }
    const ledger = this.state.ledger;
    if (!ledger) return;
    const contacts = Object.entries(ledger.evidence.tokens).filter(([, r]) => r.provenance === 'resolved_contact' && r.label);
    const lastQuery = [...contacts].reverse()[0]?.[1].query;
    const options = contacts.filter(([, r]) => r.query === lastQuery).map(([, r], i) => ({ n: i + 1, label: String(r.label) }));
    if (options.length < 2) return;
    this.lastChooser = { options };
    this.hub.patch({ modal: { kind: 'chooser', chooserId: ledger.task_id, title: 'Which contact?', options } });
  }

  /** UI intents from a screen (phone or stage). */
  uiIntent(intent: { type: string; [k: string]: unknown }) {
    switch (intent.type) {
      case 'navigate': {
        const route = String(intent.route || '');
        if (ROUTE_RE.test(route)) this.hub.patch({ route, highlight: null });
        break;
      }
      case 'field.set': {
        const form = String(intent.form || '').slice(0, 40);
        const field = String(intent.field || '').slice(0, 60);
        if (form && field) this.hub.setField(form, field, String(intent.value ?? '').slice(0, 200));
        break;
      }
      case 'tap': {
        const target = String(intent.target || '').slice(0, 80);
        this.hub.emit('ui.tap_echo', { target, by: 'user' });
        const status = this.hub.state.agent.status;
        if (this.busy && status !== 'waiting_confirmation' && !target.startsWith('confirm-') && !target.startsWith('agent-')) this.stop('manual_tap');
        break;
      }
      case 'chooser.pick': {
        const n = Number(intent.n);
        const opt = this.lastChooser?.options.find((o) => o.n === n);
        this.hub.patch({ modal: null });
        if (opt) return this.input(opt.label).catch(() => undefined);
        break;
      }
      case 'modal.close':
        if (this.hub.state.modal?.kind !== 'confirm') this.hub.patch({ modal: null });
        break;
      default:
        break;
    }
    return undefined;
  }

  async reset() {
    this.stop();
    await this.bridge.reset();
    this.state = newSessionState();
    this.lastChooser = null;
    this.traces = [];
    this.hub.reset();
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  constructor(private cfg: RuntimeConfig) {}
  static valid(id: string) { return /^[A-Za-z0-9_-]{1,64}$/.test(id); }
  get(id: string): Session {
    let s = this.sessions.get(id);
    if (!s) { s = new Session(id, this.cfg); this.sessions.set(id, s); }
    return s;
  }
  peek(id: string) { return this.sessions.get(id); }
  list() { return [...this.sessions.values()]; }
}
