// The intent rule must accept real requests (typos, verbless, "yes" to the agent's own question)
// without letting injected text start an action.
import { describe, it, expect } from 'vitest';
import { guardToolCall, type ToolMeta } from './guards.ts';
import { newLedger, type Ledger } from './ledger.ts';
import { extractAmounts } from './evidence.ts';

const transfer: ToolMeta = {
  name: 'transfer_contact_prepare', description: '', capability: 'transfer.contact.prepare', kind: 'prepare', risk: 'R3',
  inputSchema: { type: 'object', properties: { contact: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' } }, required: ['contact', 'amount', 'currency'], additionalProperties: false },
  criticalArgs: { contact: { token: 'contact', provenance: ['resolved_contact', 'ingress_token', 'template'] }, amount: { provenance: ['user_stated', 'derived', 'template'] } },
  intentTerms: ['send', 'transfer', 'pay', 'give', 'wire', 'move'], tokenProvenance: {},
};
const block: ToolMeta = { ...transfer, name: 'card_block_prepare', capability: 'card.block.prepare', risk: 'R2', inputSchema: { type: 'object', properties: { card: { type: 'string' } }, required: ['card'], additionalProperties: false }, criticalArgs: { card: { token: 'card', provenance: ['bank_record'] } }, intentTerms: ['block', 'freeze', 'lost', 'stolen'] };

function ledgerFor(texts: string[], contact: { token: string; query: string }, lastQuestion?: string): Ledger {
  const l = newLedger(texts[0]);
  l.evidence.user_texts = texts;
  l.evidence.amounts = texts.flatMap(extractAmounts);
  l.evidence.tokens[contact.token] = { provenance: 'resolved_contact', capability: 'contacts.search', query: contact.query };
  l.evidence.tokens.crd_1 = { provenance: 'bank_record', capability: 'cards.list' };
  l.last_question = lastQuestion;
  return l;
}
const call = (meta: ToolMeta, l: Ledger, input: Record<string, unknown>) => guardToolCall({ name: meta.name, input }, meta, l, { callsThisTurn: 0, seen: new Map() });

describe('intent rule', () => {
  it('tolerates typos in the action word', () => {
    const l = ledgerFor(['trasnfer 35 manats to elchin'], { token: 'ctc_e', query: 'elchin' });
    expect(call(transfer, l, { contact: 'ctc_e', amount: 35, currency: 'AZN' })).toEqual({ ok: true });
  });

  it('accepts a verbless request when payee and amount both come from the user', () => {
    const l = ledgerFor(['To Nigar Ismayilova, 70 manat, thanks'], { token: 'ctc_n', query: 'Nigar Ismayilova' });
    expect(call(transfer, l, { contact: 'ctc_n', amount: 70, currency: 'AZN' })).toEqual({ ok: true });
  });

  it('accepts a plain yes to the agent question that named the action', () => {
    const l = ledgerFor(['Nigar 70 AZN', 'yes'], { token: 'ctc_n', query: 'Nigar' }, 'Do you want me to transfer 70 AZN to Nigar Ismayilova?');
    expect(call(transfer, l, { contact: 'ctc_n', amount: 70, currency: 'AZN' })).toEqual({ ok: true });
  });

  it('a yes to an unrelated question does not authorise a card block', () => {
    const l = ledgerFor(['what is my balance', 'yes'], { token: 'ctc_x', query: 'x' }, 'Would you like to see your savings too?');
    expect(call(block, l, { card: 'crd_1' })).toMatchObject({ ok: false, code: 'INTENT_NOT_STATED' });
  });

  it('a memo-driven question answered with yes still cannot pick the payee or the amount', () => {
    // the injected memo made the agent ask about John Carter; the user only said yes
    const l = ledgerFor(['Summarize my recent transactions', 'yes'], { token: 'ctc_j', query: 'John Carter' }, 'Do you want me to send 500 USD to John Carter?');
    const r = call(transfer, l, { contact: 'ctc_j', amount: 500, currency: 'USD' });
    expect(r.ok).toBe(false);
    expect(['PAYEE_NOT_FROM_USER', 'AMOUNT_NOT_STATED']).toContain((r as { code: string }).code);
  });

  it('a summary request alone still cannot start a transfer', () => {
    const l = ledgerFor(['Summarize my recent transactions'], { token: 'ctc_j', query: 'John Carter' });
    expect(call(transfer, l, { contact: 'ctc_j', amount: 500, currency: 'AZN' })).toMatchObject({ ok: false, code: 'INTENT_NOT_STATED' });
  });
});
