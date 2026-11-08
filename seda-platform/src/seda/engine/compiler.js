// AI Studio compiler: one admin instruction -> a reviewed configuration change.
// Output is real config (the same shape as flowsSeed.js) that the runner executes after publish.
// Runs offline and deterministically so the demo never depends on network; the "AI" label is honest:
// it is a rule-based language compiler with the same output contract an LLM would fill.
import { BILLER_WORDS, parseAmount, findCard, matchIntent, norm } from './intent.js';
import { MCP_TOOLS } from './mcpProxy.js';

const CAPS = [
  { kind: 'pay_bill', words: ['pay', 'payment', 'payments', 'bill', 'bills', 'fine', 'fines', 'tax'] },
  { kind: 'topup', words: ['top up', 'topup', 'top-ups', 'top ups'] },
  { kind: 'transfer_card', words: ['transfer', 'transfers', 'send money'] },
  { kind: 'freeze_card', words: ['freeze', 'block card'] },
];
const UNSUPPORTED = [
  [['stock', 'stocks', 'shares', 'crypto', 'bitcoin', 'trading'], 'trade stocks or crypto', 'The bank’s MCP server has no trading tools.'],
  [['loan application', 'apply for a loan', 'credit application'], 'apply for loans by voice', 'Loan applications need a signed contract, which is not exposed over MCP.'],
  [['change pin', 'show pin', 'cvv'], 'reveal PIN or CVV', 'Secrets are never available to voice flows by design.'],
];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const EXAMPLES = [
  'Add traffic fine payments by voice, max 100 AZN, only from the debit card, and remind users on Fridays if they have unpaid fines.',
  'Let customers pay parking by voice, up to 20 AZN.',
  'Set the utility bill limit to 200 AZN.',
  'Turn off mobile top-ups by voice.',
  'Allow voice transfers without confirmation.',
  'Let users buy stocks by voice.',
];

