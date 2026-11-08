import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Send, Volume2, VolumeX, RotateCcw, CheckCircle2, Loader2, Info, Activity } from 'lucide-react';
import { useSeda } from '../seda/store.jsx';
import { useNav, Timeline } from '../ui/kit.jsx';
import CaspiaPhone from '../ui/CaspiaPhone.jsx';
import { runUtterance } from '../seda/engine/runner.js';
import { listen, speak, sttSupported } from '../seda/voice.js';

const EXAMPLES = ['What is my balance?', 'Send 35 manat to Murad', 'Pay my electricity bill', 'Top up my phone with 5 manat', 'Pay my traffic fine', 'How much did I spend this month?', 'Where should I put my money?', 'Freeze my card', 'Send 900 manat to Elvin'];

export default function Playground() {
  const { state } = useSeda();
  const { params, go } = useNav();
  const [text, setText] = useState(params.prefill || '');
  const [chat, setChat] = useState([{ who: 'bot', text: 'The phone shows the real Caspia app. Say or type what a customer would say, and watch Seda do the steps. Money only moves after the fingerprint on the phone.' }]);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState([]);
  const [session, setSession] = useState(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const stopRef = useRef(null);
  const logRef = useRef(null);
  const seen = useRef(new Set());

  const events = useMemo(() => state.events.filter((e) => e.session === session), [state.events, session]);
  const fresh = new Set(events.filter((e) => !seen.current.has(e.id)).map((e) => e.id));
  useEffect(() => { events.forEach((e) => seen.current.add(e.id)); });
  useEffect(() => { logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }); }, [chat]);

  const run = async (utter, source = 'text') => {
    if (!utter.trim() || busy) return;
    setBusy(true); setSteps([]); setText('');
    setChat((c) => [...c, { who: 'me', text: utter }]);
    const res = await runUtterance(utter, {
      flows: state.flows, source,
      say: (t) => speak(t, voiceOn),
      step: (t) => setSteps((s) => [...s, t]),
    }).catch((e) => ({ reply: 'Error: ' + e.message }));
    setSession(res.session);
    setChat((c) => [...c, { who: 'bot', text: res.reply, coach: res.coach }]);
    setBusy(false);
  };

  // capture the session id as soon as it starts, so the trace streams live
  useEffect(() => {
    if (!busy) return;
    const last = [...state.events].reverse().find((e) => e.type === 'voice');
    if (last && last.session !== session) setSession(last.session);
  }, [state.events, busy]); // eslint-disable-line

  useEffect(() => { if (params.prefill) setText(params.prefill); }, [params.prefill]);

  const mic = () => {
    if (listening) { stopRef.current?.(); return; }
    setListening(true); setInterim('');
    stopRef.current = listen({
      onInterim: setInterim,
      onFinal: (t) => { setInterim(''); run(t, 'voice'); },
      onError: (m) => setChat((c) => [...c, { who: 'bot', text: m }]),
      onEnd: () => setListening(false),
    });
  };

  return (
    <>
      <div className="sd-banner info"><Info size={16} style={{ flex: 'none', marginTop: 1 }} /><span>Test environment. The phone runs the actual Caspia app with its mock bank. Every step below is written to <strong>Live Traces</strong>.</span></div>
      <div className="sd-play">
        <div className="sd-card" style={{ minHeight: 'min(560px, 70vh)' }}>
          <div className="sd-card-h">
            <h2>Customer voice</h2>
            <button className="sd-iconbtn" onClick={() => setVoiceOn(!voiceOn)} aria-label={voiceOn ? 'Mute spoken replies' : 'Speak replies'} title={voiceOn ? 'Spoken replies on' : 'Spoken replies off'}>{voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          </div>
          <div ref={logRef} className="sd-stack" style={{ gap: 8, flex: 1, overflowY: 'auto', maxHeight: 360, paddingRight: 4 }}>
            {chat.map((m, i) => (
              <div key={i} className={'sd-msg ' + m.who}>
                {m.text}
                {m.coach && <button className="sd-btn sm" style={{ marginTop: 8, display: 'flex' }} onClick={() => go('coach')}>See the full reasoning</button>}
              </div>
            ))}
            {interim && <div className="sd-msg me" style={{ opacity: 0.6 }}>{interim}</div>}
            {busy && <div className="sd-msg bot"><Loader2 size={14} className="spin" /> Working…</div>}
          </div>
          {steps.length > 0 && (
            <div className="sd-steps">
              {steps.map((s, i) => <div key={i}>{i === steps.length - 1 && busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} color="var(--sd-ok)" />}{s}</div>)}
            </div>
          )}
          <form className="sd-say" onSubmit={(e) => { e.preventDefault(); run(text); }}>
            <button type="button" className={'sd-mic' + (listening ? ' live' : '')} onClick={mic} aria-label={listening ? 'Stop listening' : 'Speak'} title={sttSupported() ? 'Speak (English)' : 'Voice needs Chrome or Edge'}><Mic size={22} /></button>
            <input id="pg-input" className="sd-input" placeholder="e.g. Send 35 manat to Murad" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} data-sd="pg-input" />
            <button className="sd-btn primary" type="submit" disabled={busy || !text.trim()} aria-label="Run" data-sd="pg-run"><Send size={16} /></button>
          </form>
          <div className="sd-chips">{EXAMPLES.map((e) => <button key={e} className="sd-chip" onClick={() => run(e)} disabled={busy}>{e}</button>)}</div>
        </div>

        <div className="sd-phone-wrap">
          <CaspiaPhone />
          <button className="sd-btn sm" onClick={() => window.caspia?.navigate?.('/')}><RotateCcw size={14} /> Back to Home</button>
        </div>

        <div className="sd-card sd-play-trace">
          <div className="sd-card-h"><h2>Live trace</h2>{session && <button className="sd-btn sm" onClick={() => go('traces', { session })}><Activity size={14} /> Open in Traces</button>}</div>
          {session ? <Timeline events={events} freshIds={fresh} /> : <div className="sd-empty">Run a command to see each step: intent, MCP calls, navigation, summary, fingerprint and result.</div>}
        </div>
      </div>
    </>
  );
}
