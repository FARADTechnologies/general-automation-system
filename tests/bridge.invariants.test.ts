// Invariant tests for the Bridge. These run without any LLM: they play a hostile or
// buggy agent directly against MCP, so the protection does not depend on the model behaving.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startStack, ROOT, type Stack } from './stack.ts';
import { loadManifests } from '../services/bridge/src/manifest.ts';
import { CANARIES, seedCustomer } from '../services/core-bank/src/seed.ts';

let st: Stack;
beforeAll(async () => { st = await startStack(); });
afterAll(async () => { await st.close(); });

const bankState = async (session: string) => {
  const cust = await st.custOf(session);
  const [acct, crd, bll] = await Promise.all([st.coreGet(`/internal/v3/cust/${cust}/acct`), st.coreGet(`/internal/v3/cust/${cust}/crd`), st.coreGet(`/internal/v3/cust/${cust}/bll`)]);
  return JSON.stringify({ a: acct.items.map((x: any) => [x.acct_no, x.bal_minor]), c: crd.items.map((x: any) => [x.crd_pan, x.crd_sts_cd]), b: bll.items.map((x: any) => [x.bll_ref, x.bll_sts_cd]) });
};

async function preparedTransfer(session: string, name = 'Rashad', amount = 25) {
  const a = await st.mcp(session);
  const contacts = await a.call('contacts_search', { query: name });
  const contact = contacts.body.items[0].contact;
  const prep = await a.call('transfer_contact_prepare', { contact, amount, currency: 'AZN' });
  return { a, contact, prep };
}

describe('I2: no MCP tool can commit', () => {
  it('lists only read and prepare capabilities plus status/cancel helpers', async () => {
    const a = await st.mcp('i2-list');
    const { tools } = await a.client.listTools();
    expect(tools.length).toBeGreaterThan(5);
    for (const t of tools) {
      const kind = (t._meta as any)?.kind;
      expect(['read', 'prepare']).toContain(kind);
      expect(t.name).not.toMatch(/commit|execute|post|confirm|approve/i);
    }
  });

  it('calling every prepare tool changes nothing in the core bank', async () => {
    const s = 'i2-noeffect';
    const before = await bankState(s);
    const a = await st.mcp(s);
    const ctc = (await a.call('contacts_search', { query: 'Ali' })).body.items[0].contact;
    const card = (await a.call('cards_list')).body.items[0].card;
    const bill = (await a.call('bills_list_unpaid')).body.items[0].bill;
    const r1 = await a.call('transfer_contact_prepare', { contact: ctc, amount: 30, currency: 'AZN' });
    const r2 = await a.call('card_block_prepare', { card });
    const r3 = await a.call('bill_pay_prepare', { bill });
    for (const r of [r1, r2, r3]) {
      expect(r.isError).toBe(false);
      expect(r.body.status).toBe('awaiting_customer_confirmation');
    }
    // status helper is read-only
    expect((await a.call('prepared_status', { prepared_id: r1.body.prepared_id })).body.status).toBe('awaiting_customer_confirmation');
    expect(await bankState(s)).toBe(before);
  });

  it('the manifest loader refuses to expose an action capability', () => {
    const dir = mkdtempSync(join(tmpdir(), 'man-'));
    writeFileSync(join(dir, 'x.yaml'), 'id: transfer.commit\ntitle: x\nllm_description: x\nkind: action\nrisk: R3\nrequest: { method: POST, path: /x }\n');
    expect(() => loadManifests([dir])).toThrow(/only read and prepare/);
  });

  it('a hostile agent cannot reach the commit endpoint with its own credential', async () => {
    const { prep } = await preparedTransfer('i2-hostile');
    const r = await fetch(`${st.bridgeUrl}/bridge/confirm/${prep.body.prepared_id}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${st.keys.agent}` },
      body: JSON.stringify({ decision: 'approve', payload_hash: 'x', proof: { method: 'biometric', assertion: 'mock-biometric-ok' } }),
    });
    expect(r.status).toBe(401);
  });
});

