// The second provider is used only while the first is unreachable, and the conversation history
// passes through unchanged.
import { describe, it, expect } from 'vitest';
import { FallbackModel } from '../services/agent/src/model-fallback.ts';

const ok = (model: string) => ({ message: { model, content: [{ type: 'text', text: model }] }, latencyMs: 1, costUsd: 0 }) as any;

describe('model fallback', () => {
  it('switches to the second provider when the first fails, then retries the first after the cooldown', async () => {
    let t = 0;
    let primaryUp = false;
    const calls: string[] = [];
    const primary = { model: 'p', create: async () => { calls.push('p'); if (!primaryUp) throw Object.assign(new Error('down'), { status: 530 }); return ok('p'); } };
    const secondary = { model: 's', create: async () => { calls.push('s'); return ok('s'); } };
    const logs: string[] = [];
    const m = new FallbackModel(primary, secondary, { cooldownMs: 1000, now: () => t, log: (x) => logs.push(x) });
    const req = { system: 'x', tools: [], messages: [{ role: 'user', content: 'hi' }] } as any;

    expect((await m.create(req)).message.model).toBe('s');
    expect(m.model).toBe('s');
    expect((await m.create(req)).message.model).toBe('s'); // still cooling down: primary not retried
    expect(calls).toEqual(['p', 's', 's']);
    expect(logs[0]).toContain('530');

    t = 1500; primaryUp = true;
    expect((await m.create(req)).message.model).toBe('p');
    expect(m.model).toBe('p');
  });

  it('does not switch when the customer stopped the turn', async () => {
    const ac = new AbortController(); ac.abort();
    const primary = { model: 'p', create: async () => { throw new Error('aborted'); } };
    const secondary = { model: 's', create: async () => ok('s') };
    const m = new FallbackModel(primary, secondary);
    await expect(m.create({ system: '', tools: [], messages: [] } as any, ac.signal)).rejects.toThrow('aborted');
  });
});
