// Full stack for agent tests: Core Bank + Bridge (with webhook) + Agent service, all on ephemeral ports.
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createCoreBankApp } from '../services/core-bank/src/server.ts';
import { createBridge } from '../services/bridge/src/server.ts';
import { createAgentServer } from '../services/agent/src/server.ts';
import type { RuntimeConfig } from '../services/agent/src/session.ts';
import { CORE_PROMPT, DEFAULT_CONFIG, type ModelClient, type ModelRequest, type ModelResult, type Message } from '../packages/agent-core/src/index.ts';

export const ROOT = resolve(import.meta.dirname, '..');
const KEYS = { core: 'core-key-0123456789', agent: 'agent-key-0123456789', admin: 'admin-key-0123456789', hook: 'hook-secret-0123456789' };

const listen = (srv: { listen: (p: number, h: string, cb: () => void) => unknown; address?: () => unknown }, app?: { listen: (p: number, h: string, cb: () => void) => { address: () => unknown; close: () => void } }) =>
  new Promise<{ url: string; close: () => void }>((res) => {
    const target = (app ?? srv) as { listen: (p: number, h: string, cb: () => void) => { address: () => unknown; close: () => void } };
    const s = target.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${((s as { address: () => AddressInfo }).address() as AddressInfo).port}`, close: () => (s as { close: () => void }).close() }));
  });

export async function startFullStack(model: ModelClient, opts: { stepMs?: number } = {}) {
  const core = createCoreBankApp({ serviceKey: KEYS.core, kbDir: resolve(ROOT, 'domains/bank/kb') });
  const coreSrv = await listen(core.app as never);
  const cfg: RuntimeConfig & { webhookSecret: string } = {
    bridgeUrl: '', agentKey: KEYS.agent, webhookSecret: KEYS.hook, model,
    loop: { ...DEFAULT_CONFIG, systemPrompt: `${CORE_PROMPT}\n\n${readFileSync(resolve(ROOT, 'domains/bank/prompt.md'), 'utf8')}` },
    choreographyStepMs: opts.stepMs ?? 5, confirmTimeoutMs: 20_000, maxInputsPerMinute: 100,
    screens: JSON.parse(readFileSync(resolve(ROOT, 'domains/bank/screens.json'), 'utf8')),
  };
  const agent = createAgentServer(cfg);
  const agentSrv = await new Promise<{ url: string; close: () => void }>((res) => {
    agent.server.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${(agent.server.address() as AddressInfo).port}`, close: () => agent.server.close() }));
  });
  const bridge = createBridge({
    manifestDirs: [resolve(ROOT, 'domains/bank/manifest')], policyPath: resolve(ROOT, 'domains/bank/policy.yaml'),
    coreBankUrl: coreSrv.url, coreBankKey: KEYS.core, agentKey: KEYS.agent, adminKey: KEYS.admin,
    webhookUrl: agentSrv.url + '/hooks/bridge', webhookSecret: KEYS.hook,
  });
  const bridgeSrv = await listen(bridge.app as never);
  cfg.bridgeUrl = bridgeSrv.url;

  async function device(session: string) {
    const r = await fetch(bridgeSrv.url + '/bridge/device/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session }) });
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    return {
      view: async (id: string) => (await fetch(`${bridgeSrv.url}/bridge/confirm/${id}`, { headers: { cookie } })).json(),
      decide: (id: string, body: unknown) => fetch(`${bridgeSrv.url}/bridge/confirm/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }),
    };
  }

  /** Plays the customer on the phone: approves (or denies) whatever reaches the bank screen. */
  async function customer(session: string, mode: 'approve' | 'deny' = 'approve') {
    const dev = await device(session);
    const s = agent.sessions.get(session);
    const seen: any[] = [];
    s.hub.onEvent(async (e) => {
      if (e.type !== 'confirm.required') return;
      const id = (e.payload as { confirmId: string }).confirmId;
      const v = await dev.view(id);
      seen.push(v);
      await dev.decide(id, mode === 'deny' ? { decision: 'deny', payload_hash: v.payloadHash } : { decision: 'approve', payload_hash: v.payloadHash, proof: { method: 'biometric', assertion: 'mock-biometric-ok' }, acknowledge_warning: true });
    });
    return { seen };
  }

  const coreGet = async (path: string) => (await fetch(coreSrv.url + path, { headers: { 'x-cb-svc-key': KEYS.core } })).json();
  const custOf = async (session: string) => (await (await fetch(coreSrv.url + '/internal/v3/cust/rslv', { method: 'POST', headers: { 'x-cb-svc-key': KEYS.core, 'content-type': 'application/json' }, body: JSON.stringify({ ext_ref: session }) })).json()).cust_id as string;
  const bankState = async (session: string) => {
    const cust = await custOf(session);
    const [a, c, b] = await Promise.all([coreGet(`/internal/v3/cust/${cust}/acct`), coreGet(`/internal/v3/cust/${cust}/crd`), coreGet(`/internal/v3/cust/${cust}/bll`)]);
    return { accounts: a.items as any[], cards: c.items as any[], bills: b.items as any[] };
  };

  const effects = async (session: string) => (await (await fetch(`${coreSrv.url}/internal/admin/effects?ext_ref=${session}`, { headers: { 'x-cb-svc-key': KEYS.core } })).json()).items;
  const handoffs = async () => (await (await fetch(`${bridgeSrv.url}/admin/handoffs`, { headers: { authorization: `Bearer ${KEYS.admin}` } })).json()).items;

  return {
    agent, bridge, core, agentUrl: agentSrv.url, bridgeUrl: bridgeSrv.url, customer, device, bankState, effects, handoffs,
    close: async () => { bridge.close(); bridgeSrv.close(); agentSrv.close(); coreSrv.close(); },
  };
}

// ---------- scripted model for guard tests (no LLM) ----------
type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
export type Script = (req: ModelRequest, call: number, lastResults: any[]) => Block[];

let idn = 0;
export const tool = (name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id: `toolu_${++idn}`, name, input });
export const text = (t: string): Block => ({ type: 'text', text: t });

export class ScriptedModel implements ModelClient {
  readonly model = 'scripted';
  calls = 0;
  requests: ModelRequest[] = [];
  constructor(public script: Script) {}
  async create(req: ModelRequest): Promise<ModelResult> {
    this.requests.push(JSON.parse(JSON.stringify(req)));
    const last = req.messages[req.messages.length - 1];
    const prevUser = [...req.messages].reverse().find((m) => m.role === 'user' && Array.isArray(m.content));
    const lastResults = prevUser && Array.isArray(prevUser.content) ? (prevUser.content as any[]).filter((b) => b.type === 'tool_result').map((b) => { try { return JSON.parse(b.content); } catch { return b.content; } }) : [];
    void last;
    const content = this.script(req, this.calls++, lastResults);
    const message = { id: 'msg_' + this.calls, type: 'message', role: 'assistant', model: 'scripted', content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Message;
    return { message, costUsd: 0, latencyMs: 1 };
  }
}