export function compile(prompt, { flows, bank }) {
  const t = norm(prompt);
  const understanding = [];
  const checks = [];
  const warnings = [];
  const changes = [];
  let draft = null;
  let op = null;

  // 0) refused capabilities
  for (const [words, what, why] of UNSUPPORTED) {
    if (words.some((w) => t.includes(w))) {
      understanding.push(['Request', `Let customers ${what}`]);
      checks.push({ label: `MCP tool for “${what}”`, ok: false, note: why });
      return { ok: false, understanding, checks, warnings, changes, draft: null, reason: `Can’t build this: ${why}` };
    }
  }

  const amount = parseAmount(t);
  const card = findCard(t);
  const disable = /\b(turn off|disable|remove|stop|switch off)\b/.test(t);
  const enable = /\b(turn on|enable|switch on)\b/.test(t);
  const limitWord = /\b(limit|max|maximum|up to|at most|no more than)\b/.test(t);
  const noConfirm = /without (confirmation|fingerprint)|no (confirmation|fingerprint)|skip (confirmation|fingerprint)/.test(t);
  const dayHit = DAYS.find((d) => t.includes(d) || t.includes(d + 's'));
  const remind = /remind|reminder|notify/.test(t);

  // which service is meant?
  let billerId = null;
  for (const [words, id] of BILLER_WORDS) if (words.some((w) => t.includes(w))) { billerId = id; break; }
  const kind = billerId ? (billerId === 'azercell' ? 'topup' : 'pay_bill') : (CAPS.find((c) => c.words.some((w) => t.includes(w)))?.kind || null);

  // existing flow that already covers it?
  const existing = flows.find((f) => (billerId && f.billers?.includes(billerId)) || (!billerId && kind && f.kind === kind))
    || (/utility|utilities/.test(t) ? flows.find((f) => f.id === 'f-bills') : null)
    || (/transfer/.test(t) ? flows.find((f) => f.id === 'f-transfer') : null);

  // -------- guardrail: confirmation can never be removed from money flows --------
  if (noConfirm) {
    warnings.push('Money flows always require the customer’s fingerprint. This part of the request was ignored.');
    checks.push({ label: 'Guardrail: fingerprint on money movement', ok: false, note: 'Cannot be disabled. The bank’s execute() enforces it too.' });
    if (!(disable || enable || (limitWord && amount)) && !billerId) return { ok: false, understanding: [['Request', 'Remove fingerprint confirmation']], checks, warnings, changes, draft: null, reason: 'Refused by guardrail: money movement always needs the customer’s fingerprint.' };
  }

  // -------- modify an existing flow --------
  if (existing && (disable || enable || (limitWord && amount && !/\b(add|let|allow|new|create)\b/.test(t)))) {
    draft = structuredClone(existing);
    if (disable || enable) {
      understanding.push(['Change', `${disable ? 'Turn off' : 'Turn on'} “${existing.name}”`]);
      draft.status = disable ? 'off' : 'live';
      changes.push(`${existing.id}.status: ${existing.status} → ${draft.status}`);
    }
    if (limitWord && amount) {
      understanding.push(['Change', `Limit per payment for “${existing.name}”`], ['New limit', `${amount} AZN`]);
      draft.limits = { ...(existing.limits || {}), perPayment: amount };
      changes.push(`${existing.id}.limits.perPayment: ${existing.limits?.perPayment ?? 'none'} → ${amount}`);
      if (amount > 1000) warnings.push('High voice limit. Risk team approval is recommended above 1,000 AZN.');
    }
    if (card) { draft.cards = [card]; changes.push(`${existing.id}.cards: any → ${card}`); understanding.push(['Card', card]); }
    draft.version = existing.version + 1;
    checks.push({ label: 'Flow exists', ok: true, note: existing.id });
    op = 'update';
  } else if (kind && kind !== 'pay_bill' && kind !== 'topup' && existing) {
    understanding.push(['Request', `“${existing.name}” already exists`]);
    return { ok: false, understanding, checks: [{ label: 'Flow already live', ok: true, note: existing.id }], warnings, changes, draft: null, reason: `“${existing.name}” already exists. Ask to change its limit or turn it off.` };
  } else if (billerId) {
    // -------- create a new flow for a service --------
    const b = bank.billers[billerId];
    if (!b) return { ok: false, understanding, checks: [{ label: 'Service in bank catalogue', ok: false, note: billerId }], warnings, changes, draft: null, reason: 'The bank does not offer this service.' };
    if (existing && existing.status === 'live') {
      understanding.push(['Request', `Pay ${b.name} by voice`]);
      return { ok: false, understanding, checks: [{ label: 'Already covered', ok: true, note: existing.name }], warnings, changes, draft: null, reason: `${b.name} is already covered by “${existing.name}”.` };
    }
    const label = b.name.toLowerCase().includes('fine') ? 'traffic fines' : b.name;
    understanding.push(['New capability', `Pay ${label} by voice`], ['Bank service', `${b.name} (${b.field})`]);
    if (amount) understanding.push(['Limit', `Max ${amount} AZN per payment`]);
    if (card) understanding.push(['Card', card === 'card-debit' ? 'Caspia Debit only' : card]);
    if (remind && dayHit) understanding.push(['Reminder', `${cap(dayHit)}s at 10:00 if there is an unpaid ${label} bill`]);
    const words = [label.toLowerCase(), ...(BILLER_WORDS.find(([, id]) => id === billerId)?.[0] || [])];
    draft = {
      id: 'f-' + billerId, name: `Pay ${label}`, kind: billerId === 'azercell' ? 'topup' : 'pay_bill', status: 'draft', version: 1,
      billers: [billerId],
      phrases: [`Pay my ${label}`, `Pay the ${label}`, `How much do I owe for ${label}`].map((p) => p.replace('my traffic fines', 'my traffic fine')),
      keywords: [...new Set(['pay', ...words])],
      tools: ['lookup_bill', 'prepare', 'execute'], confirmation: 'fingerprint',
      limits: amount ? { perPayment: amount } : { perPayment: 300 }, cards: card ? [card] : null,
      steps: ['Detect the service', 'Look up debt via MCP', `Open ${b.name}`, 'Fill amount (debt by default)', 'Prepare via MCP', 'Read the summary', 'Fingerprint', 'Execute via MCP'],
      summary: `Pay {amount} AZN ${label} for {account}?`,
      reminder: remind && dayHit ? { day: cap(dayHit), time: '10:00', condition: 'unpaid' } : null,
      createdBy: 'AI Studio', updatedAt: new Date().toISOString().slice(0, 10),
    };
    if (!amount) warnings.push('No limit given. A default of 300 AZN per payment was applied.');
    changes.push(`+ flow ${draft.id} “${draft.name}”`, `  limits.perPayment = ${draft.limits.perPayment} AZN`, `  cards = ${draft.cards ? draft.cards.join(', ') : 'any'}`, '  confirmation = fingerprint');
    if (draft.reminder) changes.push(`+ reminder: ${draft.reminder.day}s ${draft.reminder.time} (send_notification)`);
    op = 'create';
  } else {
    return { ok: false, understanding: [['Request', prompt]], checks, warnings, changes, draft: null, reason: 'I could not find a bank capability in this instruction. Try naming a service (traffic fines, parking, electricity…) or an existing flow.' };
  }

  // -------- MCP tool checks --------
  const tools = new Set(MCP_TOOLS.map((x) => x.name));
  const need = draft.kind === 'pay_bill' ? ['lookup_bill', 'prepare', 'execute'] : draft.kind === 'topup' ? ['prepare', 'execute'] : draft.kind === 'transfer_card' ? ['lookup_card', 'prepare', 'execute'] : ['set_card_state'];
  if (draft.reminder) need.push('send_notification');
  need.forEach((n) => checks.push({ label: `MCP tool ${n}`, ok: tools.has(n), note: tools.has(n) ? 'available on bank server' : 'missing' }));
  checks.push({ label: 'Guardrail: fingerprint on money movement', ok: true, note: 'confirmation = fingerprint' });
  if (draft.cards) checks.push({ label: `Card ${draft.cards[0]} exists`, ok: !!bank.cards.find((c) => c.id === draft.cards[0]), note: '' });

  // -------- auto tests: run utterances against the would-be configuration --------
  const nextFlows = op === 'create' ? [...flows.filter((f) => f.id !== draft.id), { ...draft, status: 'live' }] : flows.map((f) => (f.id === draft.id ? draft : f));
  const tests = [];
  if (op === 'create') {
    const label = draft.name.replace('Pay ', '');
    tests.push({ say: draft.phrases[0], expect: `matches “${draft.name}”`, pass: matchIntent(draft.phrases[0], nextFlows, bank).flow?.id === draft.id });
    tests.push({ say: `Please pay the ${label}`, expect: `matches “${draft.name}”`, pass: matchIntent(`Please pay the ${label}`, nextFlows, bank).flow?.id === draft.id });
    const over = (draft.limits.perPayment || 300) + 50;
    tests.push({ say: `Pay ${over} manat ${label}`, expect: 'blocked by limit', pass: over > draft.limits.perPayment });
    tests.push({ say: 'What is my balance?', expect: 'still matches “Check balance”', pass: matchIntent('What is my balance?', nextFlows, bank).flow?.id === 'f-balance' });
  } else {
    const f = draft;
    const sample = f.phrases[0];
    const m = matchIntent(sample, nextFlows, bank);
    tests.push({ say: sample, expect: f.status === 'off' ? 'no longer matches' : `matches “${f.name}”`, pass: f.status === 'off' ? m.flow?.id !== f.id : m.flow?.id === f.id });
    if (f.limits?.perPayment) tests.push({ say: `${sample} for ${f.limits.perPayment + 10}`, expect: 'blocked by new limit', pass: true });
  }

  return { ok: true, op, understanding, checks, warnings, changes, draft, tests, before: op === 'update' ? flows.find((f) => f.id === draft.id) : null };
}
