// Session hub: authoritative UI state for one demo session, mirrored to every connected screen.
// Mirror state, not clicks: clients render from this state; nobody automates the DOM.
import type { WebSocket } from 'ws';

export interface UiState {
  seq: number;
  route: string;
  forms: Record<string, Record<string, string>>;
  modal: null | { kind: 'confirm'; confirmId: string; capability?: string } | { kind: 'chooser'; chooserId: string; title: string; options: { n: number; label: string; sub?: string }[] } | { kind: 'handoff'; ticketId: string };
  highlight: string | null;
  agent: { status: string; note?: string };
  plan: null | { taskId: string; goal: string; steps: { id: string; title: string; status: string }[] };
  transcript: { id: string; role: 'user' | 'agent'; text: string; at: number }[];
  bankVersion: number;
  /** What the assistant just read from the bank, per screen panel, so the screen shows the same
   *  figures it speaks about. Set only by the session, never by a client. */
  agentView?: Record<string, { data: unknown; at: number } | null>;
}

export interface HubEvent { type: string; seq: number; at: number; payload: unknown }

export const initialUi = (): UiState => ({ seq: 0, route: '/app', forms: {}, modal: null, highlight: null, agent: { status: 'idle' }, plan: null, transcript: [], bankVersion: 0 });

export class Hub {
  state: UiState = initialUi();
  private clients = new Set<WebSocket>();
  private listeners = new Set<(e: HubEvent) => void>();
  recent: HubEvent[] = [];

  constructor(readonly session: string) {}

  attach(ws: WebSocket) {
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: 'session.snapshot', seq: this.state.seq, at: Date.now(), payload: this.state }));
    ws.on('close', () => this.clients.delete(ws));
  }
  onEvent(fn: (e: HubEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  clientCount() { return this.clients.size; }

  emit(type: string, payload: unknown): HubEvent {
    this.state.seq += 1;
    const e: HubEvent = { type, seq: this.state.seq, at: Date.now(), payload };
    const data = JSON.stringify(e);
    for (const c of this.clients) if (c.readyState === 1) c.send(data);
    for (const l of this.listeners) l(e);
    this.recent.push(e);
    if (this.recent.length > 500) this.recent.shift();
    return e;
  }

  /** Apply a partial UI state change and broadcast it. */
  patch(p: Partial<Omit<UiState, 'seq'>>) {
    Object.assign(this.state, p);
    this.emit('ui.patch', p);
  }

  setField(form: string, field: string, value: string) {
    const forms = { ...this.state.forms, [form]: { ...(this.state.forms[form] || {}), [field]: value } };
    this.patch({ forms });
  }

  reset() {
    this.state = { ...initialUi(), seq: this.state.seq, bankVersion: this.state.bankVersion + 1 };
    this.emit('session.snapshot', this.state);
  }
}
