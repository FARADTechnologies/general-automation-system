// Spoken replies on the phone, as a natural running commentary: a short acknowledgement when the
// customer asks, a line while each step's form fills, a prompt when the bank screen opens, and a
// line when the bank confirms. Lines come from the server (the session voices them as soon as they
// exist) and play in order, one after another, so a new line never cuts the previous one.
// One audio element streams each line; it is unlocked by the customer's own tap (send or
// hold-to-talk), because mobile browsers block audio that starts on its own. If the server voice is
// unavailable, the browser's built-in voice reads the same text.

const KEY = 'gas-voice-replies';
let el: HTMLAudioElement | null = null;
let unlocked = false;
let serverVoice: boolean | null = null;

interface Line { url: string; text: string; at: number; key?: string }
const queue: Line[] = [];
let playing = false;
let current: Line | null = null;
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

/** Stop the current line and drop the queued ones (a new request, or voice switched off). */
export function stopSpeaking() {
  generation++;
  queue.length = 0;
  playing = false;
  current = null;
  try { if (el) { el.onended = null; el.onerror = null; if (!el.paused) el.pause(); } } catch { /* nothing playing */ }
  try { window.speechSynthesis?.cancel(); } catch { /* none */ }
}

/** Tell the session whether this phone wants spoken replies, so the server voices each line the
 *  moment it exists instead of waiting for the phone to ask. Also loads the voice setting. */
export async function announceVoice(session: string, on: boolean) {
  void hasServerVoice();
  try { await fetch(`/api/agent/sessions/${encodeURIComponent(session)}/voice`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) }); } catch { /* offline */ }
}

async function hasServerVoice(): Promise<boolean> {
  if (serverVoice !== null) return serverVoice;
  try { serverVoice = !!(await (await fetch('/api/agent/config')).json()).tts; } catch { serverVoice = false; }
  return serverVoice;
}

/** A line the session is voicing (step narration, the bank's confirmation, the final answer). */
export function queueLine(session: string, id: string, text: string) {
  if (!voiceRepliesOn()) return;
  queue.push({ url: `/api/agent/sessions/${encodeURIComponent(session)}/tts/${encodeURIComponent(id)}`, text, at: Date.now() });
  void pump();
}

/** A fixed line for a moment of the flow ("ack" when the customer asks, "confirm" when the bank screen opens). */
export function queuePhrase(key: string) {
  if (!voiceRepliesOn()) return;
  queue.push({ url: `/api/agent/tts/phrase/${encodeURIComponent(key)}`, text: '', at: Date.now(), key });
  void pump();
}

/** A fixed line that is no longer true (the customer already confirmed): drop it, even mid-sentence. */
export function dropPhrase(key: string) {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key === key) queue.splice(i, 1);
  if (current?.key === key && el) { el.onended = null; el.onerror = null; try { el.pause(); } catch { /* none */ } current = null; playing = false; void pump(); }
}

async function pump() {
  if (playing) return;
  const line = queue.shift();
  if (!line) return;
  if (Date.now() - line.at > 20_000) { void pump(); return; } // stale: skip it
  playing = true;
  current = line;
  const mine = generation;
  const next = () => { if (mine !== generation || current !== line) return; current = null; playing = false; void pump(); };
  if (!el) { try { el = new Audio(); } catch { /* no audio */ } }
  if (el && (await hasServerVoice())) {
    if (mine !== generation) return;
    el.onended = next;
    el.onerror = () => { el!.onerror = null; browserSpeak(line.text, next); };
    el.src = line.url;
    try { await el.play(); return; } catch { /* blocked or unavailable */ }
  }
  browserSpeak(line.text, next);
}

function browserSpeak(text: string, done: () => void) {
  if (!text || !('speechSynthesis' in window)) { done(); return; }
  const plain = text.replace(/\*\*|`/g, '').replace(/^\s*[-*•]\s+/gm, '').replace(/•{2,}\s?(\d+)/g, 'ending $1').replace(/\bAZN\b/g, 'manat').replace(/\bUSD\b/g, 'dollars');
  const u = new SpeechSynthesisUtterance(plain.slice(0, 600));
  u.lang = 'en-US';
  const voices = window.speechSynthesis.getVoices();
  const pick = voices.find((v) => /en-US/i.test(v.lang) && /Samantha|Google US English|Aria|Jenny|Natural/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang));
  if (pick) u.voice = pick;
  u.rate = 1.02;
  u.onend = done; u.onerror = done;
  window.speechSynthesis.speak(u);
}
