// Spoken replies. Only the assistant's own final answers in a session can be spoken (never
// arbitrary text from the client), so the speech quota cannot be spent from outside. The text is
// the same answer already shown on screen; nothing else is sent. Audio streams straight through
// and is not stored (I10).

export interface TtsConfig {
  apiKey?: string;
  voiceId: string;
  /** Tried in order; the next one is used when a model is unavailable. */
  models: string[];
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Fixed lines spoken at moments of the flow (no model text involved). Synthesised once. */
export const PHRASES: Record<string, string> = {
  ack: 'Sure, one moment.',
  confirm: 'Please confirm on the bank screen.',
};

interface Clip { chunks: Buffer[]; done: boolean; failed: boolean; waiters: Set<() => void>; at: number; model?: string }

export class TtsService {
  private clips = new Map<string, Clip>();
  /** Set when the provider says the account's credits are used up: until then nothing is sent to
   *  it, so the phone falls back to its own voice at once instead of after failed calls. */
  private pausedUntil = 0;
  constructor(private cfg: TtsConfig) {}
  get paused() { return Date.now() < this.pausedUntil; }
  get enabled() { return !!this.cfg.apiKey && this.cfg.voiceId !== 'none'; }
  has(key: string) { const c = this.clips.get(key); return !!c && !c.failed; }

  /** Start synthesis now and keep the audio, so a listener that asks later gets it at once.
   *  Starting the same key twice reuses the first. */
  start(key: string, text: string): void {
    if (this.has(key)) return;
    const clip: Clip = { chunks: [], done: false, failed: false, waiters: new Set(), at: Date.now() };
    this.clips.set(key, clip);
    this.evict();
    const wake = () => { for (const w of clip.waiters) w(); };
    void (async () => {
      try {
        const r = await this.stream(text);
        clip.model = r.model;
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          clip.chunks.push(Buffer.from(value));
          wake();
        }
        clip.done = true;
      } catch {
        clip.failed = true;
      }
      wake();
    })();
  }

  /** Send a started clip to an HTTP response as it arrives. Returns false if it failed before any audio. */
  async pipe(key: string, res: { headersSent: boolean; writeHead: (s: number, h: Record<string, string>) => unknown; write: (b: Buffer) => unknown; end: () => unknown }): Promise<boolean> {
    const clip = this.clips.get(key);
    if (!clip) return false;
    let sent = 0;
    for (;;) {
      if (clip.failed && sent === 0 && !res.headersSent) return false;
      if (sent < clip.chunks.length && !res.headersSent) res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=600', ...(clip.model ? { 'x-tts-model': clip.model } : {}) });
      while (sent < clip.chunks.length) res.write(clip.chunks[sent++]);
      if (clip.done || clip.failed) { if (!res.headersSent) return false; res.end(); return true; }
      await new Promise<void>((r) => { const w = () => { clip.waiters.delete(w); r(); }; clip.waiters.add(w); setTimeout(w, 15000); });
    }
  }

  /** Synthesise the fixed phrases and open the connection to the provider before anyone asks. */
  warm() { if (this.enabled) for (const [k, t] of Object.entries(PHRASES)) this.start('phrase:' + k, t); }

  private evict() {
    const old = Date.now() - 10 * 60_000;
    for (const [k, c] of this.clips) if (!k.startsWith('phrase:') && (c.at < old || this.clips.size > 300)) this.clips.delete(k);
  }

  /** Starts synthesis and returns the audio stream (MP3) as soon as the provider answers. */
  async stream(text: string): Promise<{ body: ReadableStream<Uint8Array>; model: string; firstByteMs: number }> {
    const f = this.cfg.fetchImpl || fetch;
    const t0 = Date.now();
    let last = '';
    if (this.paused) throw new Error('TTS_FAILED quota');
    for (const model of this.cfg.models) {
      try {
        const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.cfg.voiceId)}/stream?output_format=mp3_44100_64`, {
          method: 'POST',
          headers: { 'xi-api-key': this.cfg.apiKey || '', 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        });
        if (res.ok && res.body) return { body: res.body, model, firstByteMs: Date.now() - t0 };
        last = `${model}: ${res.status}`;
        if (res.status === 401 || res.status === 402 || res.status === 429) {
          const detail = await res.text().catch(() => '');
          if (/quota|credits?/i.test(detail)) {
            this.pausedUntil = Date.now() + 15 * 60_000;
            console.warn('spoken replies paused for 15 minutes: the speech provider has no credits left; phones use their own voice');
            break; // the other models draw on the same credits
          }
        }
      } catch (e) {
        last = `${model}: ${(e as Error).name}`;
      }
    }
    throw new Error(`TTS_FAILED ${last}`);
  }
}

const money = (whole: string, frac: string, major: string, minor: string) => {
  const w = whole.replace(/,/g, '');
  return frac && Number(frac) > 0 ? `${w} ${major} ${Number(frac)} ${minor}` : `${w} ${major}`;
};

/** Turns an on-screen answer into something that sounds natural when read aloud. */
export function speakable(text: string, maxChars = 600): string {
  let t = String(text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/(?:•{2,}|\*{3,}|\.{3,}|…)\s?(\d{2,4})\b/g, 'ending $1')
    .replace(/\b(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?\s?AZN\b/g, (_m, w, f) => money(w, f || '', 'manat', 'qapik'))
    .replace(/\b(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?\s?USD\b/g, (_m, w, f) => money(w, f || '', 'dollars', 'cents'))
    .replace(/\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g, (_m, w, f) => money(w, f || '', 'dollars', 'cents'))
    .replace(/\bAZN\b/g, 'manat')
    .replace(/\bUSD\b/g, 'dollars')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/:\./g, ':')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = (end > maxChars * 0.5 ? cut.slice(0, end + 1) : cut) + ' The details are on your screen.';
  }
  return t;
}

export function ttsFromEnv(env: NodeJS.ProcessEnv): TtsService {
  return new TtsService({
    apiKey: env.TTS_PROVIDER === 'none' ? '' : env.ELEVENLABS_API_KEY,
    voiceId: env.TTS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // "Sarah", a premade ElevenLabs voice
    models: (env.TTS_MODELS || 'eleven_v4_turbo,eleven_turbo_v2_5').split(',').map((s) => s.trim()).filter(Boolean),
    timeoutMs: Number(env.TTS_TIMEOUT_MS || 8000),
  });
}
