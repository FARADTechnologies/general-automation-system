// English speech in/out with the browser's free Web Speech APIs. Everything degrades to text.
export const sttSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function listen({ onInterim, onFinal, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError?.('Voice input needs Chrome or Edge. You can type instead.'); onEnd?.(); return () => {}; }
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const tx = e.results[i][0].transcript; if (e.results[i].isFinal) final += tx; else interim += tx; }
    onInterim?.(final + interim);
  };
  rec.onerror = (e) => onError?.(e.error === 'not-allowed' ? 'Microphone access was refused here. Type the command instead.' : 'Voice input error: ' + e.error);
  rec.onend = () => { if (final.trim()) onFinal?.(final.trim()); onEnd?.(); };
  try { rec.start(); } catch (err) { onError?.(String(err)); onEnd?.(); }
  return () => { try { rec.stop(); } catch { /* */ } };
}

export function speak(text, enabled = true) {
  if (!enabled || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/AZN/g, 'manat').replace(/•+/g, ''));
    u.lang = 'en-US'; u.rate = 1.02;
    const v = window.speechSynthesis.getVoices().find((x) => /en-(US|GB)/.test(x.lang));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch { /* */ }
}
