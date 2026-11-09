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
  it('keeps a started clip so a later listener gets it without a second synthesis', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(new Uint8Array([7, 8, 9]), { status: 200 }); }) as unknown as typeof fetch;
    const t = new TtsService({ apiKey: 'k', voiceId: 'v', models: ['m'], timeoutMs: 1000, fetchImpl: f });
    t.start('s:a1', 'hello');
    t.start('s:a1', 'hello'); // reused
    const got: number[] = [];
    let status = 0, ended = false;
    const res = { headersSent: false, writeHead(st: number) { status = st; this.headersSent = true; }, write(b: Buffer) { got.push(...b); }, end() { ended = true; } };
    expect(await t.pipe('s:a1', res)).toBe(true);
    expect(status).toBe(200); expect(ended).toBe(true); expect(got).toEqual([7, 8, 9]);
    expect(calls).toBe(1);
  });
  it('stops calling the provider when its credits are used up', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: 'This request exceeds your quota. You have 12 credits remaining.' } }), { status: 401 }); }) as unknown as typeof fetch;
    const t = new TtsService({ apiKey: 'k', voiceId: 'v', models: ['a', 'b'], timeoutMs: 1000, fetchImpl: f });
    await expect(t.stream('hello')).rejects.toThrow('TTS_FAILED');
    expect(calls).toBe(1); // the second model shares the same credits, so it is not tried
    expect(t.paused).toBe(true);
    await expect(t.stream('again')).rejects.toThrow('TTS_FAILED');
    expect(calls).toBe(1); // nothing is sent while paused
  });
  it('is off without a key', () => {
    expect(new TtsService({ apiKey: '', voiceId: 'v', models: ['m'], timeoutMs: 1 }).enabled).toBe(false);
  });
});
