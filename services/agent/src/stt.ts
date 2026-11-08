// Server-side speech-to-text for push-to-talk. Whole utterances only, no streaming.
// Primary and fallback are different providers, each with its own deadline; if both fail the
// caller gets an error, never invented text. Audio stays in memory for the duration of the
// request and is not written to disk or logs (I10).
//
// Provider choice and the 22 fixed vocabulary hints come from the team's measured bake-off:
// ElevenLabs Scribe v2 with hints first, Groq Whisper large-v3 with hints as fallback.

export type SttProviderId = 'scribe' | 'whisper';

export interface SttConfig {
  primary?: SttProviderId | 'none';
  fallback?: SttProviderId | 'none';
  timeoutMs: number;
  hints: string[];
  language: string; // ISO-639-1
  keys: { elevenlabs?: string; groq?: string };
  fetchImpl?: typeof fetch;
}

export interface SttAttempt { provider: SttProviderId; status: 'ok' | 'timeout' | 'error' | 'empty' | 'no_key'; ms: number; detail?: string }
export interface SttResult { text: string; provider: SttProviderId; latencyMs: number; fallbackUsed: boolean; attempts: SttAttempt[] }

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3' };
/** iOS records AAC in MP4, Android/Chrome Opus in WebM; both providers accept these containers. */
export function fileNameFor(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return `speech.${EXT[base] || 'webm'}`;
}

export class SttService {
  constructor(private cfg: SttConfig) {}

  private order(): SttProviderId[] {
    const list = [this.cfg.primary, this.cfg.fallback].filter((p): p is SttProviderId => p === 'scribe' || p === 'whisper');
    return [...new Set(list)].filter((p) => this.hasKey(p));
  }
  private hasKey(p: SttProviderId) { return p === 'scribe' ? !!this.cfg.keys.elevenlabs : !!this.cfg.keys.groq; }

  get enabled() { return this.order().length > 0; }
  get providers() { return this.order(); }

  async transcribe(audio: Buffer, mime: string): Promise<SttResult> {
    const t0 = Date.now();
    const attempts: SttAttempt[] = [];
    const order = this.order();
    if (!order.length) throw new Error('STT_DISABLED');
    for (const [i, provider] of order.entries()) {
      const a0 = Date.now();
      try {
        const text = (await this.call(provider, audio, mime)).trim();
        if (!text) { attempts.push({ provider, status: 'empty', ms: Date.now() - a0 }); continue; }
        attempts.push({ provider, status: 'ok', ms: Date.now() - a0 });
        return { text, provider, latencyMs: Date.now() - t0, fallbackUsed: i > 0, attempts };
      } catch (e) {
        const err = e as Error;
        const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        attempts.push({ provider, status: timeout ? 'timeout' : 'error', ms: Date.now() - a0, detail: timeout ? undefined : err.message.slice(0, 160) });
      }
    }
    const e = new Error('STT_FAILED') as Error & { attempts?: SttAttempt[] };
    e.attempts = attempts;
    throw e;
  }

  private async call(provider: SttProviderId, audio: Buffer, mime: string): Promise<string> {
    const f = this.cfg.fetchImpl || fetch;
    const file = new Blob([new Uint8Array(audio)], { type: mime.split(';')[0] || 'audio/webm' });
    const form = new FormData();
    const signal = AbortSignal.timeout(this.cfg.timeoutMs);
    if (provider === 'scribe') {
      // https://elevenlabs.io/docs/api-reference/speech-to-text/convert
      form.append('model_id', 'scribe_v2');
      form.append('file', file, fileNameFor(mime));
      form.append('language_code', this.cfg.language);
      form.append('tag_audio_events', 'false');
      for (const h of this.cfg.hints) form.append('keyterms', h);
      const r = await f('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': this.cfg.keys.elevenlabs || '' }, body: form, signal });
      if (!r.ok) throw new Error(`scribe ${r.status}`);
      const j = (await r.json()) as { text?: string };
      return String(j.text || '');
    }
    // https://console.groq.com/docs/speech-to-text (OpenAI-compatible); prompt is limited to 224 tokens
    form.append('model', 'whisper-large-v3');
    form.append('file', file, fileNameFor(mime));
    form.append('language', this.cfg.language);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (this.cfg.hints.length) form.append('prompt', this.cfg.hints.join(', '));
    const r = await f('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${this.cfg.keys.groq || ''}` }, body: form, signal });
    if (!r.ok) throw new Error(`whisper ${r.status}`);
    const j = (await r.json()) as { text?: string };
    return String(j.text || '');
  }
}

export function sttFromEnv(env: NodeJS.ProcessEnv, hints: string[]): SttService {
  const pick = (v: string | undefined, d: SttProviderId | 'none') => (v === 'scribe' || v === 'whisper' || v === 'none' ? v : d);
  return new SttService({
    primary: pick(env.STT_PRIMARY, 'scribe'),
    fallback: pick(env.STT_FALLBACK, 'whisper'),
    timeoutMs: Number(env.STT_TIMEOUT_MS || 2500),
    hints: env.STT_HINTS === 'off' ? [] : hints,
    language: env.STT_LANGUAGE || 'en',
    keys: { elevenlabs: env.ELEVENLABS_API_KEY, groq: env.GROQ_API_KEY },
  });
}
