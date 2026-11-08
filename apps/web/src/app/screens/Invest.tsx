// /app/invest and /app/invest/market: portfolio and the market list with sector chips and 1D / 1W / 1M change.
// No advice: no "buy" badges, rankings or recommendations, only prices and changes.
import React from 'react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, Empty, ErrorState } from '../components/States';
import SimBadge from '../components/SimBadge';

const SECTORS = [['all', 'All'], ['technology', 'Technology'], ['robotics', 'Robotics'], ['energy', 'Energy'], ['healthcare', 'Healthcare'], ['finance', 'Finance']] as const;
const PERIODS = ['1D', '1W', '1M'] as const;
type Quote = { symbol: string; name: string; type: string; sector: string; price: string; change: Record<string, { pct: string; up: boolean }> };

export function Portfolio() {
  const { intent } = useUi();
  // TODO(data): portfolio.get -> { value, dayChange: { text, up }, cash, holdings: [{ symbol, name, qty, value, pl: { text, up } }] }
  const pf = useBank('portfolio');
  return (
    <section className="screen no-tabs inv-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app' })} data-nav-id="back">‹</button><h1>Investments</h1><span /></header>
      <SimBadge />
      {pf.status === 'loading' && <Loading />}
      {pf.status === 'error' && <ErrorState onRetry={pf.retry} />}
      {pf.status === 'ready' && (
        <>
          <div className="block">
            <span className="eyebrow">Portfolio value</span>
            <span className="num inv-value" data-nav-id="invest-portfolio-value">{pf.data.value}</span>
            <span className={'pill ' + (pf.data.dayChange.up ? 'green' : 'red')}>{pf.data.dayChange.text} today</span>
            <span className="small muted">Cash to invest: <span className="num">{pf.data.cash}</span></span>
          </div>
          <h2 className="sec-h">My holdings</h2>
          {pf.data.holdings.length === 0 ? <Empty title="No holdings yet" /> : (
            <ul className="block flush inv-list">
              {pf.data.holdings.map((h: { symbol: string; name: string; qty: string; value: string; pl: { text: string; up: boolean } }) => (
                <li key={h.symbol}>
                  <button type="button" className="li" onClick={() => intent({ type: 'navigate', to: `/app/invest/${h.symbol}` })} data-nav-id={`invest-holding-${h.symbol}`}>
                    <span className="inv-sym" aria-hidden="true">{h.symbol}</span>
                    <span className="li-main"><span className="li-title">{h.name}</span><span className="li-sub num">{h.qty}</span></span>
                    <span className="li-right num">{h.value}<span className={'tiny ' + (h.pl.up ? 'pos' : 'neg')}>{h.pl.text}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn block" onClick={() => intent({ type: 'navigate', to: '/app/invest/market' })} data-nav-id="invest-open-market">Browse the market</button>
        </>
      )}
      <p className="tiny muted">Prices are simulated and no exchange is connected. This is not investment advice. Investments can lose value.</p>
    </section>
  );
}

export function Market() {
  const { intent } = useUi();
  const sector = useField('market', 'invest-sector');
  const period = useField('market', 'invest-period');
  const s = sector.value || 'all';
  const p = (period.value || '1D') as (typeof PERIODS)[number];
  // TODO(data): market.screen with { sector } returns quotes with change for 1D, 1W and 1M.
  const quotes = useBank('market', { sector: s });
  const set = (field: string, value: string) => intent({ type: 'field.set', form: 'market', field, value });
  return (
    <section className="screen no-tabs inv-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app/invest' })} data-nav-id="back">‹</button><h1>Market</h1><span /></header>
      <SimBadge />
      <div className="chips inv-sectors" role="group" aria-label="Sector">
        {SECTORS.map(([id, label]) => <button key={id} type="button" className={'chip' + (s === id ? ' on' : '')} aria-pressed={s === id} onClick={() => set('invest-sector', id)} data-nav-id={`invest-sector-${id}`}>{label}</button>)}
      </div>
      <div className="seg" role="group" aria-label="Change over">
        {PERIODS.map((x) => <button key={x} type="button" className={p === x ? 'on' : ''} aria-pressed={p === x} onClick={() => set('invest-period', x)} data-nav-id={`invest-period-${x}`}>{x}</button>)}
      </div>
      {quotes.status === 'loading' && <Loading label="Loading prices…" />}
      {quotes.status === 'error' && <ErrorState onRetry={quotes.retry} />}
      {quotes.status === 'ready' && quotes.data.length === 0 && <Empty title="Nothing in this sector" />}
      {quotes.status === 'ready' && quotes.data.length > 0 && (
        <ul className="block flush inv-list">
          {quotes.data.map((q: Quote) => (
            <li key={q.symbol}>
              <button type="button" className="li" onClick={() => intent({ type: 'navigate', to: `/app/invest/${q.symbol}` })} data-nav-id={`invest-quote-${q.symbol}`}>
                <span className="inv-sym" aria-hidden="true">{q.symbol}</span>
                <span className="li-main"><span className="li-title">{q.name}</span><span className="li-sub">{q.type}</span></span>
                <span className="li-right num">{q.price}<span className={'tiny ' + (q.change[p]?.up ? 'pos' : 'neg')}>{q.change[p]?.pct} {p}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
