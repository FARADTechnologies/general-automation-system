# Design Audit (M0)

Audited on 2026-11-08 from the reference branches `import/design-with-dashboard` and `import/design-app-only`.
Screenshots: `docs/audit/screens/` (phone 390x844, desktop 1440x900).

## 1. What was delivered

| Delivery | Contents | Stack |
|---|---|---|
| App only (`import/design-app-only`) | `caspia-bank`: mock mobile bank app | React 18.3, Vite 5.4, react-router 6.28 (`MemoryRouter`), lucide-react; plain JS/JSX, one CSS file |
| App + dashboard (`import/design-with-dashboard`) | `caspia-bank` (byte-identical to the app-only copy), `seda-platform` (bank-side "Seda Console" that embeds a copy of the Caspia app in a phone frame), `seda-landing` (static scroll landing page) | Same stack for `seda-platform`; landing is plain HTML/CSS/JS |

No backend in either delivery. All bank logic runs in the browser and state is kept in `localStorage`.
About 4,900 lines of source in total; code quality is good (consistent components, accessible markup, many stable IDs).

## 2. How to run

```bash
# app (either branch)
cd caspia-bank && npm install && npm run dev        # http://localhost:5173, PIN 1234
# console (dashboard branch)
cd seda-platform && npm install && npm run dev -- --port 5174
# landing (dashboard branch)
npx serve seda-landing
```

`npm run build:single` produces one offline HTML file (`dist-single/index.html`).

## 3. Routes and screens (Caspia app)

Router is `MemoryRouter`: the URL never changes, so there are no deep links today.

| Area | Routes | Notes |
|---|---|---|
| Lock | overlay | 4-digit PIN pad (1234), fingerprint via WebAuthn, auto-lock after 5 min |
| Home | `/` | total balance, quick actions, cards rail, upcoming payments, promo, 30-day spending, recent activity |
| Transfers | `/transfers`, `/transfers/card`, `/transfers/phone`, `/transfers/own`, `/transfers/abroad`, `/transfers/request`, `/receipt/:id` | contact rail, templates, recipient lookup by card or phone |
| Payments | `/payments`, `/payments/group/:id`, `/payments/:id`, `/qr` | 6 groups, 16 billers, "due now" list, QR scan simulation |
| Cards | `/cards`, `/cards/:id`, `/cards/new` | freeze/unfreeze, reveal details, limits, toggles, order virtual/physical |
| History | `/history`, `/history/:id`, `/analytics` | search, filters, grouped list, detail, donut + weekly bars |
| Products | `/loans`, `/loans/apply`, `/deposits`, `/deposits/new`, `/cashback`, `/exchange` | calculators, apply flows |
| Account | `/more`, `/notifications`, `/profile`, `/security`, `/settings`, `/branches`, `/support` | dark mode, reset demo data, FAQ/chat |
| Confirmation | sheet over any screen | review summary, then fingerprint or PIN, then receipt |

Unknown or unbuilt routes render a "Being built right now" placeholder.

## 4. Feature inventory against the backlog

| Backlog item | Present in designer app? | Usable as is? |
|---|---|---|
| Accounts and balance | Yes (home, cards) | Screen yes, data must come from Core Bank |
| Transaction search | Yes (`/history` search + filters) | Yes, after data binding |
| Contact search | Yes (contact rail + search box on `/transfers`) | Needs contact chooser for ambiguity |
| Transfer to contact | Partly (contact tap opens card transfer) | Rework: transfer-by-contact form |
| Transfer by phone / card / own accounts / template | Yes | Yes, after form state moves to hub |
| Block / unblock card | Yes (freeze/unfreeze) | Unblock must become R3 (biometric) |
| Pay a bill | Yes (single biller) | Batch "pay all unpaid" screen missing |
| Mobile top-up | Yes (Azercell/Bakcell/Nar) | Yes |
| Income/expense analytics | Partly (`/analytics`: spend by category, weekly) | Compare periods, top expenses, income sources missing |
| Subscriptions list/cancel | No | New screen |
| Replacement card to a branch | Partly (order card; branch list exists separately) | New flow |
| Recurring transfer | No | New screen |
| Split a bill | Button on transaction detail, no flow | New flow |
| Human handoff | No | New state + console queue |
| Knowledge answers | FAQ list in `/support` | Corpus moves to `domains/bank/kb` |
| Investment (P2) | No | New section |
| Agent dock (voice + text, status, plan) | No | New component |
| Bank confirmation screen | Yes (sheet) | Rework: render from Bridge prepared object, mock biometric, 120 s expiry |

## 5. Hardcoded data and broken parts

These are real problems for our architecture, not style remarks.

1. **Bank logic in the client.** `src/bank/api.js` validates, debits and writes receipts in the browser. Violates "no bank internals in the UI". Moves to Core Bank + Bridge.
2. **Forgeable confirmation.** `execute(id, { verified: true })` accepts any caller that sets `verified`; expiry is 5 minutes and it is not bound to a payload hash. Violates I3. Replaced by the Bridge confirmation endpoint.
3. **Sensitive values in client state.** Full card numbers, CVVs and IBANs live in the seed and in `localStorage`. The app-facing API will return masked values; full details only through a separate reveal call.
4. **Fabricated lookups.** `lookupCard` invents a masked name (`R*** M.`) for unknown cards; `lookupBill` invents a debt from the account number length. Both would put invented values on a confirmation screen.
5. **Local form state.** Forms keep values in component `useState` (19 in `Transfers.jsx` alone), so nothing outside the component can fill them. Needs hub-backed form state (see `docs/UI_CONTRACT.md`).
6. **`MemoryRouter`.** No URL routing, so `/app?s=demo1` style sessions and deep links do not work. Replaced.
7. **Seed does not match the brief.** Different cards (4471/9032/0556), different contacts, about 30 transactions instead of 90 days, no subscriptions, no injection memo, no investments, no canaries. Rebuilt server-side.
8. **Dashboard numbers include seeded "sample" events** (marked only by a small "includes sample history" note) and a hardcoded "Connected" pill. Risks I12.
9. **"AI Studio" is a rule-based compiler presented as AI** ("New flow with AI"). Misleading to judges who will try it.
10. **"Money Coach" recommends financial actions** (debt first, deposits, investment products). Conflicts with "no personal investment advice".

