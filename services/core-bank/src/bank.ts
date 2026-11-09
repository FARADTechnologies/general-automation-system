// In-memory mock core bank. One isolated customer per demo session.
import { randomBytes } from 'node:crypto';
import { seedCustomer, type CustomerData } from './seed.ts';
import { marketData, seedPortfolio, type Holding } from './market.ts';

export interface Drft {
  drft_id: string; cust_id: string; dst_typ_cd: 'BNF' | 'PAN' | 'ACCT' | 'BLL' | 'TOPUP' | 'MSISDN' | 'IBAN'; dst_bic?: string; dst_cntry?: string; purp_cd?: string; dst_amt_minor?: number; dst_ccy?: string; fx_rt?: number;
  src_acct_no: string; dst_ref: string; dst_nm: string; amt_minor: number; fee_minor: number; ccy: string;
  chnl_cd: string; idmp_key: string; sts_cd: 'DRFT' | 'POSTED' | 'CNCL' | 'RJCT'; crt_ts: string; pst_ts: string | null; txn_ref: string | null; rsn_cd: string | null;
}
export interface CrdChgReq { req_id: string; cust_id: string; crd_pan: string; new_sts_cd: 'A' | 'B'; rsn_cd: string; idmp_key: string; sts_cd: 'PEND' | 'APLD' | 'CNCL' }
export interface Fault { op: string; mode: 'error' | 'timeout'; cnt: number }
/** Business effects journal, used by the evaluation oracle to compare outcomes. */
export type Effect = Record<string, string | number>;
/** Generic two-phase operation: created pending, applied on confirmation. */
export interface Op { op_id: string; cust_id: string; knd: 'BTCH' | 'RPLC' | 'SO' | 'RTP' | 'SBCN' | 'INV' | 'CSET' | 'CLMT' | 'NCRD' | 'DPST' | 'LOAN'; sts_cd: 'PEND' | 'DONE' | 'CNCL' | 'RJCT'; idmp_key: string; crt_ts: string; data: Record<string, any> }

interface Customer { cust_id: string; ext_ref: string; data: CustomerData; drfts: Map<string, Drft>; chg: Map<string, CrdChgReq>; ops: Map<string, Op>; faults: Fault[]; journal: Effect[]; so: any[]; rtp: any[]; rplc: any[]; pfl: Holding[]; dpst: Deposit[] }
export interface Deposit { dpst_id: string; prod_cd: string; prod_nm: string; ccy: string; amt_minor: number; rate: number; term_m: number; opn_dt: string; mat_dt: string }

export class BankError extends Error {
  constructor(public status: number, public rsn_cd: string, msg: string) { super(msg); }
}

const id = (p: string) => p + randomBytes(5).toString('hex').toUpperCase();
const OWN_BIN = '4169';

/** IBAN checksum (ISO 13616, mod 97). */
export function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const dgt of v) rem = (rem * 10 + Number(dgt)) % 97;
  }
  return rem === 1;
}

/** Term deposit products: annual rate by term in months, minimum amount. */
export const DEPOSIT_PRODUCTS: Record<string, { nm: string; ccy: string; rates: Record<number, number>; min_minor: number; note: string }> = {
  smart_saver: { nm: 'Smart Saver', ccy: 'AZN', rates: { 6: 7.5, 12: 9, 18: 9.5 }, min_minor: 10000, note: 'Monthly interest payout' },
  flex_save: { nm: 'Flex Save', ccy: 'AZN', rates: { 3: 5, 6: 6 }, min_minor: 5000, note: 'Top up and withdraw anytime' },
  dollar_deposit: { nm: 'Dollar Deposit', ccy: 'USD', rates: { 12: 2 }, min_minor: 10000, note: 'Interest at maturity' },
};

const luhnOk = (n: string) => { let s = 0, dbl = false; for (let i = n.length - 1; i >= 0; i--) { let d = n.charCodeAt(i) - 48; if (dbl) { d *= 2; if (d > 9) d -= 9; } s += d; dbl = !dbl; } return s % 10 === 0; };

