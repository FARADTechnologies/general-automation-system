// ---------------------------------------------------------------------------
// MOCK CORE BANKING API
// Every money movement follows the same 2-step pattern real banks use:
//   1) prepare(op)   -> validates, calculates fee, returns a summary  (nothing moves)
//   2) execute(id, proof) -> requires a biometric/PIN proof, then applies it
// Later, an MCP server can expose exactly these functions to the voice platform.
// ---------------------------------------------------------------------------
import { CARD_DIRECTORY } from '../data/seed.js';
import { money, maskCard } from '../store/Store.jsx';

const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;
const uid = (p) => p + Math.random().toString(36).slice(2, 9).toUpperCase();
const OWN_BIN = '4169'; // "Caspia" cards start with this

export function createBankApi({ getState, mutate }) {
  // ---------- helpers ----------
  const card = (id) => getState().cards.find((c) => c.id === id);
  const account = (id) => getState().accounts.find((a) => a.id === id);
  const fundsOf = (c) => (c.accountId ? account(c.accountId).balance : c.available);
  const rate = (code) => getState().rates.find((x) => x.code === code);

  const debitSource = (s, cardId, amount) => {
    const c = s.cards.find((x) => x.id === cardId);
    if (c.accountId) s.accounts.find((a) => a.id === c.accountId).balance = r2(s.accounts.find((a) => a.id === c.accountId).balance - amount);
    else c.available = r2(c.available - amount);
  };
  const addTx = (s, tx) => s.transactions.unshift({ id: uid('T'), date: new Date().toISOString(), ...tx });

  const checkSource = (cardId, amount, kind = 'purchase') => {
    const c = card(cardId);
    if (!c) return 'Select a card.';
    if (c.frozen) return `${c.name} is frozen. Unfreeze it or choose another card.`;
    if (!(amount > 0)) return 'Enter an amount.';
    if (amount > fundsOf(c)) return `Insufficient funds. Available: ${money(fundsOf(c))}.`;
    if (amount > c.limits[kind === 'online' ? 'online' : 'purchase']) return `Exceeds the card's daily limit (${money(c.limits.purchase)}).`;
    return null;
  };

  // ---------- lookups ----------
  async function lookupCard(number) {
    await wait(500);
    const n = String(number).replace(/\D/g, '');
    if (n.length !== 16) return { ok: false, error: 'Card number must have 16 digits.' };
    const name = CARD_DIRECTORY[n] || ['R', 'K', 'S', 'T', 'N'][n.charCodeAt(14) % 5] + '*** ' + ['M', 'A', 'H', 'Q'][n.charCodeAt(15) % 4] + '.';
    return { ok: true, name, own: n.startsWith(OWN_BIN), bank: n.startsWith(OWN_BIN) ? 'Caspia Bank' : 'Other bank' };
  }

  async function lookupPhone(phone) {
    await wait(400);
    const digits = String(phone).replace(/\D/g, '');
    const c = getState().contacts.find((x) => x.phone.replace(/\D/g, '').endsWith(digits.slice(-9)));
    if (digits.length < 9) return { ok: false, error: 'Enter a valid phone number.' };
    return c ? { ok: true, name: c.name.split(' ')[0] + ' ' + c.name.split(' ')[1][0] + '.', card: c.card } : { ok: false, error: 'No Caspia customer with this number.' };
  }

  async function lookupBill(billerId, accountNo) {
    await wait(600);
    const b = getState().billers[billerId];
    if (!accountNo || String(accountNo).replace(/\W/g, '').length < 4) return { ok: false, error: `Enter a valid ${b.field.toLowerCase()}.` };
    const debt = b.mode === 'debt' ? (b.saved && String(accountNo).replace(/\s/g, '') === b.saved ? b.debt : r2(((accountNo.length * 7.3) % 40) + 3)) : null;
    return { ok: true, holder: 'L. Hasanova', debt, mode: b.mode };
  }

  // ---------- 1) PREPARE ----------
  async function prepare(op) {
    await wait(350);
    const s = getState();
    let err = null;
    let fee = 0;
    let lines = [];
    let title = '';
    let say = '';
    const amount = r2(Number(op.amount));
    const from = op.fromCardId ? card(op.fromCardId) : null;

    switch (op.type) {
      case 'card_transfer': {
        err = checkSource(op.fromCardId, amount);
        const own = String(op.toCard).startsWith(OWN_BIN);
        fee = own ? 0 : r2(Math.max(0.3, amount * 0.005));
        if (!err && amount + fee > fundsOf(from)) err = 'Insufficient funds including the fee.';
        title = 'Card transfer';
        lines = [['To', `${op.toName} · ${maskCard(op.toCard)}`], ['Recipient bank', own ? 'Caspia Bank' : 'Other bank'], ['Amount', money(amount)], ['Fee', money(fee)], ['From', `${from?.name} ${maskCard(from?.number || '')}`]];
        say = `Send ${amount} AZN to ${op.toName}, card ending ${String(op.toCard).slice(-4)}?`;
        break;
      }
      case 'qr_payment': {
        err = checkSource(op.fromCardId, amount);
        title = 'QR payment';
        lines = [['Merchant', op.merchant], ['Amount', money(amount)], ['Cashback', `${op.cashbackPct}% · ${money(r2(amount * op.cashbackPct / 100))}`], ['From', `${from?.name} ${maskCard(from?.number || '')}`]];
        say = `Pay ${amount} AZN to ${op.merchant}?`;
        break;
      }
      case 'phone_transfer': {
        err = checkSource(op.fromCardId, amount);
        title = 'Transfer by phone';
        lines = [['To', `${op.toName} · ${op.toPhone}`], ['Amount', money(amount)], ['Fee', money(0)], ['From', `${from?.name} ${maskCard(from?.number || '')}`]];
        say = `Send ${amount} AZN to ${op.toName}?`;
        break;
      }
      case 'own_transfer': {
        const src = account(op.fromAccountId);
        const dst = account(op.toAccountId);
        if (!src || !dst || src.id === dst.id) err = 'Choose two different accounts.';
        else if (!(amount > 0)) err = 'Enter an amount.';
        else if (amount > src.balance) err = `Insufficient funds. Available: ${money(src.balance, src.currency)}.`;
        const converted = !err && src.currency !== dst.currency ? convert(amount, src.currency, dst.currency) : amount;
        title = 'Between my accounts';
        lines = [['From', `${src?.name} (${src?.currency})`], ['To', `${dst?.name} (${dst?.currency})`], ['Amount', money(amount, src?.currency)], ...(src?.currency !== dst?.currency ? [['You get', money(converted, dst?.currency)]] : [])];
        op = { ...op, converted };
        say = `Move ${amount} ${src?.currency} to ${dst?.name}?`;
        break;
      }
      case 'intl_transfer': {
        err = checkSource(op.fromCardId, amount);
        fee = r2(Math.max(15, amount * 0.002));
        if (!err && amount + fee > fundsOf(from)) err = 'Insufficient funds including the fee.';
        if (!op.iban || op.iban.length < 10) err = 'Enter a valid IBAN.';
        if (!op.beneficiary) err = 'Enter the beneficiary name.';
        title = 'International transfer (SWIFT)';
        lines = [['Beneficiary', op.beneficiary], ['IBAN', op.iban], ['Country', op.country], ['SWIFT', op.swift || '—'], ['Amount', money(amount)], ['Fee', money(fee)], ['Arrives', '1–3 business days']];
        say = `Send ${amount} AZN abroad to ${op.beneficiary}?`;
        break;
      }
      case 'bill': {
        err = checkSource(op.fromCardId, amount);
        const b = s.billers[op.billerId];
        title = b.name;
        lines = [['Service', b.name], [b.field, op.accountNo], ['Amount', money(amount)], ['Fee', money(0)], ['From', `${from?.name} ${maskCard(from?.number || '')}`]];
        // a top-up must name the number out loud: it is the one thing a misheard request could get wrong
        say = b.mode === 'topup' ? `Top up ${op.accountNo} on ${b.name} with ${amount} AZN?` : `Pay ${amount} AZN to ${b.name}?`;
        break;
      }
      case 'exchange': {
        const src = account(op.fromAccountId);
        const dst = account(op.toAccountId);
        if (!(amount > 0)) err = 'Enter an amount.';
        else if (amount > src.balance) err = `Insufficient funds. Available: ${money(src.balance, src.currency)}.`;
        const converted = convert(amount, src.currency, dst.currency);
        title = 'Currency exchange';
        lines = [['Sell', money(amount, src.currency)], ['Buy', money(converted, dst.currency)], ['Rate', rateLabel(src.currency, dst.currency)]];
        op = { ...op, converted };
        say = `Exchange ${amount} ${src.currency} to ${converted} ${dst.currency}?`;
        break;
      }
      case 'deposit_open': {
        const src = account('acc-azn');
        const p = s.depositProducts.find((x) => x.id === op.productId);
        if (!(amount >= p.min)) err = `Minimum amount is ${money(p.min, p.currency)}.`;
        else if (p.currency === 'AZN' && amount > src.balance) err = 'Insufficient funds.';
        else if (p.currency === 'USD' && amount > account('acc-usd').balance) err = 'Insufficient USD funds.';
        const rt = p.rates[op.term];
        const interest = r2((amount * rt * op.term) / 1200);
        title = `Open ${p.name}`;
        lines = [['Amount', money(amount, p.currency)], ['Term', `${op.term} months`], ['Rate', `${rt}% per year`], ['Expected interest', money(interest, p.currency)]];
        op = { ...op, rate: rt, currency: p.currency, name: p.name };
        say = `Open a deposit of ${amount} ${p.currency} for ${op.term} months?`;
        break;
      }
      case 'loan_payment': {
        err = checkSource(op.fromCardId, amount);
        title = 'Loan payment';
        lines = [['Loan', 'Cash loan'], ['Amount', money(amount)], ['From', `${from?.name} ${maskCard(from?.number || '')}`]];
        say = `Pay ${amount} AZN towards your loan?`;
        break;
      }
      case 'installment_payment': {
        const ins = s.installments.find((x) => x.id === op.installmentId);
        title = `Installment · ${ins.merchant}`;
        lines = [['Purchase', `${ins.item} · ${ins.merchant}`], ['Amount', money(amount)], ['Card', 'Caspia Installment']];
        say = `Pay ${amount} AZN for ${ins.item}?`;
        break;
      }
      case 'cashback_withdraw': {
        if (!(amount > 0) || amount > s.cashback.balance) err = `You can withdraw up to ${money(s.cashback.balance)}.`;
        title = 'Withdraw cashback';
        lines = [['Amount', money(amount)], ['To', 'Caspia Debit']];
        say = `Move ${amount} AZN cashback to your card?`;
        break;
      }
      case 'loan_apply': {
        if (!(amount >= 300 && amount <= 30000)) err = 'Amount must be between 300 and 30,000 AZN.';
        const monthly = annuity(amount, 14.9, op.term);
        title = 'Cash loan application';
        lines = [['Amount', money(amount)], ['Term', `${op.term} months`], ['Rate', '14.9% per year'], ['Monthly payment', money(monthly)]];
        op = { ...op, monthly };
        say = `Apply for a ${amount} AZN loan for ${op.term} months?`;
        break;
      }
      default:
        err = 'Unknown operation.';
    }

    if (err) return { ok: false, error: err };
    say = say.replace(/\b(\d+)\.(\d)\b/g, (m, a, b) => `${a}.${b}0`); // 23.4 -> 23.40
    const id = uid('OP');
    const pending = { id, op: { ...op, amount }, fee, title, lines, say, createdAt: Date.now() };
    mutate((d) => { d.pendingOps[id] = pending; });
    return { ok: true, ...pending };
  }

  // ---------- 2) EXECUTE (needs biometric/PIN proof) ----------
  async function execute(id, proof) {
    const p = getState().pendingOps[id];
    if (!p) return { ok: false, error: 'This operation expired. Please start again.' };
    if (!proof || !proof.verified) return { ok: false, error: 'Confirmation required.' };
    if (Date.now() - p.createdAt > 5 * 60 * 1000) return { ok: false, error: 'Confirmation timed out.' };
    await wait(700);
    const { op, fee } = p;
    const receiptId = uid('R');

    mutate((s) => {
      switch (op.type) {
        case 'card_transfer':
          debitSource(s, op.fromCardId, op.amount + fee);
          addTx(s, { title: `Transfer to ${op.toName}`, category: 'transfers', amount: -(op.amount + fee), cardId: op.fromCardId, receiptId });
          break;
        case 'qr_payment': {
          debitSource(s, op.fromCardId, op.amount);
          const cb = r2(op.amount * op.cashbackPct / 100);
          s.cashback.balance = r2(s.cashback.balance + cb);
          addTx(s, { title: op.merchant, category: 'dining', amount: -op.amount, cardId: op.fromCardId, cashback: cb, receiptId });
          break;
        }
        case 'phone_transfer':
          debitSource(s, op.fromCardId, op.amount);
          addTx(s, { title: `Transfer to ${op.toName}`, category: 'transfers', amount: -op.amount, cardId: op.fromCardId, receiptId });
          break;
        case 'intl_transfer':
          debitSource(s, op.fromCardId, op.amount + fee);
          addTx(s, { title: `SWIFT · ${op.beneficiary}`, category: 'transfers', amount: -(op.amount + fee), cardId: op.fromCardId, receiptId });
          break;
        case 'bill': {
          debitSource(s, op.fromCardId, op.amount);
          const b = s.billers[op.billerId];
          if (b.mode === 'debt') b.debt = Math.max(0, r2((b.debt || 0) - op.amount));
          const cat = ['azercell', 'bakcell', 'nar', 'citynet', 'aztelekom', 'ktv'].includes(op.billerId) ? 'mobile' : 'utilities';
          addTx(s, { title: b.name, category: cat, amount: -op.amount, cardId: op.fromCardId, receiptId });
          break;
        }
        case 'own_transfer':
        case 'exchange': {
          const a = s.accounts.find((x) => x.id === op.fromAccountId);
          const b = s.accounts.find((x) => x.id === op.toAccountId);
          a.balance = r2(a.balance - op.amount);
          b.balance = r2(b.balance + op.converted);
          addTx(s, { title: op.type === 'exchange' ? `Exchange ${a.currency} → ${b.currency}` : `To ${b.name}`, category: 'exchange', amount: a.currency === 'AZN' ? -op.amount : r2(op.converted * (b.currency === 'AZN' ? 1 : 0)), cardId: 'card-debit', receiptId });
          break;
        }
        case 'deposit_open': {
          const src = s.accounts.find((x) => x.currency === op.currency);
          src.balance = r2(src.balance - op.amount);
          const m = new Date(); m.setMonth(m.getMonth() + Number(op.term));
          s.deposits.push({ id: uid('D'), name: op.name, currency: op.currency, amount: op.amount, rate: op.rate, term: Number(op.term), opened: new Date().toISOString(), maturity: m.toISOString() });
          if (op.currency === 'AZN') addTx(s, { title: `New deposit · ${op.name}`, category: 'transfers', amount: -op.amount, cardId: 'card-debit', receiptId });
          break;
        }
        case 'loan_payment': {
          debitSource(s, op.fromCardId, op.amount);
          const l = s.loans[0];
          l.remaining = Math.max(0, r2(l.remaining - op.amount));
          addTx(s, { title: 'Cash loan payment', category: 'loans', amount: -op.amount, cardId: op.fromCardId, receiptId });
          break;
        }
        case 'installment_payment': {
          const ins = s.installments.find((x) => x.id === op.installmentId);
          ins.paid = Math.min(ins.months, ins.paid + 1);
          const c = s.cards.find((x) => x.id === 'card-taksit');
          c.available = Math.min(c.creditLimit, r2(c.available + op.amount));
          s.accounts[0].balance = r2(s.accounts[0].balance - op.amount);
          addTx(s, { title: `Installment · ${ins.merchant}`, category: 'loans', amount: -op.amount, cardId: 'card-debit', receiptId });
          break;
        }
        case 'cashback_withdraw':
          s.cashback.balance = r2(s.cashback.balance - op.amount);
          s.accounts[0].balance = r2(s.accounts[0].balance + op.amount);
          addTx(s, { title: 'Cashback payout', category: 'cashback', amount: op.amount, cardId: 'card-debit', receiptId });
          break;
        case 'loan_apply':
          s.notifications.unshift({ id: uid('N'), title: 'Loan application received', body: `${money(op.amount)} for ${op.term} months. Decision within 5 minutes (demo).`, date: new Date().toISOString(), read: false, type: 'info' });
          break;
        default:
      }
      s.receipts[receiptId] = {
        op: { type: op.type, toCard: op.toCard, toName: op.toName, billerId: op.billerId, amount: op.amount },
        id: receiptId, title: p.title, lines: p.lines, amount: op.amount, fee, currency: op.currency || (op.type === 'exchange' || op.type === 'own_transfer' ? s.accounts.find((x) => x.id === op.fromAccountId).currency : 'AZN'),
        date: new Date().toISOString(), method: proof.method, status: op.type === 'loan_apply' ? 'Submitted' : op.type === 'intl_transfer' ? 'Processing' : 'Completed',
      };
      delete s.pendingOps[id];
    });
    return { ok: true, receiptId };
  }

  function cancel(id) { mutate((s) => { delete s.pendingOps[id]; }); }

  // ---------- non-money actions (no confirmation needed except where noted) ----------
  const setCard = (id, patch) => mutate((s) => { Object.assign(s.cards.find((c) => c.id === id), patch); });
  const setCardLimit = (id, kind, value) => mutate((s) => { s.cards.find((c) => c.id === id).limits[kind] = Number(value); });
  const toggleOffer = (id) => mutate((s) => { const o = s.offers.find((x) => x.id === id); o.active = !o.active; });
  const readAll = () => mutate((s) => { s.notifications.forEach((n) => { n.read = true; }); });
  const setSetting = (k, v) => mutate((s) => { s.settings[k] = v; });
  const saveTemplate = (tpl) => mutate((s) => { s.templates.push({ id: uid('TPL'), ...tpl }); });
  const removeDevice = (id) => mutate((s) => { s.devices = s.devices.filter((d) => d.id !== id); });
  const orderCard = (kind) => mutate((s) => {
    if (kind === 'virtual') {
      const n = '4169' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
      s.cards.push({ id: uid('card-'), name: 'Virtual card 2', product: 'Visa Virtual', network: 'VISA', accountId: 'acc-azn', number: n, holder: 'LEYLA HASANOVA', expiry: '11/29', cvv: '207', style: 'mint', frozen: false, virtual: true, limits: { purchase: 500, atm: 0, online: 500 }, online: true, contactless: false, abroad: true });
    }
    s.notifications.unshift({ id: uid('N'), title: kind === 'virtual' ? 'Virtual card is ready' : 'Card order received', body: kind === 'virtual' ? 'You can use it online right away.' : 'Your physical card will be ready in 3 business days. Delivery in Baku is free.', date: new Date().toISOString(), read: false, type: 'success' });
  });

  // ---------- money math ----------
  function convert(amount, from, to) {
    if (from === to) return amount;
    if (from === 'AZN') return r2(amount / rate(to).sell);
    if (to === 'AZN') return r2(amount * rate(from).buy);
    return r2((amount * rate(from).buy) / rate(to).sell);
  }
  function rateLabel(from, to) {
    if (from === 'AZN') return `1 ${to} = ${rate(to).sell} AZN`;
    return `1 ${from} = ${rate(from).buy} AZN`;
  }

  return {
    lookupCard, lookupPhone, lookupBill, prepare, execute, cancel,
    setCard, setCardLimit, toggleOffer, readAll, setSetting, saveTemplate, removeDevice, orderCard,
    convert, rateLabel, fundsOf,
  };
}

export function annuity(amount, ratePct, months) {
  const i = ratePct / 1200;
  return Math.round(((amount * i) / (1 - Math.pow(1 + i, -months))) * 100) / 100;
}
