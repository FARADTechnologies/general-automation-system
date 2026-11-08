// Loan calculator maths for the static product screens (display only, not a bank operation).
export function annuity(amount, ratePct, months) {
  const i = ratePct / 1200;
  return Math.round(((amount * i) / (1 - Math.pow(1 + i, -months))) * 100) / 100;
}