## 6. Chosen base and why

`caspia-bank` becomes `apps/web` `/app/*`. It is the most complete and polished part, it already has the prepare → review → confirm → receipt shape we need, and it has 60+ stable `data-nav-id` attributes. Both deliveries contain the same app, so there is no choice to make between them for the phone.
The dashboard delivery is not a base: its engine is an in-browser regex intent matcher, which our architecture replaces. Only its layout kit and a few panels are reused for `/console` and `/stage`.

## 7. Dashboard panels

| Panel (Seda Console) | Decision | Reason |
|---|---|---|
| Login | Delete | Pre-filled fake credentials; adds a step and proves nothing. Console sits behind a simple operator gate later. |
| Overview KPIs | Rework | Keep the layout; every number from real audit events; remove seeded sample history. |
| Sessions per hour, most used flows | Rework | Fine as charts once fed by real sessions; hide until there is data. |
| Bank connection card | Rework | Becomes Bridge health: real `/health`, registered capability count, real call latency. |
| Playground (phone + text box) | Rework into `/stage` | The mirrored phone plus live plan is exactly what the stage needs; the regex engine goes. |
| Live Traces | Keep, rework data | Trace list per session from the audit log with trace IDs, guard decisions, "Agent sees / Bank sees". |
| Flows | Rework into Capabilities | Capabilities come from the manifest: show tier, status, enable/kill switch. |
| Integrations (MCP tools, scopes, data minimisation) | Rework | Good business story ("what the bank exposes"); bind to the real manifest and tokenisation stats. |
| Security (flagged events, guardrails, export audit log) | Keep, rework data | Bank buyer needs this: guard holds, limits, audit export. |
| Team access | Delete | Static list, no real roles. |
| AI Studio | Delete | Rule-based compiler presented as AI; misleading. The live extensibility proof (manifest hot-reload) replaces it. |
| Money Coach | Delete | Gives financial recommendations; conflicts with the no-advice rule. |
| Versions / rollback | Delete | Not needed for the demo; manifest versions can be shown later from git. |
| Planned pages (knowledge, analytics, settings) | Delete | Placeholders. |
| Missing: handoff queue, eval results, limits editor | Add | Required by brief section 11. |

Landing page (`seda-landing`): not part of the product routes; stays on the reference branch. Its measured claim ("5 taps manually vs 1 sentence + 2 taps") was measured on the designer prototype, so it goes to `docs/PITCH_FACTS.md` only after we re-measure on our app.

## 8. Runtime check

Captured with Playwright 1.65 (Chromium). No console errors, page errors or failed requests on any page.
No horizontal overflow at 390 or 1440. One dead control: "Forgot PIN?" on the lock screen.
Landing page: at 1440 the floating tap counter covers a heading (`landing-1440-scroll2.png`); at 390 it keeps a two-column split (cramped).
Console login at 390 pushes the form below the fold. The console's analytics, knowledge and settings pages are placeholders.

## 9. Screenshots

Contact sheets for a quick look: `docs/audit/sheet-app.png`, `docs/audit/sheet-console.png`, `docs/audit/sheet-misc.png`.
Individual files in `docs/audit/screens/`:

| Files | Viewport | Content |
|---|---|---|
| `app-390-lock`, `app-390-home`, `app-390-home-bottom` | 390x844 | lock PIN pad, home top and bottom |
| `app-390-history`, `app-390-history-detail`, `app-390-analytics` | 390x844 | history, transaction detail, analytics |
| `app-390-transfers`, `app-390-transfers-{card,phone,own,abroad,request}`, `app-390-transfers-card-filled` | 390x844 | transfers hub and forms |
| `app-390-confirm-sheet`, `app-390-confirm-fingerprint`, `app-390-after-confirm` | 390x844 | confirmation sheet, fingerprint step, receipt |
| `app-390-payments`, `app-390-payments-group-utilities`, `app-390-payments-azerishiq`, `app-390-qr` | 390x844 | payments |
| `app-390-cards`, `app-390-card-detail`, `app-390-cards-new` | 390x844 | cards |
| `app-390-{loans,loans-apply,deposits,deposits-new,cashback,exchange}` | 390x844 | products |
| `app-390-{more,notifications,profile,security,settings,branches,support}` | 390x844 | account area |
| `app-1440-lock`, `app-1440-home` | 1440x900 | app inside a centred phone frame |
| `console-1440-{login,overview,traces,studio,playground,flows,integrations,coach,security,versions,analytics,knowledge,settings}` | 1440x900 | every console page |
| `console-390-{login,overview,menu}` | 390x844 | console on a phone |
| `landing-1440-{top,scroll1,scroll2,scroll3,console}`, `landing-390-top` | both | landing page |

Worth a look first: `app-390-home`, `app-390-confirm-sheet`, `console-1440-playground`, `console-1440-integrations`, `console-1440-coach` (the advice problem), `console-1440-overview` (sample KPIs).
