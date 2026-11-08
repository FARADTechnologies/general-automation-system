// Panels that extend /app/analytics: compare two periods, top expenses, income sources.
// Every number comes from the analytics capabilities; the UI only lays them out.
import React from 'react';
import { useBank, useUi } from '../../runtime';
import { Loading, Empty, ErrorState } from './States';

type Period = '7d' | '30d' | '90d';

export function SpendByCategory({ period }: { period: Period }) {
  // TODO(data): analytics.spend_by_category -> { total, items: [{ category, amount, pct }] }, sorted by the bank.
  const r = useBank('analytics.by_category', { period });
  return (
    <section className="block an-panel" aria-labelledby="an-cat" data-nav-id="analytics-by-category">
      <h2 id="an-cat">Spending by category</h2>
      {r.status === 'loading' && <Loading />}
      {r.status === 'error' && <ErrorState onRetry={r.retry} />}
      {r.status === 'ready' && r.data.items.length === 0 && <Empty title="No spending in this period" />}
      {r.status === 'ready' && r.data.items.length > 0 && (
        <>
          <p className="an-summary">Spent <strong className="num">{r.data.total}</strong></p>
          <ul className="an-cats">
            {r.data.items.map((x: { category: string; amount: string; pct: number }) => (
              <li key={x.category} data-nav-id={`analytics-category-${x.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                <span className="an-cat">{x.category}</span>
                <span className="an-bar" aria-hidden="true"><i style={{ width: `${x.pct}%` }} /></span>
                <span className="num an-val">{x.amount}<small>{x.pct}%</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function ComparePeriods({ period }: { period: Period }) {
  // TODO(data): analytics.compare_periods -> { summary, rows: [{ category, now, before, nowPct, beforePct }] }
  const r = useBank('analytics.compare', { period });
  return (
    <section className="block an-panel" aria-labelledby="an-compare" data-nav-id="analytics-compare">
      <h2 id="an-compare">Compared with the period before</h2>
      {r.status === 'loading' && <Loading />}
      {r.status === 'error' && <ErrorState onRetry={r.retry} />}
      {r.status === 'ready' && (
        <>
          <p className="an-summary">{r.data.summary}</p>
          <ul className="an-cmp">
            {r.data.rows.map((x: { category: string; now: string; before: string; nowPct: number; beforePct: number }) => (
              <li key={x.category}>
                <span className="an-cat">{x.category}</span>
                <span className="an-bars" aria-hidden="true"><i style={{ width: `${x.nowPct}%` }} /><i className="prev" style={{ width: `${x.beforePct}%` }} /></span>
                <span className="num an-val">{x.now}<small>was {x.before}</small></span>
              </li>
            ))}
          </ul>
          <p className="tiny muted">Dark bar: this period. Light bar: the period before.</p>
        </>
      )}
    </section>
  );
}

export function TopExpenses({ period }: { period: Period }) {
  const { intent } = useUi();
  const r = useBank('analytics.top_expenses', { period, limit: 5 });
  return (
    <section className="block flush an-panel" aria-labelledby="an-top" data-nav-id="analytics-top">
      <h2 id="an-top" className="an-h">Top expenses</h2>
      {r.status === 'loading' && <Loading />}
      {r.status === 'error' && <ErrorState onRetry={r.retry} />}
      {r.status === 'ready' && r.data.length === 0 && <Empty title="No spending in this period" />}
      {r.status === 'ready' && r.data.length > 0 && (
        <ol className="an-list">
          {r.data.map((t: { txId: string; title: string; category: string; date: string; amount: string }, i: number) => (
            <li key={t.txId}>
              <button type="button" className="li" onClick={() => intent({ type: 'navigate', to: `/app/history/${t.txId}` })} data-nav-id={`tx-${t.txId}`}>
                <span className="an-rank" aria-hidden="true">{i + 1}</span>
                <span className="li-main"><span className="li-title">{t.title}</span><span className="li-sub">{t.category} · {t.date}</span></span>
                <span className="li-right num">{t.amount}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function IncomeSources({ period }: { period: Period }) {
  const r = useBank('analytics.income_sources', { period });
  return (
    <section className="block flush an-panel" aria-labelledby="an-income" data-nav-id="analytics-income">
      <h2 id="an-income" className="an-h">Money in</h2>
      {r.status === 'loading' && <Loading />}
      {r.status === 'error' && <ErrorState onRetry={r.retry} />}
      {r.status === 'ready' && r.data.items.length === 0 && <Empty title="No income in this period" />}
      {r.status === 'ready' && r.data.items.length > 0 && (
        <ul className="an-list">
          {r.data.items.map((s: { source: string; amount: string; share: number }) => (
            <li key={s.source} className="li">
              <span className="li-main"><span className="li-title">{s.source}</span><span className="li-sub">{s.share}% of money in</span></span>
              <span className="li-right num pos">{s.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
