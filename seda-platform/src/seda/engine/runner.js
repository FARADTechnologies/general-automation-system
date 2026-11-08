// The runner turns an utterance into visible steps inside the real Caspia app.
// It never moves money itself: money flows stop at the bank's confirmation sheet,
// and only the customer's fingerprint (handled by Caspia + bank execute) completes them.
import { matchIntent } from './intent.js';
import { setSession, onBankEvent, wrapBank } from './mcpProxy.js';
import { analyse, bankState } from './coach.js';
import { newId } from '../store.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (session, e) => window.__seda?.log({ session, ...e });
const money = (n) => Number(n).toFixed(2);

function el(id) {
  return document.querySelector(`[data-nav-id="${id}"]`) || document.getElementById(id);
}
async function waitFor(id, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const e = el(id); if (e) return e; await sleep(80); }
  return null;
}
// scroll only inside the phone's screen, never the console page
function scrollInPhone(e) {
  const box = e.closest('.screen');
  if (!box) return;
  const r = e.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top + 40 || r.bottom > b.bottom - 90) box.scrollTo({ top: box.scrollTop + (r.top - b.top) - b.height / 3, behavior: 'smooth' });
}
async function point(id, ms = 500) {
  const e = await waitFor(id);
  if (!e) return null;
  scrollInPhone(e);
  e.setAttribute('data-hl', 'true');
  await sleep(ms);
  e.removeAttribute('data-hl');
  return e;
}
// "055 123 45 67", "0551234567" or "+994 55 123 45 67" -> "055 123 45 67"
function spokenPhone(text) {
  const d = (text.match(/\+?\d[\d\s-]{7,}\d/) || [''])[0].replace(/\D/g, '');
  const local = d.startsWith('994') ? '0' + d.slice(3) : d;
  if (!/^0\d{9}$/.test(local)) return null;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
}
const OPERATORS = { '050': 'azercell', '051': 'azercell', '010': 'azercell', '055': 'bakcell', '099': 'bakcell', '070': 'nar', '077': 'nar' };
const operatorFor = (phone) => OPERATORS[phone.slice(0, 3)] || null;

async function typeInto(id, value) {
  const t0 = Date.now();
  let e = null;
  while (!e && Date.now() - t0 < 4000) { e = document.querySelector(`input#${id}`); if (!e) await sleep(80); }
  if (!e) return false;
  e.setAttribute('data-hl', 'true');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const str = String(value);
  for (let i = 1; i <= str.length; i++) {
    setter.call(e, str.slice(0, i));
    e.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(70);
  }
  await sleep(250);
  e.removeAttribute('data-hl');
  return true;
}
async function tap(id) {
  const e = await point(id, 450);
  if (e && !e.disabled) { e.click(); return true; }
  return false;
}

function waitForOutcome(session, timeout = 120000) {
  return new Promise((resolve) => {
    const off = onBankEvent(({ tool, res }) => {
      if (tool === 'execute' && res.ok) { off(); resolve({ ok: true, res }); }
      if (tool === 'execute' && !res.ok) { off(); resolve({ ok: false, error: res.error }); }
      if (tool === 'cancel') { off(); resolve({ ok: false, cancelled: true }); }
    });
    setTimeout(() => { off(); resolve({ ok: false, timeout: true }); }, timeout);
  });
}

export function phoneReady() {
  if (window.caspia?.bank) wrapBank(window.caspia.bank);
  return !!(window.caspia?.navigate && window.caspia?.bank && document.querySelector('.app'));
}

/**
 * Run one utterance. Returns { reply, session, status, coach? }.
 * hooks.say(text) speaks; hooks.step(text) updates the UI checklist.
 */
