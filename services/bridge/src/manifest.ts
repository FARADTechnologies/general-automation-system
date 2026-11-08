// Capability manifest loader. The Bridge registers MCP tools from these files only;
// adding a capability for an existing internal endpoint needs no code change.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { Ajv, type ValidateFunction } from 'ajv';
import type { Provenance } from './vault.ts';

export interface FieldSpec {
  from?: string; value?: string; transform?: string; map?: Record<string, string>; untrusted?: boolean;
  token?: { kind: string; provenance: Provenance; masked?: string; label?: string; meta?: Record<string, string> };
}
export interface RequestSpec { method: 'GET' | 'POST'; path: string; query?: Record<string, unknown>; body?: Record<string, unknown> }
export interface LookupSpec extends RequestSpec { items: string; where: Record<string, unknown>; required?: boolean; error?: { code: string; message: string } }
export interface ResponseSpec { items?: string; where?: Record<string, unknown>; limit?: number; fields: Record<string, FieldSpec | string>; extra?: Record<string, string> }
export interface ArgSpec { token?: string; provenance?: string[] }

export interface Capability {
  id: string; title: string; llm_description: string;
  kind: 'read' | 'prepare'; risk: 'R0' | 'R1' | 'R2' | 'R3';
  enabled?: boolean;
  input_schema: Record<string, unknown>;
  critical_args?: Record<string, ArgSpec>;
  token_args?: Record<string, string>;
  /** Words that must appear in the user's own request before this action may be prepared. */
  intent_terms?: string[];
  /** Outputs are deterministic bank calculations; the agent may use their figures as derived values. */
  derived?: boolean;
  lookups?: Record<string, LookupSpec>;
  request: RequestSpec;
  response?: ResponseSpec;
  result?: Record<string, FieldSpec | string>;
  policy?: { limit_group?: string; amount?: string; currency?: string; new_payee?: string; balance?: string };
  commit?: RequestSpec; cancel?: RequestSpec;
  postcondition?: RequestSpec & { expect: Record<string, unknown> };
  confirm?: { level: 'none' | 'tap' | 'biometric'; title: string; display: { key: string; label: string; value: string }[] };
  ui?: { route: string; form?: string; fields?: { target: string; display: string }[]; submit?: string };
  errors?: Record<string, { code: string; message: string }>;
  source_file?: string;
}

export interface LoadedCapability extends Capability { validate: ValidateFunction; toolName: string }

export const toolNameOf = (id: string) => id.replace(/\./g, '_');

export class ManifestError extends Error {}

const TIER = new Set(['R0', 'R1', 'R2', 'R3']);

export function loadManifests(dirs: string[]): Map<string, LoadedCapability> {
  const ajv = new Ajv({ allErrors: false, strict: false, coerceTypes: false });
  const out = new Map<string, LoadedCapability>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml') || x.endsWith('.yml')).sort()) {
      const docs = YAML.parseAllDocuments(readFileSync(join(dir, f), 'utf8'));
      for (const d of docs) {
        const cap = d.toJSON() as Capability;
        if (!cap || !cap.id) continue;
        if (cap.kind !== 'read' && cap.kind !== 'prepare') throw new ManifestError(`${f}: ${cap.id}: only read and prepare capabilities may be exposed (got ${cap.kind})`);
        if (!TIER.has(cap.risk)) throw new ManifestError(`${f}: ${cap.id}: bad risk tier`);
        if (cap.kind === 'read' && cap.risk !== 'R0') throw new ManifestError(`${f}: ${cap.id}: read capabilities must be R0`);
        if (cap.kind === 'prepare' && (!cap.commit || !cap.postcondition || !cap.confirm)) throw new ManifestError(`${f}: ${cap.id}: prepare needs commit, postcondition and confirm`);
        if (cap.kind === 'prepare' && cap.risk !== 'R0' && cap.confirm?.level === 'none') throw new ManifestError(`${f}: ${cap.id}: state change needs a confirmation level`);
        if (cap.risk === 'R3' && cap.confirm?.level !== 'biometric') throw new ManifestError(`${f}: ${cap.id}: R3 requires biometric confirmation`);
        if (out.has(cap.id)) throw new ManifestError(`duplicate capability ${cap.id}`);
        const schema = cap.input_schema || { type: 'object', properties: {}, additionalProperties: false };
        out.set(cap.id, { ...cap, input_schema: schema, enabled: cap.enabled !== false, validate: ajv.compile(schema), toolName: toolNameOf(cap.id), source_file: f });
      }
    }
  }
  return out;
}
