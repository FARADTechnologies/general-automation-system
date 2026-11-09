// Panels that extend /app/analytics: compare two periods, top expenses, income sources.
// Every number comes from the analytics capabilities; the UI only lays them out.
import { useBank } from '../../runtime/bank.ts';
import React from 'react';
import '../../styles/analytics.css';
import { useNavigate } from 'react-router-dom';
import { Loading, Empty, ErrorState } from './States';
// Resources the app API does not expose yet. Each screen keeps its ready layout and shows the loading
// state until the core team wires the resource (swap useBank(...) for useBank(...)).
function notYet<T = any>(_resource: string, _params?: Record<string, string | number>) {
  return { status: 'loading' as 'loading' | 'ready' | 'error', data: undefined as unknown as T, reload: () => undefined };
}


type Period = '7d' | '30d' | '90d';
type CategoryRow = { category: string; amount: string; pct?: number };

// Colour slots follow the category, not its rank: the first time a category is seen it takes the
// next free slot and keeps it for the session, so switching the period never repaints a category.
// The slot order is the validated ring order of the palette in analytics.css; past eight categories
// the rest share the neutral colour (a ninth hue is never generated).
const SLOTS = 8;
const slotOf = new Map<string, number>();
function colourOf(category: string) {
  let s = slotOf.get(category);
  if (s === undefined && slotOf.size < SLOTS) { s = slotOf.size + 1; slotOf.set(category, s); }
  return s === undefined ? 'var(--an-cat-rest)' : `var(--an-cat-${s})`;
}

// Arc sizes only. Uses the bank's share when present; otherwise the parsed display amount, which
// is drawn but never printed.
function weights(items: CategoryRow[]) {
  const usePct = items.every((x) => typeof x.pct === 'number' && Number.isFinite(x.pct));
  const raw = items.map((x) => (usePct ? (x.pct as number) : Number.parseFloat(String(x.amount).replace(/[^0-9.]/g, '')) || 0));
  const sum = raw.reduce((s, v) => s + v, 0);
  return raw.map((v) => (sum > 0 ? v / sum : 0));
}

// "1,234.56 AZN" -> ["1,234.56", "AZN"]; a display split only, the text is the bank's.
function splitMoney(s: string): [string, string] {
  const m = /^(.*\S)\s+([A-Z]{3})$/.exec(String(s).trim());
  return m ? [m[1], m[2]] : [String(s), ''];
}

const GAP = 0.6; // surface gap between arcs, in pathLength units (100 = full ring)

// Highlight a category: a mouse highlights on hover, a tap toggles. Purely visual, local state.
type Picker = (key: string) => Pick<React.DOMAttributes<Element>, 'onPointerDown' | 'onPointerEnter' | 'onPointerLeave' | 'onClick'>;
function usePick(active: string | null, set: (c: string | null) => void): Picker {
  const pointer = React.useRef('');
  return (key) => ({
    onPointerDown: (e) => { pointer.current = e.pointerType; },
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') set(key); },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') set(null); },
    onClick: () => set(active === key && pointer.current !== 'mouse' ? null : key),
  });
}

