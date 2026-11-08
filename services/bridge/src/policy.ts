// Deterministic risk policy, enforced in the Bridge (I4, I11).
import { readFileSync, existsSync } from 'node:fs';
import YAML from 'yaml';

export interface PolicyConfig {
  limits: Record<string, { per_tx: Record<string, number>; daily: Record<string, number> }>;
  new_payee: { balance_ratio_threshold: number };
  confirmation: { ttl_seconds: number; demo_pin: string };
  disabled?: string[];
}

export interface PolicyDecision { ok: boolean; code?: string; message?: string; warnings: string[]; extraConfirmation: boolean }

const DEFAULT: PolicyConfig = {
  limits: {},
  new_payee: { balance_ratio_threshold: 0.3 },
  confirmation: { ttl_seconds: 120, demo_pin: '1234' },
};

export class Policy {
  cfg: PolicyConfig;
  private killed = new Set<string>();
  private daily = new Map<string, number>(); // session|group|ccy|yyyy-mm-dd -> major units

  constructor(path?: string) {
    this.cfg = path && existsSync(path) ? { ...DEFAULT, ...(YAML.parse(readFileSync(path, 'utf8')) as PolicyConfig) } : DEFAULT;
    for (const id of this.cfg.disabled || []) this.killed.add(id);
  }

  setEnabled(capabilityId: string, enabled: boolean) { if (enabled) this.killed.delete(capabilityId); else this.killed.add(capabilityId); }
  isKilled(capabilityId: string) { return this.killed.has(capabilityId); }
  killedList() { return [...this.killed]; }

  private dayKey(session: string, group: string, ccy: string) { return `${session}|${group}|${ccy}|${new Date().toISOString().slice(0, 10)}`; }
  usedToday(session: string, group: string, ccy: string) { return this.daily.get(this.dayKey(session, group, ccy)) || 0; }
  recordCommit(session: string, group: string | undefined, ccy: string | undefined, amount: number | undefined) {
    if (!group || !ccy || !amount) return;
    const k = this.dayKey(session, group, ccy);
    this.daily.set(k, (this.daily.get(k) || 0) + amount);
  }
  clearSession(session: string) { for (const k of [...this.daily.keys()]) if (k.startsWith(session + '|')) this.daily.delete(k); }

  check(session: string, p: { group?: string; amount?: number; currency?: string; newPayee?: boolean; balance?: number }): PolicyDecision {
    const warnings: string[] = [];
    let extraConfirmation = false;
    if (p.group && p.amount !== undefined && p.currency) {
      const lim = this.cfg.limits[p.group];
      if (lim) {
        const perTx = lim.per_tx?.[p.currency];
        if (perTx !== undefined && p.amount > perTx) return { ok: false, code: 'LIMIT_PER_TRANSACTION', message: `Amount exceeds the per-transaction limit of ${perTx} ${p.currency}.`, warnings, extraConfirmation };
        const daily = lim.daily?.[p.currency];
        const used = this.usedToday(session, p.group, p.currency);
        if (daily !== undefined && used + p.amount > daily) return { ok: false, code: 'LIMIT_DAILY', message: `Amount exceeds the remaining daily limit (${Math.max(0, daily - used).toFixed(2)} ${p.currency} left today).`, warnings, extraConfirmation };
      }
    }
    if (p.newPayee && p.amount !== undefined && p.balance !== undefined && p.balance > 0) {
      const ratio = p.amount / p.balance;
      if (ratio >= this.cfg.new_payee.balance_ratio_threshold) {
        extraConfirmation = true;
        warnings.push(`First payment to this payee and it is ${Math.round(ratio * 100)}% of the account balance.`);
      } else {
        warnings.push('First payment to this payee.');
      }
    }
    return { ok: true, warnings, extraConfirmation };
  }
}
