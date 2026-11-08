// Live plan: the steps of a multi-step request, with the current one highlighted.
import React from 'react';
import { Check, Circle, Loader2, X, Minus } from 'lucide-react';
import { useUi } from '../../runtime';

const ICON = { done: Check, running: Loader2, failed: X, skipped: Minus, pending: Circle } as const;
const SR = { done: 'done', running: 'in progress', failed: 'failed', skipped: 'skipped', pending: 'not started' } as const;

export default function PlanStrip() {
  const { ui } = useUi();
  const plan = ui.plan;
  if (!plan || plan.steps.length < 2) return null;
  const done = plan.steps.filter((s) => s.status === 'done').length;
  return (
    <section className="plan-strip" aria-label={`Plan: ${plan.goal}`} data-nav-id="agent-plan">
      <div className="plan-head">
        <strong>{plan.goal}</strong>
        <span className="plan-count">{done} of {plan.steps.length}</span>
      </div>
      <ol>
        {plan.steps.map((s, i) => {
          const I = ICON[s.status];
          return (
            <li key={s.id} className={`plan-step p-${s.status}`} data-nav-id={`agent-plan-step-${i + 1}`} aria-current={s.status === 'running' ? 'step' : undefined}>
              <I size={16} className={s.status === 'running' ? 'spin' : undefined} aria-hidden="true" />
              <span>{s.title}</span>
              <span className="sr-only">, {SR[s.status]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
