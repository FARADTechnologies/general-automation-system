// English intent engine: utterance -> best LIVE flow + entities.
// Deterministic on purpose: it runs offline, instantly, and its decisions are explainable in Live Traces.

const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };

export const norm = (t) => (t || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9.,' ]/g, ' ').replace(/\s+/g, ' ').trim();

// Money words that can sit next to an amount.
const CUR = /^(manat|manats|azn|usd|dollars?|eur|euros?|qepik)$/;

export function parseAmount(text) {
  const t = norm(text);
  // Numeric tokens. "1,000" and "1,500.50" use the comma as a thousands separator;
  // a lone comma with 1-2 digits ("12,50") is a decimal comma.
  const words = t.split(' ');
  const nums = [];
  words.forEach((w, i) => {
    const raw = w.replace(/[.,]$/, '');
    let v = null;
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw)) v = Number(raw.replace(/,/g, ''));
    else if (/^\d+([.,]\d{1,2})?$/.test(raw)) v = Number(raw.replace(',', '.'));
    if (v !== null) nums.push({ v, i, raw });
  });
  if (nums.length) {
    // 1) a number said next to a currency word wins ("with 10 manat")
    const cur = nums.find((n) => CUR.test(words[n.i + 1] || '') || CUR.test(words[n.i - 1] || ''));
    if (cur) return cur.v;
    // 2) skip phone-number-like runs: a leading-zero group, or 3+ number groups in a row
    const phoneish = new Set();
    nums.forEach((n, k) => {
      let run = 1; while (nums[k + run] && nums[k + run].i === n.i + run) run++;
      if (run >= 3 || /^0\d{2,}/.test(n.raw)) for (let j = 0; j < run; j++) phoneish.add(nums[k + j].i);
    });
    const plain = nums.find((n) => !phoneish.has(n.i));
    return plain ? plain.v : null;
  }
  let total = 0, cur = 0, found = false;
  for (const w of t.split(' ')) {
    if (!(w in NUM)) continue;
    found = true;
    const v = NUM[w];
    if (v === 100) cur = (cur || 1) * 100;
    else if (v === 1000) { total += (cur || 1) * 1000; cur = 0; }
    else cur += v;
  }
  return found ? total + cur : null;
}

// Service names people say -> bank biller ids (from the bank's MCP catalogue)
export const BILLER_WORDS = [
  [['traffic fine', 'traffic fines', 'fine', 'fines', 'penalty', 'police fine', 'speeding'], 'fines'],
  [['electricity', 'electric', 'light bill', 'power bill', 'azerishiq'], 'azerishiq'],
  [['water', 'azersu'], 'azersu'],
  [['gas', 'azeriqaz'], 'azeriqaz'],
  [['heating', 'azeristilik'], 'azeristilik'],
  [['internet', 'wifi', 'citynet'], 'citynet'],
  [['landline', 'home phone', 'aztelekom'], 'aztelekom'],
  [['cable', 'tv'], 'ktv'],
  [['property tax', 'tax'], 'tax'],
  [['parking'], 'parking'],
  [['metro', 'metro card', 'bakikart'], 'metrocard'],
  [['tuition', 'university'], 'university'],
  [['school'], 'school'],
  [['bakcell'], 'bakcell'],
  [['nar mobile'], 'nar'],
  [['azercell', 'my phone', 'mobile', 'phone credit', 'top up'], 'azercell'],
];

const has = (t, w) => (` ${t} `).includes(` ${w} `) || (w.includes(' ') && t.includes(w));

export function findBiller(text) {
  const t = norm(text);
  for (const [words, id] of BILLER_WORDS) if (words.some((w) => has(t, w))) return id;
  return null;
}

const CONTACT_WORDS = { mom: 'p1', mother: 'p1', mum: 'p1', mama: 'p1', dad: 'p2', father: 'p2', papa: 'p2' };
export function findContact(text, contacts) {
  const t = norm(text);
  for (const [w, id] of Object.entries(CONTACT_WORDS)) if (has(t, w) || has(t, w + "'s")) return contacts.find((c) => c.id === id);
  return contacts.find((c) => [c.short, ...c.name.split(' ')].some((n) => has(t, n.toLowerCase()) || has(t, n.toLowerCase() + "'s")));
}

export function findCard(text) {
  const t = norm(text);
  if (/installment|taksit|credit card/.test(t)) return 'card-taksit';
  if (/virtual/.test(t)) return 'card-virtual';
  if (/debit|main card/.test(t)) return 'card-debit';
  return null;
}

/**
 * @returns {{flow, entities, score, reason, candidates}}
 */
export function matchIntent(text, flows, bankState) {
  const t = norm(text);
  const entities = {
    amount: parseAmount(t),
    contact: bankState ? findContact(t, bankState.contacts) : null,
    biller: findBiller(t),
    card: findCard(t),
  };
  const live = flows.filter((f) => f.status === 'live');

  const scored = live.map((f) => {
    let score = 0;
    const hits = f.keywords.filter((k) => has(t, k) || t.includes(k + 's'));
    score += hits.length * 2;
    switch (f.kind) {
      case 'transfer_card':
        if (entities.contact) score += 4; else score -= 3;
        if (entities.biller && !entities.contact) score -= 5;
        break;
      case 'pay_bill':
        if (entities.biller && f.billers.includes(entities.biller)) score += 6;
        else if (entities.biller) score -= 8; // this flow doesn't cover that service
        else score -= 2;
        break;
      case 'topup':
        if (entities.biller && f.billers.includes(entities.biller)) score += 5; else score -= 4;
        if (/top ?up|credit/.test(t)) score += 2;
        break;
      case 'balance':
        if (/spend|spent/.test(t)) score -= 4;
        if (/top ?up/.test(t)) score -= 4;
        break;
      case 'coach':
        if (/how much did i spend/.test(t)) score -= 4;
        break;
      default:
    }
    return { flow: f, score, hits };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 2) {
    // explain WHY nothing matched (shown in Live Traces and used by AI Studio)
    let reason = 'No live voice flow matches this request.';
    if (entities.biller) reason = `No live voice flow covers “${entities.biller}” payments yet.`;
    return { flow: null, entities, score: best?.score ?? 0, reason, candidates: scored.slice(0, 3) };
  }
  return { flow: best.flow, entities, score: best.score, hits: best.hits, candidates: scored.slice(0, 3) };
}
