// Push-to-talk voice input. When the agent service has a speech-to-text adapter configured, the
// browser records one utterance (MediaRecorder: Opus/WebM on Android and Chrome, AAC/MP4 on iOS)
// and sends it to /api/agent/sessions/:s/stt; the transcript then goes in as a normal voice turn.
// Without server STT the browser's Web Speech API is used. Audio is never stored on the device.
import { hub } from './hub.ts';

type Handlers = { onPartial: (t: string) => void; onFinal: (t: string) => void; onError: (msg: string) => void; onEnd: () => void };
type Rec = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };

let serverStt: boolean | null = null;
if (typeof window !== 'undefined') {
  fetch('/api/agent/config').then((r) => r.json()).then((c) => { serverStt = !!c.stt; }).catch(() => { serverStt = false; });
}

const webSpeech = () => typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
const recorder = () => typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function speechSupported(): boolean {
  return (recorder() && serverStt !== false) || webSpeech();
}

export function startListening(handlers: Handlers): () => void {
  if (recorder() && (serverStt === true || (serverStt === null && !webSpeech()))) return startRecording(handlers);
  return startWebSpeech(handlers);
}

const MAX_MS = 15_000;
const MIN_MS = 350;
const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function startRecording(h: Handlers): () => void {
  let stopRequested = false;
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let started = 0;
  const chunks: Blob[] = [];
  const release = () => stream?.getTracks().forEach((t) => t.stop());

  const finish = async () => {
    release();
    const ms = Date.now() - started;
    const type = (rec?.mimeType || chunks[0]?.type || 'audio/webm');
    const blob = new Blob(chunks, { type });
    if (ms < MIN_MS || blob.size < 1200) { h.onError('Hold the button while you speak.'); h.onEnd(); return; }
    h.onPartial('Transcribing…');
    try {
      const r = await fetch(`/api/agent/sessions/${encodeURIComponent(hub.session)}/stt`, { method: 'POST', headers: { 'content-type': type }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.text) { h.onPartial(j.text); h.onFinal(String(j.text)); }
      else if (r.status === 503) { serverStt = false; h.onError('Server voice is off. Hold again to use browser voice, or type.'); }
      else h.onError(r.status === 429 ? 'Too many voice requests. Wait a moment or type.' : 'Could not hear that. Try again or type.');
    } catch { h.onError('Could not reach the assistant. Type instead.'); }
    h.onEnd();
  };

  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then((s) => {
    stream = s;
    if (stopRequested) { release(); h.onError('Hold the button while you speak.'); h.onEnd(); return; }
    const mimeType = MIME.find((m) => (window as any).MediaRecorder.isTypeSupported?.(m));
    rec = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { void finish(); };
    started = Date.now();
    rec.start();
    setTimeout(() => { if (rec?.state === 'recording') rec.stop(); }, MAX_MS);
  }).catch((e) => {
    h.onError(e?.name === 'NotAllowedError' ? 'Microphone permission was denied. Type instead.' : 'Microphone is not available. Type instead.');
    h.onEnd();
  });

  return () => {
    stopRequested = true;
    if (rec?.state === 'recording') rec.stop();
  };
}

function startWebSpeech(handlers: Handlers): () => void {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) { handlers.onError('Voice input is not supported in this browser. Type instead.'); handlers.onEnd(); return () => undefined; }
  const rec: Rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    handlers.onPartial((finalText + ' ' + interim).trim());
  };
  rec.onerror = (e: any) => handlers.onError(e?.error === 'not-allowed' ? 'Microphone permission was denied. Type instead.' : 'Could not hear that. Try again or type.');
  rec.onend = () => { if (finalText.trim()) handlers.onFinal(finalText.trim()); handlers.onEnd(); };
  rec.start();
  return () => rec.stop();
}
