// /transfers/template/:id: a saved payment, ready to confirm (transfer.template.prepare).
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { hub, useField, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, ErrorState } from '../components/States';
import { money } from '../components/format';

type Tpl = { id: string; title: string; type: string; amount: number; currency: string; payee?: string };

export default function TemplateTransfer() {
  const nav = useNavigate();
  const { id = '' } = useParams();
  const tpls = useBank<{ items: Tpl[] }>('templates');
  const amount = useField('template', 'transfer-amount');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const t = tpls.data?.items.find((x) => x.id === id);
  return (
    <main className="screen no-tabs screen-enter tpl-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>Template</h1><span /></header>
      {tpls.status === 'loading' && <Loading />}
      {tpls.status === 'error' && <ErrorState onRetry={tpls.reload} />}
      {tpls.status === 'ready' && !t && <ErrorState title="Template not found" sub="It may have been deleted." />}
      {t && (
        <>
          <div className="block row tpl-head">
            <span className="li-ico" aria-hidden="true"><FileText size={20} /></span>
            <div><strong>{t.title}</strong><div className="small muted">{t.payee || t.type} · usually {money(t.amount, t.currency)}</div></div>
          </div>
          <div className="field"><label htmlFor="tpl-amount">Amount this time, {t.currency} (optional)</label><input id="tpl-amount" className="input num tpl-amount" inputMode="decimal" placeholder={String(t.amount)} autoComplete="off" {...amount} /></div>
          <div className="sticky-cta">
            <button type="button" className="btn primary block" disabled={busy} onClick={() => hub.input(`Pay my ${t.title} template${amount.value ? ` with ${amount.value} ${t.currency}` : ''}`)} data-nav-id="transfer-continue">Continue</button>
          </div>
        </>
      )}
    </main>
  );
}