function CategoryDonut({ items, total, active, pick }: { items: CategoryRow[]; total: string; active: string | null; pick: Picker }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const share = weights(items);
  const sel = items.find((x) => x.category === active);
  const [value, ccy] = splitMoney(sel ? sel.amount : total);
  let start = 0;
  const arcs = items.map((x, i) => {
    const len = share[i] * 100;
    const arc = { key: x.category, colour: colourOf(x.category), start, len: len > GAP * 2 ? len - GAP : Math.max(len * 0.6, 0) };
    start += len;
    return arc;
  });
  return (
    <div className="an-donut">
      <svg viewBox="0 0 200 200" className="an-donut-svg" role="img" aria-labelledby={`${uid}-t`}>
        <title id={`${uid}-t`}>{`Spending by category, ${total} in total`}</title>
        <defs>
          <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
            <circle className="an-donut-sweep" cx="100" cy="100" r="80" pathLength={100} fill="none" stroke="#fff" strokeWidth="40" transform="rotate(-90 100 100)" />
          </mask>
        </defs>
        <g mask={`url(#${uid}-m)`}>
          {arcs.filter((a) => a.len > 0).map((a) => (
            <circle
              key={a.key}
              className={'an-arc' + (active ? (a.key === active ? ' on' : ' off') : '')}
              cx="100" cy="100" r="80" pathLength={100} fill="none"
              stroke={a.colour}
              strokeDasharray={`${a.len} ${100 - a.len}`}
              transform={`rotate(${-90 + a.start * 3.6} 100 100)`}
              {...pick(a.key)}
            />
          ))}
        </g>
      </svg>
      <div className="an-donut-centre" aria-hidden="true">
        <span className="an-donut-label">{sel ? sel.category : 'Spent'}</span>
        <strong className="num an-donut-value">{value}</strong>
        <span className="an-donut-sub num">{ccy}{sel && typeof sel.pct === 'number' ? ` · ${sel.pct}%` : ''}</span>
      </div>
    </div>
  );
}

export function SpendByCategory({ period }: { period: Period }) {
  // analytics.by_category -> { total, items: [{ category, amount, pct }] }, calculated and sorted by the bank.
  const r = useBank('analytics.by_category', { period });
  const [picked, setPicked] = React.useState<string | null>(null);
  const items: CategoryRow[] = r.status === 'ready' ? r.data.items : [];
  const active = items.some((x) => x.category === picked) ? picked : null; // a pick from another period does not carry over
  const pick = usePick(active, setPicked);
  const share = weights(items);
  const top = Math.max(0, ...share); // bars are drawn relative to the largest category
  return (
    <section className="block an-panel" aria-labelledby="an-cat" data-nav-id="analytics-by-category">
      <h2 id="an-cat">Spending by category</h2>
      {r.status === 'loading' && <Loading />}
      {r.status === 'error' && <ErrorState onRetry={r.reload} />}
      {r.status === 'ready' && items.length === 0 && <Empty title="No spending in this period" />}
      {r.status === 'ready' && items.length > 0 && (
        <>
          <CategoryDonut key={period} items={items} total={r.data.total} active={active} pick={pick} />
          <ul className={'an-cats' + (active ? ' has-active' : '')}>
            {items.map((x, i) => (
              <li
                key={x.category}
                className={x.category === active ? 'on' : undefined}
                style={{ '--an-c': colourOf(x.category) } as React.CSSProperties}
                {...pick(x.category)}
                data-nav-id={`analytics-category-${x.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              >
                <i className="an-dot" aria-hidden="true" />
                <span className="an-cat">{x.category}</span>
                <span className="an-bar" aria-hidden="true"><i style={{ width: `${top > 0 ? (share[i] / top) * 100 : 0}%` }} /></span>
                <span className="num an-val">{x.amount}{typeof x.pct === 'number' && <small>{x.pct}%</small>}</span>
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
      {r.status === 'error' && <ErrorState onRetry={r.reload} />}
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
  const nav = useNavigate();
  const r = useBank('analytics.top_expenses', { period, limit: 5 });
  return (
    <section className="block flush an-panel" aria-labelledby="an-top" data-nav-id="analytics-top">
      <h2 id="an-top" className="an-h">Top expenses</h2>
      {r.status === 'loading' && <Loading />}
      {r.status === 'error' && <ErrorState onRetry={r.reload} />}
      {r.status === 'ready' && r.data.length === 0 && <Empty title="No spending in this period" />}
      {r.status === 'ready' && r.data.length > 0 && (
        <ol className="an-list">
          {r.data.map((t: { txId: string; title: string; category: string; date: string; amount: string }, i: number) => (
            <li key={t.txId}>
              <button type="button" className="li" onClick={() => nav(`/history/${t.txId}`)} data-nav-id={`tx-${t.txId}`}>
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
      {r.status === 'error' && <ErrorState onRetry={r.reload} />}
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
