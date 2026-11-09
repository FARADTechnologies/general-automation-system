// Compatibility layer for the designer's screens. Keeps the `useStore()` API they were written
// against, but core banking data (accounts, cards, contacts, transactions, bills, templates)
// now comes live from the bank app's backend. Products the bank does not expose yet (loans,
// deposits, cashback, offers) stay as static demo content. No business logic runs here.
import React, { createContext, useContext, useMemo, useReducer, useRef } from 'react';
import { seed } from '../data/seed.js';
import { useBank } from '../../runtime/bank.ts';
import { hub } from '../../runtime/hub.ts';

const CAT = { GROC: 'groceries', DINE: 'dining', TRNS: 'transport', SHOP: 'shopping', HLTH: 'health', SUBS: 'entertainment', ENTM: 'entertainment', UTIL: 'utilities', MOBL: 'mobile', P2P: 'transfers', OWN: 'exchange', SALR: 'income', INCM: 'income' };
const ACC_ID = { 'current:AZN': 'acc-azn', 'current:USD': 'acc-usd', 'savings:AZN': 'acc-sav' };
const CARD_STYLE = { '4417': ['card-debit', 'navy', 'Visa Gold'], '9026': ['card-usd', 'violet', 'Mastercard World'], '7731': ['card-virtual', 'mint', 'Visa Virtual'] };
const BILLER_ID = { AZERISHIQ: 'azerishiq', AZERSU: 'azersu', AZERIGAZ: 'azeriqaz', BAKCELL: 'bakcell', AZERCELL: 'azercell', NAR: 'nar', CITYNET: 'citynet' };
const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#64748b', '#0ea5e9'];
const masked = (last4) => '000000000000' + last4; // only the last four digits are ever known on the client

const STATIC = () => {
  const s = seed();
  // Billers keep their catalogue, but no invented debts: amounts due come only from the bank.
  for (const b of Object.values(s.billers)) { if (b.mode === 'debt') b.debt = 0; delete b.saved; }
  return {
    billerGroups: s.billerGroups, billers: s.billers, loans: s.loans, installments: s.installments, deposits: s.deposits,
    depositProducts: s.depositProducts, cashback: s.cashback, offers: s.offers, rates: s.rates, notifications: s.notifications,
    branches: s.branches, devices: s.devices, settings: s.settings,
    user: { firstName: '', lastName: 'Mammadli', phone: '+994 50 ••• •• 00', email: 'k•••@mail.demo', fin: '•••••••', birth: '••.••.1990', address: 'Baku', customerSince: '2019', segment: 'Premium' },
  };
};

