// Tiny expression language used by capability manifests.
//   "{input.amount|minor}"            whole-string expression keeps its type
//   "Pay {input.amount} now"          embedded expressions become text
// Pipes: minor, major, last4, masked, money:<ccy|path>, or:<path>, is_null, upper, lower, str, num
export type Scope = Record<string, unknown>;
export type PipeFn = (value: unknown, arg: string | undefined, scope: Scope) => unknown;

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const WHOLE = /^\{([^{}]+)\}$/;
const EMBED = /\{([^{}]+)\}/g;

export function evalExpr(expr: string, scope: Scope, pipes: Record<string, PipeFn>): unknown {
  const [head, ...rest] = expr.split('|').map((s) => s.trim());
  let v: unknown = getPath(scope, head);
  for (const p of rest) {
    const idx = p.indexOf(':');
    const name = idx === -1 ? p : p.slice(0, idx);
    const arg = idx === -1 ? undefined : p.slice(idx + 1);
    const fn = pipes[name];
    if (!fn) throw new Error(`unknown pipe ${name}`);
    v = fn(v, arg, scope);
  }
  return v;
}

export function render(tpl: unknown, scope: Scope, pipes: Record<string, PipeFn>): unknown {
  if (typeof tpl === 'string') {
    const whole = tpl.match(WHOLE);
    if (whole) return evalExpr(whole[1], scope, pipes);
    if (!tpl.includes('{')) return tpl;
    return tpl.replace(EMBED, (_m, e: string) => {
      const v = evalExpr(e, scope, pipes);
      return v === undefined || v === null ? '' : String(v);
    });
  }
  if (Array.isArray(tpl)) return tpl.map((t) => render(t, scope, pipes));
  if (tpl && typeof tpl === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tpl)) out[k] = render(v, scope, pipes);
    return out;
  }
  return tpl;
}

export const basePipes: Record<string, PipeFn> = {
  minor: (v) => (v === undefined || v === null ? v : Math.round(Number(v) * 100)),
  major: (v) => (v === undefined || v === null ? v : Math.round(Number(v)) / 100),
  last4: (v) => (v === undefined || v === null ? v : String(v).slice(-4)),
  is_null: (v) => v === null || v === undefined,
  upper: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  lower: (v) => (typeof v === 'string' ? v.toLowerCase() : v),
  str: (v) => (v === undefined || v === null ? '' : String(v)),
  num: (v) => Number(v),
  or: (v, arg, scope) => (v === undefined || v === null || v === '' ? getPath(scope, arg || '') : v),
  default: (v, arg) => (v === undefined || v === null || v === '' ? (arg !== undefined && arg !== '' && !Number.isNaN(Number(arg)) ? Number(arg) : arg) : v),
  days_ago: (v) => (v === undefined || v === null ? v : new Date(Date.now() - Number(v) * 86400000).toISOString()),
  date: (v) => (typeof v === 'string' ? v.slice(0, 10) : v),
  initial: (v) => (typeof v === 'string' && v ? v[0].toUpperCase() : v),
  // Azerbaijani mobile number in local form: 0XXXXXXXXX
  local_msisdn: (v) => { if (v === undefined || v === null) return v; const d = String(v).replace(/\D/g, ''); return d.startsWith('994') ? '0' + d.slice(3) : d.length === 9 ? '0' + d : d; },
  join: (v, arg) => (Array.isArray(v) ? v.join(arg ?? ', ') : v),
  money: (v, arg, scope) => {
    if (v === undefined || v === null) return v;
    const ccy = arg && arg.includes('.') ? getPath(scope, arg) : arg;
    return `${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy ?? ''}`.trim();
  },
};
