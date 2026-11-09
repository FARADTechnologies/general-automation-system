// Route sync, tap echo and agent highlight. Mirror state, not clicks.
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hub, useHubEvent, useUi } from './hub.ts';

const toHub = (pathname: string) => (pathname === '/' ? '/app' : '/app' + pathname);
const fromHub = (route: string) => (route === '/app' ? '/' : route.replace(/^\/app/, '') || '/');

/** Keeps the router and the hub route in step, both ways. */
export function RouteSync() {
  const route = useUi((s) => s.route);
  const loc = useLocation();
  const nav = useNavigate();
  const lastSent = useRef<string>('');
  // hub -> router
  useEffect(() => {
    const want = fromHub(route);
    if (loc.pathname !== want) { lastSent.current = route; nav(want, { replace: false }); }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  // router -> hub (manual navigation on this screen)
  useEffect(() => {
    const r = toHub(loc.pathname);
    if (r !== hub.state.route && r !== lastSent.current) hub.intent({ type: 'navigate', route: r });
    lastSent.current = '';
  }, [loc.pathname]);
  return null;
}

/** Sends a tap intent for every press on an element with a stable ID, and shows the other screen's presses. */
export function TapLayer({ root }: { root: React.RefObject<HTMLElement> }) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest('[data-nav-id]');
      if (t) hub.intent({ type: 'tap', target: t.getAttribute('data-nav-id') });
    };
    el.addEventListener('pointerdown', onDown, true);
    return () => el.removeEventListener('pointerdown', onDown, true);
  }, [root]);

  const ripple = useCallback((e: { payload: { target: string } }) => {
    const el = root.current?.querySelector(`[data-nav-id="${CSS.escape(e.payload.target)}"]`) as HTMLElement | null;
    if (!el) return;
    el.classList.remove('tap-echo');
    void el.offsetWidth;
    el.classList.add('tap-echo');
    setTimeout(() => el.classList.remove('tap-echo'), 450);
  }, [root]);
  useHubEvent('ui.tap_echo', ripple);
  return null;
}

/** Agent highlight: ring around the element and scroll it into view. */
export function HighlightLayer({ root }: { root: React.RefObject<HTMLElement> }) {
  const id = useUi((s) => s.highlight);
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    r.querySelectorAll('.agent-hl').forEach((n) => n.classList.remove('agent-hl'));
    if (!id) return;
    // the target may render a moment after a route change
    const t = setTimeout(() => {
      const el = r.querySelector(`[data-nav-id="${CSS.escape(id)}"]`) as HTMLElement | null;
      if (!el) return;
      el.classList.add('agent-hl');
      // Centre it in the part of the screen the customer can see: above the assistant dock at the
      // bottom and below the header, so the element the assistant is working on is never hidden.
      const dock = r.querySelector('.agent-dock') as HTMLElement | null;
      el.style.scrollMarginBottom = `${Math.round(dock?.getBoundingClientRect().height ?? 0) + 12}px`;
      el.style.scrollMarginTop = '64px';
      el.scrollIntoView({ block: el.offsetHeight > 360 ? 'start' : 'center', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [id, root]);
  return null;
}
