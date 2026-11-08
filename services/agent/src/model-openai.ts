// OpenAI-compatible chat-completions adapter behind the same ModelClient interface. One adapter
// covers providers that speak this format (Mistral, Groq, OpenRouter and others). The loop keeps
// its history in one internal format; this file translates to and from chat messages.
// Guards, the Bridge and the confirmation flow do not depend on which model is used.
import { randomBytes } from 'node:crypto';
import type { ModelClient, ModelRequest, ModelResult, Message, MessageParam } from '@gas/agent-core';

export interface OpenAICompatOptions {
  provider: string;            // label for logs and traces, e.g. "mistral"
  baseUrl: string;             // e.g. https://api.mistral.ai/v1
  apiKey: string;
  model: string;
  fallbacks?: string[];
  maxTokens?: number;
  maxRetries?: number;
  /** Longest wait for a rate-limit reset before moving to the next model. */
  maxWaitMs?: number;
  /** USD per million tokens, for the spend counter; 0 when unknown or free. */
  pricing?: { input: number; output: number };
  /** Some providers want the function name on tool messages. */
  toolMessageName?: boolean;
  fetchImpl?: typeof fetch;
}

type ChatMsg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string; name?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RUNTIME = '[Runtime message, not from the customer]';

export class OpenAICompatModel implements ModelClient {
  constructor(private opts: OpenAICompatOptions) {}
  get model() { return this.opts.model; }

  async create(req: ModelRequest, signal?: AbortSignal): Promise<ModelResult> {
    const f = this.opts.fetchImpl || fetch;
    const messages = toChat(req.system, req.messages, !!this.opts.toolMessageName);
    const tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const t0 = Date.now();
    let lastErr = '';
    for (const model of [this.opts.model, ...(this.opts.fallbacks || [])]) {
      for (let attempt = 0; attempt <= (this.opts.maxRetries ?? 2); attempt++) {
        let res: Response;
        try {
          res = await f(`${this.opts.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}` },
            body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0, max_tokens: this.opts.maxTokens ?? 2048 }),
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
          });
        } catch (e) {
          if (signal?.aborted) throw e;
          lastErr = `network: ${(e as Error).message}`; await sleep(800 * 2 ** attempt); continue;
        }
        const json = await res.json().catch(() => ({}));
        if (res.ok) return { message: toMessage(json, model), latencyMs: Date.now() - t0, costUsd: cost(json, this.opts.pricing) };
        lastErr = `${res.status} ${json?.error?.message || json?.message || json?.detail || ''}`.slice(0, 300);
        if (res.status === 429) {
          const wait = retryAfterMs(res.headers);
          if (wait > (this.opts.maxWaitMs ?? 10_000)) break; // try the next model instead of stalling the customer
          await sleep(Math.max(wait, 800 * 2 ** attempt)); continue;
        }
        if (res.status >= 500) { await sleep(800 * 2 ** attempt); continue; }
        throw new Error(`${this.opts.provider} ${lastErr}`);
      }
    }
    throw new Error(`${this.opts.provider} unavailable: ${lastErr}`);
  }
}

