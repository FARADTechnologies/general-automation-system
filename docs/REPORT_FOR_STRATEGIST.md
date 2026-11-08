# Report for the Strategist (M0, 2026-11-08)

## Stack found

- Both deliveries contain the same **Caspia Bank** mobile app: React 18 + Vite 5 + react-router 6 (`MemoryRouter`), plain JSX, one CSS file, about 2,500 lines. Polished and close to a real bank app.
- The dashboard delivery adds **Seda Console** (bank-side admin, same stack) and a static landing page.
- No backend anywhere. All bank logic, data and "AI" run in the browser; state is in `localStorage`. The console's "AI" is a deterministic regex intent matcher plus a rule-based "flow compiler".

## Key findings

1. The phone app is a strong base: about 30 screens, a prepare → review → fingerprint → receipt flow, 60+ stable element IDs. We keep it.
2. It cannot be driven as-is: forms keep values in local component state and the router has no URLs. We move form and route state to a server hub; that is what makes phone/projector mirroring and agent form-filling possible.
3. Its mock bank is unsafe by our own rules: confirmation is a client flag (`verified: true`), card numbers and CVVs sit in browser storage, and two lookups invent recipient names and bill amounts. All of this moves server-side.
4. Seed data does not match the brief and is rebuilt.
5. The console mixes good ideas (traces, guardrails, data-minimisation panel, "what tools the bank exposes") with misleading ones (sample KPIs, "AI Studio" that is not AI, a "Money Coach" that gives financial advice).

## Dashboard decisions

- **Keep and rebuild on real data:** live traces, security/guardrails with audit export, integrations ("what the bank exposes"), overview KPIs (real events only), Playground → becomes `/stage`.
- **Rework:** Flows → Capabilities with tier, status and kill switch.
- **Delete:** login with fake credentials, team access list, AI Studio, Money Coach, versions/rollback, placeholder pages, landing page (stays on the reference branch).
- **Add:** handoff queue, eval results, limits editor, live extensibility toggle.

## Where I disagree with the brief

1. **M1–M3 in 3.5 hours is not realistic for everything listed.** Core Bank, Bridge with manifest engine, MCP, vault, provenance guards, agent loop, ledger, hub, choreography and confirmation are each real work. I will hit the M3 gate with V0 only (balance, search, contact transfer, block card, pay bill) and the full invariants on that slice, and defer P0 to M5 as planned. Expect M3 closer to 01:00 than 00:30.
2. **"Contacts permission off" has no real meaning in a web app.** There is no OS contacts permission in a browser PWA. I will model it as a bank-app setting that hides the contact list from the agent, and say so honestly.
3. **Product name.** The designer named it "Seda" (Azerbaijani for "voice"). The pitch says "this is not a voice chatbot". A voice-first name works against the main differentiator. Worth a decision.
4. **Voice on judges' iPhones is a real risk.** The Web Speech API is unreliable on iOS Safari, especially in home-screen mode. Until the tester's STT adapter lands, text input is the dependable path; the demo script should not depend on browser speech.
5. **The landing page's "race" (5 taps manually vs 1 sentence + 2 taps) is a good pitch device**, but it was measured on the designer prototype. It goes into the pitch only after we re-measure on our app.

## Top risks

1. **Time** (see above). Mitigation: V0 first, strict scope, cut from the bottom.
2. **Hosting.** We need always-on HTTPS with WebSockets and no cold starts. This likely needs a paid tier and a login on a platform. I will check available CLIs; a login is the one thing I will have to ask the captain for (M4).
3. **Latency.** "Simple task to confirmation in under 6 s" with a frontier model and several tool calls is tight. Prompt caching, parallel reads and deterministic execution of planned steps are the levers; numbers come from evals, not guesses.
4. **Judge sessions.** Several judges trying at once need isolated sessions, reset, and rate limits. One QR code per session is the simplest way to hand a judge a phone link.
5. **Designer merges.** Two people editing the same screens breaks things. The contract restricts the designer to UI paths on `design/*` branches.

## Screenshots worth reviewing

Quick overview: `docs/audit/sheet-app.png` (every phone screen) and `docs/audit/sheet-console.png` (every console page).
Individually, in `docs/audit/screens/`:
- `app-390-home.png`, `app-390-confirm-sheet.png`: the base we keep.
- `console-1440-playground.png`: closest thing to our `/stage`.
- `console-1440-integrations.png`: "what the bank exposes", a good business-story panel.
- `console-1440-overview.png`: KPIs partly from seeded sample events (I12 problem).
- `console-1440-coach.png`: the financial-advice problem.
- `landing-1440-top.png`: the "5 taps vs one sentence" framing.
