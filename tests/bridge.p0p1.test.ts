// P0/P1 capabilities through the Bridge, without a model: prepare, confirm on the bank screen,
// and check the bank's effects journal. Proves the manifests map correctly to the internal API.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startStack, type Stack } from './stack.ts';

let st: Stack;
beforeAll(async () => { st = await startStack(); });
afterAll(async () => { await st.close(); });

const effects = async (s: string) => (await (await fetch(`${st.coreUrl}/internal/admin/effects?ext_ref=${s}`, { headers: { 'x-cb-svc-key': st.keys.core } })).json()).items;
async function confirm(s: string, prep: any, proof = true) {
  expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
  const dev = await st.device(s);
  const v = await (await dev.get(prep.body.prepared_id)).json();
  const r = await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: v.payloadHash, proof: proof ? { method: 'pin', pin: '1234' } : undefined, acknowledge_warning: true });
  return { status: r.status, body: await r.json(), view: v };
}
const ingress = async (s: string, kind: 'pan' | 'phone' | 'iban', value: string) => (await (await fetch(`${st.bridgeUrl}/agent/vault/ingress`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${st.keys.agent}` }, body: JSON.stringify({ session: s, kind, value }) })).json()).token;

describe('international transfer (SWIFT)', () => {
  it('IBAN only as a vault token: prepare, confirm on the bank screen, and the bank posts it with the fee', async () => {
    const s = 'p0-intl'; const a = await st.mcp(s);
    const tok = await ingress(s, 'iban', 'DE89 3704 0044 0532 0130 00');
    expect(tok).toMatch(/^ibn_/);
    const prep = await a.call('transfer_intl_prepare', { iban: tok, swift: 'cobadeffxxx', beneficiary: 'Hans Becker', country: 'Germany', amount: 100, currency: 'AZN' });
    expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
    expect(JSON.stringify(prep.body)).not.toContain('370400440532013000'); // the full IBAN never reaches the agent
    expect(prep.body.details).toMatchObject({ payee_name: 'Hans Becker', masked_destination: 'DE•• •••• 3000', swift: 'COBADEFFXXX', fee: '15.00 AZN' });
    const r = await confirm(s, prep);
    expect(r.body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([{ type: 'transfer', to: 'Hans Becker', amount: 100, currency: 'AZN' }]);
  });

  it('rejects a wrong SWIFT code, an IBAN typed into the tool, and an invalid IBAN at ingress', async () => {
    const s = 'p0-intl-bad'; const a = await st.mcp(s);
    const tok = await ingress(s, 'iban', 'GB29NWBK60161331926819');
    expect((await a.call('transfer_intl_prepare', { iban: tok, swift: 'NOPE', beneficiary: 'Jane Doe', amount: 50, currency: 'AZN' })).isError).toBe(true);
    expect((await a.call('transfer_intl_prepare', { iban: 'GB29NWBK60161331926819', swift: 'NWBKGB2L', beneficiary: 'Jane Doe', amount: 50, currency: 'AZN' })).isError).toBe(true);
    expect(await ingress(s, 'iban', 'not an iban')).toBeUndefined();
  });
});

describe('P0 capabilities', () => {
  it('own-account transfer', async () => {
    const s = 'p0-own'; const a = await st.mcp(s);
    const acc = (await a.call('accounts_list')).body.items;
    const main = acc.find((x: any) => x.name === 'Main account').account; const sav = acc.find((x: any) => x.type === 'savings').account;
    const r = await confirm(s, await a.call('transfer_own_prepare', { from_account: main, to_account: sav, amount: 100, currency: 'AZN' }));
    expect(r.body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([{ type: 'transfer', to: 'own:Savings', amount: 100, currency: 'AZN' }]);
  });

  it('transfer to a typed card number (ingress token only)', async () => {
    const s = 'p0-card'; const a = await st.mcp(s);
    const tok = await ingress(s, 'pan', '4111111111111111');
    const prep = await a.call('transfer_card_prepare', { card: tok, amount: 40, currency: 'AZN' });
    expect(prep.body.details.masked_destination).toBe('•••• 1111');
    const r = await confirm(s, prep);
    expect(r.body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'transfer', to: 'card:1111', amount: 40, currency: 'AZN' }]);
    // a contact token is not accepted where a typed card is required
    const ctc = (await a.call('contacts_search', { query: 'Leyla' })).body.items[0].contact;
    expect((await a.call('transfer_card_prepare', { card: ctc, amount: 5, currency: 'AZN' })).body.error.code).toBe('TOKEN_KIND');
  });

  it('transfer by phone to a Caspia customer, refused for unknown numbers', async () => {
    const s = 'p0-phone'; const a = await st.mcp(s);
    const ok = await confirm(s, await a.call('transfer_phone_prepare', { phone: await ingress(s, 'phone', '0551112207'), amount: 15, currency: 'AZN' }));
    expect(ok.body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'transfer', to: 'Nigar Ismayilova', amount: 15, currency: 'AZN' }]);
    expect((await a.call('transfer_phone_prepare', { phone: await ingress(s, 'phone', '0509999999'), amount: 15, currency: 'AZN' })).body.error.code).toBe('NOT_A_CUSTOMER');
  });

  it('template transfer and own top-up', async () => {
    const s = 'p0-tpl'; const a = await st.mcp(s);
    const tpl = (await a.call('templates_list')).body.items;
    const rent = tpl.find((x: any) => x.name === 'Rent');
    expect(rent).toMatchObject({ payee: 'Rashad Guliyev', amount: 450 });
    expect((await confirm(s, await a.call('transfer_template_prepare', { template: rent.template }))).body.status).toBe('committed');
    expect((await confirm(s, await a.call('topup_own_prepare', { amount: 10 }))).body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'transfer', to: 'Rashad Guliyev', amount: 450, currency: 'AZN' }, { type: 'topup', operator: 'Bakcell', amount: 10 }]);
  });

  it('mobile top-up to a typed number, within the top-up limit', async () => {
    const s = 'p0-topup'; const a = await st.mcp(s);
    const tel = await ingress(s, 'phone', '+994 55 123 45 67');
    expect((await a.call('topup_mobile_prepare', { operator: 'Bakcell', phone: tel, amount: 150 })).body.error.code).toBe('LIMIT_PER_TRANSACTION');
    expect((await confirm(s, await a.call('topup_mobile_prepare', { operator: 'Bakcell', phone: tel, amount: 5 }))).body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'topup', operator: 'Bakcell', amount: 5 }]);
  });

  it('block then unblock a card (unblock needs biometric/PIN)', async () => {
    const s = 'p0-unblock'; const a = await st.mcp(s);
    const card = (await a.call('cards_list')).body.items.find((c: any) => c.last4 === '4417').card;
    expect((await confirm(s, await a.call('card_block_prepare', { card }), false)).body.status).toBe('committed');
    const prep = await a.call('card_unblock_prepare', { card });
    const dev = await st.device(s);
    const v = await (await dev.get(prep.body.prepared_id)).json();
    expect(v.level).toBe('biometric');
    expect((await dev.post(prep.body.prepared_id, { decision: 'approve', payload_hash: v.payloadHash })).status).toBe(401);
    expect((await confirm(s, await a.call('card_unblock_prepare', { card }))).body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'card_blocked', last4: '4417' }, { type: 'card_unblocked', last4: '4417' }]);
  });
});

describe('P1 capabilities', () => {
  it('analytics are calculated by the bank', async () => {
    const a = await st.mcp('p1-ana');
    const cat = (await a.call('analytics_spend_by_category', { period: 'last_30_days' })).body;
    expect(cat.total_spent).toBeGreaterThan(0);
    expect(cat.items[0]).toHaveProperty('category');
    const sum = Math.round(cat.items.reduce((s: number, x: any) => s + x.amount * 100, 0));
    expect(sum).toBe(Math.round(cat.total_spent * 100));
    const cmp = (await a.call('analytics_compare_periods', { period_a: 'last_30_days', period_b: 'previous_30_days' })).body;
    expect(Math.round((cmp.period_a_total - cmp.period_b_total) * 100)).toBe(Math.round(cmp.difference * 100));
    const top = (await a.call('analytics_top_expenses', { period: 'last_90_days', limit: 3 })).body;
    expect(top.items).toHaveLength(3);
    expect(top.items[0].amount).toBeLessThanOrEqual(top.items[1].amount);
    const inc = (await a.call('analytics_income_sources', { period: 'last_90_days' })).body;
    expect(inc.items.map((x: any) => x.untrusted_text.source)).toContain('Caspia Tech LLC');
  });

  it('pay all unpaid bills in one confirmation', async () => {
    const s = 'p1-bills'; const a = await st.mcp(s);
    const prep = await a.call('bills_pay_all_prepare');
    expect(prep.body.details).toMatchObject({ count: '4', amount: '73.35 AZN' });
    expect((await confirm(s, prep)).body.status).toBe('committed');
    expect((await effects(s)).map((e: any) => e.biller).sort()).toEqual(['Azerigaz', 'Azerishiq', 'Azersu', 'Bakcell']);
    expect((await a.call('bills_pay_all_prepare')).body.error.code).toBe('NOTHING_TO_PAY');
  });

  it('cancel a subscription', async () => {
    const s = 'p1-sub'; const a = await st.mcp(s);
    const nf = (await a.call('subscriptions_list')).body.items.find((x: any) => x.merchant === 'Netflix');
    const r = await confirm(s, await a.call('subscription_cancel_prepare', { subscription: nf.subscription }), false);
    expect(r.view.level).toBe('tap');
    expect(r.body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([{ type: 'subscription_cancelled', merchant: 'Netflix' }]);
  });

  it('order a replacement card to Quba', async () => {
    const s = 'p1-rplc'; const a = await st.mcp(s);
    const card = (await a.call('cards_list')).body.items.find((c: any) => c.last4 === '4417').card;
    const quba = (await a.call('branches_list')).body.items.find((b: any) => b.city === 'Quba').branch;
    expect((await confirm(s, await a.call('card_replace_prepare', { card, branch: quba }), false)).body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'card_replacement', last4: '4417', branch: 'Quba' }]);
    const virt = (await a.call('cards_list')).body.items.find((c: any) => c.last4 === '7731').card;
    expect((await a.call('card_replace_prepare', { card: virt, branch: quba })).body.error.code).toBe('VIRTUAL_CARD');
  });

  it('recurring transfer, split and payment requests', async () => {
    const s = 'p1-misc'; const a = await st.mcp(s);
    const leyla = (await a.call('contacts_search', { query: 'Leyla' })).body.items[0].contact;
    expect((await confirm(s, await a.call('transfer_recurring_prepare', { contact: leyla, amount: 50, currency: 'AZN', frequency: 'monthly' }))).body.status).toBe('committed');
    const split = (await a.call('split_calculate', { amount: 90, people: 3 })).body;
    expect(split).toMatchObject({ share: 30, people: 3, remainder: 0 });
    const tural = (await a.call('contacts_search', { query: 'Tural' })).body.items[0].contact;
    const aysel = (await a.call('contacts_search', { query: 'Aysel' })).body.items[0].contact;
    const rq = await a.call('payment_request_prepare', { contacts: [tural, aysel], amount: 30, note: 'Dinner' });
    expect(rq.body.details.payee_name).toBe('Tural Abbasov, Aysel Karimova');
    expect((await confirm(s, rq, false)).body.status).toBe('committed');
    expect(await effects(s)).toEqual([
      { type: 'recurring_transfer', to: 'Leyla Aliyeva', amount: 50, currency: 'AZN', frequency: 'monthly' },
      { type: 'payment_request', from: 'Tural Abbasov', amount: 30 },
      { type: 'payment_request', from: 'Aysel Karimova', amount: 30 },
    ]);
  });

  it('recurring transfer with a start day: the bank works out the date and the bank screen shows it', async () => {
    const s = 'p1-so-start'; const a = await st.mcp(s);
    const ali = (await a.call('contacts_search', { query: 'Ali Mammadov' })).body.items[0].contact;
    const prep = await a.call('transfer_recurring_prepare', { contact: ali, amount: 100, currency: 'AZN', frequency: 'monthly', start_day: 5 });
    expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
    const r = await confirm(s, prep);
    const first = r.view.display.find((d: any) => d.key === 'start').value;
    expect(first).toMatch(/^\w+day, 5 \w+ 20\d\d$/);
    expect(r.body.status).toBe('committed');
    const weekly = await a.call('transfer_recurring_prepare', { contact: ali, amount: 20, currency: 'AZN', frequency: 'weekly', start_weekday: 'friday' });
    expect(weekly.body.details.start).toMatch(/^Friday, /);
    // the Bridge rejects a day the bank cannot schedule every month
    expect((await a.call('transfer_recurring_prepare', { contact: ali, amount: 20, currency: 'AZN', frequency: 'monthly', start_day: 31 })).isError).toBe(true);
  });

  it('knowledge base answers from bank content', async () => {
    const a = await st.mcp('p1-kb');
    const r = (await a.call('kb_search', { query: 'fee for transfer to another bank card' })).body;
    expect(r.items[0].text).toMatch(/0\.5%/);
  });
});

describe('currency exchange between own accounts', () => {
  it('buys dollars with manat at the bank rate, the bank works out the other side', async () => {
    const s = 'p0-fx'; const a = await st.mcp(s);
    const prep = await a.call('fx_exchange_prepare', { from_currency: 'AZN', to_currency: 'USD', amount: 100, currency: 'USD' });
    expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
    expect(prep.body.details).toMatchObject({ you_pay: '170.35 AZN', you_get: '100.00 USD', rate: '1 USD = 1.7035 AZN' });
    const r = await confirm(s, prep);
    expect(r.body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([{ type: 'fx_exchange', from: 'AZN', to: 'USD', amount: 170.35, received: 100 }]);
  });
  it('sells dollars for manat, and refuses an exchange within one currency', async () => {
    const s = 'p0-fx2'; const a = await st.mcp(s);
    const prep = await a.call('fx_exchange_prepare', { from_currency: 'USD', to_currency: 'AZN', amount: 50, currency: 'USD' });
    expect(prep.body.details).toMatchObject({ you_pay: '50.00 USD', you_get: '84.93 AZN' });
    expect((await a.call('fx_exchange_prepare', { from_currency: 'AZN', to_currency: 'AZN', amount: 50, currency: 'AZN' })).isError).toBe(true);
  });
});

describe('card settings and limits', () => {
  it('turns online payments off and changes a daily limit, and the app shows the new values', async () => {
    const s = 'p1-cardctl'; const a = await st.mcp(s);
    const card = (await a.call('cards_list')).body.items.find((c: any) => String(c.masked || c.last4 || '').endsWith('4417') || c.name === 'Caspia Debit').card;
    const off = await a.call('card_settings_prepare', { card, setting: 'online_payments', enabled: false });
    expect(off.isError, JSON.stringify(off.body)).toBe(false);
    expect(off.body.details).toMatchObject({ setting: 'Online payments', new_state: 'Off' });
    expect((await confirm(s, off)).body).toMatchObject({ status: 'committed', verified: true });
    const lim = await a.call('card_limit_prepare', { card, limit: 'cash', amount: 500 });
    expect(lim.body.details).toMatchObject({ limit: 'Daily cash withdrawal limit', old_limit: '1,000.00 AZN', amount: '500.00 AZN' });
    expect((await confirm(s, lim)).body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([
      { type: 'card_setting', last4: '4417', setting: 'online_payments', enabled: 'no' },
      { type: 'card_limit', last4: '4417', limit: 'cash', amount: 500 },
    ]);
  });
  it('refuses limits outside the allowed range and contactless on a virtual card', async () => {
    const s = 'p1-cardctl-bad'; const a = await st.mcp(s);
    const cards = (await a.call('cards_list')).body.items;
    const debit = cards.find((c: any) => c.name === 'Caspia Debit').card;
    const virt = cards.find((c: any) => c.virtual === 'yes' || c.virtual === true).card;
    expect((await a.call('card_limit_prepare', { card: debit, limit: 'purchase', amount: 999999 })).isError).toBe(true);
    expect((await a.call('card_settings_prepare', { card: virt, setting: 'contactless', enabled: true })).isError).toBe(true);
  });
});

describe('new card', () => {
  it('issues a virtual card at once and orders a physical card to a branch', async () => {
    const s = 'p1-newcard'; const a = await st.mcp(s);
    const before = (await a.call('cards_list')).body.items.length;
    const v = await a.call('card_new_prepare', { kind: 'virtual', currency: 'AZN' });
    expect(v.isError, JSON.stringify(v.body)).toBe(false);
    expect(v.body.details).toMatchObject({ card: 'Virtual AZN card', ready: 'Now' });
    expect((await confirm(s, v)).body).toMatchObject({ status: 'committed', verified: true });
    expect((await a.call('cards_list')).body.items.length).toBe(before + 1);
    const quba = (await a.call('branches_list')).body.items.find((b: any) => /Quba/.test(b.name)).branch;
    const p = await a.call('card_new_prepare', { kind: 'physical', currency: 'USD', branch: quba });
    expect(p.body.details.pickup).toMatch(/Quba/);
    expect((await confirm(s, p)).body.status).toBe('committed');
    expect(await effects(s)).toEqual([{ type: 'card_issued', kind: 'virtual', currency: 'AZN' }, { type: 'card_issued', kind: 'physical', currency: 'USD' }]);
    expect((await a.call('card_new_prepare', { kind: 'physical', currency: 'AZN' })).isError).toBe(true);
  });
});

describe('term deposits', () => {
  it('opens a deposit at the bank rate, and the bank lists it', async () => {
    const s = 'p1-deposit'; const a = await st.mcp(s);
    const before = (await a.call('deposits_list')).body;
    expect(before.items.length).toBe(1);
    expect(String(before.products_offered)).toMatch(/Smart Saver/);
    const prep = await a.call('deposit_open_prepare', { product: 'smart_saver', term_months: 12, amount: 1000 });
    expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
    expect(prep.body.details).toMatchObject({ product: 'Smart Saver', amount: '1,000.00 AZN', term: '12 months', rate: '9%', interest: '90.00 AZN' });
    expect((await confirm(s, prep)).body).toMatchObject({ status: 'committed', verified: true });
    expect((await a.call('deposits_list')).body.items.length).toBe(2);
    expect(await effects(s)).toEqual([{ type: 'deposit_opened', product: 'Smart Saver', amount: 1000, currency: 'AZN', months: 12 }]);
  });
  it('refuses a term the product does not offer and an amount under the minimum', async () => {
    const s = 'p1-deposit-bad'; const a = await st.mcp(s);
    expect((await a.call('deposit_open_prepare', { product: 'dollar_deposit', term_months: 6, amount: 500 })).isError).toBe(true);
    expect((await a.call('deposit_open_prepare', { product: 'flex_save', term_months: 3, amount: 10 })).isError).toBe(true);
  });
});

describe('loan application', () => {
  it('submits an application priced by the bank; nothing moves', async () => {
    const s = 'p1-loan'; const a = await st.mcp(s);
    const prep = await a.call('loan_apply_prepare', { amount: 5000, term_months: 24 });
    expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
    expect(prep.body.details).toMatchObject({ amount: '5,000.00 AZN', term: '24 months', rate: '14.9%', decision: 'Pre-approved' });
    expect(prep.body.details.monthly).toMatch(/^24\d\.\d\d AZN$/);
    expect((await confirm(s, prep, false)).body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([{ type: 'loan_application', amount: 5000, months: 24 }]);
    expect((await a.call('loan_apply_prepare', { amount: 50000, term_months: 24 })).isError).toBe(true);
  });
});
