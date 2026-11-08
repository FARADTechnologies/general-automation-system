// Seda platform state: flows, versions, the shared event log, coach settings.
// Every page reads the SAME event log, so Overview, Traces and Security never disagree.
import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { seedFlows } from './flowsSeed.js';

const KEY = 'seda-platform-v2';
const uid = (p) => p + Math.random().toString(36).slice(2, 8).toUpperCase();

const seedEvents = () => {
  // a little history so the dashboard is not empty on first open (marked as sample)
  const now = Date.now();
  const mk = (minsAgo, session, type, text, extra = {}) => ({ id: uid('E'), t: now - minsAgo * 60000, session, type, text, sample: true, ...extra });
  return [
    mk(190, 'S-SAMPLE1', 'voice', '“What is my balance?”', { source: 'voice' }), mk(190, 'S-SAMPLE1', 'intent', 'Check balance', { flow: 'f-balance' }), mk(190, 'S-SAMPLE1', 'result', 'Answered: total balance', { status: 'done' }),
    mk(120, 'S-SAMPLE2', 'voice', '“Pay my electricity bill”', { source: 'voice' }), mk(120, 'S-SAMPLE2', 'intent', 'Pay utility bills', { flow: 'f-bills' }), mk(119, 'S-SAMPLE2', 'mcp', 'lookup_bill(azerishiq)', { ms: 210 }), mk(119, 'S-SAMPLE2', 'fingerprint', 'Fingerprint verified'), mk(119, 'S-SAMPLE2', 'result', 'Paid 19.80 AZN to Azərişıq', { status: 'done' }),
    mk(64, 'S-SAMPLE3', 'voice', '“Send 900 manat to Elvin”', { source: 'voice' }), mk(64, 'S-SAMPLE3', 'intent', 'Send money to a contact', { flow: 'f-transfer' }), mk(64, 'S-SAMPLE3', 'blocked', 'Over voice limit: 900 > 500 AZN per payment', { status: 'blocked' }),
  ];
};

const fresh = () => ({
  flows: seedFlows(),
  events: seedEvents(),
  versions: [{ id: 'v3', n: 3, title: 'Transfer limit set to 500 AZN', by: 'Rashad (Risk)', at: Date.now() - 3 * 86400000, changes: ['f-transfer.limits.perPayment: 1000 → 500'] },
    { id: 'v2', n: 2, title: 'Money Coach rules updated', by: 'Leyla (Product)', at: Date.now() - 4 * 86400000, changes: ['f-coach.rules: added emergency fund rule'] },
    { id: 'v1', n: 1, title: 'Initial setup', by: 'Seda onboarding', at: Date.now() - 7 * 86400000, changes: ['6 flows created'] }],
  reminders: [],
  coach: {
    rules: { debtFirst: true, emergencyFund: true, deposits: true, investments: false },
    emergencyMonths: 3,
    products: { dp1: true, dp2: true, dp3: true },
    disclaimer: 'This is general information about Caspia Bank products, not personal investment advice. Past rates do not guarantee future returns.',
  },
  user: null,
  env: 'test',
});

const load = () => {
  try { const r = localStorage.getItem(KEY); if (r) return { ...fresh(), ...JSON.parse(r) }; } catch { /* */ }
  return fresh();
};

const Ctx = createContext(null);

export function SedaProvider({ children }) {
  const [state, setState] = useReducer((_, s) => s, undefined, load);
  const ref = useRef(state);
  ref.current = state;
  const mutate = (fn) => { const d = structuredClone(ref.current); fn(d); ref.current = d; setState(d); return d; };
  const getState = () => ref.current;

  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* */ } }, 300); return () => clearTimeout(t); }, [state]);

  // the event bus used by the engine (outside React)
  useEffect(() => {
    window.__seda = {
      log: (e) => mutate((s) => { s.events.push({ id: uid('E'), t: Date.now(), ...e }); if (s.events.length > 600) s.events.splice(0, s.events.length - 600); }),
      getState,
      mutate,
    };
  }, []); // eslint-disable-line

  const reset = () => { try { localStorage.removeItem(KEY); } catch { /* */ } setState(fresh()); ref.current = fresh(); };
  return <Ctx.Provider value={{ state, mutate, getState, reset }}>{children}</Ctx.Provider>;
}

export const useSeda = () => useContext(Ctx);
export const newId = uid;

// group events into sessions (newest first)
export function sessionsOf(events) {
  const map = new Map();
  events.forEach((e) => {
    if (!map.has(e.session)) map.set(e.session, { id: e.session, events: [], start: e.t });
    const s = map.get(e.session);
    s.events.push(e);
  });
  return [...map.values()].map((s) => {
    const ev = s.events;
    const res = [...ev].reverse().find((e) => ['result', 'blocked', 'cancelled', 'error', 'no_flow'].includes(e.type));
    const intent = ev.find((e) => e.type === 'intent');
    const voice = ev.find((e) => e.type === 'voice');
    return {
      ...s, end: ev[ev.length - 1].t,
      status: res ? (res.type === 'result' ? 'done' : res.type) : ev.some((e) => e.type === 'voice') ? (Date.now() - ev[ev.length - 1].t > 180000 ? 'error' : 'running') : 'draft',
      title: voice ? voice.text : intent ? intent.text : ev[0].text,
      flow: intent?.flow, flowName: intent?.text, sample: ev[0].sample,
      source: voice?.source || ev[0].source || 'app',
    };
  }).sort((a, b) => b.start - a.start);
}
