// In-memory mock core bank. One isolated customer per demo session.
import { randomBytes } from 'node:crypto';
import { seedCustomer, type CustomerData } from './seed.ts';
import { marketData, seedPortfolio, type Holding } from './market.ts';

export interface Drft {
  drft_id: string; cust_id: string; dst_typ_cd: 'BNF' | 'PAN' | 'ACCT' | 'BLL' | 'TOPUP' | 'MSISDN';
  src_acct_no: string; dst_ref: string; dst_nm: string; amt_minor: number; fee_minor: number; ccy: string;
  chnl_cd: string; idmp_key: string; sts_cd: 'DRFT' | 'POSTED' | 'CNCL' | 'RJCT'; crt_ts: string; pst_ts: string | null; txn_ref: string | null; rsn_cd: string | null;
}
export interface CrdChgReq { req_id: string; cust_id: string; crd_pan: string; new_sts_cd: 'A' | 'B'; rsn_cd: string; idmp_key: string; sts_cd: 'PEND' | 'APLD' | 'CNCL' }
export interface Fault { op: string; mode: 'error' | 'timeout'; cnt: number }
/** Business effects journal, used by the evaluation oracle to compare outcomes. */
export type Effect = Record<string, string | number>;
/** Generic two-phase operation: created pending, applied on confirmation. */
export interface Op { op_id: string; cust_id: string; knd: 'BTCH' | 'RPLC' | 'SO' | 'RTP' | 'SBCN' | 'INV'; sts_cd: 'PEND' | 'DONE' | 'CNCL' | 'RJCT'; idmp_key: string; crt_ts: string; data: Record<string, any> }

interface Customer { cust_id: string; ext_ref: string; data: CustomerData; drfts: Map<string, Drft>; chg: Map<string, CrdChgReq>; ops: Map<string, Op>; faults: Fault[]; journal: Effect[]; so: any[]; rtp: any[]; rplc: any[]; pfl: Holding[] }

export class BankError extends Error {
  constructor(public status: number, public rsn_cd: string, msg: string) { super(msg); }
}

const id = (p: string) => p + randomBytes(5).toString('hex').toUpperCase();
const OWN_BIN = '4169';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** First payment of a standing order, from what the customer said: a weekday (strt_wkdy), a day
 *  of the month (strt_dom, optionally with a month strt_mon), or an explicit date (strt_dt).
 *  The bank works out the date; the earliest is tomorrow (Baku time), the latest a year ahead. */
export function firstPaymentDate(body: Record<string, unknown>, now = Date.now()): string {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const today = Date.parse(day(now + 4 * 3600_000) + 'T00:00:00Z'); // Baku is UTC+4
  const tomorrow = today + 86400_000;
  const latest = today + 366 * 86400_000;
  const search = (ok: (d: Date) => boolean, what: string) => {
    for (let t = tomorrow; t <= latest; t += 86400_000) if (ok(new Date(t))) return day(t);
    throw new BankError(422, 'STRT_INV', `no ${what} within the next year`);
  };
  if (body.strt_dt) {
    const s = String(body.strt_dt);
    const t = Date.parse(s + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(t) || t < tomorrow || t > latest) throw new BankError(422, 'STRT_INV', 'the first payment must be between tomorrow and one year ahead');
    return s;
  }
  if (body.strt_dom !== undefined && body.strt_dom !== '') {
    const dom = Number(body.strt_dom);
    const mon = body.strt_mon !== undefined && body.strt_mon !== '' ? Number(body.strt_mon) : null;
    if (!Number.isInteger(dom) || dom < 1 || dom > 28) throw new BankError(422, 'STRT_INV', 'day of the month must be 1 to 28');
    if (mon !== null && (!Number.isInteger(mon) || mon < 1 || mon > 12)) throw new BankError(422, 'STRT_INV', 'month must be 1 to 12');
    return search((d) => d.getUTCDate() === dom && (mon === null || d.getUTCMonth() + 1 === mon), 'such date');
  }
  if (body.strt_wkdy) {
    const i = WEEKDAYS.indexOf(String(body.strt_wkdy).slice(0, 3).toUpperCase());
    if (i < 0) throw new BankError(422, 'STRT_INV', 'unknown weekday');
    return search((d) => d.getUTCDay() === i, 'such weekday');
  }
  return day(tomorrow);
}

