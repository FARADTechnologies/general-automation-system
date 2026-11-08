// "Agent sees / Bank sees": the same step shown from both sides, so the audience sees that the
// model only gets tokens and masked values while the bank keeps the real data.
import React from 'react';

export type SeesRow = { id: string; step: string; agent: string; bank: string; guard?: { decision: 'allow' | 'hold' | 'block'; reason?: string } };

export default function SeesPanel({ rows }: { rows: SeesRow[] }) {
  return (
    <section className="stage-panel stage-sees" aria-label="Agent sees and bank sees">
      <div className="stage-sees-head"><h2>Agent sees</h2><h2>Bank sees</h2></div>
      {rows.length === 0 && <p className="stage-muted">Nothing yet</p>}
      <ol>
        {rows.map((r) => (
          <li key={r.id}>
            <span className="stage-sees-step">{r.step}{r.guard && <span className={`stage-guard g-${r.guard.decision}`}>{r.guard.decision}{r.guard.reason ? ` · ${r.guard.reason}` : ''}</span>}</span>
            <code className="stage-sees-agent">{r.agent}</code>
            <code className="stage-sees-bank">{r.bank}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
