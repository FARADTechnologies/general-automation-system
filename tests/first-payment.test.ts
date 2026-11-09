// The first payment date of a standing order is worked out by the bank from what the customer
// said, never by the model.
import { describe, it, expect } from 'vitest';
import { firstPaymentDate } from '../services/core-bank/src/bank.ts';

// Monday 9 November 2026, 10:00 in Baku (06:00 UTC)
const now = Date.parse('2026-11-09T06:00:00Z');

describe('first payment date', () => {
  it('defaults to tomorrow', () => { expect(firstPaymentDate({}, now)).toBe('2026-11-10'); });
  it('next weekday, never today', () => {
    expect(firstPaymentDate({ strt_wkdy: 'friday' }, now)).toBe('2026-11-13');
    expect(firstPaymentDate({ strt_wkdy: 'monday' }, now)).toBe('2026-11-16');
  });
  it('next day of the month, optionally in a named month', () => {
    expect(firstPaymentDate({ strt_dom: 5 }, now)).toBe('2026-12-05');
    expect(firstPaymentDate({ strt_dom: 1, strt_mon: 12 }, now)).toBe('2026-12-01');
    expect(firstPaymentDate({ strt_dom: 15, strt_mon: 1 }, now)).toBe('2027-01-15');
    expect(firstPaymentDate({ strt_dom: 20 }, now)).toBe('2026-11-20');
  });
  it('uses the Baku date near midnight UTC', () => {
    // 22:00 UTC on 9 November is 02:00 on 10 November in Baku, so tomorrow is 11 November
    expect(firstPaymentDate({}, Date.parse('2026-11-09T22:00:00Z'))).toBe('2026-11-11');
  });
  it('rejects impossible or out-of-range starts', () => {
    expect(() => firstPaymentDate({ strt_dom: 31 }, now)).toThrow();
    expect(() => firstPaymentDate({ strt_wkdy: 'someday' }, now)).toThrow();
    expect(() => firstPaymentDate({ strt_dt: '2026-11-09' }, now)).toThrow();
    expect(() => firstPaymentDate({ strt_dt: '2028-01-01' }, now)).toThrow();
  });
});
