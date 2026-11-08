# Seda Console: voice banking platform (YUNEX demo)

Seda is the bank's console for voice banking. It embeds the real Caspia Bank app and drives it by voice.
All data is fictional, and the sign-in form is pre-filled.

## Run
- Windows: double-click `start-demo.bat`, then open http://localhost:5173 in Chrome (Chrome is needed for the microphone).
- Any OS: `npm install`, then `npm run dev`.
- Offline: open `seda-console-offline.html`.

## Pages (left sidebar)
| Page | What it does |
|---|---|
| Overview | Sessions, completion rate, blocked requests, time to complete, fingerprint confirmations and MCP health, all read from the shared event log |
| AI Studio | Turns one sentence into a flow. Seda checks the bank's MCP tools and guardrails, drafts the configuration, shows what the customer will hear, runs tests and publishes only after an admin approves. Every publish is a new version. |
| Playground | Voice or text commands drive the embedded Caspia app step by step. Money flows stop at the bank's summary and wait for the fingerprint. |
| Live Traces | Each session as a timeline: what the customer said, the intent, MCP calls with latency, navigation, the summary, the fingerprint and the result. Sessions can be replayed or copied as JSON. |
| Flows | Every voice journey as configuration. Flows can be turned on or off (each change is versioned), inspected as JSON and tested. |
| Integrations | The bank's MCP server, granted scopes, tools with call counts and latency, and which data Seda receives. |
| Money Coach | Rules in priority order, cushion size, allowed products and the disclaimer, with a live analysis of the customer that shows the numbers behind each suggestion. |
| Security | Flagged events, guardrails, team access and audit export. |
| Versions | Every change with its prompt and diff, plus one-click rollback. |
| Knowledge, Analytics, Settings | Planned for the next build. |

## How it fits together
```
Admin (AI Studio) ──publish──► Flows (config) ◄── runner reads it
Customer voice ──► intent engine ──► runner ──► Caspia app (navigate, fill, tap)
                                         │
                       MCP proxy (lookup, prepare, execute) ──► bank API
Every step ──► one event log ──► Overview · Live Traces · Security
```
- `src/seda/engine/intent.js` finds the intent and the entities in English: amount, contact, service and card.
- `src/seda/engine/runner.js` carries out each step visibly in the app and applies the flow's limits and card rules.
- `src/seda/engine/mcpProxy.js` wraps the bank API so every call is logged as an MCP call.
- `src/seda/engine/compiler.js` is AI Studio: it turns a prompt into flow config, tool checks, guardrail checks and tests.
- `src/seda/engine/coach.js` is the Money Coach analysis.
- `src/caspia/` is the Caspia customer app, unchanged apart from a switch that starts it unlocked inside the console.

AI Studio uses an offline, deterministic compiler, so the demo works without Wi-Fi. It fills the same
config format an LLM would, so connecting Gemini later only means replacing `compile()`.

## 3-minute demo script
1. In Playground, say "Pay my traffic fine". Seda answers that no live voice flow covers it yet.
2. In AI Studio, click the first example (traffic fines, max 100 AZN, debit card only, Friday reminder), watch the six steps, then click Approve and publish.
3. Click Try it in Playground. The app opens Traffic fines, the bank returns the debt and the summary is read aloud. Hold the fingerprint on the phone to get the receipt.
4. Say "Pay 150 manat traffic fine". The new 100 AZN limit blocks it.
5. Open Live Traces and walk through the timeline, including the MCP calls and the fingerprint signature.
6. Ask "Where should I put my money?", then open Money Coach to show the numbers behind the answer.
7. In AI Studio, try "Allow voice transfers without confirmation". The guardrail refuses it.
