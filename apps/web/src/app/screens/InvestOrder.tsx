// /app/invest/:symbol and /app/invest/order: one instrument and the order form (instrument, side, amount).
// Submitting asks the runtime to prepare invest.order (R3); the bank confirmation follows.
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { hub, useField } from '../../runtime/hub.ts';
import SimBadge from '../components/SimBadge';
import { Loading, ErrorState } from '../components/States';
// Resources the app API does not expose yet. Each screen keeps its ready layout and shows the loading
// state until the core team wires the resource (swap notYet(...) for useBank(...)).
function notYet<T = any>(_resource: string, _params?: Record<string, string | number>) {
  return { status: 'loading' as 'loading' | 'ready' | 'error', data: undefined as unknown as T, reload: () => undefined };
}


export function Instrument() {
  const { symbol = '' } = useParams();
  const nav = useNavigate();
  const intent = (i: { type: string; [k: string]: unknown }) => hub.intent(i);
  // TODO(data): market.quote -> { name, type, price, change: {1D,1W,1M}, chart: number[] (normalised 0..1), owned?: string }
  const q = notYet('quote', { symbol });
  const open = (side: 'buy' | 'sell') => {
    intent({ type: 'field.set', form: 'invest-order', field: 'invest-order-instrument', value: symbol });
    intent({ type: 'field.set', form: 'invest-order', field: 'invest-order-side', value: side });
    nav('/invest/order');
  };
  return (
    <section className="screen no-tabs inv-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav('/invest/market')} data-nav-id="back">‹</button><h1>{symbol}</h1><span /></header>
      <SimBadge />
      {q.status === 'loading' && <Loading />}
      {q.status === 'error' && <ErrorState onRetry={q.reload} />}
      {q.status === 'ready' && (
        <>
          <div className="block">
            <span className="eyebrow">{q.data.name} · {q.data.type}</span>
            <span className="num inv-value" data-nav-id="invest-price">{q.data.price}</span>
            <dl className="inv-changes">
              {(['1D', '1W', '1M'] as const).map((p) => <div key={p}><dt>{p}</dt><dd className={'num ' + (q.data.change[p].up ? 'pos' : 'neg')}>{q.data.change[p].pct}</dd></div>)}
            </dl>
            {q.data.chart?.length > 1 && (
              <svg className="inv-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Price over the last month, ${q.data.change['1M'].pct}`}>
                <polyline points={q.data.chart.map((v: number, i: number) => `${(i / (q.data.chart.length - 1)) * 100},${38 - v * 36}`).join(' ')} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {q.data.owned && <span className="small muted">You own {q.data.owned}</span>}
          </div>
          <div className="grid2">
            <button type="button" className="btn primary" onClick={() => open('buy')} data-nav-id="invest-buy">Buy</button>
            <button type="button" className="btn" disabled={!q.data.owned} onClick={() => open('sell')} data-nav-id="invest-sell">Sell</button>
          </div>
        </>
      )}
    </section>
  );
}

export function OrderForm() {
  const nav = useNavigate();
  const instrument = useField('invest-order', 'invest-order-instrument');
  const side = useField('invest-order', 'invest-order-side');
  const amount = useField('invest-order', 'invest-order-amount');
  // TODO(data): the estimate (shares for the amount, fee) comes from the bank, e.g. an invest.order quote resource.
  const est = notYet('invest.estimate', { symbol: instrument.value, side: side.value, amount: amount.value });
  return (
    <section className="screen no-tabs inv-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(`/invest/${instrument.value}`)} data-nav-id="back">‹</button><h1>Order</h1><span /></header>
      <SimBadge />
      <div className="field"><label htmlFor="ord-inst">Instrument</label><input id="ord-inst" className="input" readOnly {...instrument} /></div>
      <fieldset className="field inv-side">
        <legend>Buy or sell</legend>
        {(['buy', 'sell'] as const).map((v) => (
          <label key={v} className={'chip big' + (side.value === v ? ' on' : '')}>
            <input type="radio" name="ord-side" value={v} checked={side.value === v} onChange={side.onChange} className="sr-only" />{v === 'buy' ? 'Buy' : 'Sell'}
          </label>
        ))}
      </fieldset>
      <div className="field"><label htmlFor="ord-amount">Amount, USD</label><input id="ord-amount" className="input num inv-amount" inputMode="decimal" placeholder="0.00" {...amount} /></div>
      {est.status === 'ready' && (
        <div className="block inv-est" data-nav-id="invest-order-estimate">
          <div className="kv"><span>About</span><span className="num">{est.data.shares}</span></div>
          <div className="kv"><span>Fee</span><span className="num">{est.data.fee}</span></div>
        </div>
      )}
      <p className="tiny muted">Simulated prices, no real exchange. Not investment advice.</p>
      <div className="sticky-cta"><button type="button" className="btn primary block" disabled={!instrument.value || !side.value || !amount.value} onClick={() => hub.input(`${side.value === 'sell' ? 'Sell' : 'Buy'} ${amount.value} USD of ${instrument.value}`)} data-nav-id="invest-order-continue">Continue</button></div>
    </section>
  );
}
