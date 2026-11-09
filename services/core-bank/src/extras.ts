// Additional internal endpoints: two-phase operations, reporting aggregates, calculators,
// knowledge base search. Reporting is computed bank-side so the assistant never does arithmetic.
import type { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BankError, type CoreBank } from './bank.ts';
import { marketData, MARKET_LABEL } from './market.ts';

export function periodRange(code: string, now = new Date()): { frm: string; to: string } {
  const d = (x: Date) => x.toISOString();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const m = /^last_(\d+)_days$/.exec(code);
  if (m) return { frm: d(daysAgo(Number(m[1]))), to: d(now) };
  if (code === 'previous_30_days') return { frm: d(daysAgo(60)), to: d(daysAgo(30)) };
  if (code === 'previous_7_days') return { frm: d(daysAgo(14)), to: d(daysAgo(7)) };
  if (code === 'this_month') return { frm: d(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: d(now) };
  if (code === 'last_month') return { frm: d(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))), to: d(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1)) };
  throw new BankError(400, 'PRD_INV', 'unknown period');
}

// ---------- BM25 over the bank's knowledge base ----------
interface Doc { id: string; title: string; text: string; terms: string[] }
const STOP = new Set('a an the to of for in on at by and or is are be do does did i my me you your it its this that what how much many can will with from as about any there their our we us'.split(' '));
const stem = (w: string) => w.replace(/(ings|ing|edly|ed|es|s)$/, '').replace(/(.)\1$/, '$1') || w;
const tok = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9%\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
export function buildKb(dir: string): Doc[] {
  if (!existsSync(dir)) return [];
  const docs: Doc[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const src = readFileSync(join(dir, f), 'utf8');
    const title = (src.match(/^#\s+(.+)$/m)?.[1] || f).trim();
    src.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('# ')).forEach((p, i) => {
      docs.push({ id: `${f.replace(/\.md$/, '')}#${i + 1}`, title, text: p.replace(/^#+\s*/gm, ''), terms: tok(title + ' ' + p) });
    });
  }
  return docs;
}
export function searchKb(docs: Doc[], q: string, k = 3) {
  const qt = [...new Set(tok(q))];
  const N = docs.length || 1;
  const avg = docs.reduce((s, d) => s + d.terms.length, 0) / N;
  const df = new Map<string, number>();
  for (const t of qt) df.set(t, docs.filter((d) => d.terms.includes(t)).length);
  return docs.map((d) => {
    let score = 0;
    for (const t of qt) {
      const f = d.terms.filter((x) => x === t).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.terms.length / avg))));
    }
    return { d, score };
  }).filter((x) => x.score > 0.5).sort((a, b) => b.score - a.score).slice(0, k)
    .map(({ d, score }) => ({ doc_id: d.id, ttl: d.title, txt: d.text, scr: Math.round(score * 100) / 100 }));
}

