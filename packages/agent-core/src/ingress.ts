// Ingress tokenizer (deterministic, runs before the LLM sees anything).
// Detects card-like numbers (13-19 digits passing Luhn, including spoken digit groups)
// full phone numbers and IBANs (checksum-valid). Luhn is used only here, and only to recognise cards:
// ordinary amounts are never touched.

export interface SensitiveHit { kind: 'pan' | 'phone' | 'iban'; digits: string; start: number; end: number }

const DIGIT_WORDS: Record<string, string> = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const AZ_MOBILE = /^(50|51|55|60|70|77|99|10)\d{7}$/;

function classify(digits: string, plus: boolean): 'pan' | 'phone' | null {
  if (digits.length >= 13 && digits.length <= 19 && luhn(digits) && !plus) return 'pan';
  if (plus && digits.length >= 10 && digits.length <= 15) return 'phone';
  if (/^994\d{9}$/.test(digits)) return 'phone';
  if (/^0\d{9}$/.test(digits) && AZ_MOBILE.test(digits.slice(1))) return 'phone';
  if (AZ_MOBILE.test(digits)) return 'phone';
  return null;
}

interface Group { digits: string; start: number; end: number; plus: boolean }

/** IBAN checksum (ISO 13616, mod 97). */
export function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) for (const d of ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

/** IBANs written together ("DE89370400440532013000") or in groups of four ("DE89 3704 0044 ..."). */
export function findIbans(text: string): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  const re = /\b[A-Za-z]{2}\d{2}(?:[ -]?[A-Za-z0-9]{1,4}){3,8}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // try the longest prefix that ends on a group boundary and passes the checksum
    const parts = m[0].split(/(?=[ -])/);
    for (let k = parts.length; k >= 1; k--) {
      const raw = parts.slice(0, k).join('');
      const v = raw.replace(/[ -]/g, '').toUpperCase();
      if (ibanValid(v)) { hits.push({ kind: 'iban', digits: v, start: m.index, end: m.index + raw.length }); break; }
    }
  }
  return hits;
}

/** Find card numbers, phone numbers and IBANs in free text (digits or spoken digit words). */
export function findSensitive(text: string): SensitiveHit[] {
  // IBANs first; their characters are blanked so their digits are not read as a card or a phone
  const ibans = findIbans(text);
  if (ibans.length) {
    let blanked = text;
    for (const h of ibans) blanked = blanked.slice(0, h.start) + ' '.repeat(h.end - h.start) + blanked.slice(h.end);
    return [...ibans, ...findDigits(blanked)].sort((a, b) => a.start - b.start);
  }
  return findDigits(text);
}

function findDigits(text: string): SensitiveHit[] {
  // 1) tokens that are digit groups or single digit words, with positions
  const re = /\+?\d+|[A-Za-z]+/g;
  const toks: (Group & { word: boolean })[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    if (/^\+?\d+$/.test(raw)) toks.push({ digits: raw.replace('+', ''), start: m.index, end: m.index + raw.length, plus: raw.startsWith('+'), word: false });
    else if (DIGIT_WORDS[raw.toLowerCase()] !== undefined && raw.length > 1) toks.push({ digits: DIGIT_WORDS[raw.toLowerCase()], start: m.index, end: m.index + raw.length, plus: false, word: true });
    else toks.push({ digits: '', start: m.index, end: m.index + raw.length, plus: false, word: true }); // breaker
  }
  // 2) runs of adjacent numeric tokens separated only by spaces, dashes, dots or commas
  const runs: Group[][] = [];
  let cur: Group[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t.digits) { if (cur.length) runs.push(cur); cur = []; continue; }
    const prev = cur[cur.length - 1];
    const gap = prev ? text.slice(prev.end, t.start) : '';
    if (prev && !/^[\s\-.]*$/.test(gap)) { runs.push(cur); cur = []; }
    cur.push(t);
  }
  if (cur.length) runs.push(cur);

  // 3) inside each run, take the longest contiguous span that classifies, left to right
  const hits: SensitiveHit[] = [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      let found: SensitiveHit | null = null;
      for (let j = run.length - 1; j >= i; j--) {
        const span = run.slice(i, j + 1);
        // a long digit group (5+ digits) only joins neighbours when every group is short, to keep "pay 20 0501112201" apart
        if (span.length > 1 && span.some((g) => g.digits.length > 4 && !g.plus)) continue;
        const digits = span.map((g) => g.digits).join('');
        const kind = classify(digits, span[0].plus);
        if (kind) { found = { kind, digits, start: span[0].start, end: span[span.length - 1].end }; i = j + 1; break; }
      }
      if (found) hits.push(found); else i++;
    }
  }
  return hits;
}

/** Replace hits right-to-left using the provided replacer. */
export function replaceHits(text: string, hits: SensitiveHit[], replacement: (h: SensitiveHit, i: number) => string): string {
  let out = text;
  [...hits].map((h, i) => ({ h, i })).sort((a, b) => b.h.start - a.h.start).forEach(({ h, i }) => { out = out.slice(0, h.start) + replacement(h, i) + out.slice(h.end); });
  return out;
}
