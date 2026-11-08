// Large plan panel for the stage: the goal and every step with its status, readable from the back of a room.
import React from 'react';
import { Check, Circle, Loader2, X, Minus } from 'lucide-react';

export type PlanStep = { id: string; title: string; status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' };
const ICON = { done: Check, running: Loader2, failed: X, skipped: Minus, pending: Circle } as const;

export default function PlanPanel({ goal, steps, waitingConfirmation }: { goal?: string; steps: PlanStep[]; waitingConfirmation?: boolean }) {
  return (
    <section className="stage-panel stage-plan" aria-label="Plan">
      <h2>Plan</h2>
      {!goal ? <p className="stage-muted">Waiting for a request</p> : (
        <>
          <p className="stage-goal">{goal}</p>
          <ol>
            {steps.map((s) => {
              const I = ICON[s.status];
              return <li key={s.id} className={`stage-step p-${s.status}`}><I size={22} aria-hidden="true" className={s.status === 'running' ? 'spin' : undefined} /><span>{s.title}</span><span className="sr-only">, {s.status}</span></li>;
            })}
          </ol>
        </>
      )}
      {waitingConfirmation && <p className="stage-waiting" role="status">Waiting for customer confirmation</p>}
    </section>
  );
}
