import { describe, it, expect } from 'vitest';
import { findSensitive, luhn } from './ingress.ts';
import { extractAmounts, mentionedCurrencies, queryFromUser, intentStated } from './evidence.ts';
import { lintAnswer, claimedFigures } from './lint.ts';

// a Luhn-valid test PAN
const PAN = '4111111111111111';

describe('ingress tokenizer', () => {
  it('finds cards written plainly, spaced, dashed and spoken', () => {
    expect(luhn(PAN)).toBe(true);
    expect(findSensitive(`card ${PAN}`)[0]).toMatchObject({ kind: 'pan', digits: PAN });
    expect(findSensitive('card 4111 1111 1111 1111 please')[0]).toMatchObject({ kind: 'pan', digits: PAN });
    expect(findSensitive('4111-1111-1111-1111')[0]?.kind).toBe('pan');
    const spoken = 'four one one one one one one one one one one one one one one one';
    expect(findSensitive(`my card is ${spoken}`)[0]).toMatchObject({ kind: 'pan', digits: PAN });
  });
  it('finds Azerbaijani phone numbers in common formats', () => {
    for (const p of ['+994 50 111 22 33', '+994501112233', '050 111 22 33', '0501112233', '994501112233']) expect(findSensitive(`call ${p}`)[0]?.kind).toBe('phone');
  });
  it('never touches ordinary amounts or a non-Luhn long number', () => {
    for (const t of ['send 25 manat', 'send 1500', 'send 1,500.50 AZN', 'send 1 000 000', 'pay 20 to Ali', 'year 2026 and 4417', '4111111111111112']) expect(findSensitive(t)).toEqual([]);
  });
  it('keeps an amount apart from a phone number that follows it', () => {
    const h = findSensitive('top up 20 0501112233');
    expect(h).toHaveLength(1);
    expect(h[0].digits).toBe('0501112233');
  });
});

describe('evidence', () => {
  it('extracts amounts from digits and words', () => {
    expect(extractAmounts('send 25 manat')).toContain(25);
    expect(extractAmounts('send twenty five manat')).toContain(25);
    expect(extractAmounts('a hundred and fifty')).toContain(150);
    expect(extractAmounts('1,500.50 AZN')).toContain(1500.5);
    expect(extractAmounts('12,5 manat')).toContain(12.5);
    expect(extractAmounts('20 manat 50 qapik')).toContain(20.5);
    expect(extractAmounts('15 manat and 50 qapik')).toContain(15.5);
    expect(extractAmounts('Send fifteen manat and fifty qapik to Nigar')).toContain(15.5);
    expect(extractAmounts('twenty-five manat')).toContain(25);
  });
  it('detects currencies', () => {
    expect([...mentionedCurrencies('20 dollars')]).toEqual(['USD']);
    expect([...mentionedCurrencies('20 manat')]).toEqual(['AZN']);
    expect([...mentionedCurrencies('send 20')]).toEqual([]);
  });
  it('matches contact queries only to the user words', () => {
    expect(queryFromUser('Rashad', ['Send 25 manat to Rashad'])).toBe(true);
    expect(queryFromUser('Ali Hasanov', ['send to ali hasanov'])).toBe(true);
    expect(queryFromUser('John Carter', ['Summarize my recent transactions'])).toBe(false);
    expect(intentStated(['send', 'transfer'], ['Summarize my recent transactions'])).toBe(false);
    expect(intentStated(['block', 'lost'], ['I lost my card'])).toBe(true);
  });
});

describe('answer lint', () => {
  it('flags figures that are not in evidence', () => {
    expect(claimedFigures('You spent 64.65 AZN, 12% more than $10')).toEqual([64.65, 10, 12]);
    expect(lintAnswer('Sent 25.00 AZN', new Set([25])).ok).toBe(true);
    expect(lintAnswer('Total 64.65 AZN', new Set([25, 39.65])).unsupported).toEqual([64.65]);
  });
});