export function mountExtras(internal: Router, bank: CoreBank, opts: { kbDir?: string }) {
  const kb = opts.kbDir ? buildKb(opts.kbDir) : [];

  // two-phase operations
  internal.post('/v3/pmt/btch', async (req, res) => { res.status(201).json(await bank.createOp('BTCH', req.body || {})); });
  internal.post('/v3/crd/rplc_req', async (req, res) => { res.status(201).json(await bank.createOp('RPLC', req.body || {})); });
  internal.post('/v3/crd/sttg_req', async (req, res) => { res.status(201).json(await bank.createOp('CSET', req.body || {})); });
  internal.post('/v3/loan/app_req', async (req, res) => { res.status(201).json(await bank.createOp('LOAN', req.body || {})); });
  internal.post('/v3/dpst/open_req', async (req, res) => { res.status(201).json(await bank.createOp('DPST', req.body || {})); });
  internal.get('/v3/cust/:cust/dpst', (req, res) => { res.json({ items: bank.cust(req.params.cust).dpst }); });
  internal.post('/v3/crd/new_req', async (req, res) => { res.status(201).json(await bank.createOp('NCRD', req.body || {})); });
  internal.post('/v3/crd/lmt_req', async (req, res) => { res.status(201).json(await bank.createOp('CLMT', req.body || {})); });
  internal.post('/v3/so/drft', async (req, res) => { res.status(201).json(await bank.createOp('SO', req.body || {})); });
  internal.post('/v3/rtp/drft', async (req, res) => { res.status(201).json(await bank.createOp('RTP', req.body || {})); });
  internal.post('/v3/sbscr/cncl_req', async (req, res) => { res.status(201).json(await bank.createOp('SBCN', req.body || {})); });
  internal.get('/v3/op/:id', (req, res) => { res.json(bank.getOp(req.params.id)); });
  internal.post('/v3/op/:id/aply', async (req, res) => { res.json(await bank.applyOp(req.params.id)); });
  internal.post('/v3/op/:id/cncl', (req, res) => { res.json(bank.cancelOp(req.params.id)); });

  // reporting
  const txnsIn = (cust: string, prd: string, ccy: string, dir: string) => {
    const { frm, to } = periodRange(prd);
    const items = bank.cust(cust).data.txns.filter((t) => t.bkg_dt >= frm && t.bkg_dt <= to && t.ccy === ccy && t.ctgry_cd !== 'OWN' && (dir === 'CR' ? t.amt_minor > 0 : t.amt_minor < 0));
    return { frm, to, items };
  };
  const group = (items: { amt_minor: number; ctgry_cd: string; cntrpty_nm: string | null; mrch_nm: string }[], grp: string) => {
    const by = new Map<string, { ttl_minor: number; cnt: number }>();
    for (const t of items) {
      const key = grp === 'cntrpty' ? (t.cntrpty_nm || t.mrch_nm) : grp === 'mrch' ? t.mrch_nm : t.ctgry_cd;
      const g = by.get(key) || { ttl_minor: 0, cnt: 0 };
      g.ttl_minor += Math.abs(t.amt_minor); g.cnt += 1;
      by.set(key, g);
    }
    return [...by.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.ttl_minor - a.ttl_minor);
  };
  internal.get('/v3/cust/:cust/txn/agg', (req, res) => {
    const q = req.query as Record<string, string>;
    const prd = q.prd || 'last_30_days';
    const { frm, to, items } = txnsIn(req.params.cust, prd, q.ccy || 'AZN', q.dir || 'DR');
    const groups = group(items, q.grp || 'ctgry');
    res.json({ prd_cd: prd, frm_dt: frm.slice(0, 10), to_dt: to.slice(0, 10), ccy: q.ccy || 'AZN', ttl_minor: groups.reduce((s, g) => s + g.ttl_minor, 0), items: groups.slice(0, Number(q.lmt) || 20) });
  });
  internal.get('/v3/cust/:cust/txn/cmp', (req, res) => {
    const q = req.query as Record<string, string>;
    const a = txnsIn(req.params.cust, q.prd_a || 'this_month', q.ccy || 'AZN', q.dir || 'DR');
    const b = txnsIn(req.params.cust, q.prd_b || 'last_month', q.ccy || 'AZN', q.dir || 'DR');
    const ga = group(a.items, q.grp || 'ctgry'); const gb = group(b.items, q.grp || 'ctgry');
    const keys = [...new Set([...ga.map((g) => g.key), ...gb.map((g) => g.key)])];
    const ta = ga.reduce((s, g) => s + g.ttl_minor, 0); const tb = gb.reduce((s, g) => s + g.ttl_minor, 0);
    const items = keys.map((k) => { const x = ga.find((g) => g.key === k)?.ttl_minor || 0; const y = gb.find((g) => g.key === k)?.ttl_minor || 0; return { key: k, a_minor: x, b_minor: y, diff_minor: x - y }; })
      .sort((p, r) => Math.abs(r.diff_minor) - Math.abs(p.diff_minor));
    res.json({ ccy: q.ccy || 'AZN', a: { prd_cd: q.prd_a || 'this_month', frm_dt: a.frm.slice(0, 10), to_dt: a.to.slice(0, 10), ttl_minor: ta }, b: { prd_cd: q.prd_b || 'last_month', frm_dt: b.frm.slice(0, 10), to_dt: b.to.slice(0, 10), ttl_minor: tb }, diff_minor: ta - tb, pct_chg: tb ? Math.round(((ta - tb) / tb) * 1000) / 10 : null, items: items.slice(0, Number(q.lmt) || 12) });
  });
  internal.get('/v3/cust/:cust/txn/top', (req, res) => {
    const q = req.query as Record<string, string>;
    const { frm, to, items } = txnsIn(req.params.cust, q.prd || 'last_30_days', q.ccy || 'AZN', 'DR');
    res.json({ frm_dt: frm.slice(0, 10), to_dt: to.slice(0, 10), items: [...items].sort((x, y) => x.amt_minor - y.amt_minor).slice(0, Math.min(Number(q.lmt) || 5, 20)) });
  });

  // simulated market data (never presented as live)
  internal.get('/v3/mkt/scrn', (req, res) => {
    const q = req.query as Record<string, string>;
    const key = q.prd === '1w' ? 'chg_1w' : q.prd === '1m' ? 'chg_1m' : 'chg_1d';
    let items = marketData().filter((m) => !q.sctr || m.sctr === q.sctr);
    if (q.dir === 'up') items = items.filter((m) => m[key] > 0);
    if (q.dir === 'down') items = items.filter((m) => m[key] < 0);
    items.sort((a, b) => (q.dir === 'down' ? a[key] - b[key] : b[key] - a[key]));
    res.json({ lbl: MARKET_LABEL, prd_cd: q.prd || '1d', items: items.slice(0, Math.min(Number(q.lmt) || 10, 40)) });
  });
  internal.get('/v3/mkt/qte', (req, res) => {
    const q = String(req.query.q || '').toLowerCase().trim();
    const items = marketData().filter((m) => q && (m.sym.toLowerCase() === q || m.nm.toLowerCase().includes(q)));
    res.json({ lbl: MARKET_LABEL, items });
  });
  internal.get('/v3/cust/:cust/pfl', (req, res) => {
    const mk = marketData();
    const items = bank.portfolio(req.params.cust).map((h) => {
      const m = mk.find((x) => x.sym === h.sym)!;
      const val = Math.round(h.qty * m.px_minor);
      return { sym: h.sym, nm: m.nm, sctr: m.sctr, qty: h.qty, px_minor: m.px_minor, val_minor: val, pnl_minor: val - Math.round(h.qty * h.avg_px_minor), chg_1d: m.chg_1d, ccy: m.ccy };
    });
    res.json({ lbl: MARKET_LABEL, ccy: 'USD', ttl_minor: items.reduce((s, x) => s + x.val_minor, 0), items });
  });
  internal.post('/v3/inv/ord', async (req, res) => { res.status(201).json(await bank.createOp('INV', req.body || {})); });

  // calculators
  internal.get('/v3/calc/split', (req, res) => {
    const amt = Number(req.query.amt_minor); const n = Number(req.query.n);
    if (!Number.isInteger(amt) || amt <= 0 || !Number.isInteger(n) || n < 2 || n > 20) throw new BankError(400, 'CALC_INV', 'amount and 2-20 people required');
    res.json({ ttl_minor: amt, n, shr_minor: Math.floor(amt / n), rmndr_minor: amt % n });
  });

  // reference data and knowledge base
  internal.get('/v3/cust/:cust/sbscr/:ref', (req, res) => {
    const s = bank.cust(req.params.cust).data.sbscr.find((x) => x.sbscr_ref === req.params.ref);
    if (!s) throw new BankError(404, 'SBSCR_NF', 'subscription not found');
    res.json(s);
  });
  internal.get('/v3/cust/:cust/brnch', (req, res) => { res.json({ items: bank.cust(req.params.cust).data.brnch }); });
  internal.get('/v3/cust/:cust/so', (req, res) => { res.json({ items: bank.standingOrders(req.params.cust) }); });
  internal.get('/v3/kb/srch', (req, res) => { res.json({ items: searchKb(kb, String(req.query.q || ''), Math.min(Number(req.query.lmt) || 3, 5)) }); });

  // evaluation oracle: business effects since the last reset
  internal.get('/admin/effects', (req, res) => { res.json({ items: bank.effects(bank.resolve(String(req.query.ext_ref || ''))) }); });
}
