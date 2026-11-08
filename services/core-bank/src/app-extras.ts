// Extra resources for the bank app's own backend (/app-api/v1), shaped for the screens:
// analytics, branches, simulated investments. All figures are calculated here, bank-side,
// and formatted for display; the client does no arithmetic on money.
import type { Router, Request } from 'express';
import type { CoreBank } from './bank.ts';
import { periodRange } from './extras.ts';
import { marketData, MARKET_LABEL } from './market.ts';

const CAT: Record<string, string> = { GROC: 'Groceries', DINE: 'Cafés & dining', TRNS: 'Transport', SHOP: 'Shopping', HLTH: 'Health', SUBS: 'Subscriptions', ENTM: 'Entertainment', UTIL: 'Utilities', MOBL: 'Mobile', P2P: 'Transfers to people', INVS: 'Investments', SALR: 'Salary', INCM: 'Other income' };
const fmt = (minor: number, ccy = 'AZN') => `${(Math.abs(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;
const pctText = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;
const days = (p: string) => (p === '7d' ? 7 : p === '90d' ? 90 : 30);

export function mountAppExtras(appApi: Router, bank: CoreBank, custOf: (req: Request) => string) {
  const window = (cust: string, from: number, to: number, dir: 'DR' | 'CR') => {
    const now = Date.now();
    const frm = new Date(now - from * 86400000).toISOString(), toIso = new Date(now - to * 86400000).toISOString();
    return bank.cust(cust).data.txns.filter((t) => t.bkg_dt >= frm && t.bkg_dt <= toIso && t.ccy === 'AZN' && t.ctgry_cd !== 'OWN' && (dir === 'CR' ? t.amt_minor > 0 : t.amt_minor < 0));
  };
  const byCat = (items: { ctgry_cd: string; amt_minor: number }[]) => {
    const m = new Map<string, number>();
    for (const t of items) m.set(t.ctgry_cd, (m.get(t.ctgry_cd) || 0) + Math.abs(t.amt_minor));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  appApi.get('/analytics.by_category', (req, res) => {
    const d = days(String(req.query.period));
    const cats = byCat(window(custOf(req), d, 0, 'DR'));
    const total = cats.reduce((s, [, v]) => s + v, 0);
    res.json({ total: fmt(total), items: cats.map(([k, v]) => ({ category: CAT[k] || k, amount: fmt(v), pct: total ? Math.round((v / total) * 100) : 0 })) });
  });

  appApi.get('/analytics.compare', (req, res) => {
    const d = days(String(req.query.period));
    const now = byCat(window(custOf(req), d, 0, 'DR')), before = byCat(window(custOf(req), 2 * d, d, 'DR'));
    const tn = now.reduce((s, [, v]) => s + v, 0), tb = before.reduce((s, [, v]) => s + v, 0);
    const keys = [...new Set([...now.map(([k]) => k), ...before.map(([k]) => k)])];
    const get = (l: [string, number][], k: string) => l.find(([x]) => x === k)?.[1] || 0;
    const max = Math.max(1, ...keys.map((k) => Math.max(get(now, k), get(before, k))));
    const change = tb ? ((tn - tb) / tb) * 100 : 0;
    res.json({
      summary: tb ? `${fmt(tn)} in the last ${d} days, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% from ${fmt(tb)} in the ${d} days before.` : `${fmt(tn)} in the last ${d} days.`,
      rows: keys.map((k) => ({ category: CAT[k] || k, now: fmt(get(now, k)), before: fmt(get(before, k)), nowPct: Math.round((get(now, k) / max) * 100), beforePct: Math.round((get(before, k) / max) * 100) }))
        .sort((a, b) => b.nowPct - a.nowPct).slice(0, 8),
    });
  });

  appApi.get('/analytics.top_expenses', (req, res) => {
    const items = [...window(custOf(req), days(String(req.query.period)), 0, 'DR')].sort((a, b) => a.amt_minor - b.amt_minor).slice(0, Math.min(Number(req.query.limit) || 5, 10));
    res.json(items.map((t) => ({ txId: t.txn_ref, title: t.mrch_nm, category: CAT[t.ctgry_cd] || t.ctgry_cd, date: t.bkg_dt.slice(0, 10), amount: fmt(t.amt_minor) })));
  });

  appApi.get('/analytics.income_sources', (req, res) => {
    const m = new Map<string, number>();
    for (const t of window(custOf(req), days(String(req.query.period)), 0, 'CR')) { const k = t.cntrpty_nm || t.mrch_nm; m.set(k, (m.get(k) || 0) + t.amt_minor); }
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    res.json({ total: fmt(total), items: [...m.entries()].sort((a, b) => b[1] - a[1]).map(([source, v]) => ({ source, amount: fmt(v), share: total ? Math.round((v / total) * 100) : 0 })) });
  });

  appApi.get('/branches', (req, res) => {
    res.json(bank.cust(custOf(req)).data.brnch.map((b) => ({ id: b.brnch_cd, name: b.brnch_nm, address: `${b.addr_txt}, ${b.city_nm}`, hours: b.hrs_txt })));
  });

  // ---- simulated investments ----
  const change = (x: number) => ({ pct: pctText(x), up: x >= 0 });
  const quote = (m: ReturnType<typeof marketData>[number]) => ({ symbol: m.sym, name: m.nm, type: 'Stock', sector: m.sctr, price: fmt(m.px_minor, m.ccy), change: { '1D': change(m.chg_1d), '1W': change(m.chg_1w), '1M': change(m.chg_1m) } });

  appApi.get('/portfolio', (req, res) => {
    const cust = custOf(req);
    const mk = marketData();
    const usd = bank.cust(cust).data.accts.find((a) => a.ccy === 'USD' && a.acct_typ_cd === 'CUR');
    let value = 0, dayMove = 0;
    const holdings = bank.portfolio(cust).map((h) => {
      const m = mk.find((x) => x.sym === h.sym)!;
      const val = Math.round(h.qty * m.px_minor), cost = Math.round(h.qty * h.avg_px_minor);
      value += val; dayMove += val - val / (1 + m.chg_1d / 100);
      const pl = val - cost;
      return { symbol: h.sym, name: m.nm, qty: `${h.qty} shares`, value: fmt(val, 'USD'), pl: { text: `${pl >= 0 ? '+' : '−'}${fmt(pl, 'USD')}`, up: pl >= 0 } };
    });
    const dayPct = value ? (dayMove / (value - dayMove)) * 100 : 0;
    res.json({ label: MARKET_LABEL, value: fmt(value, 'USD'), dayChange: { text: pctText(dayPct), up: dayPct >= 0 }, cash: usd ? fmt(usd.bal_minor, 'USD') : '—', holdings });
  });

  appApi.get('/market', (req, res) => {
    const s = String(req.query.sector || 'all');
    res.json(marketData().filter((m) => s === 'all' || m.sctr === s).map(quote));
  });

  appApi.get('/quote', (req, res) => {
    const m = marketData().find((x) => x.sym === String(req.query.symbol || '').toUpperCase());
    if (!m) { res.status(404).json({ error: 'unknown symbol' }); return; }
    // a deterministic 30-point path ending at today's price, normalised to 0..1 for the sparkline
    const pts: number[] = [];
    let v = 1;
    for (let i = 0; i < 30; i++) { v *= 1 + Math.sin(i * 1.7 + m.sym.charCodeAt(0)) * 0.012 + (m.chg_1m / 100) / 30; pts.push(v); }
    const lo = Math.min(...pts), hi = Math.max(...pts);
    const h = bank.portfolio(custOf(req)).find((x) => x.sym === m.sym);
    res.json({ ...quote(m), label: MARKET_LABEL, chart: pts.map((x) => (hi === lo ? 0.5 : (x - lo) / (hi - lo))), owned: h ? `${h.qty} shares` : undefined });
  });

  appApi.get('/invest.estimate', (req, res) => {
    const m = marketData().find((x) => x.sym === String(req.query.symbol || '').toUpperCase());
    const amt = Math.round(Number(req.query.amount) * 100);
    if (!m || !(amt > 0)) { res.json({ shares: '—', fee: '—' }); return; }
    res.json({ shares: `${Math.floor((amt / m.px_minor) * 10000) / 10000} shares`, fee: fmt(0, 'USD') });
  });
}
