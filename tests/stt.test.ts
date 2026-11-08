// Speech-to-text adapter: provider order, deadlines, fallback, no invented text, and the HTTP
// route's input checks. Providers are faked; no audio leaves the machine in these tests.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SttService, fileNameFor } from '../services/agent/src/stt.ts';
import { startFullStack, ScriptedModel, text, ROOT } from './agent.stack.ts';

const HINTS = JSON.parse(readFileSync(resolve(ROOT, 'domains/bank/stt-hints.json'), 'utf8')) as string[];
const AUDIO = Buffer.alloc(4000, 7);

type Call = { url: string; headers: Record<string, string>; form: FormData };
function fakeFetch(behaviour: Record<'scribe' | 'whisper', 'ok' | 'hang' | 'error' | 'empty'>, text = 'Send 20 manat to Leyla Aliyeva') {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const provider = url.includes('elevenlabs') ? 'scribe' : 'whisper';
    calls.push({ url, headers: init.headers as Record<string, string>, form: init.body as FormData });
    const b = behaviour[provider];
    if (b === 'hang') return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))));
    if (b === 'error') return new Response('{"detail":"bad"}', { status: 500 });
    return new Response(JSON.stringify({ text: b === 'empty' ? '' : text }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const svc = (f: typeof fetch, keys = { elevenlabs: 'k1', groq: 'k2' }) =>
  new SttService({ primary: 'scribe', fallback: 'whisper', timeoutMs: 80, hints: HINTS, language: 'en', keys, fetchImpl: f });

describe('stt adapter', () => {
  it('is off without keys, so the client falls back to browser speech', async () => {
    const s = svc(fakeFetch({ scribe: 'ok', whisper: 'ok' }).f, { elevenlabs: '', groq: '' });
    expect(s.enabled).toBe(false);
    await expect(s.transcribe(AUDIO, 'audio/webm')).rejects.toThrow('STT_DISABLED');
  });

  it('uses Scribe v2 first with the 22 domain terms and the English language hint', async () => {
    const { f, calls } = fakeFetch({ scribe: 'ok', whisper: 'ok' });
    const r = await svc(f).transcribe(AUDIO, 'audio/webm;codecs=opus');
    expect(r).toMatchObject({ provider: 'scribe', fallbackUsed: false, text: 'Send 20 manat to Leyla Aliyeva' });
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['xi-api-key']).toBe('k1');
    expect(calls[0].form.get('model_id')).toBe('scribe_v2');
    expect(calls[0].form.get('language_code')).toBe('en');
    expect(calls[0].form.getAll('keyterms')).toEqual(HINTS);
    expect(HINTS).toHaveLength(22);
  });

  it('falls back to Groq Whisper when Scribe misses its deadline', async () => {
    const { f, calls } = fakeFetch({ scribe: 'hang', whisper: 'ok' });
    const r = await svc(f).transcribe(AUDIO, 'audio/mp4');
    expect(r.provider).toBe('whisper');
    expect(r.fallbackUsed).toBe(true);
    expect(r.attempts.map((a) => a.status)).toEqual(['timeout', 'ok']);
    expect(calls[1].headers.authorization).toBe('Bearer k2');
    expect(calls[1].form.get('model')).toBe('whisper-large-v3');
    expect(String(calls[1].form.get('prompt'))).toContain('Nigar Ismayilova');
    expect((calls[1].form.get('file') as File).name).toBe('speech.mp4');
  });

  it('never invents text: both providers failing or returning nothing is an error', async () => {
    await expect(svc(fakeFetch({ scribe: 'error', whisper: 'hang' }).f).transcribe(AUDIO, 'audio/webm')).rejects.toThrow('STT_FAILED');
    await expect(svc(fakeFetch({ scribe: 'empty', whisper: 'empty' }).f).transcribe(AUDIO, 'audio/webm')).rejects.toThrow('STT_FAILED');
  });

  it('names uploads by container so iOS AAC and Android Opus are both accepted', () => {
    expect(fileNameFor('audio/webm;codecs=opus')).toBe('speech.webm');
    expect(fileNameFor('audio/mp4')).toBe('speech.mp4');
    expect(fileNameFor('audio/ogg;codecs=opus')).toBe('speech.ogg');
  });
});

describe('stt route', async () => {
  const { f } = fakeFetch({ scribe: 'ok', whisper: 'ok' }, 'What is my balance?');
  const stack = await startFullStack(new ScriptedModel(() => [text('ok')]), { stt: svc(f) });
  afterAll(() => stack.close());
  const post = (body: Buffer, type: string) => fetch(`${stack.agentUrl}/api/agent/sessions/stt-test/stt`, { method: 'POST', headers: { 'content-type': type }, body: new Uint8Array(body) });

  it('reports server STT in the client config', async () => {
    expect((await (await fetch(stack.agentUrl + '/api/agent/config')).json()).stt).toBe(true);
  });
  it('transcribes audio and records only provider and timing in the trace', async () => {
    const r = await post(AUDIO, 'audio/webm');
    expect(r.status).toBe(200);
    expect((await r.json()).text).toBe('What is my balance?');
    const traces = stack.agent.sessions.get('stt-test').traces.filter((t) => t.kind === 'stt');
    expect(traces).toHaveLength(1);
    expect(traces[0].detail).toMatchObject({ provider: 'scribe', bytes: AUDIO.length });
    expect(JSON.stringify(traces[0])).not.toContain('balance');
  });
  it('rejects non-audio bodies and clips too short to hold speech', async () => {
    expect((await post(AUDIO, 'text/plain')).status).toBe(415);
    expect((await post(Buffer.alloc(100), 'audio/webm')).status).toBe(400);
  });
});
