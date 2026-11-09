// Spoken replies: the on-screen answer becomes natural speech, and a failing voice model falls
// back to the next one.
import { describe, it, expect } from 'vitest';
import { speakable, TtsService } from '../services/agent/src/tts.ts';

describe('speakable text', () => {
  it('reads amounts, masked cards and bullets naturally', () => {
    expect(speakable('Sent **25.00 AZN** to Rashad (card •••• 2321).')).toBe('Sent 25 manat to Rashad (card ending 2321).');
    expect(speakable('Fee 0.30 AZN, balance 1,200.00 USD')).toBe('Fee 0 manat 30 qapik, balance 1200 dollars');
    expect(speakable('You spent:\n- Dining: 118.34 AZN\n- Groceries: 94.98 AZN')).toBe('You spent: Dining: 118 manat 34 qapik. Groceries: 94 manat 98 qapik');
  });
  it('keeps long answers short and points to the screen', () => {
    const long = 'This is a sentence. '.repeat(60);
    const out = speakable(long, 200);
    expect(out.length).toBeLessThan(260);
    expect(out.endsWith('The details are on your screen.')).toBe(true);
  });
});

describe('voice provider', () => {
  it('moves to the next model when one is unavailable', async () => {
    const seen: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model_id;
      seen.push(model);
      if (model === 'first') return new Response('no', { status: 404 });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }) as unknown as typeof fetch;
    const t = new TtsService({ apiKey: 'k', voiceId: 'v', models: ['first', 'second'], timeoutMs: 1000, fetchImpl: f });
    const r = await t.stream('hello');
    expect(seen).toEqual(['first', 'second']);
    expect(r.model).toBe('second');
  });
  it('is off without a key', () => {
    expect(new TtsService({ apiKey: '', voiceId: 'v', models: ['m'], timeoutMs: 1 }).enabled).toBe(false);
  });
});
