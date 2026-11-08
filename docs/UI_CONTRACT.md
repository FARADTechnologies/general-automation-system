# UI Contract

This is the contract between the UI (designer) and the runtime (core team). If something here blocks a design, ask; do not work around it.
Types live in `packages/contracts`. This document is the human-readable version.

## 1. Principles

- The UI is a thin client. No AI, no API keys, no business rules, no seed data in components.
- Two kinds of state:
  - **Domain state** (balances, cards, transactions): owned by Core Bank. Screens read it through runtime hooks only.
  - **UI state** (route, form values, modals, highlight, agent status): owned by the session hub on the server. Every screen of a session (phone, stage) shows the same UI state.
- The agent never clicks the DOM. It changes UI state through the hub; screens re-render from state.

## 2. Routes

One web app, three areas.

| Route | Purpose | Viewport |
|---|---|---|
| `/app?s=<session>` and `/app/...` | Customer mobile bank (installable PWA) | phone first, 390x844 |
| `/stage?s=<session>` | Presentation view: mirrored phone, live plan, guard decisions, "Agent sees / Bank sees" | 1920x1080 |
| `/console` | Bank-side console: sessions, audit, capabilities and kill switches, limits, handoff queue, eval results | 1440x900 |

App routes (all under `/app`):

| Route | Screen | Status |
|---|---|---|
| `/app` | Home | exists |
| `/app/accounts/:id` | Account detail | new |
| `/app/history`, `/app/history/:id` | History, transaction detail | exists |
| `/app/analytics` | Income/expense analytics | exists, extend |
| `/app/transfers` | Transfers hub (contacts, templates) | exists |
| `/app/transfers/contact` | Transfer to a contact | new (V0) |
| `/app/transfers/card`, `/app/transfers/phone`, `/app/transfers/own` | Transfer by card, by phone, between own accounts | exists |
| `/app/transfers/template/:id` | Transfer from a template | new |
| `/app/transfers/recurring` | Schedule a recurring transfer | new |
| `/app/split/:txId` | Split a bill | new |
| `/app/payments`, `/app/payments/:billerId` | Payments hub, pay one biller (incl. mobile top-up) | exists |
| `/app/bills` | All unpaid bills, pay as one batch | new |
| `/app/subscriptions` | Subscriptions list, cancel | new |
| `/app/cards`, `/app/cards/:id` | Cards, card detail (block/unblock, limits) | exists |
| `/app/cards/:id/replace` | Order a replacement card to a branch | new |
| `/app/invest`, `/app/invest/market`, `/app/invest/:symbol`, `/app/invest/order` | Portfolio, market list, instrument, order form | new (P2) |
| `/app/receipt/:id` | Receipt | exists |
| `/app/more`, `/app/support`, `/app/branches`, `/app/settings` | Account area | exists |

Overlays (not routes, driven by `ui.modal`): bank confirmation, contact chooser, handoff notice, lock screen.

## 3. Stable element IDs

- Attribute: `data-nav-id` (already used across the designer app). Keep every existing one.
- Format: kebab-case `<area>-<element>`. Repeated items: `<prefix>-<key>`, where `key` is a token or index, never a full number.
- An ID is stable once it is in this table. Renaming one is a contract change.
- Every interactive control and every field the agent may fill must have an ID.

Required IDs (V0 and P0):

| Area | IDs |
|---|---|
| Tabs | `tab-home`, `tab-payments`, `tab-transfers`, `tab-history`, `tab-more` |
| Home | `home-balance-total`, `home-account-<accountToken>`, `home-card-<last4>` |
| History | `history-search`, `history-filter-<name>`, `tx-<txId>` |
| Transfer form | `transfer-recipient`, `transfer-amount`, `transfer-source`, `transfer-continue` |
| Contact chooser | `chooser-option-<n>` (1-based), `chooser-cancel` |
| Cards | `card-<last4>`, `card-block`, `card-unblock`, `card-replace` |
| Bills | `bill-<billerId>`, `bill-account`, `bill-amount`, `bill-pay`, `bills-pay-all` |
| Subscriptions | `sub-<subId>`, `sub-cancel-<subId>` |
| Confirmation | `confirm-approve`, `confirm-cancel`, `confirm-biometric`, `confirm-pin-<digit>` |
| Agent dock | `agent-text-input`, `agent-send`, `agent-mic`, `agent-stop`, `agent-status`, `agent-try-saying` |

