// Display formatting only. Amounts arrive from the bank as numbers in major units with a currency;
// this turns them into text. It never adds, divides or rounds money for a decision.
export function money(amount: number | undefined, currency = 'AZN', opts: { sign?: boolean } = {}): string {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return '';
  const n = Number(amount);
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}${abs} ${currency}`;
}

export const masked = (last4?: string) => (last4 ? `•••• ${last4}` : '');

export function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
