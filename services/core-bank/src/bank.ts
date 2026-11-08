// In-memory mock core bank. One isolated customer per demo session.
import { randomBytes } from 'node:crypto';
import { seedCustomer, type CustomerData } from './seed.ts';

export interface Drft {
  drft_id: string; cust_id: string; dst_typ_cd: 'BNF' | 'PAN' | 'ACCT' | 'BLL' | 'TOPUP';
  src_acct_no: string; dst_ref: string; dst_nm: string; amt_minor: number; fee_minor: number; ccy: string;
  chnl_cd: string; idmp_key: string; sts_cd: 'DRFT' | 'POSTED' | 'CNCL' | 'RJCT'; crt_ts: string; pst_ts: string | null; txn_ref: string | null; rsn_cd: string | null;
}
export interface CrdChgReq { req_id: string; cust_id: string; crd_pan: string; new_sts_cd: 'A' | 'B'; rsn_cd: string; idmp_key: string; sts_cd: 'PEND' | 'APLD' | 'CNCL' }
export interface Fault { op: string; mode: 'error' | 'timeout'; cnt: number }

interface Customer { cust_id: string; ext_ref: string; data: CustomerData; drfts: Map<string, Drft>; chg: Map<string, CrdChgReq>; faults: Fault[] }

export class BankError extends Error {
  constructor(public status: number, public rsn_cd: string, msg: string) { super(msg); }
}

const id = (p: string) => p + randomBytes(5).toString('hex').toUpperCase();
const OWN_BIN = '4169';

export class CoreBank {
  private byCust = new Map<string, Customer>();
  private byExt = new Map<string, string>();

  resolve(ext_ref: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ext_ref)) throw new BankError(400, 'BAD_REF', 'invalid ext_ref');
    const existing = this.byExt.get(ext_ref);
    if (existing) return existing;
    const cust_id = 'C' + randomBytes(6).toString('hex').toUpperCase();
    this.byCust.set(cust_id, { cust_id, ext_ref, data: seedCustomer(), drfts: new Map(), chg: new Map(), faults: [] });
    this.byExt.set(ext_ref, cust_id);
    return cust_id;
  }

  reset(ext_ref: string): string {
    const cust_id = this.resolve(ext_ref);
    const c = this.byCust.get(cust_id)!;
    c.data = seedCustomer(); c.drfts.clear(); c.chg.clear(); c.faults = [];
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
    }
    return { ...r, crd_sts_cd: card.crd_sts_cd };
  }

  cancelCardChange(req_id: string) { const r = this.getCardChange(req_id); if (r.sts_cd === 'PEND') r.sts_cd = 'CNCL'; return r; }
}