/** A card's payment settings and daily limits, with the bank's defaults where none were set. */
export function cardControls(c: { vrtl_flg: 'Y' | 'N'; onln_flg?: 'Y' | 'N'; ctls_flg?: 'Y' | 'N'; abrd_flg?: 'Y' | 'N'; lmt_pur_minor?: number; lmt_atm_minor?: number; lmt_onl_minor?: number }) {
  return {
    online: c.onln_flg ?? 'Y', contactless: c.ctls_flg ?? (c.vrtl_flg === 'Y' ? 'N' : 'Y'), abroad: c.abrd_flg ?? 'Y',
    purchase: c.lmt_pur_minor ?? 200000, atm: c.lmt_atm_minor ?? (c.vrtl_flg === 'Y' ? 0 : 100000), online_lmt: c.lmt_onl_minor ?? 150000,
  };
}
const SETTINGS: Record<string, { fld: 'onln_flg' | 'ctls_flg' | 'abrd_flg'; nm: string }> = {
  online_payments: { fld: 'onln_flg', nm: 'Online payments' }, contactless: { fld: 'ctls_flg', nm: 'Contactless payments' }, payments_abroad: { fld: 'abrd_flg', nm: 'Payments abroad' },
};
const LIMITS: Record<string, { fld: 'lmt_pur_minor' | 'lmt_atm_minor' | 'lmt_onl_minor'; nm: string; max: number }> = {
  purchase: { fld: 'lmt_pur_minor', nm: 'Daily purchase limit', max: 500000 }, cash: { fld: 'lmt_atm_minor', nm: 'Daily cash withdrawal limit', max: 300000 }, online: { fld: 'lmt_onl_minor', nm: 'Daily online limit', max: 500000 },
};

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
    this.byCust.set(cust_id, { cust_id, ext_ref, data: seedCustomer(), drfts: new Map(), chg: new Map(), ops: new Map(), faults: [], journal: [], so: [], rtp: [], rplc: [], pfl: seedPortfolio(), dpst: [{ dpst_id: 'DP0001', prod_cd: 'smart_saver', prod_nm: 'Smart Saver', ccy: 'AZN', amt_minor: 150000, rate: 9, term_m: 12, opn_dt: new Date(Date.now() - 120 * 86400000).toISOString(), mat_dt: new Date(Date.now() + 245 * 86400000).toISOString() }] });
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

    let amt = Number(body.amt_minor);
    if (!Number.isInteger(amt) || amt <= 0) throw new BankError(400, 'AMT_INV', 'amt_minor must be a positive integer');
    let fx: { dst_amt_minor: number; dst_ccy: string; fx_rt: number } | null = null;
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
        if (a.ccy !== src.ccy) {
          // currency exchange between own accounts, at the bank's own rate (fx_flg Y). The amount may
          // be given in either currency (amt_ccy); the bank works out the other side.
          if (body.fx_flg !== 'Y') throw new BankError(422, 'CCY_MISMATCH', 'cross-currency transfer needs fx_flg');
          const foreign = src.ccy === 'AZN' ? a.ccy : a.ccy === 'AZN' ? src.ccy : '';
          const rate = c.data.fx.find((r) => r.ccy === foreign);
          if (!rate) throw new BankError(422, 'FX_NA', 'exchange not available for this pair');
          const amtCcy = String(body.amt_ccy || src.ccy);
          if (amtCcy !== src.ccy && amtCcy !== a.ccy) throw new BankError(400, 'AMT_CCY_INV', 'amount currency must be one side of the exchange');
          const rt = src.ccy === 'AZN' ? rate.sell : rate.buy; // AZN per unit of the foreign currency
          const toAzn = (m: number) => Math.round(m * rt), fromAzn = (m: number) => Math.round(m / rt);
          let srcAmt: number, dstAmt: number;
          if (src.ccy === 'AZN') { if (amtCcy === 'AZN') { srcAmt = amt; dstAmt = fromAzn(amt); } else { dstAmt = amt; srcAmt = toAzn(amt); } }
          else { if (amtCcy === 'AZN') { dstAmt = amt; srcAmt = fromAzn(amt); } else { srcAmt = amt; dstAmt = toAzn(amt); } }
          if (srcAmt <= 0 || dstAmt <= 0) throw new BankError(400, 'AMT_INV', 'amount too small to exchange');
          amt = srcAmt;
          fx = { dst_amt_minor: dstAmt, dst_ccy: a.ccy, fx_rt: rt };
        }
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
      case 'IBAN': {
        // international (SWIFT) transfer: valid IBAN checksum, BIC format, a named beneficiary
        const iban = ref.replace(/\s+/g, '').toUpperCase();
        if (!ibanValid(iban)) throw new BankError(400, 'IBAN_INV', 'invalid IBAN');
        const bic = String(body.dst_bic || '').replace(/\s+/g, '').toUpperCase();
        if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) throw new BankError(400, 'BIC_INV', 'invalid SWIFT/BIC code');
        const name = String(body.bnfcry_nm || '').trim();
        if (name.length < 3 || name.length > 70) throw new BankError(400, 'BNF_NM_INV', 'beneficiary name required');
        dst_nm = name;
        fee = Math.max(1500, Math.round(amt * 0.002)); // 0.2%, minimum 15.00
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
      drft_id: id('DR'), cust_id: c.cust_id, dst_typ_cd: typ, src_acct_no: src.acct_no, dst_ref: typ === 'IBAN' ? ref.replace(/\s+/g, '').toUpperCase() : ref, dst_nm,
      ...(fx || {}),
      ...(typ === 'IBAN' ? { dst_bic: String(body.dst_bic).replace(/\s+/g, '').toUpperCase(), dst_cntry: String(body.dst_cntry || '').slice(0, 40), purp_cd: String(body.purp_cd || '').slice(0, 40) } : {}),
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
    if (d.dst_typ_cd === 'ACCT') {
      const a = c.data.accts.find((x) => x.acct_no === d.dst_ref)!;
      a.bal_minor += d.dst_amt_minor ?? d.amt_minor; ctg = 'OWN'; mrch = d.fx_rt ? `Exchange to ${a.ccy}` : `To ${a.acct_nm}`;
      if (d.fx_rt) c.data.txns.unshift({ txn_ref: id('TXN'), acct_no: a.acct_no, bkg_dt: new Date().toISOString(), amt_minor: d.dst_amt_minor!, ccy: a.ccy, mrch_nm: `Exchange from ${d.ccy}`, txn_desc: '', ctgry_cd: 'OWN', crd_pan: null, cntrpty_nm: null });
    }
    if (d.dst_typ_cd === 'BNF') { const b = c.data.bnfcry.find((x) => x.bnfcry_ref === d.dst_ref); if (b && !b.frst_pmt_dt) b.frst_pmt_dt = new Date().toISOString(); }
    if (d.dst_typ_cd === 'BLL') { ctg = 'UTIL'; mrch = d.dst_nm; }
    if (d.dst_typ_cd === 'TOPUP') { ctg = 'MOBL'; mrch = `${d.dst_nm} top-up`; }
    if (d.dst_typ_cd === 'IBAN') mrch = `International transfer to ${d.dst_nm}`;
    const txn_ref = id('TXN');
    c.data.txns.unshift({
      txn_ref, acct_no: src.acct_no, bkg_dt: new Date().toISOString(), amt_minor: -(d.amt_minor + d.fee_minor), ccy: d.ccy,
      mrch_nm: mrch, txn_desc: '', ctgry_cd: ctg, crd_pan: null, cntrpty_nm: d.dst_typ_cd === 'BNF' || d.dst_typ_cd === 'PAN' ? d.dst_nm : null,
    });
    d.sts_cd = 'POSTED'; d.pst_ts = new Date().toISOString(); d.txn_ref = txn_ref;
    const amount = d.amt_minor / 100;
    if (d.dst_typ_cd === 'BLL') c.journal.push({ type: 'bill_paid', biller: d.dst_nm });
    else if (d.dst_typ_cd === 'TOPUP') c.journal.push({ type: 'topup', operator: d.dst_nm, amount });
    else if (d.dst_typ_cd === 'ACCT' && d.fx_rt) c.journal.push({ type: 'fx_exchange', from: d.ccy, to: d.dst_ccy!, amount, received: d.dst_amt_minor! / 100 });
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
      case 'CSET': {
        // turn a card's online payments, contactless or payments abroad on or off
        const card = c.data.crds.find((x) => x.crd_pan === body.crd_pan);
        if (!card) throw new BankError(404, 'CRD_NF', 'card not found');
        const st = SETTINGS[String(body.sttg_cd)];
        if (!st) throw new BankError(400, 'STTG_INV', 'unknown setting');
        const on = String(body.val) === 'true' || body.val === true || body.val === 'Y';
        if (st.fld === 'ctls_flg' && card.vrtl_flg === 'Y' && on) throw new BankError(422, 'VIRTUAL', 'a virtual card has no contactless payments');
        data = { crd_pan: card.crd_pan, crd_nm: card.crd_nm, sttg_cd: String(body.sttg_cd), sttg_nm: st.nm, val: on ? 'Y' : 'N', val_txt: on ? 'On' : 'Off' };
        break;
      }
      case 'CLMT': {
        // change one of a card's daily limits (amount in the card account's currency)
        const card = c.data.crds.find((x) => x.crd_pan === body.crd_pan);
        if (!card) throw new BankError(404, 'CRD_NF', 'card not found');
        const lm = LIMITS[String(body.lmt_cd)];
        if (!lm) throw new BankError(400, 'LMT_INV', 'unknown limit');
        const amt = Number(body.amt_minor);
        if (!Number.isInteger(amt) || amt < 0 || amt > lm.max) throw new BankError(422, 'LMT_RANGE', `limit must be between 0 and ${lm.max / 100}`);
        if (lm.fld === 'lmt_atm_minor' && card.vrtl_flg === 'Y') throw new BankError(422, 'VIRTUAL', 'a virtual card has no cash withdrawals');
        const ccy = c.data.accts.find((a) => a.acct_no === card.lnk_acct_no)?.ccy || 'AZN';
        const prev = (cardControls(card) as Record<string, number | string>)[String(body.lmt_cd) === 'cash' ? 'atm' : String(body.lmt_cd) === 'online' ? 'online_lmt' : 'purchase'];
        data = { crd_pan: card.crd_pan, crd_nm: card.crd_nm, lmt_cd: String(body.lmt_cd), lmt_nm: lm.nm, amt_minor: amt, prev_minor: prev, ccy };
        break;
      }
      case 'LOAN': {
        // a cash loan application: the bank prices it (annuity at 14.9% a year) and pre-approves up
        // to 15,000 AZN; above that a specialist reviews it. No money moves at this step.
        const amt = Number(body.amt_minor);
        const term = Number(body.term_m);
        if (!Number.isInteger(amt) || amt < 30000 || amt > 3000000) throw new BankError(422, 'AMT_RANGE', 'loan amount must be between 300 and 30,000 AZN');
        if (![6, 12, 24, 36, 48, 59].includes(term)) throw new BankError(422, 'TERM_INV', 'term must be 6, 12, 24, 36, 48 or 59 months');
        const r = 0.149 / 12;
        const monthly = Math.round(amt * r / (1 - Math.pow(1 + r, -term)));
        data = { amt_minor: amt, term_m: term, rate: 14.9, mthly_minor: monthly, ttl_minor: monthly * term, ccy: 'AZN', dcsn: amt <= 1500000 ? 'Pre-approved' : 'Sent to a loan specialist for review', purp: String(body.purp_cd || 'personal').slice(0, 30) };
        break;
      }
      case 'DPST': {
        // open a term deposit from the current account in the product's currency
        const p = DEPOSIT_PRODUCTS[String(body.prod_cd)];
        if (!p) throw new BankError(400, 'PROD_INV', 'unknown deposit product');
        const term = Number(body.term_m);
        const rate = p.rates[term];
        if (!rate) throw new BankError(422, 'TERM_INV', `${p.nm} is offered for ${Object.keys(p.rates).join(', ')} months`);
        const amt = Number(body.amt_minor);
        if (!Number.isInteger(amt) || amt < p.min_minor) throw new BankError(422, 'AMT_MIN', `minimum for ${p.nm} is ${p.min_minor / 100} ${p.ccy}`);
        const src = c.data.accts.find((a) => a.ccy === p.ccy && a.acct_typ_cd === 'CUR');
        if (!src) throw new BankError(404, 'ACCT_NF', 'no current account in the deposit currency');
        if (amt > src.bal_minor) throw new BankError(422, 'NSF', 'insufficient funds');
        const mat = new Date(Date.now() + term * 30.4375 * 86400000);
        data = { prod_cd: String(body.prod_cd), prod_nm: p.nm, ccy: p.ccy, amt_minor: amt, rate, term_m: term, src_acct_no: src.acct_no, src_acct_nm: src.acct_nm, mat_dt: mat.toISOString().slice(0, 10), int_minor: Math.round(amt * rate / 100 * term / 12) };
        break;
      }
      case 'NCRD': {
        // a new card: virtual cards are issued at once, physical cards are made for branch pickup
        const kind = String(body.knd_cd) === 'physical' ? 'physical' : String(body.knd_cd) === 'virtual' ? 'virtual' : '';
        if (!kind) throw new BankError(400, 'KND_INV', 'card kind must be virtual or physical');
        const ccy = String(body.ccy || 'AZN');
        const acc = c.data.accts.find((a) => a.ccy === ccy && a.acct_typ_cd === 'CUR');
        if (!acc) throw new BankError(404, 'ACCT_NF', 'no current account in that currency');
        let br: { brnch_cd: string; brnch_nm: string } | undefined;
        if (kind === 'physical') { br = c.data.brnch.find((x) => x.brnch_cd === body.brnch_cd); if (!br) throw new BankError(404, 'BRNCH_NF', 'a physical card needs a pickup branch'); }
        const nm = kind === 'virtual' ? `Virtual ${ccy} card` : `Caspia ${ccy === 'USD' ? 'Dollar' : 'Debit'} card`;
        data = { knd_cd: kind, ccy, lnk_acct_no: acc.acct_no, crd_nm: nm, brnch_cd: br?.brnch_cd ?? null, brnch_nm: br?.brnch_nm ?? null, rdy_dt: kind === 'virtual' ? 'Now' : new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), fee_minor: 0 };
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
      case 'CSET': {
        const card = c.data.crds.find((x) => x.crd_pan === d.crd_pan)!;
        card[SETTINGS[d.sttg_cd].fld] = d.val;
        c.journal.push({ type: 'card_setting', last4: d.crd_pan.slice(-4), setting: d.sttg_cd, enabled: d.val === 'Y' ? 'yes' : 'no' });
        break;
      }
      case 'CLMT': {
        const card = c.data.crds.find((x) => x.crd_pan === d.crd_pan)!;
        card[LIMITS[d.lmt_cd].fld] = d.amt_minor;
        c.journal.push({ type: 'card_limit', last4: d.crd_pan.slice(-4), limit: d.lmt_cd, amount: d.amt_minor / 100 });
        break;
      }
      case 'LOAN':
        c.journal.push({ type: 'loan_application', amount: d.amt_minor / 100, months: d.term_m });
        break;
      case 'DPST': {
        const src = c.data.accts.find((a) => a.acct_no === d.src_acct_no)!;
        if (d.amt_minor > src.bal_minor) throw new BankError(422, 'NSF', 'insufficient funds');
        src.bal_minor -= d.amt_minor;
        c.data.txns.unshift({ txn_ref: id('TXN'), acct_no: src.acct_no, bkg_dt: new Date().toISOString(), amt_minor: -d.amt_minor, ccy: d.ccy, mrch_nm: `Deposit ${d.prod_nm}`, txn_desc: '', ctgry_cd: 'OWN', crd_pan: null, cntrpty_nm: null });
        c.dpst.push({ dpst_id: id('DP'), prod_cd: d.prod_cd, prod_nm: d.prod_nm, ccy: d.ccy, amt_minor: d.amt_minor, rate: d.rate, term_m: d.term_m, opn_dt: new Date().toISOString(), mat_dt: new Date(d.mat_dt + 'T00:00:00Z').toISOString() });
        c.journal.push({ type: 'deposit_opened', product: d.prod_nm, amount: d.amt_minor / 100, currency: d.ccy, months: d.term_m });
        break;
      }
      case 'NCRD': {
        const last4 = String(1000 + ((c.data.crds.length * 7919 + Date.now()) % 9000));
        const pan = (() => { for (let k = 0; k < 100000; k++) { const p = ('4169' + String((k * 104729 + Date.now()) % 1e8).padStart(8, '0')) + last4; if (luhnOk(p)) return p; } return '4169000000000000'; })();
        if (d.knd_cd === 'virtual') c.data.crds.push({ crd_pan: pan, lnk_acct_no: d.lnk_acct_no, crd_sts_cd: 'A', prod_cd: 'VVRT', crd_nm: d.crd_nm, exp_dt: '11/30', cvv_val: '•••', ntwrk_cd: 'VISA', vrtl_flg: 'Y' });
        d.crd_last4 = pan.slice(-4);
        c.journal.push({ type: 'card_issued', kind: d.knd_cd, currency: d.ccy });
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
