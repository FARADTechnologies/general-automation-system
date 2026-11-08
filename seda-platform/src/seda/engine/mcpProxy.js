// The "bank MCP server" seen from Seda. In this demo the bank's API lives in the embedded Caspia app,
// so we wrap it in place: every call is logged to the shared event log as an MCP call with its latency.
// In production these calls go over MCP to the bank's own server instead.

export const MCP_TOOLS = [
  { name: 'get_accounts', method: null, kind: 'read', desc: 'Balances of the customer’s accounts (masked IBAN)' },
  { name: 'get_transactions', method: null, kind: 'read', desc: 'Recent transactions with category' },
  { name: 'get_loans', method: null, kind: 'read', desc: 'Loans and installments' },
  { name: 'get_products', method: null, kind: 'read', desc: 'Deposit and loan products with rates' },
  { name: 'lookup_card', method: 'lookupCard', kind: 'read', desc: 'Card number → masked owner name and bank' },
  { name: 'lookup_phone', method: 'lookupPhone', kind: 'read', desc: 'Phone → masked customer name' },
  { name: 'lookup_bill', method: 'lookupBill', kind: 'read', desc: 'Service account → holder and current debt' },
  { name: 'prepare', method: 'prepare', kind: 'write', desc: 'Validate an operation, return summary + operation id (nothing moves)' },
  { name: 'execute', method: 'execute', kind: 'write', desc: 'Execute a prepared operation. Needs the customer’s fingerprint proof' },
  { name: 'cancel', method: 'cancel', kind: 'write', desc: 'Discard a prepared operation' },
  { name: 'set_card_state', method: 'setCard', kind: 'write', desc: 'Freeze / unfreeze, toggles' },
  { name: 'send_notification', method: null, kind: 'write', desc: 'Push a notification to the customer' },
];

let currentSession = null;
const listeners = new Set();
export const setSession = (id) => { currentSession = id; };
export const getSession = () => currentSession;
export const onBankEvent = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const log = (e) => window.__seda?.log({ session: currentSession || manualSession(), source: currentSession ? 'voice' : 'app', ...e });
let manual = null;
let manualAt = 0;
function manualSession() {
  if (!manual || Date.now() - manualAt > 120000) manual = 'S-APP' + Math.random().toString(36).slice(2, 6).toUpperCase();
  manualAt = Date.now();
  return manual;
}

const mask = (v) => String(v).replace(/\d(?=\d{4})/g, '•');

export function wrapBank(bank) {
  if (!bank || bank.__sedaWrapped) return bank;
  const wrap = (name, tool, describe) => {
    const orig = bank[name];
    bank[name] = async (...args) => {
      const t0 = performance.now();
      const res = await orig(...args);
      const ms = Math.round(performance.now() - t0);
      const d = describe(args, res);
      log({ type: 'mcp', text: `${tool}(${d.args})`, ms, data: d.out, ok: res?.ok !== false });
      listeners.forEach((fn) => fn({ tool, args, res }));
      return res;
    };
  };
  wrap('lookupCard', 'lookup_card', ([n], r) => ({ args: mask(n), out: r.ok ? `→ ${r.name} · ${r.bank}` : `→ ${r.error}` }));
  wrap('lookupPhone', 'lookup_phone', ([p], r) => ({ args: mask(p), out: r.ok ? `→ ${r.name}` : `→ ${r.error}` }));
  wrap('lookupBill', 'lookup_bill', ([b, a], r) => ({ args: `${b}, ${a}`, out: r.ok ? `→ debt ${r.debt ?? '—'}` : `→ ${r.error}` }));
  wrap('prepare', 'prepare', ([op], r) => ({ args: `${op.type}, ${op.amount ?? ''}`, out: r.ok ? `→ ${r.id} · fee ${r.fee}` : `→ refused: ${r.error}` }));
  wrap('cancel', 'cancel', ([id]) => ({ args: id, out: '→ discarded' }));
  wrap('setCard', 'set_card_state', ([id, patch]) => ({ args: `${id}, ${JSON.stringify(patch)}`, out: '→ ok' }));

  const exec = bank.execute;
  bank.execute = async (id, proof) => {
    log({ type: 'fingerprint', text: proof?.verified ? `Verified with ${proof.method} · signs operation ${id}` : 'No proof supplied', ok: !!proof?.verified });
    const t0 = performance.now();
    const res = await exec(id, proof);
    log({ type: 'mcp', text: `execute(${id}, proof)`, ms: Math.round(performance.now() - t0), data: res.ok ? `→ completed · receipt ${res.receiptId}` : `→ ${res.error}`, ok: res.ok });
    listeners.forEach((fn) => fn({ tool: 'execute', args: [id, proof], res }));
    return res;
  };
  bank.__sedaWrapped = true;
  return bank;
}

// keep the proxy attached whenever Caspia (re)mounts
export function installProxy() {
  const attach = () => window.caspia?.bank && wrapBank(window.caspia.bank);
  window.addEventListener('caspia:ready', attach);
  attach();
  return () => window.removeEventListener('caspia:ready', attach);
}
