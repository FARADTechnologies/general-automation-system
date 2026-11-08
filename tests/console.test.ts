// Bank console and live extensibility: a capability for an existing internal endpoint is
// switched on from the console and works over MCP with no code change and no restart.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startStack, type Stack } from './stack.ts';

let st: Stack;
let cookie = '';
beforeAll(async () => { st = await startStack(); });
afterAll(async () => { await st.close(); });

const consoleCall = (path: string, body?: unknown) => fetch(`${st.bridgeUrl}/bridge/console${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe('bank console', () => {
  it('requires the operator passcode', async () => {
    expect((await consoleCall('/overview')).status).toBe(401);
    expect((await consoleCall('/login', { passcode: 'wrong' })).status).toBe(401);
    const r = await consoleCall('/login', { passcode: 'operator-test-pass' });
    expect(r.status).toBe(200);
    cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    const o = await (await consoleCall('/overview')).json();
    expect(o.capabilities.length).toBeGreaterThan(20);
    expect(o.optional).toEqual([expect.objectContaining({ id: 'fx.rates', enabled: false })]);
  });

  it('switches on an optional capability with no code change (live extensibility)', async () => {
    const a = await st.mcp('ext');
    expect((await a.client.listTools()).tools.map((t) => t.name)).not.toContain('fx_rates');
    expect((await consoleCall('/optional/fx.rates', { enabled: true })).status).toBe(200);
    expect((await a.client.listTools()).tools.map((t) => t.name)).toContain('fx_rates');
    const r = await a.call('fx_rates');
    expect(r.body.items.find((x: any) => x.currency === 'USD')).toMatchObject({ bank_buys_at: 1.6985, bank_sells_at: 1.7035 });
    expect((await consoleCall('/optional/fx.rates', { enabled: false })).status).toBe(200);
    expect((await a.client.listTools()).tools.map((t) => t.name)).not.toContain('fx_rates');
  });

  it('kill switch and limit changes take effect immediately and are audited', async () => {
    const a = await st.mcp('ks');
    await consoleCall('/capabilities/bill.pay.prepare', { enabled: false });
    expect((await a.client.listTools()).tools.map((t) => t.name)).not.toContain('bill_pay_prepare');
    await consoleCall('/capabilities/bill.pay.prepare', { enabled: true });
    const lim = await (await consoleCall('/limits', { group: 'transfer', currency: 'AZN', per_tx: 30 })).json();
    expect(lim.limits.transfer.per_tx.AZN).toBe(30);
    const ctc = (await a.call('contacts_search', { query: 'Leyla' })).body.items[0].contact;
    expect((await a.call('transfer_contact_prepare', { contact: ctc, amount: 50, currency: 'AZN' })).body.error.code).toBe('LIMIT_PER_TRANSACTION');
    await consoleCall('/limits', { group: 'transfer', currency: 'AZN', per_tx: 1000 });
    const audit = await (await consoleCall('/audit?limit=50')).json();
    expect(audit.items.map((x: any) => x.event)).toEqual(expect.arrayContaining(['capability.toggle', 'limit.change', 'manifest.optional']));
  });
});
