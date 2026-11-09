# Pitch facts

Every claim used in the pitch, its value, where it comes from, and whether it is **measured** (by us, reproducible), **published** (third-party source), or **assumed** (input to a model, not a fact). Anything not in this table is not said on stage.

## Product evidence (measured)

| Claim | Value | Source | Type |
|---|---|---|---|
| Invariant tests passing | 84 tests passing, no model involved (2026-11-09) | `pnpm test` | measured |
| Holdout task success | 225/250 = 90.0% (95% CI 85.7–93.1%), Claude Opus 5.5, blind set; only 250 of 560 planned runs completed before the model gateway went down | `docs/RELIABILITY.md`, `evals/results/summary-latest.json` | measured, offline, synthetic, partial run |
| Critical errors (S1) on holdout | 0 in 250 runs (rate likely below 1.5%); wrong values on the bank screen (S2): 0 | same | measured, offline, synthetic |
| Unauthorized commits | 0 in the evaluation; also blocked by design (direct guard tests without a model) | same + `tests/` | measured |
| Assistant turn latency | p50 7.3 s, p95 14.6 s per turn (holdout 2, Opus 5.5 through the event gateway) | `docs/RELIABILITY.md` | measured |
| Model cost per completed task | $0.017 mean at Anthropic list prices for Opus 5.5 (holdout 2); the event covered actual usage | `docs/RELIABILITY.md` | measured tokens × published list price |
| Capabilities live | see `docs/CAPABILITY_MATRIX.md` | matrix | measured (tested rows only) |
| Speech-to-text latency, deployed | 538 ms for one push-to-talk command (ElevenLabs Scribe v2, single run on 2026-11-09) | agent STT trace | measured, single run |
| New capability without code change | demonstrated: `fx.rates` switched on from the console, works on next turn | `tests/console.test.ts` | measured |

## Manual versus assistant (to measure)

| Claim | Value | Source | Type |
|---|---|---|---|
| Taps and time to block a lost card and order a replacement manually in a real bank app | pending | tester's `manual_baseline.md` | measured (pending) |
| Same task with the assistant | one sentence + 2 taps; time from eval | `evals/demo` | measured |
| Designer prototype: paying a traffic fine manually | 5 taps vs 1 sentence + 2 taps | designer landing brief (`import/design-with-dashboard`) | measured on the prototype, not on our app; do not use unless re-measured |

## Market (published, sources to be filled by the team)

| Claim | Value | Source | Type |
|---|---|---|---|
| ABB assistant features (transfers by contact, card or template; card block/reactivate; mobile top-up; income/expense analysis; subscriptions) | as listed | ABB public pages (URL to add) | published |
| Competitors | interface.ai, Bank of America Erica, Revolut AIR, Nymbus MCP server, Danske Bank MCP pilot | public announcements (URLs to add) | published |

## Business model (assumed until a bank gives inputs)

Value per year = request volume × routine share × automation rate × (human cost per request − AI cost per request).

| Input | Value | Type |
|---|---|---|
| AI cost per request | measured model cost per task (above) plus hosting | measured + assumed |
| Request volume, routine share, human cost | to be provided by a bank | assumed |
| Pricing hypothesis | platform fee plus a fee per resolved action | assumed (captain to update after judge conversations) |

Business KPIs to frame (not measured here): self-service completion rate, cost per resolved request, handle time, handoff rate.
