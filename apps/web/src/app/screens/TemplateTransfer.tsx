// /app/transfers/template/:id: a saved payment, ready to confirm. The amount can be changed.
import React from 'react';
import { FileText } from 'lucide-react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, ErrorState } from '../components/States';

export default function TemplateTransfer({ templateId }: { templateId: string }) {
  const { intent } = useUi();
  // TODO(data): templates.list item by id; the destination arrives masked.
  const tpl = useBank('template', { id: templateId });
  const amount = useField('template', 'transfer-amount');
  const source = useField('template', 'transfer-source');
  const sources = useBank('accounts');
  return (
    <section className="screen no-tabs tpl-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app/transfers' })} data-nav-id="back">‹</button><h1>Template</h1><span /></header>
      {tpl.status === 'loading' && <Loading />}
      {tpl.status === 'error' && <ErrorState onRetry={tpl.retry} />}
      {tpl.status === 'ready' && (
        <>
          <div className="block row tpl-head">
            <span className="li-ico" aria-hidden="true"><FileText size={20} /></span>
            <div><strong>{tpl.data.title}</strong><div className="small muted num">{tpl.data.payee} · {tpl.data.maskedDestination}</div></div>
          </div>
          <div className="field"><label htmlFor="tpl-amount">Amount, AZN</label><input id="tpl-amount" className="input num tpl-amount" inputMode="decimal" {...amount} /></div>
          <div className="field">
            <label htmlFor="tpl-source">From</label>
            {sources.status === 'ready'
              ? <select id="tpl-source" className="input" {...source}>{sources.data.map((s: { token: string; name: string; masked: string }) => <option key={s.token} value={s.token}>{s.name} {s.masked}</option>)}</select>
              : <Loading />}
          </div>
          <div className="sticky-cta"><button type="button" className="btn primary block" onClick={() => intent({ type: 'submit', form: 'template' })} data-nav-id="transfer-continue">Continue</button></div>
        </>
      )}
    </section>
  );
}
