// Deterministic evidence extraction from the user's own words.

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every number the user stated: digits ("25", "1,500.50", "12,5") and number words ("twenty five", "a hundred"). */
export function extractAmounts(text: string): number[] {
  const out = new Set<number>();
  const t = text.toLowerCase().replace(/[’']/g, "'");
  for (const m of t.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)) {
    const raw = m[0];
    const v = /^\d{1,3}(,\d{3})+/.test(raw) ? Number(raw.replace(/,/g, '')) : Number(raw.replace(',', '.'));
    if (Number.isFinite(v)) out.add(round2(v));
  }
  // number words
  const words = t.replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  let total = 0, curr = 0, active = false;
  const flush = () => { if (active) out.add(total + curr); total = 0; curr = 0; active = false; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in UNITS) { curr += UNITS[w]; active = true; }
    else if (w in TENS) { curr += TENS[w]; active = true; }
    else if (w === 'hundred') { curr = (curr || 1) * 100; active = true; }
    else if (w === 'thousand') { total += (curr || 1) * 1000; curr = 0; active = true; }
    else if ((w === 'a' || w === 'and') && active) { /* "a hundred", "one hundred and five" */ }
    else if (w === 'a' && (words[i + 1] === 'hundred' || words[i + 1] === 'thousand')) { active = true; }
    else flush();
  }
  flush();
  // "20 manat 50 qapik" -> 20.50
  for (const m of t.matchAll(/(\d+)\s*(?:manat|azn)\s*(\d{1,2})\s*(?:qapik|q[eə]pik|gapik)/g)) out.add(round2(Number(m[1]) + Number(m[2]) / 100));
  return [...out];
}

export function mentionedCurrencies(text: string): Set<'AZN' | 'USD'> {
  const t = text.toLowerCase();
  const s = new Set<'AZN' | 'USD'>();
  if (/\b(manat|manats|azn|qapik|qəpik)\b|₼/.test(t)) s.add('AZN');
  if (/\b(dollars?|usd|bucks)\b|\$/.test(t)) s.add('USD');
  return s;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** True when every word of `query` appears in the user's words (as a word or word prefix of 3+ letters). */
export function queryFromUser(query: string, userTexts: string[]): boolean {
  const q = norm(query).split(' ').filter(Boolean);
  if (!q.length) return false;
  const words = new Set(userTexts.flatMap((t) => norm(t).split(' ')));
  // also accept possessives and plurals the user may have used ("ali's" -> "ali s")
  return q.every((w) => words.has(w) || [...words].some((u) => (u.length >= 3 && w.startsWith(u)) || (w.length >= 3 && u.startsWith(w))));
}

/** True when any of the capability's intent terms appears in the user's words. */
export function intentStated(terms: string[], userTexts: string[]): boolean {
  if (!terms.length) return true;
  const words = new Set(userTexts.flatMap((t) => norm(t).split(' ')));
  return terms.some((term) => words.has(norm(term)) || [...words].some((w) => w.startsWith(norm(term)) && w.length - term.length <= 3));
}

/** Collect every number found in a JSON value (numbers and numeric parts of strings). */
export function numbersIn(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === 'number') into.add(round2(value));
  else if (typeof value === 'string') for (const m of value.matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g)) into.add(round2(Math.abs(Number(m[0].replace(/,/g, '')))));
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, into));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbersIn(v, into));
  if (typeof value === 'number') into.add(round2(Math.abs(value)));
  return into;
}
