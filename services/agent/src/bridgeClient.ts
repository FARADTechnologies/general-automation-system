// The agent's only door to the bank: MCP over Streamable HTTP to the Bridge,
// plus a few Bridge helper endpoints. The agent never knows the Core Bank URL.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface BridgeTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  capability: string;
  kind: 'read' | 'prepare';
  risk: string;
  criticalArgs: Record<string, { token?: string; provenance?: string[] }>;
  intentTerms: string[];
  tokenProvenance: Record<string, string>;
}

export type CallOutcome = { ok: true; data: any; text: string } | { ok: false; error: { code: string; message: string; retryable?: boolean }; text: string };

export class BridgeSession {
  private client?: Client;
  private connecting?: Promise<Client>;
  constructor(private bridgeUrl: string, private agentKey: string, readonly session: string) {}

  private async conn(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StreamableHTTPClientTransport(new URL('/mcp', this.bridgeUrl), {
          requestInit: { headers: { authorization: `Bearer ${this.agentKey}`, 'x-session-id': this.session } },
        });
        const c = new Client({ name: 'agent-runtime', version: '0.1.0' });
        await c.connect(transport);
        this.client = c;
        return c;
      })();
    }
    return this.connecting;
  }

  async listTools(): Promise<BridgeTool[]> {
    const { tools } = await (await this.conn()).listTools();
    return tools.map((t) => {
      const m = (t._meta || {}) as Record<string, any>;
      return { name: t.name, description: t.description || '', inputSchema: t.inputSchema as Record<string, unknown>, capability: m.capability || t.name, kind: m.kind, risk: m.risk, criticalArgs: m.critical_args || {}, intentTerms: m.intent_terms || [], tokenProvenance: m.token_provenance || {} };
    });
  }

  async call(name: string, args: Record<string, unknown>, traceId: string): Promise<CallOutcome> {
    const r = (await (await this.conn()).callTool({ name, arguments: args, _meta: { trace_id: traceId } })) as { isError?: boolean; content: { type: string; text: string }[] };
    const text = r.content?.[0]?.text ?? '{}';
    let body: any = {};
    try { body = JSON.parse(text); } catch { /* keep empty */ }
    if (r.isError) return { ok: false, error: body.error || { code: 'UNKNOWN', message: 'Tool failed.' }, text };
    return { ok: true, data: body, text };
  }

  private async http(method: string, path: string, body?: unknown) {
    const res = await fetch(new URL(path, this.bridgeUrl), {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${this.agentKey}` },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`bridge ${path} ${res.status} ${json.code || ''}`);
    return json;
  }

  /** Ingress tokenizer storage: raw card/phone numbers from the user go to the vault before the LLM. */
  tokenize(kind: 'pan' | 'phone', value: string, traceId: string): Promise<{ token: string; masked: string }> {
    return this.http('POST', '/agent/vault/ingress', { session: this.session, kind, value, trace_id: traceId });
  }

  uiPlan(preparedId: string) { return this.http('GET', `/agent/prepared/${encodeURIComponent(preparedId)}/ui?session=${encodeURIComponent(this.session)}`); }
  reset() { return this.http('POST', `/agent/session/${encodeURIComponent(this.session)}/reset`); }
  audit(event: string, traceId: string, detail: Record<string, unknown>, capability?: string, decision?: string) {
    return this.http('POST', '/agent/audit', { session: this.session, trace_id: traceId, event, detail, capability, decision }).catch(() => undefined);
  }

  async close() { await this.client?.close().catch(() => undefined); this.client = undefined; this.connecting = undefined; }
}
