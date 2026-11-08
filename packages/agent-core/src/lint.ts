// Answer lint: currency amounts and percentages in the final message must exist in the evidence set.
const round2 = (n: number) => Math.round(n * 100) / 100;

export function claimedFigures(text: string): number[] {
  const out: number[] = [];
  const t = text.replace(/[  ]/g, ' ');
  const num = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
  const patterns = [
    new RegExp(String.raw`(${num})\s*(?:AZN|USD|EUR|manat|manats|dollars?|₼|\$)`, 'gi'),
    new RegExp(String.raw`(?:AZN|USD|EUR|₼|\$)\s*(${num})`, 'gi'),
    new RegExp(String.raw`(${num})\s*%`, 'g'),
    new RegExp(String.raw`(${num})\s*percent`, 'gi'),
  ];
  for (const re of patterns) for (const m of t.matchAll(re)) out.push(round2(Number(m[1].replace(/,/g, ''))));
  return out;
}

export function lintAnswer(text: string, evidence: Set<number>): { ok: boolean; unsupported: number[] } {
  const unsupported = claimedFigures(text).filter((v) => ![...evidence].some((e) => Math.abs(e - v) < 0.005));
  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}
