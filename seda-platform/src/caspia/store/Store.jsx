import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { seed } from '../data/seed.js';
import { createBankApi } from '../bank/api.js';

// ---------------------------------------------------------------------------
// Global app state. Persisted in localStorage so the demo survives a refresh.
// All business logic lives in bank/api.js (the "mock core banking system").
// ---------------------------------------------------------------------------

const KEY = 'caspia-demo-state-v2';

const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sorted({ ...fresh(), ...JSON.parse(raw), session: { locked: !window.__CASPIA_EMBED } });
  } catch { /* storage unavailable */ }
  return fresh();
};

const sorted = (s) => ({ ...s, transactions: [...s.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)) });
const fresh = () => sorted({ ...seed(), pendingOps: {}, receipts: {}, session: { locked: typeof window === 'undefined' || !window.__CASPIA_EMBED }, toast: null });

function reducer(state, action) {
  switch (action.type) {
    case 'REPLACE': return action.state;
    case 'RESET': return { ...fresh(), session: { locked: false } };
    default: return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const ref = useRef(state);
  ref.current = state;

  // mutate(draft => { ... })  — simple immutable update helper
  const mutate = (fn) => {
    const draft = structuredClone(ref.current);
    fn(draft);
    draft.transactions.sort((a, b) => (a.date < b.date ? 1 : -1));
    ref.current = draft;
    dispatch({ type: 'REPLACE', state: draft });
    return draft;
  };
  const getState = () => ref.current;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const { session, toast, ...rest } = state;
        localStorage.setItem(KEY, JSON.stringify(rest));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => mutate((s) => { s.toast = null; }), 2800);
    return () => clearTimeout(t);
  }, [state.toast]); // eslint-disable-line

  const bank = useMemo(() => createBankApi({ getState, mutate }), []); // eslint-disable-line
  if (typeof window !== 'undefined') window.__caspiaMutate = mutate;
  const toast = (text, kind = 'ok') => mutate((s) => { s.toast = { text, kind, at: Date.now() }; });
  const reset = () => { try { localStorage.removeItem(KEY); } catch { /* */ } dispatch({ type: 'RESET' }); };

  return <Ctx.Provider value={{ state, mutate, getState, bank, toast, reset }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// ---------------- formatting helpers ----------------
export const money = (n, cur = 'AZN', { sign = false } = {}) => {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return `${s}${abs} ${cur}`;
};
export const last4 = (num) => String(num).slice(-4);
export const maskCard = (num) => `•••• ${last4(num)}`;
export const groupCard = (num) => String(num).replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
export const fmtDate = (iso, withTime = true) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return withTime ? `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : date;
};
export const fmtLongDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
