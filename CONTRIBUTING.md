# Contributing

The single source of truth is [`docs/BRIEF.md`](docs/BRIEF.md). Decisions are logged one line each in [`docs/DECISIONS.md`](docs/DECISIONS.md).
UI work follows [`docs/UI_CONTRACT.md`](docs/UI_CONTRACT.md); designers work only on `design/*` branches and only in the paths listed there.

## Layout

```text
apps/web/            one client: /app, /stage, /console
services/agent/      agent runtime, STT adapter, realtime hub
services/bridge/     MCP server, manifest engine, vault, policy, confirmation
services/core-bank/  mock internal bank API plus app-facing API
packages/agent-core/ domain-agnostic runtime: loop, ledger, guards, eval types
packages/contracts/  shared event and API schemas
domains/bank/        manifest, policies, prompt additions, seed, KB, scenarios
evals/               runner, dev set, holdout set, results
docs/                brief, audit, contract, reliability, pitch facts
```

## Commands

```bash
pnpm install                        # once (pnpm 10)
pnpm dev                            # core-bank :4100, bridge :4200, agent :4300, web :5173
pnpm test                           # unit, invariant and scripted agent tests (no model calls)
LIVE=1 pnpm vitest run tests/agent.live.test.ts   # live model scenarios (costs money)
bash scripts/secret-scan.sh         # run the commit secret scan by hand

# open http://localhost:5173/app?s=demo1 (phone) and http://localhost:5173/stage?s=demo1 (projector)
```

Secrets live only in the local `.env` (see `.env.example`). The pre-commit hook in `.githooks/` blocks key patterns; enable it with `git config core.hooksPath .githooks`.

## Invariants (tests must prove them)

- I1 The LLM never receives a full card number, IBAN, full phone number, PIN, CVV or auth token.
- I2 No MCP tool can commit money or a critical action. The agent can only prepare.
- I3 Commit needs a one-time, 120 s confirmation bound to the payload hash, sent from the bank screen straight to the Bridge.
- I4 The Bridge re-validates everything: schema, ownership, limits, state, risk.
- I5 Tool outputs and bank data fields are untrusted; a payee or amount can never come from them.
- I6 The confirmation screen renders only from the Bridge's prepared object.
- I7 Critical arguments pass deterministic provenance checks.
- I8 The agent never says an action is complete before the Bridge returns a verified postcondition.
- I9 When uncertain the agent asks or hands off; it never guesses a payee or amount.
- I10 Every step goes to an append-only audit log with a trace ID. Raw audio is never stored.
- I11 Per-capability kill switch, enforced in the Bridge.
- I12 No fabricated metric in the UI; simulated or assumed numbers are labelled.
- I13 Secrets never appear in client bundles, logs, docs or git history.

## Separation

Agent, Bridge and Core Bank are separate processes with separate ports and env vars. The agent has no database access, no Core Bank URL and no import from `services/bridge` or `services/core-bank`; a test enforces this.

## Commits

Small commits, plain-prose messages that explain why. Push to `main` at each milestone.
