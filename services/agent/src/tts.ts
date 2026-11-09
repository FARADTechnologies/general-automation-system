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

export class TtsService {
  constructor(private cfg: TtsConfig) {}
  get enabled() { return !!this.cfg.apiKey && this.cfg.voiceId !== 'none'; }

  /** Starts synthesis and returns the audio stream (MP3) as soon as the provider answers. */
  async stream(text: string): Promise<{ body: ReadableStream<Uint8Array>; model: string; firstByteMs: number }> {
    const f = this.cfg.fetchImpl || fetch;
    const t0 = Date.now();
    let last = '';
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
