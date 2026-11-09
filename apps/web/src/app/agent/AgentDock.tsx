// Agent dock: push-to-talk and text input, agent status, live plan, last exchange.
import React, { useEffect, useRef, useState } from 'react';
import { Mic, SendHorizontal, Square, Sparkles, Check, X, Loader2, Circle, Volume2, VolumeX } from 'lucide-react';
import { hub, useUi, useConnected, useHubEvent } from '../../runtime/hub.ts';
import { speechSupported, startListening } from '../../runtime/voice.ts';
import { useMode } from '../App.jsx';
import { useLocation } from 'react-router-dom';
import { RichText } from '../../runtime/RichText';
import { unlockAudio, stopSpeaking, voiceRepliesOn, setVoiceReplies, announceVoice, queueLine, queuePhrase, dropPhrase } from '../../runtime/speech.ts';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Ask me to do something',
  listening: 'Listening…',
  thinking: 'Thinking…',
  acting: 'Working in the app…',
  waiting_confirmation: 'Waiting for your confirmation',
  paused: 'Paused',
  handoff: 'Handed to a bank specialist',
  error: 'Something went wrong',
};

let tryCache: string[] | null = null;

export default function AgentDock({ withTabs }: { withTabs: boolean }) {
  const mode = useMode();
  const onHome = useLocation().pathname === '/';
  const status = useUi((s) => s.agent.status);
  const note = useUi((s) => s.agent.note);
  const plan = useUi((s) => s.plan);
  const transcript = useUi((s) => s.transcript);
  const connected = useConnected();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [tries, setTries] = useState<string[]>(tryCache || []);
  const [open, setOpen] = useState(false);
  const stopRef = useRef<() => void>();
  const [voiceOn, setVoiceOn] = useState(voiceRepliesOn());
  const busy = !['idle', 'paused', 'error', 'handoff'].includes(status);

  useEffect(() => {
    if (tryCache) return;
    fetch('/api/agent/config').then((r) => r.json()).then((c) => { tryCache = c.tryCommands || []; setTries(tryCache!); }).catch(() => undefined);
  }, []);

  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    unlockAudio(); stopSpeaking(); void announceVoice(hub.session, voiceOn);
    hub.input(v, 'text');
    if (mode === 'phone') queuePhrase('ack');
    setText('');
    setOpen(true);
  };

  const micDown = () => {
    unlockAudio(); stopSpeaking(); void announceVoice(hub.session, voiceOn);
    if (busy || listening) return;
    setListening(true); setPartial('');
    stopRef.current = startListening({
      onPartial: setPartial,
      onFinal: (t) => { hub.input(t, 'voice'); setOpen(true); if (mode === 'phone') queuePhrase('ack'); },
      onError: (m) => setPartial(m),
      onEnd: () => { setListening(false); setTimeout(() => setPartial(''), 1500); },
    });
  };
  const micUp = () => { stopRef.current?.(); };

  const lastUser = [...transcript].reverse().find((t) => t.role === 'user');
  const lastAgent = [...transcript].reverse().find((t) => t.role === 'agent');
  const showAgentReply = lastAgent && lastUser && lastAgent.at >= lastUser.at;
  // Running commentary: the session sends each line as it happens (step narration, the bank's
  // confirmation, the final answer) and the phone plays them in order.
  useHubEvent('agent.say', (e) => {
    if (mode !== 'phone') return;
    const p = e.payload as { id: string; text: string };
    queueLine(hub.session, p.id, p.text);
  });
  const toggleVoice = () => { const on = !voiceOn; setVoiceOn(on); setVoiceReplies(on); void announceVoice(hub.session, on); if (on) unlockAudio(); };
  // Tell the session this phone listens, so answers are voiced as soon as they are written.
  useEffect(() => { if (mode === 'phone') void announceVoice(hub.session, voiceOn); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Speak with the action: a short fixed line the moment the bank's confirmation screen opens.
  const modal = useUi((s) => s.modal);
  const confirmId = modal?.kind === 'confirm' ? (modal as { confirmId: string }).confirmId : null;
  useEffect(() => { if (mode !== 'phone') return; if (confirmId) queuePhrase('confirm'); else dropPhrase('confirm'); }, [confirmId]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusText = listening ? 'Listening…' : (note && (status === 'paused' || status === 'error') ? note : STATUS_TEXT[status] || status);

  return (
    <div className={'agent-dock' + (withTabs ? ' with-tabs' : '')} data-mode={mode}>
      {(open || busy) && (lastUser || plan) && (
        <div className="agent-panel">
          <button className="agent-close" aria-label="Hide" onClick={() => setOpen(false)}><X size={16} /></button>
          {lastUser && <p className="agent-said"><span>You</span>{lastUser.text}</p>}
          {plan && plan.steps.length > 0 && (
            <ol className="agent-plan" aria-label="Plan">
              {plan.steps.map((s) => (
                <li key={s.id} className={'st-' + s.status}>
                  {s.status === 'done' ? <Check size={14} /> : s.status === 'failed' ? <X size={14} /> : s.status === 'running' || s.status === 'waiting_confirmation' ? <Loader2 size={14} className="spin" /> : <Circle size={10} />}
                  <span>{s.title}</span>
                </li>
              ))}
            </ol>
          )}
          {showAgentReply && <p className="agent-reply"><Sparkles size={14} /><RichText text={lastAgent!.text} /></p>}
        </div>
      )}

      {!busy && !lastUser && onHome && mode === 'phone' && tries.length > 0 && (
        <div className="try-saying" data-nav-id="agent-try-saying">
          <span className="eyebrow">Try saying</span>
          <div className="try-chips">{tries.map((t) => <button key={t} className="chip" onClick={() => send(t)}>{t}</button>)}</div>
        </div>
      )}

      <div className="agent-status" data-nav-id="agent-status" aria-live="polite">
        <span className={'agent-dot s-' + (listening ? 'listening' : status)} />
        <span className="agent-status-text">{partial || statusText}</span>
        {!connected && <span className="agent-offline">offline</span>}
        {mode === 'phone' && (
          <button type="button" className={'agent-voice' + (voiceOn ? ' on' : '')} onClick={toggleVoice} data-nav-id="agent-voice"
            aria-pressed={voiceOn} aria-label={voiceOn ? 'Spoken replies on' : 'Spoken replies off'} title={voiceOn ? 'Spoken replies on' : 'Spoken replies off'}>
            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        )}
      </div>

      <form className="agent-bar" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={busy ? 'Working…' : 'Type a request'} data-nav-id="agent-text-input" aria-label="Request to the assistant" disabled={busy} />
        {busy ? (
          <button type="button" className="agent-btn stop" onClick={() => hub.stop()} data-nav-id="agent-stop" aria-label="Stop"><Square size={16} /></button>
        ) : text.trim() ? (
          <button type="submit" className="agent-btn" data-nav-id="agent-send" aria-label="Send"><SendHorizontal size={18} /></button>
        ) : (
          <button type="button" className={'agent-btn mic' + (listening ? ' on' : '')} data-nav-id="agent-mic" aria-label="Hold to talk"
            onPointerDown={micDown} onPointerUp={micUp} onPointerLeave={() => listening && micUp()} disabled={mode !== 'phone' || !speechSupported()}
            title={speechSupported() ? 'Hold to talk' : 'Voice is not supported in this browser'}>
            <Mic size={18} />
          </button>
        )}
      </form>
    </div>
  );
}
