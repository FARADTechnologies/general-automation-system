// Append-only audit log (I10). UPDATE and DELETE are rejected by triggers.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AuditRow { seq: number; ts: string; trace_id: string; session: string; actor: string; event: string; capability: string | null; decision: string | null; detail: Record<string, unknown> }

export class AuditLog {
  private db: DatabaseSync;
  private listeners = new Set<(row: AuditRow) => void>();

  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL, trace_id TEXT NOT NULL, session TEXT NOT NULL, actor TEXT NOT NULL,
        event TEXT NOT NULL, capability TEXT, decision TEXT, detail TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
    `);
  }

  write(e: { trace_id: string; session: string; actor: string; event: string; capability?: string | null; decision?: string | null; detail?: Record<string, unknown> }): AuditRow {
    const ts = new Date().toISOString();
    const detail = e.detail || {};
    const r = this.db.prepare('INSERT INTO audit (ts, trace_id, session, actor, event, capability, decision, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(ts, e.trace_id, e.session, e.actor, e.event, e.capability ?? null, e.decision ?? null, JSON.stringify(detail));
    const row: AuditRow = { seq: Number(r.lastInsertRowid), ts, trace_id: e.trace_id, session: e.session, actor: e.actor, event: e.event, capability: e.capability ?? null, decision: e.decision ?? null, detail };
    for (const l of this.listeners) l(row);
    return row;
  }

  list(filter: { session?: string; trace_id?: string; after?: number; limit?: number } = {}): AuditRow[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.session) { where.push('session = ?'); args.push(filter.session); }
    if (filter.trace_id) { where.push('trace_id = ?'); args.push(filter.trace_id); }
    if (filter.after) { where.push('seq > ?'); args.push(filter.after); }
    const sql = `SELECT * FROM audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq DESC LIMIT ${Math.min(filter.limit || 200, 2000)}`;
    return (this.db.prepare(sql).all(...args) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as AuditRow), detail: JSON.parse(String(r.detail)) }));
  }

  /** Exposed only so tests can prove that tampering is rejected. */
  rawExec(sql: string) { this.db.exec(sql); }

  onWrite(fn: (row: AuditRow) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
