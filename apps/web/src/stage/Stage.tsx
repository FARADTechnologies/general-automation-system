// Presentation view for the projector (1920x1080): the mirrored phone, the live plan, and for
// every tool step the guard decision plus what the agent saw versus what the bank received.
// Everything shown comes from this session's real trace events and the Bridge's audit log.
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ShieldCheck, Mic, Wifi, WifiOff, Sun, Moon } from 'lucide-react';
import { StoreProvider } from '../app/store/Store.jsx';
import { Shell, ModeCtx } from '../app/App.jsx';
import { hub, useUi, useHubEvent, useConnected, type HubEvent } from '../runtime/hub.ts';
import PhoneFrame from './components/PhoneFrame.tsx';
import PlanPanel, { type PlanStep } from './components/PlanPanel.tsx';
import SeesPanel, { type SeesRow } from './components/SeesPanel.tsx';
import '../styles/stage.css';
import { RichText } from '../runtime/RichText';

interface Trace { trace_id: string; at: number; kind: string; name?: string; decision?: string; detail?: any }

const GUARD_TEXT: Record<string, string> = {
  INTENT_NOT_STATED: 'customer did not ask for this',
  PAYEE_NOT_FROM_USER: 'payee not from the customer',
  REFERENCE_NOT_FROM_USER: 'reference not from the customer',
  AMOUNT_NOT_STATED: 'amount not stated',
  CURRENCY_NOT_STATED: 'currency not stated',
  PROVENANCE_REJECTED: 'reference of unknown origin',
  UNKNOWN_TOOL: 'no such capability',
  LOOP_DETECTED: 'repeated call',
  SCHEMA_INVALID: 'invalid arguments',
  STEP_LIMIT: 'step limit',
};
const STEP_STATUS: Record<string, PlanStep['status']> = { pending: 'pending', running: 'running', waiting_confirmation: 'running', done: 'done', failed: 'failed', skipped: 'skipped' };
const clip = (s: string, n = 420) => (s.length > n ? s.slice(0, n) + ' …' : s);

// Projector theme: light by default, toggled with T or the header button, remembered per browser.
// It is set on <html> so the mirrored phone and the panels switch together with the stage.
type Theme = 'light' | 'dark';
const THEME_KEY = 'gas-stage-theme';
function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function seesRows(turn: Trace[], bank: any[]): SeesRow[] {
  const rows: SeesRow[] = [];
  turn.forEach((t, i) => {
    if (t.kind !== 'guard') return;
    const held = t.decision === 'held';
    const call = turn.slice(i + 1).find((x) => x.kind === 'tool_call' && x.name === t.name);
    const input = held ? t.detail?.input : call?.detail?.agent_sends;
    const capability = t.detail?.capability as string | undefined;
    let bankSide = '—';
    if (held) bankSide = 'Nothing sent: stopped before the Bridge';
    else if (t.name === 'task_plan') bankSide = 'Not a bank call (plan shown on screen)';
    else if (t.detail?.risk && capability) {
      const prep = bank.find((b) => b.event === 'prepare' && b.capability === capability && b.trace_id === t.trace_id);
      bankSide = prep ? `${prep.detail.internal_request.method} ${prep.detail.internal_request.path}\n${JSON.stringify(prep.detail.internal_request.body)}` : `Bridge read: ${capability}`;
    }
    rows.push({
      id: `${t.at}-${i}`,
      step: t.name || 'step',
      agent: clip(JSON.stringify(input ?? {})),
      bank: clip(bankSide),
      guard: { decision: held ? 'hold' : 'allow', reason: held ? GUARD_TEXT[t.detail?.code] || t.detail?.code : t.detail?.risk },
    });
  });
  return rows.slice(-6);
}

export default function Stage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [bank, setBank] = useState<any[]>([]);
  const plan = useUi((s) => s.plan);
  const transcript = useUi((s) => s.transcript);
  const status = useUi((s) => s.agent.status);
  const connected = useConnected();
  const [backup, setBackup] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
  }, [theme]);

  useHubEvent('trace.event', useCallback((e: HubEvent) => setTraces((t) => [...t.slice(-200), e.payload as Trace]), []));
  const refreshBank = useCallback(async () => {
    try { const r = await fetch(`/bridge/session/${encodeURIComponent(hub.session)}/bank-view`); if (r.ok) setBank((await r.json()).items); } catch { /* offline */ }
  }, []);
  useHubEvent(['confirm.required', 'confirm.resolved', 'bank.changed', 'agent.message'], useCallback(() => { void refreshBank(); }, [refreshBank]));
  useEffect(() => { void refreshBank(); }, [refreshBank]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') setBackup((x) => !x);
      if (e.key.toLowerCase() === 'r' && e.altKey && e.shiftKey) void hub.reset().then(() => { setTraces([]); setBank([]); });
      if (e.key.toLowerCase() === 't' && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !isTyping(e.target)) toggleTheme();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [toggleTheme]);

  const lastTrace = traces.at(-1)?.trace_id;
  const turn = traces.filter((t) => t.trace_id === lastTrace);
  const lastUser = [...transcript].reverse().find((t) => t.role === 'user');
  const lastAgent = [...transcript].reverse().find((t) => t.role === 'agent');
  const answer = turn.find((t) => t.kind === 'answer');

  if (backup) {
    return (
      <div className="stg stg-backup">
        <video autoPlay controls playsInline>
          <source src="/backup.webm" type="video/webm" />
          <source src="/backup.mp4" type="video/mp4" />
        </video>
        <p>Backup recording. Press B to return to the live view.</p>
      </div>
    );
  }

  return (
    <div className="stg">
      <header className="stg-head">
        <div className="stg-brand"><ShieldCheck size={22} /> Action layer for Caspia Bank <span className="stg-sub">live session {hub.session}</span></div>
        <div className="stg-tools">
          <button type="button" className="stg-theme" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} title="Light or dark (T)">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <div className={'stg-conn ' + (connected ? 'on' : 'off')}>{connected ? <Wifi size={16} /> : <WifiOff size={16} />} {connected ? 'Connected' : 'Reconnecting'}</div>
        </div>
      </header>

      <section className="stg-phone-col">
        <PhoneFrame>
          <ModeCtx.Provider value="mirror">
            <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <StoreProvider><Shell /></StoreProvider>
            </MemoryRouter>
          </ModeCtx.Provider>
        </PhoneFrame>
      </section>

      <section className="stg-main">
        <div className="stg-card stg-said">
          <span className="stg-label"><Mic size={14} /> Customer said</span>
          <p className="stg-quote">{lastUser ? `“${lastUser.text}”` : 'Waiting for a request…'}</p>
          {lastAgent && lastUser && lastAgent.at >= lastUser.at && <p className="stg-answer"><RichText text={lastAgent.text} /></p>}
          <span className={'stg-status s-' + status}>{status.replace('_', ' ')}</span>
          {answer?.detail && <span className="stg-metric">This turn: {Math.round(answer.detail.ms / 100) / 10}s · {answer.detail.llm_calls} model calls · ${answer.detail.cost_usd.toFixed(3)} (measured)</span>}
        </div>
        <PlanPanel goal={plan?.goal} steps={(plan?.steps || []).map((s) => ({ ...s, status: STEP_STATUS[s.status] || 'pending' }))} waitingConfirmation={status === 'waiting_confirmation'} />
        <SeesPanel rows={seesRows(turn, bank)} />
      </section>
    </div>
  );
}
