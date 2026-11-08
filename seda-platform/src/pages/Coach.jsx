import React, { useMemo } from 'react';
import { PlayCircle, Info, ShieldCheck, ArrowRight } from 'lucide-react';
import { useSeda } from '../seda/store.jsx';
import { useNav, Switch, Kpi } from '../ui/kit.jsx';
import { analyse, bankState } from '../seda/engine/coach.js';

const RULES = [
  ['emergencyFund', 'Safety cushion first', 'Recommend keeping several months of spending easy to reach before locking money away.'],
  ['debtFirst', 'Expensive debt before savings', 'If a loan costs more than the best deposit earns, suggest extra loan payments.'],
  ['deposits', 'Suggest the bank’s deposits', 'Show deposit products with rates and expected interest.'],
  ['investments', 'Suggest investment products', 'Only products the bank itself offers. Off by default: needs a licence review.'],
];

export default function Coach() {
  const { state, mutate } = useSeda();
  const { go } = useNav();
  const cfg = state.coach;
  const bank = bankState();
  const a = useMemo(() => analyse(bank, cfg), [cfg]); // eslint-disable-line
  const set = (fn) => mutate((s) => fn(s.coach));
  const m = (n) => `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AZN`;

  return (
    <>
      <div className="sd-banner info"><Info size={16} style={{ flex: 'none', marginTop: 1 }} /><span>Money Coach answers “Where should I put my money?” using only the customer’s bank data and the bank’s own products. Every suggestion shows the numbers behind it. It never moves money: any action goes through the normal fingerprint confirmation.</span></div>
      <div className="sd-cols-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.35fr)' }}>
        <div className="sd-stack" style={{ gap: 14 }}>
          <div className="sd-card">
            <div className="sd-card-h"><h2>Rules, in priority order</h2></div>
            {RULES.map(([k, title, desc], i) => (
              <div key={k} className="sd-between" style={{ alignItems: 'flex-start', paddingTop: i ? 10 : 0, borderTop: i ? '1px dashed var(--sd-line)' : 0 }}>
                <div><div style={{ fontWeight: 600 }}>{i + 1}. {title}</div><div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.45 }}>{desc}</div></div>
                <Switch label={title} checked={cfg.rules[k]} onChange={(v) => set((c) => { c.rules[k] = v; })} id={'rule-' + k} />
              </div>
            ))}
          </div>
          <div className="sd-card">
            <div className="sd-card-h"><h2>Settings</h2></div>
            <div className="sd-between"><label className="sd-label" htmlFor="months">Safety cushion</label>
              <select id="months" className="sd-select" style={{ width: 160 }} value={cfg.emergencyMonths} onChange={(e) => set((c) => { c.emergencyMonths = Number(e.target.value); })}>
                {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div className="sd-label">Products the coach may suggest</div>
            {bank.depositProducts.map((p) => (
              <div key={p.id} className="sd-between small"><span>{p.name} <span className="muted">· {p.currency} · up to {Math.max(...Object.values(p.rates))}%</span></span><Switch label={p.name} checked={cfg.products[p.id]} onChange={(v) => set((c) => { c.products[p.id] = v; })} /></div>
            ))}
            <label className="sd-label" htmlFor="disc">Disclaimer shown to customers</label>
            <textarea id="disc" className="sd-textarea" value={cfg.disclaimer} onChange={(e) => set((c) => { c.disclaimer = e.target.value; })} />
          </div>
        </div>

        <div className="sd-stack" style={{ gap: 14 }}>
          <div className="sd-card">
            <div className="sd-card-h"><h2>Live preview · Leyla H.</h2><button className="sd-btn sm primary" onClick={() => go('playground', { prefill: 'Where should I put my money?' })}><PlayCircle size={14} /> Ask by voice</button></div>
            <div className="sd-kpis compact" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <Kpi k="Monthly income" v={m(a.income)} d="avg. of 60 days" />
              <Kpi k="Spending (30 d)" v={m(a.spending)} d="excl. transfers, loans" />
              <Kpi k="Loan + installments" v={m(a.obligations)} d="per month" />
              <Kpi k="Left each month" v={m(a.free)} d="income − spending − obligations" />
              <Kpi k="Available now" v={m(a.liquid)} d="AZN + USD at bank rate" />
              <Kpi k="Cushion target" v={m(a.target)} d={`${cfg.emergencyMonths} × spending`} />
            </div>
          </div>
          {a.recs.map((r, i) => (
            <div key={r.id} className="sd-card" style={i === 0 ? { borderColor: 'var(--sd-accent)', boxShadow: '0 0 0 3px var(--sd-accent-soft)' } : undefined}>
              <div className="sd-card-h"><h2>{i + 1}. {r.title}</h2>{i === 0 && <span className="sd-pill accent">Said first</span>}</div>
              <p style={{ lineHeight: 1.55 }}>{r.text}</p>
              <div className="sd-label">Based on</div>
              <dl className="sd-kv">{r.basis.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd className="num">{v}</dd></React.Fragment>)}</dl>
              {r.action && <button className="sd-btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('playground')}>{r.action.label} in the app <ArrowRight size={14} /></button>}
            </div>
          ))}
          <div className="sd-banner warn"><ShieldCheck size={16} style={{ flex: 'none', marginTop: 1 }} /><span>{cfg.disclaimer}</span></div>
        </div>
      </div>
    </>
  );
}
