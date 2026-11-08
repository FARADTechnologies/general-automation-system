// Gemini adapter behind the same thin ModelClient interface. The loop keeps its message history
// in one internal format; this file translates to and from the Gemini generateContent API.
// Guards, the Bridge and the confirmation flow do not depend on which model is used.
import { randomBytes } from 'node:crypto';
import type { ModelClient, ModelRequest, ModelResult, Message, MessageParam } from '@gas/agent-core';

export interface GeminiOptions { model: string; fallbacks?: string[]; apiKey: string; thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'; maxRetries?: number }

type Part = Record<string, any>;
interface Content { role: 'user' | 'model'; parts: Part[] }

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Models whose daily quota is used up, with the time they become usable again. Skipping them
 *  avoids paying retry back-off on every turn once a free-tier daily limit is hit. */
const exhaustedUntil = new Map<string, number>();

/** Reads a 429 body: is it a daily quota, and how long until retry? */
function quotaInfo(json: any): { daily: boolean; retryMs: number } {
  const details: any[] = json?.error?.details || [];
  const daily = details.some((d) => (d.violations || []).some((v: any) => /PerDay/i.test(String(v.quotaId || ''))));
  const delay = details.find((d) => d.retryDelay)?.retryDelay;
  const retryMs = delay ? Math.round(parseFloat(String(delay)) * 1000) : 0;
  return { daily, retryMs };
}

export class GeminiModel implements ModelClient {
  constructor(private opts: GeminiOptions) {}
  get model() { return this.opts.model; }

  async create(req: ModelRequest, signal?: AbortSignal): Promise<ModelResult> {
    const contents = toContents(req.messages);
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.inputSchema })) }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { maxOutputTokens: 4096, ...(this.opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: this.opts.thinkingLevel } } : {}) },
    };
    const models = [this.opts.model, ...(this.opts.fallbacks || [])];
    const t0 = Date.now();
    let lastErr = '';
    for (const model of models) {
      if ((exhaustedUntil.get(model) || 0) > Date.now()) { lastErr = `429 daily quota used up for ${model}`; continue; }
      for (let attempt = 0; attempt <= (this.opts.maxRetries ?? 2); attempt++) {
        let res: Response;
        try {
          res = await fetch(`${API}/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000) });
        } catch (e) { lastErr = `network: ${(e as Error).message}`; await sleep(800 * 2 ** attempt); continue; }
        const json = await res.json().catch(() => ({}));
        if (res.ok) return { message: toMessage(json, model), latencyMs: Date.now() - t0, costUsd: 0 };
        lastErr = `${res.status} ${json?.error?.message || ''}`.slice(0, 300);
        if (res.status === 429) {
          const q = quotaInfo(json);
          if (q.daily || q.retryMs > 10_000) { exhaustedUntil.set(model, Date.now() + Math.max(q.retryMs, 60_000)); break; }
          await sleep(Math.max(q.retryMs, 800 * 2 ** attempt)); continue;
        }
        if (res.status >= 500) { await sleep(800 * 2 ** attempt); continue; }
        throw new Error(`gemini ${lastErr}`);
      }
    }
    throw new Error(`gemini unavailable: ${lastErr}`);
  }
}

/** Internal (Anthropic-shaped) history -> Gemini contents. Raw Gemini parts, kept on assistant
 *  turns, are replayed unchanged so thought signatures stay valid across tool calls. */
function toContents(messages: MessageParam[]): Content[] {
  const out: Content[] = [];
  const toolNames = new Map<string, string>();
  const push = (role: Content['role'], parts: Part[]) => {
    if (!parts.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else out.push({ role, parts });
  };
  for (const m of messages as any[]) {
    if (m.role === 'system') { push('user', [{ text: `[Runtime message, not from the customer]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}` }]); continue; }
    if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }];
      for (const b of blocks) if (b.type === 'tool_use') toolNames.set(b.id, b.name);
      const raw = blocks.find((b: any) => Array.isArray(b._gemini_parts))?._gemini_parts;
      if (raw) { push('model', raw); continue; }
      push('model', blocks.flatMap((b: any) => (b.type === 'text' && b.text ? [{ text: b.text }] : b.type === 'tool_use' ? [{ functionCall: { name: b.name, args: b.input || {}, id: b.id } }] : [])));
      continue;
    }
    if (typeof m.content === 'string') { push('user', [{ text: m.content }]); continue; }
    push('user', (m.content as any[]).flatMap((b) => {
      if (b.type === 'text') return [{ text: b.text }];
      if (b.type === 'tool_result') {
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
        let response: unknown;
        try { response = JSON.parse(text); } catch { response = { result: text }; }
        if (!response || typeof response !== 'object' || Array.isArray(response)) response = { result: response };
        return [{ functionResponse: { name: toolNames.get(b.tool_use_id) || 'tool', id: b.tool_use_id, response: b.is_error ? { error: response } : response } }];
      }
      return [];
    }));
  }
  return out;
}

/** Gemini response -> internal message with text and tool_use blocks. */
function toMessage(json: any, model: string): Message {
  const cand = json?.candidates?.[0];
  const parts: Part[] = cand?.content?.parts || [];
  const blocks: any[] = [];
  for (const p of parts) {
    if (p.functionCall) blocks.push({ type: 'tool_use', id: p.functionCall.id || 'gem_' + randomBytes(6).toString('hex'), name: p.functionCall.name, input: p.functionCall.args || {} });
    else if (p.text && !p.thought) blocks.push({ type: 'text', text: p.text });
  }
  // keep ids in the raw parts so the matching functionResponse ids line up on replay
  const raw = parts.map((p) => (p.functionCall && !p.functionCall.id ? { ...p, functionCall: { ...p.functionCall, id: blocks.find((b) => b.type === 'tool_use' && b.name === p.functionCall.name)?.id } } : p));
  if (blocks.length) blocks[0]._gemini_parts = raw; else blocks.push({ type: 'text', text: '', _gemini_parts: raw });
  const finish = cand?.finishReason;
  const u = json?.usageMetadata || {};
  return {
    id: 'gem_' + randomBytes(6).toString('hex'), type: 'message', role: 'assistant', model, content: blocks,
    stop_reason: finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'refusal' : blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: u.promptTokenCount || 0, output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), cache_read_input_tokens: u.cachedContentTokenCount || 0, cache_creation_input_tokens: 0 },
  } as unknown as Message;
}
