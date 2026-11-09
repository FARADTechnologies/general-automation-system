// Spoken replies on the phone. The server speaks only answers that are already in the session's
// transcript; the client asks for them by id. One audio element streams the reply as it arrives;
// it is unlocked by the customer's own tap (send or hold-to-talk), because mobile browsers block
// audio that starts on its own. If the server voice is unavailable, the browser's built-in voice
// reads the same text.

const KEY = 'gas-voice-replies';
let el: HTMLAudioElement | null = null;
let unlocked = false;
let serverVoice: boolean | null = null;
let generation = 0;

/** A tenth of a second of silence as a WAV file, used to unlock the audio element. */
function silentWav(): string {
  const rate = 8000, n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function voiceRepliesOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setVoiceReplies(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
  if (!on) stopSpeaking();
}

/** Call from a user gesture (tap on send, press on the microphone). */
export function unlockAudio() {
  try {
    if (!el) { el = new Audio(); el.preload = 'auto'; }
    if (!unlocked) { el.src = silentWav(); void el.play().then(() => { unlocked = true; }).catch(() => undefined); }
    // iOS also needs the speech engine touched inside a gesture for the fallback voice.
    if ('speechSynthesis' in window && !window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  } catch { /* audio not available */ }
}

export function stopSpeaking() {
  generation++;
  try { if (el && !el.paused) el.pause(); } catch { /* nothing playing */ }
  try { window.speechSynthesis?.cancel(); } catch { /* none */ }
}

async function hasServerVoice(): Promise<boolean> {
  if (serverVoice !== null) return serverVoice;
  try { serverVoice = !!(await (await fetch('/api/agent/config')).json()).tts; } catch { serverVoice = false; }
  return serverVoice;
}

/** Speak one assistant answer (by transcript id). Falls back to the browser voice. */
export async function speakAnswer(session: string, answerId: string, text: string) {
  if (!voiceRepliesOn()) return;
  stopSpeaking();
  const mine = generation;
  if (await hasServerVoice() && el) {
    try {
      if (mine !== generation) return; // a newer request or a stop came in meanwhile
      el.src = `/api/agent/sessions/${encodeURIComponent(session)}/tts/${encodeURIComponent(answerId)}`;
      await el.play(); // streams: playback starts while the rest of the audio arrives
      return;
    } catch { /* blocked or unavailable: fall through to the browser voice */ }
  }
  if (mine !== generation) return;
  browserSpeak(text);
}

function browserSpeak(text: string) {
  if (!('speechSynthesis' in window)) return;
  const plain = text.replace(/\*\*|`/g, '').replace(/^\s*[-*•]\s+/gm, '').replace(/•{2,}\s?(\d+)/g, 'ending $1').replace(/\bAZN\b/g, 'manat').replace(/\bUSD\b/g, 'dollars');
  const u = new SpeechSynthesisUtterance(plain.slice(0, 600));
  u.lang = 'en-US';
  const voices = window.speechSynthesis.getVoices();
  const pick = voices.find((v) => /en-US/i.test(v.lang) && /Samantha|Google US English|Aria|Jenny|Natural/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang));
  if (pick) u.voice = pick;
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}
