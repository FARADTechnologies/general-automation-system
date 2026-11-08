# Decisions

One line per reversible decision. Newest at the bottom.

- 2026-11-08 Repository keeps its name `general-automation-system`; renaming gives no benefit now.
- 2026-11-08 Designer deliveries imported from the original zips into `import/design-with-dashboard` and `import/design-app-only`; dependencies, build output and single-file bundles left out (rebuildable with `npm run build:single`).
- 2026-11-08 The designer's own tooling folder and two capture scripts with local machine paths are not imported; they are tooling, not product.
- 2026-11-08 Base for `apps/web` is the Caspia app (identical in both deliveries); the dashboard delivery contributes only selected console panels, rebuilt on real data.
- 2026-11-08 Frontend stays React 18 + Vite 5 + react-router 6 (designer's stack). New code is TypeScript; designer JSX is converted file by file only when touched.
- 2026-11-08 Stable element IDs reuse the designer's existing `data-nav-id` attribute instead of introducing a second attribute.
- 2026-11-08 The browser-side mock bank (`bank/api.js`, localStorage state) is replaced by Core Bank + Bridge; the client keeps no business logic.
- 2026-11-08 `MemoryRouter` is replaced by a browser router under `/app`, driven by hub UI state, so deep links and mirroring work.
- 2026-11-08 Seed data is rebuilt server-side to match the brief (cards 4417/9026/7731, brief contact list, 90 days, injection memo, canaries); designer seed is not reused.
- 2026-11-08 Landing page and the dashboard's "AI Studio", "Money Coach", "Versions", login and "planned" pages are dropped from the product (see `docs/AUDIT.md`).
- 2026-11-08 Working product name stays "Seda" (designer's) until the captain decides otherwise; bank brand stays "Caspia".
- 2026-11-08 Development guide lives in `CONTRIBUTING.md`.
- 2026-11-08 Package manager is pnpm via corepack (workspace monorepo).
- 2026-11-08 Services use Express 5 and run TypeScript directly with tsx; no build step for backends.
- 2026-11-08 Bridge audit log uses Node's built-in `node:sqlite` with triggers that reject UPDATE/DELETE; no native modules.
- 2026-11-08 Core Bank keeps state in memory, one seeded customer per demo session; reset reseeds.
- 2026-11-08 MCP runs stateless (one server per request, JSON responses); the agent re-lists tools when the Bridge signals a change.
- 2026-11-08 MCP tool names are capability IDs with dots replaced by underscores, because the model API rejects dots in tool names.
- 2026-11-08 Confirmation needs an httpOnly device cookie issued to the phone by the Bridge; the agent never holds it. Production would use delegated tokens / CIBA.
- 2026-11-08 Bridge notifies the agent of confirmation outcomes through an HMAC-signed webhook.
- 2026-11-08 Policy limits are re-checked at commit time, not only at prepare time.
- 2026-11-08 Merchant names, counterparties and memos are returned under `untrusted_text` in tool output.
- 2026-11-08 Runtime model `claude-sonnet-5-5`, effort `medium`, thinking `between_tools` (lowest setting; `disabled` is rejected on this model). To be re-chosen from eval data in M6.
- 2026-11-08 Correction to the brief: Sonnet 5.5 cache reads cost $0.20/MTok, not $0.10. Haiku 5.5 input $0.10, output $0.50 as stated.
- 2026-11-08 Server-side refusal fallback (`fallbacks: "default"`) is on; it only re-routes safety declines and can be turned off with `AGENT_FALLBACK=0`.
- 2026-11-08 Tools are sent with `strict: true`; JSON-schema keywords the API cannot enforce (min/max, lengths) are stripped from the model copy and still enforced by the agent guard and the Bridge.
- 2026-11-08 The task ledger is appended as a mid-conversation `system` message, so the history stays append-only and the prompt cache stays valid.
- 2026-11-08 After a prepare, the agent loop waits inside the tool call for the customer's decision and returns the Bridge-verified outcome as the tool result; the model never sees a pending action as done.
- 2026-11-08 A state-changing call requires one of the capability's `intent_terms` in the user's own words for the current task (blocks injection-driven actions).
- 2026-11-08 Contact search prefers exact name-word matches, then word prefixes, so "Ali" does not return "Aliyeva".
- 2026-11-08 `apps/web` ports the designer's Caspia screens; a compatibility store keeps their `useStore()` API, with accounts, cards, contacts, transactions, bills and templates live from the bank and other products as static demo content.
- 2026-11-08 The lock screen is off in the demo so judges land on the home screen; the bank confirmation keeps its own (mocked) biometric/PIN step.
- 2026-11-08 Manual money actions in the designer screens show an honest message pointing to the assistant; the contact-transfer form's Continue sends the typed request through the assistant.
- 2026-11-08 Runtime-owned screens live in `apps/web/src/app/core-screens/`, outside the designer's paths, so the two never edit the same files.
- 2026-11-08 The stage reads a read-only, masked "bank view" of its own session from the Bridge to show what the bank received.
- 2026-11-08 Dev gateway is Vite's proxy; production uses a small gateway with the same routes (M4).