function reducer(state, action) {
  if (action.type === 'REPLACE') return action.state;
  return state;
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [local, dispatch] = useReducer(reducer, undefined, () => ({ ...STATIC(), session: { locked: false }, toast: null, pendingOps: {}, receipts: {} }));
  const summary = useBank('summary');
  const txs = useBank('transactions', { limit: 120 });
  const contacts = useBank('contacts');
  const bills = useBank('bills');
  const templates = useBank('templates');
  const deposits = useBank('deposits');

  const state = useMemo(() => {
    const s = { ...local, billers: { ...local.billers } };
    if (deposits.data?.items) s.deposits = deposits.data.items; // the bank's own term deposits
    const sum = summary.data;
    if (sum) {
      s.user = { ...local.user, firstName: sum.user.firstName, segment: sum.user.segment };
      s.accounts = sum.accounts.map((a) => ({ id: ACC_ID[`${a.type}:${a.currency}`] || a.id, name: a.name, currency: a.currency, balance: a.balance, iban: `•••• ${a.last4}` }));
      const accIdOf = (appId) => { const a = sum.accounts.find((x) => x.id === appId); return a ? ACC_ID[`${a.type}:${a.currency}`] || a.id : null; };
      s.cards = sum.cards.map((c, i) => {
        const [id, style, product] = CARD_STYLE[c.last4] || [c.id, 'navy', c.network];
        return { id, name: c.name, product, network: c.network === 'MC' ? 'MASTERCARD' : c.network, accountId: accIdOf(c.accountId), number: masked(c.last4), holder: 'KAMAL MAMMADLI', expiry: c.expiry, cvv: '•••', style, frozen: c.status === 'blocked', primary: i === 0, virtual: c.virtual, limits: c.limits || { purchase: 2000, atm: 1000, online: 1500 }, online: c.online ?? true, contactless: c.contactless ?? !c.virtual, abroad: c.abroad ?? true };
      });
    } else { s.accounts = []; s.cards = []; }
    s.transactions = (txs.data?.items || []).map((t) => ({ id: t.id, title: t.title, category: CAT[t.category] || 'transfers', amount: t.amount, date: t.date, cardId: t.accountId?.endsWith('9026') || t.currency === 'USD' ? 'card-usd' : 'card-debit', memo: t.memo, currency: t.currency }));
    s.contacts = (contacts.data?.items || []).map((c, i) => ({ id: c.id, name: c.name, short: c.name.split(' ')[0], phone: c.phoneMasked, card: masked(c.cardLast4), color: COLORS[i % COLORS.length] }));
    for (const b of bills.data?.items || []) {
      const id = BILLER_ID[b.billerCode];
      if (!id || !s.billers[id]) continue;
      s.billers[id] = { ...s.billers[id], mode: 'debt', debt: b.status === 'unpaid' ? b.amount : 0, saved: b.subscriber, billId: b.id };
    }
    s.templates = (templates.data?.items || []).map((t) => ({ id: t.id, title: t.title, type: t.type === 'P2P' ? 'card' : 'bill', to: '', payee: t.payee, amount: t.amount || null, icon: t.title === 'Rent' ? 'home' : t.type === 'P2P' ? 'heart' : 'zap', billerId: t.type === 'P2P' ? null : 'bakcell' }));
    s.loading = summary.status === 'loading';
    s.loadError = summary.status === 'error';
    return s;
  }, [local, summary.data, txs.data, contacts.data, bills.data, templates.data, deposits.data, summary.status]);

  const ref = useRef(state);
  ref.current = state;
  const localRef = useRef(local);
  localRef.current = local;

  // Local, UI-only changes (settings, toasts, read flags). Changes to live bank data are ignored.
  const mutate = (fn) => {
    const draft = structuredClone({ ...localRef.current, accounts: [], cards: [], transactions: [], contacts: [], templates: [] });
    fn(draft);
    const { accounts, cards, transactions, contacts: c2, templates: t2, ...keep } = draft; // eslint-disable-line no-unused-vars
    localRef.current = keep;
    dispatch({ type: 'REPLACE', state: keep });
    return draft;
  };
  const toast = (text, kind = 'ok') => { mutate((s) => { s.toast = { text, kind, at: Date.now() }; }); setTimeout(() => mutate((s) => { s.toast = null; }), 2800); };
  const reset = () => { void hub.reset(); };

  const ASK = 'This step runs through the assistant in this demo. Try: "Send 25 manat to Rashad".';
  const bank = useMemo(() => ({
    lookupCard: async () => ({ ok: false, error: 'Card lookup is not connected in this demo.' }),
    lookupPhone: async () => ({ ok: false, error: 'Phone lookup is not connected in this demo.' }),
    lookupBill: async (billerId) => {
      const b = ref.current.billers[billerId];
      return b?.billId ? { ok: true, holder: `${ref.current.user.firstName} ${ref.current.user.lastName}`, debt: b.debt, mode: 'debt' } : { ok: false, error: 'No bill found for this account.' };
    },
    prepare: async () => ({ ok: false, error: ASK }),
    execute: async () => ({ ok: false, error: ASK }),
    cancel: () => undefined,
    setCard: () => toast('Ask the assistant to block or unblock a card, for example "Block my virtual card".', 'err'),
    setCardLimit: () => toast('Limit changes are not connected in this demo.', 'err'),
    toggleOffer: (id) => mutate((s) => { const o = s.offers.find((x) => x.id === id); if (o) o.active = !o.active; }),
    readAll: () => mutate((s) => { s.notifications.forEach((n) => { n.read = true; }); }),
    setSetting: (k, v) => mutate((s) => { s.settings[k] = v; }),
    saveTemplate: () => toast('Templates are read-only in this demo.', 'err'),
    removeDevice: (id) => mutate((s) => { s.devices = s.devices.filter((d) => d.id !== id); }),
    orderCard: () => toast('Card orders are not connected in this demo.', 'err'),
    convert: (amount, from, to) => {
      const rate = (code) => ref.current.rates.find((x) => x.code === code);
      if (from === to) return amount;
      if (from === 'AZN') return Math.round((amount / rate(to).sell) * 100) / 100;
      if (to === 'AZN') return Math.round(amount * rate(from).buy * 100) / 100;
      return Math.round(((amount * rate(from).buy) / rate(to).sell) * 100) / 100;
    },
    rateLabel: (from, to) => { const rate = (code) => ref.current.rates.find((x) => x.code === code); return from === 'AZN' ? `1 ${to} = ${rate(to).sell} AZN` : `1 ${from} = ${rate(from).buy} AZN`; },
    fundsOf: (c) => (c.accountId ? ref.current.accounts.find((a) => a.id === c.accountId)?.balance ?? 0 : c.available ?? 0),
    currencyOf: (c) => (c.accountId ? ref.current.accounts.find((a) => a.id === c.accountId)?.currency : c.currency) || 'AZN',
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ state, mutate, getState: () => ref.current, bank, toast, reset }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// ---------------- formatting helpers (unchanged API) ----------------
export const money = (n, cur = 'AZN', { sign = false } = {}) => {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return `${s}${abs} ${cur}`;
};
export const last4 = (num) => String(num).slice(-4);
export const maskCard = (num) => `•••• ${last4(num)}`;
export const groupCard = (num) => `•••• •••• •••• ${last4(num)}`;
export const fmtDate = (iso, withTime = true) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return withTime ? `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : date;
};
export const fmtLongDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
