// Runtime-executed tools. Screen navigation is pure UI; the handoff record is assembled
// deterministically from the ledger, never written by the model.
import type { LocalTool, Ledger } from '@gas/agent-core';
import type { Hub } from './hub.ts';
import type { BridgeSession } from './bridgeClient.ts';

export interface ScreenMap { [screen: string]: string }

export function localTools(deps: { hub: Hub; bridge: BridgeSession; screens: ScreenMap; transcript: () => { role: string; text: string }[] }): LocalTool[] {
  const screens = Object.keys(deps.screens);
  return [
    {
      meta: {
        name: 'app_open_screen',
        description: 'Open a screen of the banking app for the user (navigation only, changes nothing). Use when the user asks to see or go to a section.',
        inputSchema: { type: 'object', properties: { screen: { type: 'string', enum: screens } }, required: ['screen'], additionalProperties: false },
        capability: 'app.open_screen', kind: 'local', risk: 'R0', criticalArgs: {}, intentTerms: [], tokenProvenance: {},
      },
      run: async (input) => {
        const route = deps.screens[String(input.screen)];
        if (!route) return { ok: false, content: JSON.stringify({ error: 'unknown screen' }) };
        deps.hub.patch({ route, modal: null, highlight: null });
        return { ok: true, content: JSON.stringify({ opened: input.screen }) };
      },
    },
    {
      meta: {
        name: 'handoff_request',
        description: 'Hand the conversation to a human bank specialist. Use when the user asks for a person, when the request is outside what the tools can do and the user wants it done, or after repeated failures. The specialist receives the full context automatically.',
        inputSchema: { type: 'object', properties: { reason: { type: 'string', enum: ['user_asked', 'unsupported_request', 'repeated_failure', 'risk_concern'] } }, required: ['reason'], additionalProperties: false },
        capability: 'handoff.create', kind: 'local', risk: 'R0', criticalArgs: {}, intentTerms: [], tokenProvenance: {},
      },
      run: async (input, { ledger, traceId }) => {
        const record = buildHandoff(ledger, String(input.reason), deps.transcript());
        try {
          const r = await deps.bridge.handoff(record, traceId);
          deps.hub.patch({ modal: { kind: 'handoff', ticketId: r.ticket_id }, agent: { status: 'handoff', note: 'A bank specialist has your request.' } });
          deps.hub.emit('handoff.created', { ticketId: r.ticket_id, reason: record.reason });
          return { ok: true, content: JSON.stringify({ ticket_id: r.ticket_id, status: 'queued', note: 'A specialist will contact the customer; they already see the context.' }) };
        } catch {
          return { ok: false, content: JSON.stringify({ error: 'handoff service unavailable' }) };
        }
      },
    },
  ];
}

export function buildHandoff(l: Ledger, reason: string, transcript: { role: string; text: string }[]) {
  return {
    task_id: l.task_id,
    goal: l.goal,
    reason,
    finished_steps: l.steps.filter((s) => s.status === 'done').map((s) => ({ title: s.title, capability: s.capability })),
    pending_step: l.steps.find((s) => s.status !== 'done')?.title ?? null,
    collected: {
      amounts: l.evidence.amounts,
      currencies: l.evidence.currencies,
      references: Object.entries(l.evidence.tokens).map(([token, r]) => ({ token, label: r.label, kind: r.provenance })),
    },
    risk_flags: l.risk_flags,
    guard_holds: l.guard_holds,
    conversation: transcript.slice(-8),
  };
}
