// OpenAI-compatible adapter: the internal history must map to chat messages that strict providers
// accept (no system or user message directly after a tool message), and responses map back.
import { describe, it, expect } from 'vitest';
import { toChat, OpenAICompatModel } from '../services/agent/src/model-openai.ts';

const history: any[] = [
  { role: 'system', content: 'LEDGER v1' },
  { role: 'user', content: 'Send 20 manat to Leyla' },
  { role: 'assistant', content: [{ type: 'text', text: 'Looking up Leyla.' }, { type: 'tool_use', id: 'abc123def', name: 'contacts_search', input: { query: 'Leyla' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'abc123def', content: '{"items":[{"contact":"ctc_1"}]}' }] },
  { role: 'system', content: 'LEDGER v2' },
];

describe('openai-compatible adapter', () => {
  it('folds runtime messages after a tool result into that tool message', () => {
    const chat = toChat('SYSTEM', history, true);
    expect(chat.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(chat[1].content).toContain('LEDGER v1');
    expect(chat[1].content).toContain('Send 20 manat to Leyla');
    expect(chat[1].content).toContain('not from the customer');
    const a = chat[2] as any;
    expect(a.tool_calls[0]).toEqual({ id: 'abc123def', type: 'function', function: { name: 'contacts_search', arguments: '{"query":"Leyla"}' } });
    const t = chat[3] as any;
    expect(t).toMatchObject({ tool_call_id: 'abc123def', name: 'contacts_search' });
    expect(t.content).toContain('ctc_1');
    expect(t.content).toContain('LEDGER v2');
  });

  it('maps tool calls back and moves to the next model when a rate limit would stall the customer', async () => {
    const seen: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      seen.push(body.model);
      if (body.model === 'slow') return new Response('{}', { status: 429, headers: { 'retry-after': '60' } });
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'x1y2z3w4v', function: { name: 'accounts_list', arguments: '{}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = new OpenAICompatModel({ provider: 't', baseUrl: 'http://x', apiKey: 'k', model: 'slow', fallbacks: ['fast'], maxWaitMs: 5000, fetchImpl: f });
    const r = await m.create({ system: 's', tools: [], messages: [{ role: 'user', content: 'balance' }] as any });
    expect(seen).toEqual(['slow', 'fast']);
    expect((r.message.content as any[])[0]).toMatchObject({ type: 'tool_use', id: 'x1y2z3w4v', name: 'accounts_list', input: {} });
    expect(r.message.stop_reason).toBe('tool_use');
  });
});
