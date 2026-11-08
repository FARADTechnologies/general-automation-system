import React, { useState } from 'react';
import { LayoutDashboard, Wand2, Workflow, Plug, Activity, PlayCircle, PiggyBank, BookOpen, BarChart3, ShieldCheck, History, Settings, Search, Bell, Menu, LogOut } from 'lucide-react';
import { useSeda, sessionsOf } from '../seda/store.jsx';
import { useNav } from './kit.jsx';

export const PAGES = {
  overview: ['Overview', LayoutDashboard, 'Monitor'],
  studio: ['AI Studio', Wand2, 'Build'],
  flows: ['Flows', Workflow, 'Build'],
  integrations: ['Integrations', Plug, 'Build'],
  traces: ['Live Traces', Activity, 'Monitor'],
  playground: ['Playground', PlayCircle, 'Build'],
  coach: ['Money Coach', PiggyBank, 'Build'],
  knowledge: ['Knowledge', BookOpen, 'Build'],
  analytics: ['Analytics', BarChart3, 'Monitor'],
  security: ['Security', ShieldCheck, 'Govern'],
  versions: ['Versions', History, 'Govern'],
  settings: ['Settings', Settings, 'Govern'],
};
const ORDER = [['Monitor', ['overview', 'traces', 'analytics']], ['Build', ['studio', 'playground', 'flows', 'integrations', 'coach', 'knowledge']], ['Govern', ['security', 'versions', 'settings']]];
const SOON = new Set(['knowledge', 'analytics', 'settings']);

export default function Layout({ children }) {
  const { state, mutate } = useSeda();
  const { page, go } = useNav();
  const [open, setOpen] = useState(false);
  const running = sessionsOf(state.events).filter((s) => s.status === 'running').length;
  const live = state.env === 'live';
  const [title, Icon, group] = PAGES[page];
  const initials = state.user?.name.split(' ').map((x) => x[0]).join('') || 'AD';

  return (
    <div className="sd sd-shell">
      <aside className={'sd-side' + (open ? ' open' : '')} aria-label="Main navigation">
        <div className="sd-brand">
          <span className="sd-brand-mark"><Wave /></span>
          <span>Seda<small>Voice banking console</small></span>
        </div>
        {ORDER.map(([g, keys]) => (
          <React.Fragment key={g}>
            <div className="sd-group">{g}</div>
            {keys.map((k) => {
              const [label, I] = PAGES[k];
              return (
                <button key={k} className={'sd-nav' + (page === k ? ' on' : '')} onClick={() => { go(k); setOpen(false); }} aria-current={page === k ? 'page' : undefined} data-sd={'nav-' + k} title={label}>
                  <I size={18} /><span className="sd-label">{label}</span>
                  {k === 'studio' && <span className="sd-tag new">AI</span>}
                  {k === 'traces' && running > 0 && <span className="sd-tag live">● {running}</span>}
                  {SOON.has(k) && <span className="sd-tag">Soon</span>}
                </button>
              );
            })}
          </React.Fragment>
        ))}
        <div className="sd-side-foot"><span className="dot" /><span>Caspia Bank MCP · connected</span></div>
      </aside>
      {open && <div className="sd-scrim" onClick={() => setOpen(false)} />}

      <div className="sd-main">
        <header className="sd-top">
          <button className="sd-iconbtn sd-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <Icon size={19} className="muted" />
          <h1>{title}</h1>
          <span className="sd-crumb">· Caspia Bank · {group}</span>
          <label className="sd-search"><Search size={15} /><input placeholder="Search flows, sessions…" aria-label="Search" onKeyDown={(e) => { if (e.key === 'Enter') go('traces', { q: e.target.value }); }} /></label>
          <div className="sd-env" role="group" aria-label="Environment">
            <button className={!live ? 'on' : ''} onClick={() => mutate((s) => { s.env = 'test'; })}>Test</button>
            <button className={live ? 'on live' : ''} onClick={() => mutate((s) => { s.env = 'live'; })}>Live</button>
          </div>
          <button className="sd-iconbtn" aria-label="Notifications" onClick={() => go('security')}><Bell size={18} /></button>
          <button className="sd-me" title={`${state.user?.name} · sign out`} onClick={() => mutate((s) => { s.user = null; })} aria-label="Sign out">{initials}</button>
        </header>
        {live && <div className="sd-banner ok" style={{ borderRadius: 0, padding: '7px 24px' }}><strong>Live environment.</strong>&nbsp;Published changes reach Caspia customers immediately.</div>}
        <main className="sd-content" key={page}>{children}</main>
      </div>
    </div>
  );
}

export function Wave({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4" /><path d="M8 7v10" /><path d="M12 4v16" /><path d="M16 8v8" /><path d="M20 11v2" />
    </svg>
  );
}
