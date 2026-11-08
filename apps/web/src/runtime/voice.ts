// Temporary speech input through the browser's Web Speech API, kept as a fallback once a
// server STT adapter is configured. No audio is stored anywhere.
type Rec = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function startListening(handlers: { onPartial: (t: string) => void; onFinal: (t: string) => void; onError: (msg: string) => void; onEnd: () => void }): () => void {
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