describe('I3: one-time, expiring confirmation bound to the payload hash', () => {
  it('commits once with a valid device, proof and hash, then verifies the postcondition', async () => {
    const s = 'i3-ok';
    const { prep } = await preparedTransfer(s, 'Rashad', 25);
    const dev = await st.device(s);
    const view = await (await dev.get(prep.body.prepared_id)).json();
    expect(view.display.find((d: any) => d.key === 'amount').value).toBe('25.00 AZN');
    const cust = await st.custOf(s);
    const bal0 = (await st.coreGet(`/internal/v3/cust/${cust}/acct`)).items[0].bal_minor;

    const bad = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: view.payloadHash, proof: { method: 'biometric', assertion: 'nope' } });
    expect(bad.status).toBe(401);
    const flipped = (view.payloadHash[0] === '0' ? '1' : '0') + view.payloadHash.slice(1);
    const tampered = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: flipped, proof: { method: 'biometric', assertion: 'mock-biometric-ok' } });
    expect(tampered.status).toBe(409);

    const ok = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: view.payloadHash, proof: { method: 'biometric', assertion: 'mock-biometric-ok' } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'committed', verified: true });
    const bal1 = (await st.coreGet(`/internal/v3/cust/${cust}/acct`)).items[0].bal_minor;
    const fee = Math.round(parseFloat(view.display.find((d: any) => d.key === 'fee').value) * 100);
    expect(bal0 - bal1).toBe(2500 + fee);

    const replay = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: view.payloadHash, proof: { method: 'biometric', assertion: 'mock-biometric-ok' } });
    expect(replay.status).toBe(409);
    expect((await st.coreGet(`/internal/v3/cust/${cust}/acct`)).items[0].bal_minor).toBe(bal1);
  });

  it('rejects confirmation without a device credential or from another session', async () => {
    const { prep } = await preparedTransfer('i3-dev');
    const noDevice = await fetch(`${st.bridgeUrl}/bridge/confirm/${prep.body.prepared_id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(noDevice.status).toBe(401);
    const other = await st.device('i3-other');
    expect((await other.get(prep.body.prepared_id)).status).toBe(403);
  });

  it('expires after 120 seconds and cancels the draft', async () => {
    const s = 'i3-exp';
    const { prep } = await preparedTransfer(s);
    const dev = await st.device(s);
    const view = await (await dev.get(prep.body.prepared_id)).json();
    expect(view.expiresAt - view.now).toBe(120_000);
    st.advance(121_000);
    const r = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: view.payloadHash, proof: { method: 'pin', pin: '1234' } });
    expect(r.status).toBe(410);
  });

  it('a denied confirmation commits nothing', async () => {
    const s = 'i3-deny';
    const before = await bankState(s);
    const { prep } = await preparedTransfer(s);
    const dev = await st.device(s);
    const view = await (await dev.get(prep.body.prepared_id)).json();
    expect((await dev.post(prep.body.prepared_id, { decision: 'deny', payload_hash: view.payloadHash })).status).toBe(200);
    expect(await bankState(s)).toBe(before);
  });
});

describe('I4: the Bridge re-validates everything', () => {
  it('rejects schema violations', async () => {
    const a = await st.mcp('i4-schema');
    const r = await a.call('transfer_contact_prepare', { contact: 'ctc_x', amount: '25', currency: 'AZN' });
    expect(r.body.error.code).toBe('SCHEMA_INVALID');
    const r2 = await a.call('transfer_contact_prepare', { contact: 'ctc_x', amount: 25, currency: 'EUR' });
    expect(r2.body.error.code).toBe('SCHEMA_INVALID');
    const r3 = await a.call('transfer_contact_prepare', { contact: 'ctc_x', amount: 25, currency: 'AZN', payee_iban: 'AZ00' });
    expect(r3.body.error.code).toBe('SCHEMA_INVALID');
  });

  it('rejects unknown, foreign and wrong-kind tokens (ownership)', async () => {
    const a = await st.mcp('i4-own-a');
    const b = await st.mcp('i4-own-b');
    const ctcA = (await a.call('contacts_search', { query: 'Leyla' })).body.items[0].contact;
    expect((await b.call('transfer_contact_prepare', { contact: ctcA, amount: 5, currency: 'AZN' })).body.error.code).toBe('TOKEN_FOREIGN');
    expect((await a.call('transfer_contact_prepare', { contact: 'ctc_deadbeef', amount: 5, currency: 'AZN' })).body.error.code).toBe('TOKEN_UNKNOWN');
    const acc = (await a.call('accounts_list')).body.items[0].account;
    expect((await a.call('transfer_contact_prepare', { contact: acc, amount: 5, currency: 'AZN' })).body.error.code).toBe('TOKEN_KIND');
  });

  it('enforces limits, funds, amount precision and card state', async () => {
    const s = 'i4-limits';
    const a = await st.mcp(s);
    const ctc = (await a.call('contacts_search', { query: 'Tural' })).body.items[0].contact;
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 1500, currency: 'AZN' })).body.error.code).toBe('LIMIT_PER_TRANSACTION');
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 10.005, currency: 'AZN' })).body.error.code).toBe('AMOUNT_INVALID');
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: -5, currency: 'AZN' })).body.error.code).toBe('AMOUNT_INVALID');
    // USD account holds 1,200.00; per-tx USD limit is 500, so ask the core bank directly for NSF via savings-free path
    const usdOver = await a.call('transfer_contact_prepare', { contact: ctc, amount: 499, currency: 'USD' });
    expect(usdOver.isError).toBe(false);

    // card state: block once, confirm, then a second block is refused by the bank state check
    const card = (await a.call('cards_list')).body.items[2].card;
    const p = await a.call('card_block_prepare', { card });
    const dev = await st.device(s);
    const v = await (await dev.get(p.body.prepared_id)).json();
    expect(v.level).toBe('tap');
    expect((await dev.post(p.body.prepared_id, { decision: 'approve', payload_hash: v.payloadHash })).status).toBe(200);
    expect((await a.call('card_block_prepare', { card })).body.error.code).toBe('ALREADY_BLOCKED');
  });

  it('reports insufficient funds from the bank', async () => {
    const s = 'i4-nsf';
    const a = await st.mcp(s);
    const ctc = (await a.call('contacts_search', { query: 'Nigar' })).body.items[0].contact;
    await fetch(`${st.coreUrl}/internal/admin/set_bal`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cb-svc-key': st.keys.core }, body: JSON.stringify({ ext_ref: s, acct_idx: 0, bal_minor: 1000 }) });
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 50, currency: 'AZN' })).body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('re-checks the daily limit at commit time', async () => {
    const s = 'i4-daily';
    const a = await st.mcp(s);
    const ctc = (await a.call('contacts_search', { query: 'Sara' })).body.items[0].contact;
    const dev = await st.device(s);
    const preps = [];
    for (let i = 0; i < 3; i++) preps.push((await a.call('transfer_contact_prepare', { contact: ctc, amount: 450 + i, currency: 'USD' })).body);
    const statuses = [];
    for (const p of preps) {
      const v = await (await dev.get(p.prepared_id)).json();
      statuses.push((await dev.post(p.prepared_id, { decision: 'approve', payload_hash: v.payloadHash, proof: { method: 'pin', pin: '1234' }, acknowledge_warning: true })).status);
    }
    expect(statuses).toEqual([200, 200, 422]);
    // 901 USD used today; 100 more would exceed the 1,000 USD daily limit
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 100, currency: 'USD' })).body.error.code).toBe('LIMIT_DAILY');
  });

  it('a bank failure at commit is reported as failed and never as done', async () => {
    const s = 'i4-fault';
    const before = await bankState(s);
    const { prep } = await preparedTransfer(s, 'Elchin', 20);
    await fetch(`${st.coreUrl}/internal/admin/flt`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cb-svc-key': st.keys.core }, body: JSON.stringify({ ext_ref: s, op: 'pmt.post', mode: 'error', cnt: 1 }) });
    const dev = await st.device(s);
    const v = await (await dev.get(prep.body.prepared_id)).json();
    const r = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: v.payloadHash, proof: { method: 'pin', pin: '1234' } });
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ status: 'failed', verified: false });
    expect(await bankState(s)).toBe(before);
  });

  it('kill switch removes the tool and blocks calls (I11)', async () => {
    const a = await st.mcp('i11');
    const ctc = (await a.call('contacts_search', { query: 'Aysel' })).body.items[0].contact;
    const off = await fetch(`${st.bridgeUrl}/admin/capabilities/transfer.contact.prepare`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${st.keys.admin}` }, body: JSON.stringify({ enabled: false }) });
    expect(off.status).toBe(200);
    const { tools } = await a.client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('transfer_contact_prepare');
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 5, currency: 'AZN' })).body.error.code).toBe('CAPABILITY_DISABLED');
    await fetch(`${st.bridgeUrl}/admin/capabilities/transfer.contact.prepare`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${st.keys.admin}` }, body: JSON.stringify({ enabled: true }) });
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 5, currency: 'AZN' })).isError).toBe(false);
  });

  it('first payment to a new payee with a high balance share needs an explicit acknowledgement', async () => {
    const s = 'np';
    const a = await st.mcp(s);
    const john = (await a.call('contacts_search', { query: 'John' })).body.items[0];
    expect(john.new_payee).toBe(true);
    const p = await a.call('transfer_contact_prepare', { contact: john.contact, amount: 900, currency: 'AZN' });
    expect(p.body.warnings[0]).toMatch(/First payment/);
    const dev = await st.device(s);
    const v = await (await dev.get(p.body.prepared_id)).json();
    expect(v.extraConfirmation).toBe(true);
    const r = await dev.post(p.body.prepared_id, { decision: 'approve', payload_hash: v.payloadHash, proof: { method: 'pin', pin: '1234' } });
    expect(r.status).toBe(422);
  });
});

describe('I1: tool outputs never carry raw identifiers or canaries', () => {
  it('no full card numbers, account numbers, phone numbers, CVVs or canaries in any read output', async () => {
    const a = await st.mcp('i1');
    const outs = [
      await a.call('accounts_list'), await a.call('cards_list'), await a.call('contacts_search', { query: 'a' }),
      await a.call('bills_list_unpaid'), await a.call('transactions_search', { days: 90, limit: 50 }),
    ].map((r) => r.text).join('\n');
    const seed = seedCustomer();
    const forbidden = [
      ...seed.crds.map((c) => c.crd_pan), ...seed.accts.map((x) => x.acct_no), ...seed.bnfcry.map((b) => b.dst_pan),
      ...seed.bnfcry.map((b) => b.msisdn), ...seed.bnfcry.map((b) => b.msisdn.slice(4)), seed.cust.msisdn,
      CANARIES.natId, CANARIES.riskScore,
    ];
    for (const f of forbidden) expect(outs).not.toContain(f);
    for (const cvv of CANARIES.cvv) expect(outs).not.toMatch(new RegExp(`"${cvv}"`));
    expect(outs).not.toMatch(/\b\d{13,19}\b/);
  });

  it('prepare output carries masked values only', async () => {
    const { prep } = await preparedTransfer('i1-prep', 'Ahmed', 12);
    expect(prep.text).not.toMatch(/\b\d{13,19}\b/);
    expect(prep.body.details.masked_destination).toMatch(/^•••• \d{4}$/);
  });
});

describe('I5: bank text is marked untrusted', () => {
  it('memos and merchant names come back under untrusted_text', async () => {
    const a = await st.mcp('i5');
    const r = await a.call('transactions_search', { query: 'Carter', days: 10 });
    const row = r.body.items[0];
    expect(row.memo).toBeUndefined();
    expect(row.untrusted_text.memo).toMatch(/ignore previous instructions/);
  });
});

describe('I10: audit log is append-only', () => {
  it('rejects UPDATE and DELETE', () => {
    st.bridge.audit.write({ trace_id: 't', session: 's', actor: 'test', event: 'x' });
    expect(() => st.bridge.audit.rawExec("UPDATE audit SET decision = 'forged'")).toThrow(/append-only/);
    expect(() => st.bridge.audit.rawExec('DELETE FROM audit')).toThrow(/append-only/);
  });

  it('records every tool call with a trace id', async () => {
    const a = await st.mcp('i10');
    await a.call('accounts_list');
    const rows = st.bridge.audit.list({ session: 'i10' });
    expect(rows.some((r) => r.capability === 'accounts.list' && r.trace_id)).toBe(true);
  });
});

describe('manifests', () => {
  it('every shipped manifest loads and declares tiers consistently', () => {
    const caps = loadManifests([resolve(ROOT, 'domains/bank/manifest')]);
    for (const c of caps.values()) {
      if (c.kind === 'prepare') expect(c.confirm?.level).not.toBe('none');
      if (c.risk === 'R3') expect(c.confirm?.level).toBe('biometric');
    }
    expect(readFileSync(resolve(ROOT, 'domains/bank/policy.yaml'), 'utf8')).toMatch(/ttl_seconds: 120/);
  });
});