The manifest's `ui.fields[].target` refers to these IDs.

## 4. UI state shape

```ts
interface UiState {
  seq: number;                       // last applied event sequence number
  route: string;                     // e.g. "/app/transfers/contact"
  forms: Record<string, Record<string, string>>;   // formId -> fieldId -> display value
  modal: null
    | { kind: 'confirm'; confirmId: string }      // details are fetched from the Bridge, never from here
    | { kind: 'chooser'; chooserId: string; title: string; options: { n: number; label: string; sub?: string }[] }
    | { kind: 'handoff'; ticketId: string };
  highlight: string | null;          // a data-nav-id
  agent: { status: 'idle' | 'listening' | 'thinking' | 'acting' | 'waiting_confirmation' | 'paused' | 'handoff' | 'error'; note?: string };
  plan: null | { taskId: string; goal: string; steps: { id: string; title: string; status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' }[] };
  transcript: { id: string; role: 'user' | 'agent'; text: string; at: number }[];
  bankVersion: number;               // bumps on every bank change; data hooks refetch
}
```

## 5. Form control rules

1. A field the agent may fill is **controlled by the hub**: `const f = useField('transfer', 'transfer-amount')`. It returns `{ value, onChange, 'data-nav-id' }`. Do not keep such a value in local `useState`.
2. Local `useState` is allowed only for purely visual state (accordion open, tab within a card, animation).
3. Display values only. The form never holds a full card number, IBAN or full phone number; it shows what the Bridge returns (masked).
4. Typing on the phone sends `ui.intent { type: 'field.set' }`; the hub applies it and broadcasts `ui.patch` to every screen.
5. A "Continue" button does not compute anything. It sends `ui.intent { type: 'submit', form }`; the runtime asks the Bridge to prepare.
6. Every data screen handles four states: loading, empty, error, ready. Use the shared `<Loading/>`, `<Empty/>`, `<ErrorState/>` components.
7. Screens get domain data through `useBank(resource)` only. No imports from seed files or mock APIs.

## 6. Events

Server to client (ordered, each with `seq`): `session.snapshot`, `ui.patch`, `ui.tap_echo`, `ui.highlight`, `agent.status`, `agent.transcript`, `agent.message`, `agent.step`, `trace.event`, `confirm.required`, `confirm.resolved`, `bank.changed`, `handoff.created`.

Client to server: `ui.intent` (`navigate`, `field.set`, `submit`, `tap`, `chooser.pick`, `modal.close`), `agent.input` (text or transcript), `agent.stop`.

Rules:
- On connect and on every reconnect the client gets a full `session.snapshot`; it never replays events from local memory.
- Events with `seq` not greater than the current one are ignored.
- A manual tap while the agent is acting pauses the agent (`agent.status = paused`).
- `ui.tap_echo { target }` shows a short press ripple on the element with that ID on the other screen.
- Scroll position is not synced, except an agent `ui.highlight` that scrolls the target into view.

## 7. Confirmation screen

- Rendered by `apps/web/src/app/confirm/` from the Bridge's prepared object, fetched with the `confirmId`. Never from agent text.
- Shown on the phone only. The stage shows "Waiting for customer confirmation".
- Approve calls the Bridge confirmation endpoint directly. The agent is not in that path.
- The designer may restyle it through the `.bank-confirm*` CSS classes only.

## 8. Designer paths

Allowed (on `design/*` branches only):

- `apps/web/src/app/screens/**`
- `apps/web/src/app/components/**`
- `apps/web/src/stage/components/**`
- `apps/web/src/console/components/**`
- `apps/web/src/styles/**`
- `apps/web/public/**`

Not allowed: `apps/web/src/runtime/**`, `apps/web/src/app/confirm/**` (except CSS classes), `services/**`, `packages/**`, `domains/**`, `evals/**`, `docs/**` (except comments in a PR), root config files.

Push small commits. The core team merges `design/*` into `main`.