function retryAfterMs(h: Headers): number {
  const ra = h.get('retry-after');
  if (ra && !Number.isNaN(Number(ra))) return Number(ra) * 1000;
  const reset = h.get('x-ratelimit-reset-tokens') || h.get('x-ratelimit-reset-requests') || '';
  const m = reset.match(/(?:(\d+)m)?(?:([\d.]+)s)?/);
  if (m && (m[1] || m[2])) return (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 1000;
  return 0;
}

function cost(json: any, p?: { input: number; output: number }): number {
  if (!p) return 0;
  const u = json?.usage || {};
  return ((u.prompt_tokens || 0) * p.input + (u.completion_tokens || 0) * p.output) / 1e6;
}

/** Internal (Anthropic-shaped) history -> chat messages. Runtime system messages in the middle of
 *  the conversation (the task ledger, lint feedback) are folded into the previous tool message or
 *  sent as a labelled user message, because several providers reject a system or user message
 *  directly after a tool message. */
export function toChat(system: string, messages: MessageParam[], toolName: boolean): ChatMsg[] {
  const out: ChatMsg[] = [{ role: 'system', content: system }];
  const names = new Map<string, string>();
  const userText = (text: string) => {
    const last = out[out.length - 1];
    if (last.role === 'user') last.content += `\n\n${text}`; else out.push({ role: 'user', content: text });
  };
  for (const m of messages as any[]) {
    if (m.role === 'system') {
      const text = `${RUNTIME}\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
      const last = out[out.length - 1];
      if (last.role === 'tool') last.content += `\n\n${text}`; else userText(text);
      continue;
    }
    if (m.role === 'assistant') {
      const blocks: any[] = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }];
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => {
        names.set(b.id, b.name);
        return { id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input || {}) } };
      });
      out.push(calls.length ? { role: 'assistant', content: text, tool_calls: calls } : { role: 'assistant', content: text || '…' });
      continue;
    }
    if (typeof m.content === 'string') { userText(m.content); continue; }
    const extra: string[] = [];
    for (const b of m.content as any[]) {
      if (b.type === 'tool_result') {
        const body = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? JSON.stringify(c)).join('\n') : JSON.stringify(b.content);
        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.is_error ? `ERROR: ${body}` : body, ...(toolName ? { name: names.get(b.tool_use_id) || 'tool' } : {}) });
      } else if (b.type === 'text' && b.text) extra.push(b.text);
    }
    if (extra.length) userText(extra.join('\n'));
  }
  return out;
}

/** Chat completion -> internal message with text and tool_use blocks. */
function toMessage(json: any, model: string): Message {
  const choice = json?.choices?.[0] || {};
  const msg = choice.message || {};
  const blocks: any[] = [];
  const text = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : '';
  if (text.trim()) blocks.push({ type: 'text', text });
  for (const c of msg.tool_calls || []) {
    let input: Record<string, unknown> = {};
    try { input = typeof c.function?.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : (c.function?.arguments || {}); } catch { input = { _unparsed: String(c.function?.arguments).slice(0, 200) }; }
    blocks.push({ type: 'tool_use', id: c.id || 'call' + randomBytes(3).toString('hex'), name: c.function?.name, input });
  }
  if (!blocks.length) blocks.push({ type: 'text', text: '' });
  const u = json?.usage || {};
  return {
    id: json?.id || 'oa_' + randomBytes(6).toString('hex'), type: 'message', role: 'assistant', model, content: blocks,
    stop_reason: choice.finish_reason === 'content_filter' ? 'refusal' : blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens || 0, cache_creation_input_tokens: 0 },
  } as unknown as Message;
}

/** Provider presets read from the environment. */
export function openAICompatFromEnv(provider: string, env: NodeJS.ProcessEnv): OpenAICompatModel {
  const list = (v?: string) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const maxWaitMs = Number(env.MODEL_MAX_WAIT_MS || 10_000);
  if (provider === 'mistral') return new OpenAICompatModel({ provider, baseUrl: 'https://api.mistral.ai/v1', apiKey: env.MISTRAL_API_KEY || '', model: env.MISTRAL_MODEL || 'mistral-medium-latest', fallbacks: list(env.MISTRAL_FALLBACKS === 'none' ? '' : env.MISTRAL_FALLBACKS || 'mistral-large-latest,mistral-small-latest'), toolMessageName: true, maxWaitMs });
  if (provider === 'groq') return new OpenAICompatModel({ provider, baseUrl: 'https://api.groq.com/openai/v1', apiKey: env.GROQ_API_KEY || '', model: env.GROQ_MODEL || 'openai/gpt-oss-120b', fallbacks: list(env.GROQ_FALLBACKS), maxWaitMs });
  return new OpenAICompatModel({ provider, baseUrl: env.OPENAI_COMPAT_BASE_URL || '', apiKey: env.OPENAI_COMPAT_API_KEY || '', model: env.OPENAI_COMPAT_MODEL || '', fallbacks: list(env.OPENAI_COMPAT_FALLBACKS), maxWaitMs });
}
