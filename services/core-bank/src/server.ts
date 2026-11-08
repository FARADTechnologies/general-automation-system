// Mock Core Bank HTTP server.
//  /internal/v3/*  internal API with deliberately internal names, service credential required
//  /app-api/v1/*   the bank app's own backend (masked values only), keyed by demo session
import express, { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CoreBank, BankError } from './bank.ts';
import { mountExtras } from './extras.ts';
import { mountAppExtras } from './app-extras.ts';

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const last4 = (s: string) => s.slice(-4);
const major = (minor: number) => Math.round(minor) / 100;

export function createCoreBankApp(opts: { serviceKey: string; bank?: CoreBank; kbDir?: string }) {
  const bank = opts.bank ?? new CoreBank();
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => { res.json({ ok: true, service: 'core-bank' }); });

  // ---------------- internal API ----------------
  const internal = express.Router();
  internal.use((req: Request, res: Response, next: NextFunction) => {
    const k = String(req.header('x-cb-svc-key') || '');
    if (!opts.serviceKey || !safeEq(k, opts.serviceKey)) { res.status(401).json({ rsn_cd: 'AUTH', rsn_txt: 'service credential required' }); return; }
    next();
  });

  internal.post('/v3/cust/rslv', (req, res) => { res.json({ cust_id: bank.resolve(String(req.body?.ext_ref || '')) }); });
  internal.get('/v3/cust/:cust/prfl', (req, res) => {
    const c = bank.cust(req.params.cust).data.cust;
    res.json({ ...c });
  });
  internal.get('/v3/cust/:cust/acct', (req, res) => {
    res.json({ items: bank.cust(req.params.cust).data.accts.map((a) => ({ ...a, avail_bal_minor: a.bal_minor })) });
  });
  internal.get('/v3/cust/:cust/crd', (req, res) => { res.json({ items: bank.cust(req.params.cust).data.crds }); });
  internal.get('/v3/cust/:cust/crd/:pan', (req, res) => {
    const card = bank.cust(req.params.cust).data.crds.find((x) => x.crd_pan === req.params.pan);
    if (!card) throw new BankError(404, 'CRD_NF', 'card not found');
    res.json(card);
  });
  internal.get('/v3/cust/:cust/txn', (req, res) => {
    const { frm_dt, to_dt, q, ctgry_cd, lmt, acct_no } = req.query as Record<string, string | undefined>;
    let items = bank.cust(req.params.cust).data.txns;
    if (frm_dt) items = items.filter((t) => t.bkg_dt >= frm_dt);
    if (to_dt) items = items.filter((t) => t.bkg_dt <= to_dt);
    if (acct_no) items = items.filter((t) => t.acct_no === acct_no);
    if (ctgry_cd) items = items.filter((t) => t.ctgry_cd === ctgry_cd);
    if (q) { const s = q.toLowerCase(); items = items.filter((t) => (t.mrch_nm + ' ' + (t.cntrpty_nm || '')).toLowerCase().includes(s)); }
    res.json({ items: items.slice(0, Math.min(Number(lmt) || 200, 500)), ttl_cnt: items.length });
  });
  internal.get('/v3/cust/:cust/bnfcry', (req, res) => {
    const q = String(req.query.q || '').toLowerCase().trim();
    let items = bank.cust(req.params.cust).data.bnfcry;
    // every query word must start a word of the name: "ali" finds Ali Mammadov, not Leyla Aliyeva
    const qw = q.split(/\s+/).filter(Boolean);
    if (qw.length) {
      const words = (nm: string) => nm.toLowerCase().split(/\s+/);
      const exact = items.filter((b) => qw.every((w) => words(b.bnfcry_nm).includes(w)));
      items = exact.length ? exact : items.filter((b) => qw.every((w) => words(b.bnfcry_nm).some((n) => n.startsWith(w))));
    }
    res.json({ items });
  });
  internal.get('/v3/cust/:cust/bll', (req, res) => {
    const sts = req.query.sts_cd as string | undefined;
    const items = bank.cust(req.params.cust).data.blls.filter((b) => !sts || b.bll_sts_cd === sts);
    res.json({ items });
  });
  internal.get('/v3/cust/:cust/sbscr', (req, res) => { res.json({ items: bank.cust(req.params.cust).data.sbscr }); });
  internal.get('/v3/cust/:cust/tmpl', (req, res) => { const d = bank.cust(req.params.cust).data; res.json({ items: d.tmpl.map((t) => ({ ...t, pye_nm: t.bnfcry_ref ? d.bnfcry.find((b) => b.bnfcry_ref === t.bnfcry_ref)?.bnfcry_nm : d.blrs.find((b) => b.blr_cd === t.blr_cd)?.blr_nm })) }); });
  internal.get('/v3/cust/:cust/blr', (req, res) => { res.json({ items: bank.cust(req.params.cust).data.blrs }); });
  internal.get('/v3/ref/brnch', (_req, res) => { res.json({ items: bank.cust(firstCust(bank)).data.brnch }); });
  internal.get('/v3/ref/fx', (_req, res) => { res.json({ items: bank.cust(firstCust(bank)).data.fx }); });

  internal.post('/v3/pmt/drft', async (req, res) => { res.status(201).json(await bank.createDraft(req.body || {})); });
  internal.get('/v3/pmt/:id', (req, res) => { res.json(bank.getDraft(req.params.id)); });
  internal.post('/v3/pmt/:id/post', async (req, res) => { res.json(await bank.postDraft(req.params.id)); });
  internal.post('/v3/pmt/:id/cncl', (req, res) => { res.json(bank.cancelDraft(req.params.id)); });

  internal.post('/v3/crd/chg_req', async (req, res) => { res.status(201).json(await bank.createCardChange(req.body || {})); });
  internal.get('/v3/crd/chg_req/:id', (req, res) => { res.json(bank.getCardChange(req.params.id)); });
  internal.post('/v3/crd/chg_req/:id/aply', async (req, res) => { res.json(await bank.applyCardChange(req.params.id)); });
  internal.post('/v3/crd/chg_req/:id/cncl', (req, res) => { res.json(bank.cancelCardChange(req.params.id)); });

  internal.post('/admin/rst', (req, res) => { res.json({ cust_id: bank.reset(String(req.body?.ext_ref || '')) }); });
  internal.post('/admin/set_bal', (req, res) => {
    const b = req.body || {};
    const a = bank.cust(bank.resolve(String(b.ext_ref))).data.accts[Number(b.acct_idx) || 0];
    a.bal_minor = Number(b.bal_minor);
    res.json({ ok: true });
  });
  internal.post('/admin/flt', (req, res) => {
    const b = req.body || {};
    bank.injectFault(bank.resolve(String(b.ext_ref)), { op: String(b.op), mode: b.mode === 'timeout' ? 'timeout' : 'error', cnt: Number(b.cnt) || 1 });
    res.json({ ok: true });
  });

  mountExtras(internal, bank, { kbDir: opts.kbDir });
  app.use('/internal', internal);

  // ---------------- app-facing API (the phone app's own backend) ----------------
  const appApi = express.Router();
  appApi.use((req, res, next) => {
    const s = String(req.header('x-demo-session') || req.query.s || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) { res.status(400).json({ error: 'session required' }); return; }
    (req as Request & { cust: string }).cust = bank.resolve(s);
    next();
  });
  const custOf = (req: Request) => bank.cust((req as Request & { cust: string }).cust).data;

  appApi.get('/summary', (req, res) => {
    const d = custOf(req);
    res.json({
      user: { firstName: d.cust.frst_nm, segment: d.cust.seg_cd === 'PRM' ? 'Premium' : 'Standard' },
      accounts: d.accts.map((a) => ({ id: 'acc-' + last4(a.acct_no), name: a.acct_nm, type: a.acct_typ_cd === 'SAV' ? 'savings' : 'current', currency: a.ccy, balance: major(a.bal_minor), last4: last4(a.acct_no) })),
      cards: d.crds.map((c) => ({ id: 'crd-' + last4(c.crd_pan), name: c.crd_nm, network: c.ntwrk_cd, last4: last4(c.crd_pan), status: c.crd_sts_cd === 'B' ? 'blocked' : 'active', virtual: c.vrtl_flg === 'Y', expiry: c.exp_dt, accountId: 'acc-' + last4(c.lnk_acct_no) })),
    });
  });
  appApi.get('/transactions', (req, res) => {
    const d = custOf(req);
    const q = String(req.query.q || '').toLowerCase();
    const items = d.txns.filter((t) => !q || (t.mrch_nm + ' ' + (t.cntrpty_nm || '')).toLowerCase().includes(q)).slice(0, Number(req.query.limit) || 60);
    res.json({ items: items.map((t) => ({ id: t.txn_ref, date: t.bkg_dt, title: t.mrch_nm, amount: major(t.amt_minor), currency: t.ccy, category: t.ctgry_cd, memo: t.txn_desc, accountId: 'acc-' + last4(t.acct_no) })) });
  });
  appApi.get('/contacts', (req, res) => {
    res.json({ items: custOf(req).bnfcry.map((b) => ({ id: b.bnfcry_ref, name: b.bnfcry_nm, phoneMasked: b.msisdn.slice(0, 4) + ' •• ••• •• ' + b.msisdn.slice(-2), cardLast4: last4(b.dst_pan) })) });
  });
  appApi.get('/bills', (req, res) => {
    res.json({ items: custOf(req).blls.map((b) => ({ id: b.bll_ref, biller: b.blr_nm, billerCode: b.blr_cd, subscriber: b.sbscr_no, amount: major(b.due_amt_minor), currency: b.ccy, status: b.bll_sts_cd === 'UNPD' ? 'unpaid' : 'paid', dueDate: b.due_dt })) });
  });
  appApi.get('/subscriptions', (req, res) => {
    res.json({ items: custOf(req).sbscr.map((s) => ({ id: s.sbscr_ref, merchant: s.mrch_nm, amount: major(s.amt_minor), currency: s.ccy, cardLast4: last4(s.crd_pan), nextCharge: s.nxt_chrg_dt, status: s.sts_cd === 'ACT' ? 'active' : 'cancelled' })) });
  });
  appApi.get('/templates', (req, res) => {
    const d = custOf(req);
    res.json({ items: d.tmpl.map((t) => ({ id: t.tmpl_ref, title: t.tmpl_nm, type: t.tmpl_typ, amount: major(t.amt_minor), currency: t.ccy, payee: t.bnfcry_ref ? d.bnfcry.find((b) => b.bnfcry_ref === t.bnfcry_ref)?.bnfcry_nm : d.blrs.find((b) => b.blr_cd === t.blr_cd)?.blr_nm })) });
  });
  mountAppExtras(appApi, bank, (req) => (req as Request & { cust: string }).cust);
  app.use('/app-api/v1', appApi);

  // ---------------- errors ----------------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BankError) { res.status(err.status).json({ rsn_cd: err.rsn_cd, rsn_txt: err.message }); return; }
    res.status(500).json({ rsn_cd: 'SYS', rsn_txt: 'internal error' });
  });

  return { app, bank };
}

function firstCust(bank: CoreBank): string {
  // Reference data is identical for every customer; serve it from a fixed reference customer.
  return bank.resolve('__ref__');
}
