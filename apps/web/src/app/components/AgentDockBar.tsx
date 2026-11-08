// The dock as it sits in the app: open on Home, a single Speak button on every other screen
// that expands the full dock. Mounted once by the app shell, above the tab bar.
import React from 'react';
import { Mic } from 'lucide-react';
import { useUi } from '../../runtime';
import AgentDock, { AgentStatus } from './AgentDock';
import PlanStrip from './PlanStrip';

export default function AgentDockBar() {
  const { ui } = useUi();
  // TODO(data): the shell mounts this once (see the issue "Mount the agent dock in the app shell").
  const onHome = ui.route === '/app' || ui.route === '/app/';
  const active = ui.agent.status !== 'idle';
  const [open, setOpen] = React.useState(false); // purely visual: expanded or not
  const expanded = onHome || open || active;
  return (
    <div className={'agent-bar' + (expanded ? ' open' : '')}>
      {expanded ? (
        <>
          <PlanStrip />
          <AgentDock />
          {!onHome && !active && <button type="button" className="agent-bar-collapse" onClick={() => setOpen(false)}>Hide assistant</button>}
        </>
      ) : (
        <button type="button" className="agent-bar-fab" onClick={() => setOpen(true)} aria-label="Open the assistant" data-nav-id="agent-open">
          <Mic size={26} /><span>Speak</span>
        </button>
      )}
      {!expanded && <span className="sr-only"><AgentStatus /></span>}
    </div>
  );
}