export async function runUtterance(text, { flows, source = 'text', say = () => {}, step = () => {} } = {}) {
  const session = newId('S-');
  setSession(session);
  log(session, { type: 'voice', text: `“${text}”`, source });
  const s = bankState();
  const m = matchIntent(text, flows, s);

  if (!m.flow) {
    log(session, { type: 'no_flow', text: m.reason, data: m.candidates.map((c) => `${c.flow.name}: ${c.score}`).join(' · ') });
    const reply = `${m.reason.replace(/“.*?”/, m.entities.biller ? `“${s.billers[m.entities.biller]?.name || m.entities.biller}”` : '')} An admin can add it in AI Studio.`;
    say(reply); setSession(null);
    return { reply, session, status: 'no_flow' };
  }
  const f = m.flow;
  const ent = m.entities;
  log(session, { type: 'intent', text: f.name, flow: f.id, data: `score ${m.score} · ${Object.entries(ent).filter(([, v]) => v).map(([k, v]) => `${k}=${typeof v === 'object' ? v.short : v}`).join(', ') || 'no entities'}` });

  const ready = phoneReady();
  const nav = async (path, state) => {
    if (!ready) return;
    window.caspia.navigate(path, state ? { state } : undefined);
    log(session, { type: 'navigate', text: path });
    step(`Open ${path}`);
    await sleep(650);
  };
  const blocked = (why) => { log(session, { type: 'blocked', text: why, status: 'blocked' }); say(why); setSession(null); return { reply: why, session, status: 'blocked' }; };
  const done = (reply, extra = {}, ev = {}) => { log(session, { type: 'result', text: reply, status: 'done', flow: f.id, ...ev }); say(reply); setSession(null); return { reply, session, status: 'done', ...extra }; };

  const moneyFlow = ['transfer_card', 'pay_bill', 'topup'].includes(f.kind);
  if (moneyFlow && !ready) return blocked('Open the Playground so the customer app is on screen, then try again.');

  // card policy from the flow config
  const pickCard = async () => {
    if (!f.cards?.length) return ent.card && !s.cards.find((c) => c.id === ent.card)?.creditLimit ? ent.card : null;
    const chosen = ent.card && f.cards.includes(ent.card) ? ent.card : f.cards[0];
    if (ent.card && !f.cards.includes(ent.card)) {
      log(session, { type: 'policy', text: `Card restricted by flow: using ${chosen} instead of ${ent.card}` });
    }
    return chosen;
  };
  const checkLimit = (amount) => {
    if (f.limits?.perPayment && amount > f.limits.perPayment) return `Voice payments for “${f.name}” are limited to ${f.limits.perPayment} AZN. Please use the app with your PIN for larger amounts.`;
    return null;
  };
  const awaitConfirmation = async (amount) => {
    const box = await waitFor('confirm-summary', 5000);
    if (!box) return blocked('The bank refused to prepare this operation.');
    const summary = box.textContent;
    log(session, { type: 'summary', text: summary });
    say(summary + ' Confirm with your fingerprint.');
    step('Waiting for fingerprint');
    const out = await waitForOutcome(session);
    if (out.ok) {
      const r = bankState().receipts[out.res.receiptId];
      return done(`Done. ${r ? r.title + ' · ' + money(r.amount) + ' ' + r.currency : 'Completed'}.`, {}, { amount });
    }
    if (out.cancelled) { log(session, { type: 'cancelled', text: 'Customer cancelled at the summary' }); setSession(null); return { reply: 'Cancelled. Nothing was sent.', session, status: 'cancelled' }; }
    log(session, { type: 'error', text: out.error || 'Timed out waiting for fingerprint' }); setSession(null);
    return { reply: 'The operation was not completed.', session, status: 'error' };
  };

  switch (f.kind) {
    case 'balance': {
      log(session, { type: 'mcp', text: 'get_accounts()', ms: 40, data: `→ ${s.accounts.length} accounts` });
      const usd = s.accounts.find((a) => a.currency === 'USD');
      const azn = s.accounts.find((a) => a.currency === 'AZN');
      const total = azn.balance + (usd ? usd.balance * s.rates.find((r) => r.code === 'USD').buy : 0);
      await nav('/');
      if (ready) await point('total-balance', 1200);
      return done(`Your total balance is ${money(total)} AZN: ${money(azn.balance)} AZN in your main account${usd ? ` and ${money(usd.balance)} USD in savings` : ''}.`);
    }
    case 'spending': {
      log(session, { type: 'mcp', text: 'get_transactions(30 days)', ms: 55, data: `→ ${s.transactions.length} items` });
      const a = analyse(s, window.__seda.getState().coach);
      const by = {};
      s.transactions.filter((t) => t.amount < 0 && Date.now() - new Date(t.date) < 30 * 86400000 && !['transfers', 'exchange'].includes(t.category)).forEach((t) => { by[t.category] = (by[t.category] || 0) - t.amount; });
      const top = Object.entries(by).sort((x, y) => y[1] - x[1])[0];
      await nav('/analytics');
      return done(`You spent ${money(a.spending)} AZN in the last 30 days. The biggest category is ${top[0]} with ${money(top[1])} AZN.`);
    }
    case 'coach': {
      ['get_accounts()', 'get_transactions(60 days)', 'get_loans()', 'get_products()'].forEach((t) => log(session, { type: 'mcp', text: t, ms: 30 + Math.round(Math.random() * 40) }));
      const a = analyse(s, window.__seda.getState().coach);
      log(session, { type: 'coach', text: a.recs.map((r) => r.title).join(' → ') });
      if (ready && a.recs[0]?.action) await nav(a.recs[0].action.path, a.recs[0].action.state);
      return done(a.short, { coach: a });
    }
    case 'freeze_card': {
      const card = ent.card || 'card-debit';
      const c = s.cards.find((x) => x.id === card);
      if (c.frozen) return done(`${c.name} is already frozen.`);
      await nav('/cards/' + card);
      if (ready) {
        await tap('card-freeze');
        await point('confirm-freeze', 300);
        log(session, { type: 'summary', text: `Freeze ${c.name}? (tap to confirm)` });
        say(`Freeze ${c.name}? Tap Freeze card to confirm.`);
        step('Waiting for tap');
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
          await sleep(300);
          if (bankState().cards.find((x) => x.id === card).frozen) return done(`${c.name} is frozen. No payments will go through.`);
          if (!el('confirm-freeze')) break;
        }
        log(session, { type: 'cancelled', text: 'Not confirmed' }); setSession(null);
        return { reply: 'Card was not frozen.', session, status: 'cancelled' };
      }
      return blocked('Open the Playground to freeze a card.');
    }
    case 'transfer_card': {
      const c = ent.contact;
      if (!c) return blocked('Who should receive the money? Say a contact name, for example “Send 20 manat to Murad”.');
      if (!ent.amount) return blocked(`How much should I send to ${c.short}? Say for example “Send 20 manat to ${c.short}”.`);
      const lim = checkLimit(ent.amount); if (lim) return blocked(lim);
      if (f.limits?.perDay) {
        const today = new Date().toDateString();
        const used = window.__seda.getState().events.filter((e) => e.type === 'result' && e.flow === f.id && new Date(e.t).toDateString() === today && e.amount).reduce((a, e) => a + e.amount, 0);
        if (used + ent.amount > f.limits.perDay) return blocked(`Daily voice limit reached: ${used} of ${f.limits.perDay} AZN used today.`);
      }
      const card = await pickCard();
      await nav('/transfers');
      await point('contact-' + c.id, 500);
      await nav('/transfers/card', { toCard: c.card });
      await waitFor('recipient-name', 3000);
      step('Recipient checked by the bank');
      await typeInto('amount', ent.amount);
      if (card) await tap('pick-card-' + card);
      step('Prepare with the bank');
      await tap('continue');
      return awaitConfirmation(ent.amount);
    }
    case 'pay_bill':
    case 'topup': {
      // A spoken phone number decides the operator and the number to top up. Without one, the saved own number is used.
      const phone = f.kind === 'topup' ? spokenPhone(text) : null;
      let billerId = ent.biller && f.billers.includes(ent.biller) ? ent.biller : f.billers[0];
      if (phone) {
        const op = operatorFor(phone);
        if (!op || !f.billers.includes(op)) return blocked(`${phone} looks like a ${op ? s.billers[op].name : 'number from another operator'} number. This voice flow only tops up ${f.billers.map((x) => s.billers[x].name).join(', ')}.`);
        billerId = op;
      }
      const b = s.billers[billerId];
      if (f.kind === 'topup' && !ent.amount) return blocked('How much should I top up? Say for example “Top up my phone with 5 manat”.');
      let amount = ent.amount;
      if (!amount && b.mode === 'debt') {
        if (!(b.debt > 0)) return done(`You have no unpaid ${b.name} bill.`);
        amount = b.debt;
      }
      const lim = checkLimit(amount); if (lim) return blocked(lim);
      const card = await pickCard();
      await nav('/payments/' + billerId);
      if (b.mode === 'debt') { await waitFor('bill-debt', 3500); step('Debt checked by the bank'); }
      // always write the number: the screen may still hold one from an earlier request
      if (f.kind === 'topup') await typeInto('bill-acc', phone || spokenPhone(b.saved || '') || b.saved || '');
      if (ent.amount || f.kind === 'topup') await typeInto('amount', amount);
      if (card) await tap('pick-card-' + card);
      step('Prepare with the bank');
      await tap('continue');
      return awaitConfirmation(amount);
    }
    default:
      return blocked('This flow type is not supported yet.');
  }
}