export class CoreBank {
  private byCust = new Map<string, Customer>();
  private byExt = new Map<string, string>();

  resolve(ext_ref: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ext_ref)) throw new BankError(400, 'BAD_REF', 'invalid ext_ref');
    const existing = this.byExt.get(ext_ref);
    if (existing) return existing;
    const cust_id = 'C' + randomBytes(6).toString('hex').toUpperCase();
    this.byCust.set(cust_id, { cust_id, ext_ref, data: seedCustomer(), drfts: new Map(), chg: new Map(), ops: new Map(), faults: [], journal: [], so: [], rtp: [], rplc: [], pfl: seedPortfolio() });
    this.byExt.set(ext_ref, cust_id);
    return cust_id;
  }

  reset(ext_ref: string): string {
    const cust_id = this.resolve(ext_ref);
    const c = this.byCust.get(cust_id)!;
    c.data = seedCustomer(); c.drfts.clear(); c.chg.clear(); c.ops.clear(); c.faults = []; c.journal = []; c.so = []; c.rtp = []; c.rplc = []; c.pfl = seedPortfolio();
    return cust_id;
  }

  cust(cust_id: string): Customer {
    const c = this.byCust.get(cust_id);
    if (!c) throw new BankError(404, 'CUST_NF', 'customer not found');
    return c;
  }

  injectFault(cust_id: string, f: Fault) { this.cust(cust_id).faults.push(f); }

  private async maybeFault(c: Customer, op: string) {
    const f = c.faults.find((x) => x.op === op && x.cnt > 0);
    if (!f) return;
    f.cnt -= 1;
    if (f.mode === 'timeout') await new Promise((r) => setTimeout(r, 8000));
    throw new BankError(503, 'FAULT', `injected fault on ${op}`);
  }

  // ---------- payments ----------
  async createDraft(body: Record<string, unknown>): Promise<Drft> {
    const c = this.cust(String(body.cust_id));
    await this.maybeFault(c, 'pmt.drft');
    const idmp = String(body.idmp_key || '');
    if (!idmp) throw new BankError(400, 'IDMP_REQ', 'idmp_key required');
    const dup = [...c.drfts.values()].find((d) => d.idmp_key === idmp);
    if (dup) return dup;

    const amt = Number(body.amt_minor);
    if (!Number.isInteger(amt) || amt <= 0) throw new BankError(400, 'AMT_INV', 'amt_minor must be a positive integer');
    const ccy = String(body.ccy);
    const src = c.data.accts.find((a) => a.acct_no === body.src_acct_no);
    if (!src) throw new BankError(404, 'ACCT_NF', 'source account not found');
    if (src.ccy !== ccy) throw new BankError(422, 'CCY_MISMATCH', `source account is ${src.ccy}`);

    const typ = String(body.dst_typ_cd) as Drft['dst_typ_cd'];
    const ref = String(body.dst_ref);
    let dst_nm = '';
    let fee = 0;
    switch (typ) {
      case 'BNF': {
        const b = c.data.bnfcry.find((x) => x.bnfcry_ref === ref);
        if (!b) throw new BankError(404, 'BNF_NF', 'beneficiary not found');
        dst_nm = b.bnfcry_nm;
        fee = b.dst_pan.startsWith(OWN_BIN) ? 0 : Math.max(30, Math.round(amt * 0.005));
        break;
      }
      case 'PAN': {
        if (!/^\d{16}$/.test(ref)) throw new BankError(400, 'PAN_INV', 'invalid card number');
        const b = c.data.bnfcry.find((x) => x.dst_pan === ref);
        dst_nm = b ? b.bnfcry_nm : 'Card holder';
        fee = ref.startsWith(OWN_BIN) ? 0 : Math.max(30, Math.round(amt * 0.005));
        break;
      }
      case 'MSISDN': {
        const digits = ref.replace(/\D/g, '');
        const b = digits.length >= 9 ? c.data.bnfcry.find((x) => x.msisdn.replace(/\D/g, '').endsWith(digits.slice(-9))) : undefined;
        if (!b) throw new BankError(404, 'MSISDN_NF', 'no Caspia customer with this number');
        dst_nm = b.bnfcry_nm;
        break;
      }
      case 'ACCT': {
        const a = c.data.accts.find((x) => x.acct_no === ref);
        if (!a) throw new BankError(404, 'ACCT_NF', 'destination account not found');
        if (a.acct_no === src.acct_no) throw new BankError(422, 'SAME_ACCT', 'source and destination are the same');
        if (a.ccy !== src.ccy) throw new BankError(422, 'CCY_MISMATCH', 'cross-currency transfer not supported on this endpoint');
        dst_nm = a.acct_nm;
        break;
      }
      case 'BLL': {
        const b = c.data.blls.find((x) => x.bll_ref === ref);
        if (!b) throw new BankError(404, 'BLL_NF', 'bill not found');
        if (b.bll_sts_cd !== 'UNPD') throw new BankError(422, 'BLL_PAID', 'bill already paid');
        if (amt !== b.due_amt_minor) throw new BankError(422, 'AMT_MISMATCH', 'amount must equal the amount due');
        dst_nm = b.blr_nm;
        break;
      }
      case 'TOPUP': {
        const [blr, num] = ref.split(':');
        const b = c.data.blrs.find((x) => x.blr_cd === blr && x.blr_grp === 'MOBILE');
        if (!b || !/^0\d{9}$/.test(num || '')) throw new BankError(400, 'TOPUP_INV', 'invalid operator or number');
        dst_nm = b.blr_nm;
        break;
      }
      default:
        throw new BankError(400, 'DST_TYP_INV', 'unknown dst_typ_cd');
    }
    if (amt + fee > src.bal_minor) throw new BankError(422, 'NSF', 'insufficient funds');

    const d: Drft = {
      drft_id: id('DR'), cust_id: c.cust_id, dst_typ_cd: typ, src_acct_no: src.acct_no, dst_ref: ref, dst_nm,
      amt_minor: amt, fee_minor: fee, ccy, chnl_cd: String(body.chnl_cd || 'UNK'), idmp_key: idmp,
      sts_cd: 'DRFT', crt_ts: new Date().toISOString(), pst_ts: null, txn_ref: null, rsn_cd: null,
    };
    c.drfts.set(d.drft_id, d);
    return d;
  }

  getDraft(drft_id: string): Drft {
    for (const c of this.byCust.values()) { const d = c.drfts.get(drft_id); if (d) return d; }
    throw new BankError(404, 'DRFT_NF', 'draft not found');
  }

  cancelDraft(drft_id: string): Drft {
    const d = this.getDraft(drft_id);
    if (d.sts_cd === 'DRFT') d.sts_cd = 'CNCL';
    return d;
  }

  async postDraft(drft_id: string): Promise<Drft> {
    const d = this.getDraft(drft_id);
    if (d.sts_cd === 'POSTED') return d; // idempotent
    if (d.sts_cd !== 'DRFT') throw new BankError(409, 'DRFT_STATE', `draft is ${d.sts_cd}`);
    const c = this.cust(d.cust_id);
    await this.maybeFault(c, 'pmt.post');
    const src = c.data.accts.find((a) => a.acct_no === d.src_acct_no)!;
    if (d.amt_minor + d.fee_minor > src.bal_minor) { d.sts_cd = 'RJCT'; d.rsn_cd = 'NSF'; throw new BankError(422, 'NSF', 'insufficient funds'); }
    if (d.dst_typ_cd === 'BLL') {
      const b = c.data.blls.find((x) => x.bll_ref === d.dst_ref)!;
      if (b.bll_sts_cd !== 'UNPD') { d.sts_cd = 'RJCT'; d.rsn_cd = 'BLL_PAID'; throw new BankError(422, 'BLL_PAID', 'bill already paid'); }
      b.bll_sts_cd = 'PAID';
    }
    src.bal_minor -= d.amt_minor + d.fee_minor;
    let ctg = 'P2P';
    let mrch = `Transfer to ${d.dst_nm}`;
    if (d.dst_typ_cd === 'ACCT') { const a = c.data.accts.find((x) => x.acct_no === d.dst_ref)!; a.bal_minor += d.amt_minor; ctg = 'OWN'; mrch = `To ${a.acct_nm}`; }
    if (d.dst_typ_cd === 'BNF') { const b = c.data.bnfcry.find((x) => x.bnfcry_ref === d.dst_ref); if (b && !b.frst_pmt_dt) b.frst_pmt_dt = new Date().toISOString(); }
    if (d.dst_typ_cd === 'BLL') { ctg = 'UTIL'; mrch = d.dst_nm; }
    if (d.dst_typ_cd === 'TOPUP') { ctg = 'MOBL'; mrch = `${d.dst_nm} top-up`; }
    const txn_ref = id('TXN');
    c.data.txns.unshift({
      txn_ref, acct_no: src.acct_no, bkg_dt: new Date().toISOString(), amt_minor: -(d.amt_minor + d.fee_minor), ccy: d.ccy,
      mrch_nm: mrch, txn_desc: '', ctgry_cd: ctg, crd_pan: null, cntrpty_nm: d.dst_typ_cd === 'BNF' || d.dst_typ_cd === 'PAN' ? d.dst_nm : null,
    });
    d.sts_cd = 'POSTED'; d.pst_ts = new Date().toISOString(); d.txn_ref = txn_ref;
    const amount = d.amt_minor / 100;
    if (d.dst_typ_cd === 'BLL') c.journal.push({ type: 'bill_paid', biller: d.dst_nm });
    else if (d.dst_typ_cd === 'TOPUP') c.journal.push({ type: 'topup', operator: d.dst_nm, amount });
    else if (d.dst_typ_cd === 'ACCT') c.journal.push({ type: 'transfer', to: 'own:' + d.dst_nm, amount, currency: d.ccy });
    else if (d.dst_typ_cd === 'PAN') c.journal.push({ type: 'transfer', to: c.data.bnfcry.some((b) => b.dst_pan === d.dst_ref) ? d.dst_nm : 'card:' + d.dst_ref.slice(-4), amount, currency: d.ccy });
    else c.journal.push({ type: 'transfer', to: d.dst_nm, amount, currency: d.ccy });
    return d;
  }

  // ---------- card status ----------
  async createCardChange(body: Record<string, unknown>): Promise<CrdChgReq> {
    const c = this.cust(String(body.cust_id));
    await this.maybeFault(c, 'crd.chg');
    const idmp = String(body.idmp_key || '');
    if (!idmp) throw new BankError(400, 'IDMP_REQ', 'idmp_key required');
    const dup = [...c.chg.values()].find((r) => r.idmp_key === idmp);
    if (dup) return dup;
    const card = c.data.crds.find((x) => x.crd_pan === body.crd_pan);
    if (!card) throw new BankError(404, 'CRD_NF', 'card not found');
    const to = String(body.new_sts_cd) as 'A' | 'B';
    if (to !== 'A' && to !== 'B') throw new BankError(400, 'STS_INV', 'new_sts_cd must be A or B');
    if (card.crd_sts_cd === to) throw new BankError(422, 'CRD_STS_SAME', to === 'B' ? 'card already blocked' : 'card already active');
    const r: CrdChgReq = { req_id: id('CR'), cust_id: c.cust_id, crd_pan: card.crd_pan, new_sts_cd: to, rsn_cd: String(body.rsn_cd || 'CUST'), idmp_key: idmp, sts_cd: 'PEND' };
    c.chg.set(r.req_id, r);
    return r;
  }

  getCardChange(req_id: string): CrdChgReq {
    for (const c of this.byCust.values()) { const r = c.chg.get(req_id); if (r) return r; }
    throw new BankError(404, 'REQ_NF', 'request not found');
  }

  async applyCardChange(req_id: string): Promise<CrdChgReq & { crd_sts_cd: string }> {
    const r = this.getCardChange(req_id);
    const c = this.cust(r.cust_id);
    const card = c.data.crds.find((x) => x.crd_pan === r.crd_pan)!;
    if (r.sts_cd === 'PEND') {
      await this.maybeFault(c, 'crd.aply');
      card.crd_sts_cd = r.new_sts_cd;
      r.sts_cd = 'APLD';
      c.journal.push({ type: r.new_sts_cd === 'B' ? 'card_blocked' : 'card_unblocked', last4: card.crd_pan.slice(-4) });
    }
    return { ...r, crd_sts_cd: card.crd_sts_cd };
  }

  cancelCardChange(req_id: string) { const r = this.getCardChange(req_id); if (r.sts_cd === 'PEND') r.sts_cd = 'CNCL'; return r; }

  effects(cust_id: string) { return this.cust(cust_id).journal; }
  standingOrders(cust_id: string) { return this.cust(cust_id).so; }
  paymentRequests(cust_id: string) { return this.cust(cust_id).rtp; }
  portfolio(cust_id: string) { return this.cust(cust_id).pfl; }

  // ---------- generic two-phase operations ----------
  async createOp(knd: Op['knd'], body: Record<string, any>): Promise<Op> {
    const c = this.cust(String(body.cust_id));
    await this.maybeFault(c, 'op.' + knd.toLowerCase());
    const idmp = String(body.idmp_key || '');
    if (!idmp) throw new BankError(400, 'IDMP_REQ', 'idmp_key required');
    const dup = [...c.ops.values()].find((o) => o.idmp_key === idmp);
    if (dup) return dup;
    let data: Record<string, any> = {};
    const acct = (no: string) => { const a = c.data.accts.find((x) => x.acct_no === no); if (!a) throw new BankError(404, 'ACCT_NF', 'account not found'); return a; };
    const bnf = (ref: string) => { const b = c.data.bnfcry.find((x) => x.bnfcry_ref === ref); if (!b) throw new BankError(404, 'BNF_NF', 'beneficiary not found'); return b; };
    switch (knd) {
      case 'BTCH': {
        const src = acct(String(body.src_acct_no));
        const unpaid = c.data.blls.filter((b) => b.bll_sts_cd === 'UNPD' && (!Array.isArray(body.bll_refs) || body.bll_refs.includes(b.bll_ref)));
        if (!unpaid.length) throw new BankError(422, 'NO_UNPAID', 'no unpaid bills');
        if (unpaid.some((b) => b.ccy !== src.ccy)) throw new BankError(422, 'CCY_MISMATCH', 'bill currency differs from the account');
        const ttl = unpaid.reduce((s, b) => s + b.due_amt_minor, 0);
        if (ttl > src.bal_minor) throw new BankError(422, 'NSF', 'insufficient funds');
        data = { src_acct_no: src.acct_no, items: unpaid.map((b) => ({ bll_ref: b.bll_ref, blr_nm: b.blr_nm, amt_minor: b.due_amt_minor })), ttl_minor: ttl, ccy: src.ccy, itm_cnt: unpaid.length, blr_list: unpaid.map((b) => `${b.blr_nm} ${(b.due_amt_minor / 100).toFixed(2)}`).join(', ') };
        break;
      }
      case 'RPLC': {
        const card = c.data.crds.find((x) => x.crd_pan === body.crd_pan);
        if (!card) throw new BankError(404, 'CRD_NF', 'card not found');
        if (card.vrtl_flg === 'Y') throw new BankError(422, 'VIRTUAL', 'virtual cards are not delivered to a branch');
        const br = c.data.brnch.find((x) => x.brnch_cd === body.brnch_cd);
        if (!br) throw new BankError(404, 'BRNCH_NF', 'branch not found');
        data = { crd_pan: card.crd_pan, crd_nm: card.crd_nm, brnch_cd: br.brnch_cd, brnch_nm: br.brnch_nm, rdy_dt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), fee_minor: 0 };
        break;
      }
      case 'SO': {
        const src = acct(String(body.src_acct_no));
        const b = bnf(String(body.bnfcry_ref));
        const amt = Number(body.amt_minor);
        if (!Number.isInteger(amt) || amt <= 0) throw new BankError(400, 'AMT_INV', 'invalid amount');
        if (src.ccy !== body.ccy) throw new BankError(422, 'CCY_MISMATCH', 'currency differs from the account');
        const freq = body.freq_cd === 'W' ? 'W' : 'M';
        const strt = firstPaymentDate(body);
        const lbl = new Date(strt + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        data = { src_acct_no: src.acct_no, bnfcry_ref: b.bnfcry_ref, bnfcry_nm: b.bnfcry_nm, amt_minor: amt, ccy: src.ccy, freq_cd: freq, strt_dt: strt, strt_lbl: lbl };
        break;
      }
      case 'RTP': {
        const refs: string[] = Array.isArray(body.bnfcry_refs) ? body.bnfcry_refs.filter(Boolean) : [];
        if (!refs.length || refs.length > 10) throw new BankError(400, 'RTP_INV', 'one to ten contacts');
        const amt = Number(body.amt_minor);
        if (!Number.isInteger(amt) || amt <= 0) throw new BankError(400, 'AMT_INV', 'invalid amount');
        const items = refs.map((r) => ({ bnfcry_ref: r, bnfcry_nm: bnf(r).bnfcry_nm, amt_minor: amt }));
        data = { items, ccy: String(body.ccy || 'AZN'), note: String(body.note || '').slice(0, 80), who: items.map((i) => i.bnfcry_nm).join(', ') };
        break;
      }
      case 'INV': {
        const src = acct(String(body.src_acct_no));
        const ins = marketData().find((m) => m.sym === body.sym);
        if (!ins) throw new BankError(404, 'SYM_NF', 'instrument not found');
        const amt = Number(body.amt_minor);
        if (!Number.isInteger(amt) || amt <= 0) throw new BankError(400, 'AMT_INV', 'invalid amount');
        if (src.ccy !== ins.ccy) throw new BankError(422, 'CCY_MISMATCH', 'orders are paid from the USD account');
        if (amt > src.bal_minor) throw new BankError(422, 'NSF', 'insufficient funds');
        const qty = Math.floor((amt / ins.px_minor) * 10000) / 10000;
        data = { src_acct_no: src.acct_no, sym: ins.sym, nm: ins.nm, amt_minor: amt, ccy: ins.ccy, px_minor: ins.px_minor, est_qty: qty, side: 'BUY', lbl: 'Simulated market data' };
        break;
      }
      case 'SBCN': {
        const s = c.data.sbscr.find((x) => x.sbscr_ref === body.sbscr_ref);
        if (!s) throw new BankError(404, 'SBSCR_NF', 'subscription not found');
        if (s.sts_cd !== 'ACT') throw new BankError(422, 'SBSCR_INACTIVE', 'subscription already cancelled');
        data = { sbscr_ref: s.sbscr_ref, mrch_nm: s.mrch_nm, amt_minor: s.amt_minor, ccy: s.ccy, nxt_chrg_dt: s.nxt_chrg_dt };
        break;
      }
    }
    const op: Op = { op_id: id('OP'), cust_id: c.cust_id, knd, sts_cd: 'PEND', idmp_key: idmp, crt_ts: new Date().toISOString(), data };
    c.ops.set(op.op_id, op);
    return op;
  }

  getOp(op_id: string): Op {
    for (const c of this.byCust.values()) { const o = c.ops.get(op_id); if (o) return o; }
    throw new BankError(404, 'OP_NF', 'operation not found');
  }

  cancelOp(op_id: string): Op { const o = this.getOp(op_id); if (o.sts_cd === 'PEND') o.sts_cd = 'CNCL'; return o; }

  async applyOp(op_id: string): Promise<Op> {
    const o = this.getOp(op_id);
    if (o.sts_cd === 'DONE') return o;
    if (o.sts_cd !== 'PEND') throw new BankError(409, 'OP_STATE', 'operation is ' + o.sts_cd);
    const c = this.cust(o.cust_id);
    await this.maybeFault(c, 'op.apply');
    const d = o.data;
    switch (o.knd) {
      case 'BTCH': {
        const src = c.data.accts.find((a) => a.acct_no === d.src_acct_no)!;
        const bills = d.items.map((it: any) => c.data.blls.find((b) => b.bll_ref === it.bll_ref)!);
        if (bills.some((b: any) => b.bll_sts_cd !== 'UNPD')) { o.sts_cd = 'RJCT'; throw new BankError(422, 'BLL_PAID', 'a bill in the batch is already paid'); }
        if (d.ttl_minor > src.bal_minor) { o.sts_cd = 'RJCT'; throw new BankError(422, 'NSF', 'insufficient funds'); }
        for (const b of bills) {
          b.bll_sts_cd = 'PAID';
          src.bal_minor -= b.due_amt_minor;
          c.data.txns.unshift({ txn_ref: id('TXN'), acct_no: src.acct_no, bkg_dt: new Date().toISOString(), amt_minor: -b.due_amt_minor, ccy: b.ccy, mrch_nm: b.blr_nm, txn_desc: '', ctgry_cd: b.blr_cd === 'BAKCELL' ? 'MOBL' : 'UTIL', crd_pan: null, cntrpty_nm: null });
          c.journal.push({ type: 'bill_paid', biller: b.blr_nm });
        }
        break;
      }
      case 'RPLC':
        c.rplc.push({ ...d, sts_cd: 'ORDERED' });
        c.journal.push({ type: 'card_replacement', last4: d.crd_pan.slice(-4), branch: d.brnch_nm });
        break;
      case 'SO':
        c.so.push({ so_id: o.op_id, ...d, sts_cd: 'ACT' });
        c.journal.push({ type: 'recurring_transfer', to: d.bnfcry_nm, amount: d.amt_minor / 100, currency: d.ccy, frequency: d.freq_cd === 'W' ? 'weekly' : 'monthly' });
        break;
      case 'RTP':
        for (const it of d.items) { c.rtp.push({ ...it, ccy: d.ccy, note: d.note, sts_cd: 'SENT' }); c.journal.push({ type: 'payment_request', from: it.bnfcry_nm, amount: it.amt_minor / 100 }); }
        break;
      case 'INV': {
        const src = c.data.accts.find((a) => a.acct_no === d.src_acct_no)!;
        if (d.amt_minor > src.bal_minor) { o.sts_cd = 'RJCT'; throw new BankError(422, 'NSF', 'insufficient funds'); }
        src.bal_minor -= d.amt_minor;
        const h = c.pfl.find((x) => x.sym === d.sym);
        if (h) { const q = h.qty + d.est_qty; h.avg_px_minor = Math.round((h.avg_px_minor * h.qty + d.px_minor * d.est_qty) / q); h.qty = Math.round(q * 10000) / 10000; }
        else c.pfl.push({ sym: d.sym, qty: d.est_qty, avg_px_minor: d.px_minor });
        c.data.txns.unshift({ txn_ref: id('TXN'), acct_no: src.acct_no, bkg_dt: new Date().toISOString(), amt_minor: -d.amt_minor, ccy: d.ccy, mrch_nm: 'Investment order ' + d.sym, txn_desc: 'Simulated market', ctgry_cd: 'INVS', crd_pan: null, cntrpty_nm: null });
        c.journal.push({ type: 'invest_order', symbol: d.sym, amount: d.amt_minor / 100, currency: d.ccy });
        break;
      }
      case 'SBCN': {
        const s = c.data.sbscr.find((x) => x.sbscr_ref === d.sbscr_ref)!;
        if (s.sts_cd !== 'ACT') { o.sts_cd = 'RJCT'; throw new BankError(422, 'SBSCR_INACTIVE', 'subscription already cancelled'); }
        s.sts_cd = 'CNL';
        c.journal.push({ type: 'subscription_cancelled', merchant: s.mrch_nm });
        break;
      }
    }
    o.sts_cd = 'DONE';
    return o;
  }
}
