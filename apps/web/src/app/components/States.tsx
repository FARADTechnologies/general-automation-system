// Shared screen states. Every data screen renders one of these while it is not "ready",
// so loading, empty and error look the same everywhere (UI_CONTRACT 5.6).
import React from 'react';
import '../../styles/states.css';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite" data-nav-id="state-loading">
      <span className="state-spinner" aria-hidden="true" />
      <span className="state-sub">{label}</span>
    </div>
  );
}

export function Empty({ title, sub, icon }: { title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="state-box" data-nav-id="state-empty">
      {icon}
      <strong className="state-title">{title}</strong>
      {sub && <span className="state-sub">{sub}</span>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', sub = 'Please try again.', onRetry }: { title?: string; sub?: string; onRetry?: () => void }) {
  return (
    <div className="state-box" role="alert" data-nav-id="state-error">
      <strong className="state-title">{title}</strong>
      <span className="state-sub">{sub}</span>
      {onRetry && <button type="button" className="btn sm" onClick={onRetry} data-nav-id="state-retry">Try again</button>}
    </div>
  );
}

// Renders the right state for a resource from useBank(); children only when the data is ready.
export function Resource<T>({ res, empty, emptyTitle = 'Nothing here yet', children }: {
  res: { status: 'loading' | 'error' | 'ready'; data?: T; reload?: () => void };
  empty?: (data: T) => boolean;
  emptyTitle?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (res.status === 'loading') return <Loading />;
  if (res.status === 'error' || res.data === undefined) return <ErrorState onRetry={res.reload} />;
  if (empty?.(res.data)) return <Empty title={emptyTitle} />;
  return <>{children(res.data)}</>;
}
