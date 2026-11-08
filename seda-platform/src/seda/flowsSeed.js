// Voice flows that are live on day one. Each flow is pure configuration:
// the runner (engine/runner.js) reads it to decide what the app does.
// "kind" picks the runner; everything else (billers, limits, cards, phrases, summary) is data.

export const KINDS = {
  balance: { label: 'Read-only', money: false },
  spending: { label: 'Read-only', money: false },
  coach: { label: 'Advice', money: false },
  transfer_card: { label: 'Money movement', money: true },
  pay_bill: { label: 'Money movement', money: true },
  topup: { label: 'Money movement', money: true },
  freeze_card: { label: 'Card control', money: false },
};

export const seedFlows = () => [
  {
    id: 'f-balance', name: 'Check balance', kind: 'balance', status: 'live', version: 1,
    phrases: ['What is my balance', 'How much money do I have', 'Show my balance'],
    keywords: ['balance', 'how much money', 'how much do i have'],
    tools: ['get_accounts'], confirmation: 'none', limits: null, cards: null,
    steps: ['Read accounts via MCP', 'Open Home', 'Highlight total balance', 'Say the total'],
    summary: 'Your total balance is {total} AZN.', createdBy: 'Seed', updatedAt: '2026-11-01',
  },
  {
    id: 'f-transfer', name: 'Send money to a contact', kind: 'transfer_card', status: 'live', version: 3,
    phrases: ['Send 35 manat to Murad', 'Transfer 20 AZN to Mom', 'Pay Aysel 15'],
    keywords: ['send', 'transfer', 'give', 'pay'],
    tools: ['lookup_card', 'prepare_transfer', 'execute_transfer'], confirmation: 'fingerprint',
    limits: { perPayment: 500, perDay: 1000 }, cards: null,
    steps: ['Find the contact', 'Look up card owner via MCP', 'Open Transfers → To a card', 'Fill card and amount', 'Prepare via MCP', 'Read the summary', 'Fingerprint', 'Execute via MCP'],
    summary: 'Send {amount} AZN to {name}, card ending {last4}?', createdBy: 'Seed', updatedAt: '2026-11-03',
  },
  {
    id: 'f-bills', name: 'Pay utility bills', kind: 'pay_bill', status: 'live', version: 2,
    billers: ['azerishiq', 'azersu', 'azeriqaz', 'azeristilik', 'citynet', 'aztelekom'],
    phrases: ['Pay my electricity bill', 'Pay the water bill', 'Pay gas'],
    keywords: ['electricity', 'light', 'water', 'gas', 'heating', 'internet', 'bill', 'utility', 'utilities'],
    tools: ['lookup_bill', 'prepare_payment', 'execute_payment'], confirmation: 'fingerprint',
    limits: { perPayment: 300 }, cards: null,
    steps: ['Detect the service', 'Look up debt via MCP', 'Open the service', 'Fill amount', 'Prepare via MCP', 'Read the summary', 'Fingerprint', 'Execute via MCP'],
    summary: 'Pay {amount} AZN to {biller}?', createdBy: 'Seed', updatedAt: '2026-11-02',
  },
  {
    id: 'f-topup', name: 'Top up mobile', kind: 'topup', status: 'live', version: 1, billers: ['azercell'],
    phrases: ['Top up my phone with 5 manat', 'Add 10 AZN to my mobile'],
    keywords: ['top up', 'topup', 'phone', 'mobile', 'azercell', 'credit'],
    tools: ['prepare_payment', 'execute_payment'], confirmation: 'fingerprint', limits: { perPayment: 50 }, cards: null,
    steps: ['Open Azercell', 'Fill amount', 'Prepare via MCP', 'Read the summary', 'Fingerprint', 'Execute via MCP'],
    summary: 'Top up {amount} AZN to {account}?', createdBy: 'Seed', updatedAt: '2026-11-02',
  },
  {
    id: 'f-freeze', name: 'Freeze a card', kind: 'freeze_card', status: 'live', version: 1,
    phrases: ['Freeze my card', 'I lost my card', 'Block my debit card'],
    keywords: ['freeze', 'lost', 'stolen', 'block'],
    tools: ['set_card_state'], confirmation: 'tap', limits: null, cards: null,
    steps: ['Detect the card', 'Open the card', 'Ask for a tap to confirm', 'Freeze via MCP'],
    summary: 'Freeze {card}?', createdBy: 'Seed', updatedAt: '2026-11-01',
  },
  {
    id: 'f-spending', name: 'Spending insight', kind: 'spending', status: 'live', version: 1,
    phrases: ['How much did I spend this month', 'Where did my money go'],
    keywords: ['spend', 'spent', 'spending', 'where did my money go', 'expenses'],
    tools: ['get_transactions'], confirmation: 'none', limits: null, cards: null,
    steps: ['Read transactions via MCP', 'Open Analytics', 'Say the top category'],
    summary: 'You spent {total} AZN in the last 30 days.', createdBy: 'Seed', updatedAt: '2026-11-01',
  },
  {
    id: 'f-coach', name: 'Money Coach', kind: 'coach', status: 'live', version: 2,
    phrases: ['Where should I put my money', 'How can I save more', 'Should I open a deposit'],
    keywords: ['invest', 'investment', 'save', 'saving', 'savings', 'where should i put', 'put my money', 'advice', 'deposit', 'grow my money'],
    tools: ['get_accounts', 'get_transactions', 'get_loans', 'get_products'], confirmation: 'none', limits: null, cards: null,
    steps: ['Read accounts, income, spending, loans via MCP', 'Apply the coach rules', 'Explain the recommendation with numbers'],
    summary: '{advice}', createdBy: 'Seed', updatedAt: '2026-11-04',
  },
];
