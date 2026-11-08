// Money Coach: explains where spare money should go, using only the bank's data and the bank's products.
// Every recommendation carries the numbers it was based on.
import { seed } from '../../caspia/data/seed.js';

export function bankState() {
  if (window.caspia?.getState) return window.caspia.getState();
  try { const r = localStorage.getItem('caspia-demo-state-v2'); if (r) return { ...seed(), ...JSON.parse(r) }; } catch { /* */ }
  return seed();
}

const r2 = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;

export function analyse(s, cfg) {
  const now = Date.now();
  const inWindow = (t, days) => now - new Date(t.date).getTime() < days * DAY;
  const income60 = s.transactions.filter((t) => t.category === 'income' && inWindow(t, 60)).reduce((a, t) => a + t.amount, 0);
  const income = r2(income60 / 2);
  const spending = r2(s.transactions.filter((t) => t.amount < 0 && inWindow(t, 30) && !['transfers', 'exchange', 'loans'].includes(t.category)).reduce((a, t) => a - t.amount, 0));
  const loan = s.loans[0];
  const installments = s.installments.filter((i) => i.paid < i.months).reduce((a, i) => a + i.monthly, 0);
  const obligations = r2((loan?.monthly || 0) + installments);
  const free = r2(income - spending - obligations);
  const usd = s.accounts.find((a) => a.currency === 'USD');
  const usdRate = s.rates.find((r) => r.code === 'USD').buy;
  const liquid = r2(s.accounts.find((a) => a.currency === 'AZN').balance + (usd ? usd.balance * usdRate : 0));
  const deposits = s.deposits.reduce((a, d) => a + (d.currency === 'AZN' ? d.amount : d.amount * usdRate), 0);
  const target = r2(spending * cfg.emergencyMonths);
  const bestDeposit = s.depositProducts.filter((p) => cfg.products[p.id] && p.currency === 'AZN').map((p) => ({ p, rate: Math.max(...Object.values(p.rates)) })).sort((a, b) => b.rate - a.rate)[0];
  const flexible = s.depositProducts.find((p) => p.id === 'dp2' && cfg.products.dp2);

  const recs = [];
  if (cfg.rules.emergencyFund && liquid < target) {
    const monthly = Math.max(20, Math.round(Math.max(free, 0) * 0.5 / 10) * 10);
    recs.push({
      id: 'emergency', priority: 1, title: 'Build a safety cushion first',
      text: `You have ${liquid.toFixed(2)} AZN available, but ${cfg.emergencyMonths} months of your spending is ${target.toFixed(2)} AZN. Keep this money easy to reach${flexible ? ` and move about ${monthly} AZN a month into ${flexible.name} (up to ${Math.max(...Object.values(flexible.rates))}%, withdraw anytime)` : ''}.`,
      basis: [['Available now', `${liquid.toFixed(2)} AZN`], ['Monthly spending (30 days)', `${spending.toFixed(2)} AZN`], [`Target (${cfg.emergencyMonths} months)`, `${target.toFixed(2)} AZN`]],
      action: flexible ? { label: `Open ${flexible.name}`, path: '/deposits/new', state: { productId: flexible.id } } : null,
    });
  }
  if (cfg.rules.debtFirst && loan && loan.remaining > 0 && bestDeposit && loan.rate > bestDeposit.rate) {
    const extra = 100;
    const saved = r2((extra * (loan.rate - bestDeposit.rate)) / 100);
    recs.push({
      id: 'debt', priority: 2, title: 'Extra loan payments beat a deposit',
      text: `Your cash loan costs ${loan.rate}% a year; the best deposit earns ${bestDeposit.rate}%. Every 100 AZN paid early on the loan is worth about ${saved} AZN a year more than depositing it. Early repayment has no fee.`,
      basis: [['Loan rate', `${loan.rate}%`], ['Best deposit rate', `${bestDeposit.rate}% (${bestDeposit.p.name})`], ['Loan left', `${loan.remaining.toFixed(2)} AZN`]],
      action: { label: 'Open loan', path: '/loans' },
    });
  }
  if (cfg.rules.deposits && bestDeposit) {
    const ready = !cfg.rules.emergencyFund || liquid >= target;
    recs.push({
      id: 'deposit', priority: 3, title: ready ? `Put long-term savings in ${bestDeposit.p.name}` : `Later: ${bestDeposit.p.name} for long-term savings`,
      text: ready
        ? `${bestDeposit.p.name} pays up to ${bestDeposit.rate}% a year. 1,000 AZN for 12 months would earn about ${r2(1000 * (bestDeposit.p.rates[12] || bestDeposit.rate) / 100)} AZN.`
        : `Once your cushion is in place, ${bestDeposit.p.name} pays up to ${bestDeposit.rate}% a year for money you won't need for 6 to 18 months.`,
      basis: [['Rate', `${bestDeposit.rate}%`], ['Minimum', `${bestDeposit.p.min} ${bestDeposit.p.currency}`], ['Current deposits', `${r2(deposits).toFixed(2)} AZN`]],
      action: { label: `See ${bestDeposit.p.name}`, path: '/deposits/new', state: { productId: bestDeposit.p.id } },
    });
  }
  if (cfg.rules.investments) {
    recs.push({ id: 'invest', priority: 4, title: 'Investment products', text: 'Caspia Bank does not offer investment funds in this demo, so the coach does not suggest any.', basis: [['Products available', 'None']], action: null });
  }

  const short = recs.length
    ? `${recs[0].title}. ${recs[0].text.split('. ')[0]}.`
    : 'Your finances look balanced. Keep it up.';
  return { income, spending, obligations, free, liquid, target, deposits: r2(deposits), recs, short };
}
