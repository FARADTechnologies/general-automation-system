// Agent dock: talk or type to the assistant, see what it is doing, stop it at any time.
// Everything here reads hub UI state; the dock never decides anything itself.
import React from 'react';
import { Mic, Send, Square, Pause } from 'lucide-react';
// TODO(data): confirm the runtime hook names and shapes (see the design issue "Runtime hooks for the agent dock").
import { useUi, useAgent } from '../../runtime';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  acting: 'Working in the app',
  waiting_confirmation: 'Waiting for your confirmation',
  paused: 'Paused',
  handoff: 'A bank specialist has your request',
  error: 'Something went wrong',
};

export function AgentStatus() {
  const { ui } = useUi();
  const st = ui.agent.status;
  return (
    <div className={`agent-status s-${st}`} role="status" aria-live="polite" data-nav-id="agent-status">
      <span className="agent-dot" aria-hidden="true" />
      <span>{STATUS_LABEL[st] ?? st}</span>
      {ui.agent.note && <span className="agent-note">{ui.agent.note}</span>}
    </div>
  );
}

export default function AgentDock() {
  const { ui } = useUi();
  // TODO(data): useAgent() is expected to expose send(text), mic start/stop, stop() and the "Try saying" list from live capabilities.
  const agent = useAgent();
  const [text, setText] = React.useState(''); // purely local draft of what the customer types; sent as agent.input
  const busy = !['idle', 'error', 'handoff'].includes(ui.agent.status);
  const listening = ui.agent.status === 'listening';

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    agent.send(t);
    setText('');
  };

  return (
    <section className="agent-dock" aria-label="Assistant">
      <AgentStatus />
      {!busy && agent.trySaying?.length > 0 && (
        <div className="agent-try" data-nav-id="agent-try-saying">
          <span className="agent-try-label">Try saying</span>
          {agent.trySaying.slice(0, 4).map((s: string) => (
            <button key={s} type="button" className="agent-try-chip" onClick={() => agent.send(s)}>“{s}”</button>
          ))}
        </div>
      )}
      <form className="agent-row" onSubmit={send}>
        <button
          type="button"
          className={'agent-mic' + (listening ? ' live' : '')}
          onClick={() => (listening ? agent.stopListening() : agent.listen())}
          aria-label={listening ? 'Stop listening' : 'Speak'}
          aria-pressed={listening}
          data-nav-id="agent-mic"
        >
          <Mic size={24} />
        </button>
        <input
          className="agent-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type what you need"
          aria-label="Type what you need"
          data-nav-id="agent-text-input"
        />
        {busy ? (
          <button type="button" className="agent-stop" onClick={() => agent.stop()} aria-label="Stop the assistant" data-nav-id="agent-stop">
            {ui.agent.status === 'paused' ? <Pause size={18} /> : <Square size={16} />}
          </button>
        ) : (
          <button type="submit" className="agent-send" disabled={!text.trim()} aria-label="Send" data-nav-id="agent-send">
            <Send size={18} />
          </button>
        )}
      </form>
    </section>
  );
}
