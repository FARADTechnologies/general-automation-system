// Thin model interface. Cloud model by default; a bank could plug its own model behind ModelClient.
import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelRequest, ModelResult, ToolMeta } from '@gas/agent-core';

// USD per million tokens. Verified against the current model table on 2026-11-08.
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5-5': { in: 2.0, out: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { in: 4.0, out: 20.0, cacheRead: 0.2, cacheWrite: 5.0 },
};

// Keywords the model API's strict mode does not accept. The agent's own guard and the Bridge
// still enforce them, so stripping them here loses no protection.
const UNSUPPORTED = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'format']);
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, strictSchema(s)])) : strictSchema(v);
  }
  if (out.type === 'object') {
    out.additionalProperties = false;
    if (!out.properties) out.properties = {};
    if (!out.required) out.required = [];
  }
  return out;
}

export interface ModelOptions {
  model: string; effort: 'low' | 'medium' | 'high'; thinking: 'between_tools' | 'adaptive'; maxTokens?: number; fallback?: boolean;
  /** A gateway in front of the Messages API (for example an event's shared proxy). */
  baseURL?: string;
  /** Bearer token for gateways that expect Authorization instead of x-api-key. */
  authToken?: string;
  /** Cache lifetime. A gateway that adds its own 1-hour breakpoints needs ours to match. */
  cacheTtl?: '5m' | '1h';
}

export class AnthropicModel implements ModelClient {
  private client: Anthropic;
  constructor(private opts: ModelOptions, apiKey?: string) {
    this.client = new Anthropic({
      apiKey: opts.authToken ? null : apiKey,
      authToken: opts.authToken || null,
      baseURL: opts.baseURL || undefined,
      // Retries are ours (below): a dead gateway can answer "retry-after: 120", and the SDK would
      // wait that long instead of letting the agent fall back or report the outage.
      maxRetries: 0,
      timeout: Number(process.env.MODEL_TIMEOUT_MS || 45_000),
    });
  }
  private cacheMode: 'full' | 'system' | 'none' = (['full', 'system', 'none'].includes(process.env.AGENT_CACHE_MODE || '') ? process.env.AGENT_CACHE_MODE : 'full') as 'full' | 'system' | 'none';
  private maxStrict = Number(process.env.AGENT_MAX_STRICT_TOOLS || 20);
  get model() { return this.opts.model; }

  async create(req: ModelRequest, signal?: AbortSignal): Promise<ModelResult> {
    // The API accepts at most 20 strict tools, and some accounts compile a smaller grammar. State-
    // changing (prepare) tools get strict schemas first; reads are validated by the agent guard and
    // the Bridge either way, and so are prepares when the strict budget shrinks.
    const toolsFor = (maxStrict: number) => {
      const strictNames = new Set(req.tools.filter((t) => t.kind === 'prepare').concat(req.tools.filter((t) => t.kind === 'local')).slice(0, maxStrict).map((t) => t.name));
      return req.tools.map((t: ToolMeta) => ({
        name: t.name,
        description: t.description,
        input_schema: (strictNames.has(t.name) ? strictSchema(t.inputSchema) : t.inputSchema) as Anthropic.Beta.Messages.BetaTool.InputSchema,
        ...(strictNames.has(t.name) ? { strict: true } : {}),
      }));
    };
    // Cache breakpoints: the system block (tools come before it in the prefix, so it caches them
    // too) and automatic caching of the conversation. The API allows four; a gateway may add its
    // own. If a gateway rejects ours, the adapter adapts once and remembers: matching one-hour
    // lifetimes, then the system block only, then none (the gateway's own breakpoints still cache).
    const t0 = Date.now();
    let message: Anthropic.Beta.Messages.BetaMessage | undefined;
    let transient = 0;
    for (let attempt = 0; attempt < 10 && !message; attempt++) {
      const cache = this.opts.cacheTtl === '1h' ? { type: 'ephemeral' as const, ttl: '1h' as const } : { type: 'ephemeral' as const };
      const mode = this.cacheMode;
      const params: Record<string, unknown> = {
        model: this.opts.model,
        max_tokens: this.opts.maxTokens ?? 4096,
        system: [{ type: 'text', text: req.system, ...(mode !== 'none' ? { cache_control: cache } : {}) }],
        tools: toolsFor(this.maxStrict),
        messages: req.messages,
        ...(mode === 'full' ? { cache_control: cache } : {}),
        thinking: { type: this.opts.thinking },
        output_config: { effort: this.opts.effort },
      };
      if (this.opts.fallback) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
      try {
        message = (await this.client.beta.messages.create(params as never, { signal })) as Anthropic.Beta.Messages.BetaMessage;
      } catch (e) {
        const msg = String((e as Error).message || '');
        const status = (e as { status?: number }).status;
        if (signal?.aborted) throw e;
        // Network errors, rate limits and server errors: two short retries, then give up so the
        // caller can fall back or tell the customer. Never wait for a long retry-after.
        if (status === undefined || status === 429 || status >= 500) {
          if (transient < 2) { await new Promise((r) => setTimeout(r, 700 * 2 ** transient)); transient++; continue; }
          throw e;
        }
        if (status !== 400) throw e;
        console.warn(`model adapter: ${this.opts.model} rejected a request after ${Date.now() - t0} ms (strict tools ${this.maxStrict}, cache ${this.cacheMode}, thinking ${this.opts.thinking}): ${msg.slice(0, 120)}`);
        if (/grammar is too large/i.test(msg) && this.maxStrict > 0) { this.maxStrict = this.maxStrict > 4 ? Math.floor(this.maxStrict / 2) : 0; continue; }
        if (/between_tools/.test(msg) && this.opts.thinking === 'between_tools') { this.opts.thinking = 'adaptive'; continue; }
        if (/matching TTLs/i.test(msg) && this.opts.cacheTtl !== '1h') { this.opts.cacheTtl = '1h'; continue; }
        if (/blocks with cache_control/i.test(msg) && mode !== 'none') { this.cacheMode = mode === 'full' ? 'system' : 'none'; continue; }
        throw e;
      }
    }
    if (!message) throw new Error('model request was rejected after adapting cache settings');
    const latencyMs = Date.now() - t0;
    if (process.env.MODEL_DEBUG === '1') console.warn(`model call ${this.opts.model} ${latencyMs} ms usage=${JSON.stringify({ in: message.usage.input_tokens, out: message.usage.output_tokens, cr: message.usage.cache_read_input_tokens, cw: message.usage.cache_creation_input_tokens })} stop=${message.stop_reason}`);
    return { message, latencyMs, costUsd: costOf(message.model || this.opts.model, message.usage as never) };
  }
}

export function costOf(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = PRICES[model] || PRICES['claude-sonnet-5-5'];
  return ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.cache_creation_input_tokens || 0) * p.cacheWrite) / 1e6;
}
