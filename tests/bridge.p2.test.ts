// P2 investment capabilities through the Bridge, without a model: simulated market data is
// labelled, an order needs an instrument reference from market.quote, prepare moves nothing,
// confirmation commits and the portfolio shows the result, and the invest limit holds.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startStack, type Stack } from './stack.ts';

let st: Stack;
beforeAll(async () => { st = await startStack(); });
afterAll(async () => { await st.close(); });

const effects = async (s: string) => (await (await fetch(`${st.coreUrl}/internal/admin/effects?ext_ref=${s}`, { headers: { 'x-cb-svc-key': st.keys.core } })).json()).items;
async function approve(s: string, preparedId: string) {
  const dev = await st.device(s);
  const v = await (await dev.get(preparedId)).json();
  const r = await dev.post(preparedId, { decision: 'approve', payload_hash: v.payloadHash, proof: { method: 'pin', pin: '1234' }, acknowledge_warning: true });
  return { view: v, body: await r.json() };
}

describe('P2 investment capabilities', () => {
  it('screens simulated technology stocks that rose today, labelled as simulated', async () => {
    const a = await st.mcp('p2-screen');
    const r = await a.call('market_screen', { sector: 'technology', period: '1d', direction: 'up', limit: 5 });
    expect(r.isError).toBe(false);
    const items = r.body.items as { sector: string; change_1d_pct: number }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.every((x) => x.sector === 'technology' && x.change_1d_pct > 0)).toBe(true);
    const changes = items.map((x) => x.change_1d_pct);
    expect([...changes].sort((p, q) => q - p)).toEqual(changes);
    expect(r.body.data_label).toMatch(/simulated/i);
  });

  it('prepares a buy order from a quoted instrument, moves nothing until the customer confirms', async () => {
    const s = 'p2-order'; const a = await st.mcp(s);
    const q = await a.call('market_quote', { query: 'Novexa' });
    const inst = q.body.items[0];
    expect(inst).toMatchObject({ symbol: 'NOVX', name: 'Novexa Systems' });
    expect(inst.instrument).not.toBe('NOVX'); // a Bridge token, not the raw symbol
    const prep = await a.call('invest_order_prepare', { instrument: inst.instrument, amount: 100 });
    expect(prep.isError, JSON.stringify(prep.body)).toBe(false);
    expect(await effects(s)).toEqual([]); // prepare never commits (I2)
    const { view, body } = await approve(s, prep.body.prepared_id);
    expect(view.display.find((d: { key: string }) => d.key === 'label').value).toMatch(/Simulated market data/);
    expect(body).toMatchObject({ status: 'committed', verified: true });
    expect(await effects(s)).toEqual([{ type: 'invest_order', symbol: 'NOVX', amount: 100, currency: 'USD' }]);
    const pf = await a.call('portfolio_get');
    expect(pf.body.items.some((h: { symbol: string }) => h.symbol === 'NOVX')).toBe(true);
  });

  it('refuses an order on a raw symbol that did not come from market.quote', async () => {
    const s = 'p2-raw'; const a = await st.mcp(s);
    const prep = await a.call('invest_order_prepare', { instrument: 'NOVX', amount: 50 });
    expect(prep.isError).toBe(true);
    expect(await effects(s)).toEqual([]);
  });

  it('holds an order above the per-transaction invest limit', async () => {
    const s = 'p2-limit'; const a = await st.mcp(s);
    const inst = (await a.call('market_quote', { query: 'ROBO' })).body.items[0].instrument;
    const prep = await a.call('invest_order_prepare', { instrument: inst, amount: 900 });
    expect(prep.isError).toBe(true);
    expect(JSON.stringify(prep.body)).toMatch(/LIMIT/i);
    expect(await effects(s)).toEqual([]);
  });
});
