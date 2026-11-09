# Reliability

Every figure below comes from `evals/runner.ts` output (`evals/results/summary-latest.json`). Zero S1 in N runs only says the S1 rate is likely below the stated upper bound; it is not a guarantee.

## Holdout 2 (reported numbers)

**Offline evaluation on synthetic scenarios.** This measures how reliably the system carries out scripted requests against the demo bank. It does not measure demand or financial impact.

- Set: `evals/holdout2/scenarios.yaml` (sha256 `fc353f56e8f7a13a…`), 112 scenarios × 5 repeats = 560 runs
- Model `claude-opus-5-5`, effort `medium`, thinking `adaptive`, prompt `31da9c25d69d`, run 2026-11-09 02:06 UTC
- 310 runs that had ended in an infrastructure error (the event's model gateway was unreachable) were re-run later with the same code, prompt and model; no other run was repeated, and model failures were never re-run.
- Oracle: Core Bank effects journal and the bank confirmation screens shown; no model grading. The simulated customer approves only screens that match an expected effect and declines anything else (counted as S2).

| Metric | Value |
|---|---|
| Task success | 520/560 = 92.9% (95% Wilson 90.4%–94.7%) |
| S1 critical (unwanted real effect) | 0 (95% upper bound 0.7%) |
| S2 high (wrong value reached the bank screen, declined) | 0 (0.0%) |
| S3 medium (failed safely) | 40 (7.1%) |
| S4 low (needless question or slow) | 30 |
| Unauthorized commits | 0 |
| pass^5 (all repeats passed) | 104/112 scenarios |
| Turn latency p50 / p95 | 7.0 s / 19.1 s |
| Task latency p50 / p95 | 8.7 s / 20.9 s |
| Model cost per task (mean) | $0.0181 (total $10.15) |
| Clarification rate | 23.4% |
| Handoff rate | 1.8% |

### By scenario group

| Group | Runs | Passed | S1 | S2 | S3 |
|---|---|---|---|---|---|
| advice | 20 | 20 (100.0%) | 0 | 0 | 0 |
| ambiguous_contact | 35 | 25 (71.4%) | 0 | 0 | 10 |
| chains | 50 | 40 (80.0%) | 0 | 0 | 10 |
| confirmation_denied | 30 | 30 (100.0%) | 0 | 0 | 0 |
| golden | 125 | 120 (96.0%) | 0 | 0 | 5 |
| injection | 35 | 35 (100.0%) | 0 | 0 | 0 |
| investment | 35 | 35 (100.0%) | 0 | 0 | 0 |
| limits_and_funds | 35 | 35 (100.0%) | 0 | 0 | 0 |
| missing_info | 50 | 45 (90.0%) | 0 | 0 | 5 |
| out_of_scope | 40 | 40 (100.0%) | 0 | 0 | 0 |
| paraphrase | 75 | 65 (86.7%) | 0 | 0 | 10 |
| typed_numbers | 30 | 30 (100.0%) | 0 | 0 | 0 |

### By expected effect

| Effect | Runs | Passed |
|---|---|---|
| bill_paid | 55 | 45 (81.8%) |
| card_blocked | 25 | 25 (100.0%) |
| card_replacement | 15 | 15 (100.0%) |
| card_unblocked | 5 | 5 (100.0%) |
| invest_order | 20 | 20 (100.0%) |
| payment_request | 10 | 10 (100.0%) |
| recurring_transfer | 20 | 0 (0.0%) |
| subscription_cancelled | 15 | 10 (66.7%) |
| topup | 30 | 25 (83.3%) |
| transfer | 130 | 115 (88.5%) |

Failing scenarios (8): `h2-golden-20`, `h2-paraphrase-07`, `h2-paraphrase-10`, `h2-ambiguous_contact-06`, `h2-ambiguous_contact-05`, `h2-missing_info-10`, `h2-chains-03`, `h2-chains-09`.

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
