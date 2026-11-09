// Thin client for the session hub. The browser holds no AI, no keys and no bank logic:
// it renders hub state, sends intents, and talks to the bank's own APIs.
import { useEffect, useRef, useSyncExternalStore } from 'react';

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
  agentView?: Record<string, { data: any; at: number } | null>;
}
export interface HubEvent { type: string; seq: number; at: number; payload: any }

const EMPTY: UiState = { seq: 0, route: '/app', forms: {}, modal: null, highlight: null, agent: { status: 'idle' }, plan: null, transcript: [], bankVersion: 0 };

// ---------- session id ----------
export function resolveSession(): string {
  const url = new URL(window.location.href);
  let s = url.searchParams.get('s') || '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) {
    try { s = localStorage.getItem('gas-session') || ''; } catch { /* storage blocked */ }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) s = 'demo-' + Math.random().toString(36).slice(2, 7);
    url.searchParams.set('s', s);
    window.history.replaceState(null, '', url.toString());
  }
  try { localStorage.setItem('gas-session', s); } catch { /* ignore */ }
  return s;
}

class HubClient {
  session = '';
  state: UiState = EMPTY;
  connected = false;
  private ws?: WebSocket;
  private subs = new Set<() => void>();
  private evs = new Set<(e: HubEvent) => void>();
  private retry = 0;
  private queue: string[] = [];

  connect(session: string) {
    if (this.session === session && this.ws) return;
    this.session = session;
    this.open();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?s=${encodeURIComponent(this.session)}`);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.retry = 0; for (const m of this.queue.splice(0)) ws.send(m); this.notify(); };
    ws.onclose = () => {
      this.connected = false; this.notify();
      const delay = Math.min(4000, 300 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay); // a reconnect always gets a fresh snapshot
    };
    ws.onmessage = (m) => {
      let e: HubEvent;
      try { e = JSON.parse(String(m.data)); } catch { return; }
      if (e.type === 'session.snapshot') { this.state = { ...EMPTY, ...e.payload, seq: e.seq }; this.notify(); }
      else if (e.type === 'ui.patch') {
        if (e.seq <= this.state.seq) return; // ordered events only
        this.state = { ...this.state, ...e.payload, seq: e.seq };
        this.notify();
      } else if (e.seq > this.state.seq) this.state = { ...this.state, seq: e.seq };
      for (const l of this.evs) l(e);
    };
  }

  private notify() { for (const s of this.subs) s(); }
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  onEvent(fn: (e: HubEvent) => void) { this.evs.add(fn); return () => { this.evs.delete(fn); }; }

  private send(msg: unknown) {
    const s = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(s); else this.queue.push(s);
  }
  intent(intent: { type: string; [k: string]: unknown }) {
    // optimistic local echo for fields so typing feels instant
    if (intent.type === 'field.set') {
      const form = String(intent.form), field = String(intent.field);
      this.state = { ...this.state, forms: { ...this.state.forms, [form]: { ...(this.state.forms[form] || {}), [field]: String(intent.value ?? '') } } };
      this.notify();
    }
    this.send({ type: 'ui.intent', intent });
  }
  input(text: string, source: 'text' | 'voice' = 'text') { this.send({ type: 'agent.input', text, source }); }
  stop() { this.send({ type: 'agent.stop' }); }
  async reset() { await fetch(`/api/agent/sessions/${encodeURIComponent(this.session)}/reset`, { method: 'POST' }); }
}

export const hub = new HubClient();

const shallowEqual = (a: unknown, b: unknown) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** Select from the hub state. The result is cached per state object (and kept when shallow-equal),
 *  so selectors that build new arrays or objects, such as `s.plan?.steps || []`, never loop. */
export function useUi<T>(select: (s: UiState) => T): T {
  const cache = useRef<{ state: UiState | null; value: T }>({ state: null, value: undefined as T });
  const get = () => {
    const st = hub.state;
    if (cache.current.state === st) return cache.current.value;
    const v = select(st);
    if (cache.current.state !== null && shallowEqual(v, cache.current.value)) { cache.current.state = st; return cache.current.value; }
    cache.current = { state: st, value: v };
    return v;
  };
  return useSyncExternalStore(hub.subscribe, get);
}
export function useConnected() { return useSyncExternalStore(hub.subscribe, () => hub.connected); }

export function useHubEvent(type: string | string[], fn: (e: HubEvent) => void) {
  useEffect(() => hub.onEvent((e) => { if (Array.isArray(type) ? type.includes(e.type) : e.type === type) fn(e); }), [type, fn]);
}

/** A form field controlled by the hub, mirrored to every screen of the session. */
export function useField(form: string, field: string) {
  const value = useUi((s) => s.forms[form]?.[field] ?? '');
  return {
    value,
    onChange: (e: { target: { value: string } } | string) => hub.intent({ type: 'field.set', form, field, value: typeof e === 'string' ? e : e.target.value }),
    'data-nav-id': field,
  };
}
