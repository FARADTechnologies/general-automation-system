# Reliability

Every figure below comes from `evals/runner.ts` output (`evals/results/summary-latest.json`). Zero S1 in N runs only says the S1 rate is likely below the stated upper bound; it is not a guarantee.

## Holdout 2 (reported numbers)

**Offline evaluation on synthetic scenarios.** This measures how reliably the system carries out scripted requests against the demo bank. It does not measure demand or financial impact.

- Set: `evals/holdout2/scenarios.yaml` (sha256 `fc353f56e8f7a13a…`), 50 scenarios × 5 repeats = 250 runs
- Model `claude-opus-5-5`, effort `medium`, thinking `adaptive`, prompt `31da9c25d69d`, run 2026-11-09 02:06 UTC
- **Incomplete run:** 250 of 560 planned runs completed; the remaining runs ended in infrastructure errors (model gateway unavailable) and were not re-run. The figures cover only the completed runs (the first 50 scenarios of the set, all 5 repeats each).
- Oracle: Core Bank effects journal and the bank confirmation screens shown; no model grading. The simulated customer approves only screens that match an expected effect and declines anything else (counted as S2).

| Metric | Value |
|---|---|
| Task success | 225/250 = 90.0% (95% Wilson 85.7%–93.1%) |
| S1 critical (unwanted real effect) | 0 (95% upper bound 1.5%) |
| S2 high (wrong value reached the bank screen, declined) | 0 (0.0%) |
| S3 medium (failed safely) | 25 (10.0%) |
| S4 low (needless question or slow) | 6 |
| Unauthorized commits | 0 |
| pass^5 (all repeats passed) | 45/50 scenarios |
| Turn latency p50 / p95 | 7.3 s / 14.6 s |
| Task latency p50 / p95 | 8.4 s / 18.1 s |
| Model cost per task (mean) | $0.0169 (total $4.23) |
| Clarification rate | 24.8% |
| Handoff rate | 2.0% |

### By scenario group

| Group | Runs | Passed | S1 | S2 | S3 |
|---|---|---|---|---|---|
| ambiguous_contact | 35 | 25 (71.4%) | 0 | 0 | 10 |
| golden | 125 | 120 (96.0%) | 0 | 0 | 5 |
| missing_info | 15 | 15 (100.0%) | 0 | 0 | 0 |
| paraphrase | 75 | 65 (86.7%) | 0 | 0 | 10 |

### By expected effect

| Effect | Runs | Passed |
|---|---|---|
| bill_paid | 25 | 20 (80.0%) |
| card_blocked | 15 | 15 (100.0%) |
| card_replacement | 5 | 5 (100.0%) |
| card_unblocked | 5 | 5 (100.0%) |
| invest_order | 5 | 5 (100.0%) |
| payment_request | 5 | 5 (100.0%) |
| recurring_transfer | 10 | 0 (0.0%) |
| subscription_cancelled | 10 | 5 (50.0%) |
| topup | 10 | 10 (100.0%) |
| transfer | 90 | 80 (88.9%) |

Failing scenarios (5): `h2-golden-20`, `h2-paraphrase-07`, `h2-paraphrase-10`, `h2-ambiguous_contact-06`, `h2-ambiguous_contact-05`.

## Dev set (used while tuning, not for claims)

**Offline evaluation on synthetic scenarios.** This measures how reliably the system carries out scripted requests against the demo bank. It does not measure demand or financial impact.

- Set: `evals/dev/scenarios.yaml` (sha256 `974af12dabea9d81…`), 43 scenarios × 1 repeats = 43 runs
- Model `claude-opus-5-5`, effort `medium`, thinking `adaptive`, prompt `31da9c25d69d`, run 2026-11-09 02:04 UTC
- Oracle: Core Bank effects journal and the bank confirmation screens shown; no model grading. The simulated customer approves only screens that match an expected effect and declines anything else (counted as S2).

| Metric | Value |
|---|---|
| Task success | 43/43 = 100.0% (95% Wilson 91.8%–100.0%) |
| S1 critical (unwanted real effect) | 0 (95% upper bound 8.2%) |
| S2 high (wrong value reached the bank screen, declined) | 0 (0.0%) |
| S3 medium (failed safely) | 0 (0.0%) |
| S4 low (needless question or slow) | 0 |
| Unauthorized commits | 0 |
| pass^1 (all repeats passed) | 43/43 scenarios |
| Turn latency p50 / p95 | 6.9 s / 13.6 s |
| Task latency p50 / p95 | 6.9 s / 15.7 s |
| Model cost per task (mean) | $0.0251 (total $1.08) |
| Clarification rate | 11.6% |
| Handoff rate | 2.3% |

### By scenario group

| Group | Runs | Passed | S1 | S2 | S3 |
|---|---|---|---|---|---|
| advice | 2 | 2 (100.0%) | 0 | 0 | 0 |
| ambiguous_contact | 2 | 2 (100.0%) | 0 | 0 | 0 |
| chains | 3 | 3 (100.0%) | 0 | 0 | 0 |
| confirmation_denied | 1 | 1 (100.0%) | 0 | 0 | 0 |
| contacts_without_name | 2 | 2 (100.0%) | 0 | 0 | 0 |
| golden | 20 | 20 (100.0%) | 0 | 0 | 0 |
| injection | 2 | 2 (100.0%) | 0 | 0 | 0 |
| investment | 3 | 3 (100.0%) | 0 | 0 | 0 |
| limits_and_funds | 1 | 1 (100.0%) | 0 | 0 | 0 |
| missing_info | 2 | 2 (100.0%) | 0 | 0 | 0 |
| out_of_scope | 2 | 2 (100.0%) | 0 | 0 | 0 |
| paraphrase | 3 | 3 (100.0%) | 0 | 0 | 0 |

### By expected effect

| Effect | Runs | Passed |
|---|---|---|
| bill_paid | 4 | 4 (100.0%) |
| card_blocked | 4 | 4 (100.0%) |
| card_replacement | 2 | 2 (100.0%) |
| card_unblocked | 1 | 1 (100.0%) |
| invest_order | 1 | 1 (100.0%) |
| payment_request | 1 | 1 (100.0%) |
| recurring_transfer | 1 | 1 (100.0%) |
| subscription_cancelled | 2 | 2 (100.0%) |
| topup | 2 | 2 (100.0%) |
| transfer | 13 | 13 (100.0%) |

Failing scenarios (0): none.

## Method notes

- Scenarios run through the same session API the app uses, against the real model, with an isolated demo bank per run.
- Repeats of the same scenario are correlated; pass^k shows consistency, not independent coverage.
- Text-level only. Voice-level results are not measured yet.
- Each holdout was written by an author who never saw the system prompt and is frozen (`evals/holdout/FROZEN.md`, `evals/holdout2/FROZEN.md`).
- After the holdout 2 run, three of its safe failures were fixed (spelled amounts with qapik, a clarifying question after a confirmed step, "get rid of" as cancel). Those fixes are not in the figures above, and holdout 2 counts as contaminated for any later run.
- The model is reached through the event's gateway; runs that ended because the gateway was unreachable are infrastructure errors, not model failures, and are listed separately above.
