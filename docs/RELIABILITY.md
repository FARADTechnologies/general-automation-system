# Reliability

Every figure below comes from `evals/runner.ts` output (`evals/results/summary-latest.json`). Zero S1 in N runs only says the S1 rate is likely below the stated upper bound; it is not a guarantee.

## Holdout (reported numbers)

**Offline evaluation on synthetic scenarios.** This measures how reliably the system carries out scripted requests against the demo bank. It does not measure demand or financial impact.

- Set: `evals/holdout/scenarios.yaml` (sha256 `6ac0b07845966787…`), 110 scenarios × 5 repeats = 550 runs
- Model `claude-sonnet-5-5`, effort `medium`, thinking `between_tools`, prompt `31da9c25d69d`, run 2026-11-08 17:36 UTC
- Oracle: Core Bank effects journal and the bank confirmation screens shown; no model grading. The simulated customer approves only screens that match an expected effect and declines anything else (counted as S2).

| Metric | Value |
|---|---|
| Task success | 530/550 = 96.4% (95% Wilson 94.5%–97.6%) |
| S1 critical (unwanted real effect) | 0 (95% upper bound 0.7%) |
| S2 high (wrong value reached the bank screen, declined) | 0 (0.0%) |
| S3 medium (failed safely) | 20 (3.6%) |
| S4 low (needless question or slow) | 7 |
| Unauthorized commits | 0 |
| pass^5 (all repeats passed) | 106/110 scenarios |
| Turn latency p50 / p95 | 4.4 s / 9.0 s |
| Task latency p50 / p95 | 5.4 s / 9.6 s |
| Model cost per task (mean) | $0.0090 (total $4.93) |
| Clarification rate | 28.2% |
| Handoff rate | 1.8% |

### By scenario group

| Group | Runs | Passed | S1 | S2 | S3 |
|---|---|---|---|---|---|
| advice | 20 | 20 (100.0%) | 0 | 0 | 0 |
| ambiguous_contact | 35 | 35 (100.0%) | 0 | 0 | 0 |
| chains | 50 | 50 (100.0%) | 0 | 0 | 0 |
| confirmation_denied | 35 | 35 (100.0%) | 0 | 0 | 0 |
| contacts_without_name | 35 | 35 (100.0%) | 0 | 0 | 0 |
| golden | 145 | 135 (93.1%) | 0 | 0 | 10 |
| injection | 35 | 35 (100.0%) | 0 | 0 | 0 |
| limits_and_funds | 25 | 25 (100.0%) | 0 | 0 | 0 |
| missing_info | 50 | 50 (100.0%) | 0 | 0 | 0 |
| out_of_scope | 40 | 40 (100.0%) | 0 | 0 | 0 |
| paraphrase | 80 | 70 (87.5%) | 0 | 0 | 10 |

### By expected effect

| Effect | Runs | Passed |
|---|---|---|
| bill_paid | 45 | 45 (100.0%) |
| card_blocked | 30 | 30 (100.0%) |
| card_replacement | 20 | 20 (100.0%) |
| card_unblocked | 5 | 5 (100.0%) |
| invest_order | 5 | 0 (0.0%) |
| payment_request | 25 | 25 (100.0%) |
| recurring_transfer | 25 | 25 (100.0%) |
| subscription_cancelled | 25 | 25 (100.0%) |
| topup | 25 | 25 (100.0%) |
| transfer | 125 | 110 (88.0%) |

Failing scenarios (4): `holdout-golden-07`, `holdout-golden-29`, `holdout-paraphrase-10`, `holdout-paraphrase-14`.

## Dev set (used while tuning, not for claims)

**Offline evaluation on synthetic scenarios.** This measures how reliably the system carries out scripted requests against the demo bank. It does not measure demand or financial impact.

- Set: `evals/dev/scenarios.yaml` (sha256 `876c10f8a65eeda1…`), 37 scenarios × 1 repeats = 37 runs
- Model `claude-sonnet-5-5`, effort `medium`, thinking `between_tools`, prompt `31da9c25d69d`, run 2026-11-08 17:33 UTC
- Oracle: Core Bank effects journal and the bank confirmation screens shown; no model grading. The simulated customer approves only screens that match an expected effect and declines anything else (counted as S2).

| Metric | Value |
|---|---|
| Task success | 36/37 = 97.3% (95% Wilson 86.2%–99.5%) |
| S1 critical (unwanted real effect) | 0 (95% upper bound 9.4%) |
| S2 high (wrong value reached the bank screen, declined) | 0 (0.0%) |
| S3 medium (failed safely) | 1 (2.7%) |
| S4 low (needless question or slow) | 0 |
| Unauthorized commits | 0 |
| pass^1 (all repeats passed) | 36/37 scenarios |
| Turn latency p50 / p95 | 5.7 s / 16.0 s |
| Task latency p50 / p95 | 5.9 s / 17.0 s |
| Model cost per task (mean) | $0.0125 (total $0.46) |
| Clarification rate | 18.9% |
| Handoff rate | 2.7% |

### By scenario group

| Group | Runs | Passed | S1 | S2 | S3 |
|---|---|---|---|---|---|
| advice | 1 | 1 (100.0%) | 0 | 0 | 0 |
| ambiguous_contact | 2 | 2 (100.0%) | 0 | 0 | 0 |
| chains | 3 | 3 (100.0%) | 0 | 0 | 0 |
| confirmation_denied | 1 | 1 (100.0%) | 0 | 0 | 0 |
| contacts_without_name | 2 | 2 (100.0%) | 0 | 0 | 0 |
| golden | 20 | 19 (95.0%) | 0 | 0 | 1 |
| injection | 2 | 2 (100.0%) | 0 | 0 | 0 |
| limits_and_funds | 1 | 1 (100.0%) | 0 | 0 | 0 |
| missing_info | 2 | 2 (100.0%) | 0 | 0 | 0 |
| out_of_scope | 2 | 2 (100.0%) | 0 | 0 | 0 |
| paraphrase | 1 | 1 (100.0%) | 0 | 0 | 0 |

### By expected effect

| Effect | Runs | Passed |
|---|---|---|
| bill_paid | 4 | 4 (100.0%) |
| card_blocked | 4 | 4 (100.0%) |
| card_replacement | 2 | 1 (50.0%) |
| card_unblocked | 1 | 1 (100.0%) |
| payment_request | 1 | 1 (100.0%) |
| recurring_transfer | 1 | 1 (100.0%) |
| subscription_cancelled | 2 | 2 (100.0%) |
| topup | 2 | 2 (100.0%) |
| transfer | 11 | 11 (100.0%) |

Failing scenarios (1): `dev-replace`.

## Method notes

- Scenarios run through the same session API the app uses, against the real model, with an isolated demo bank per run.
- Repeats of the same scenario are correlated; pass^k shows consistency, not independent coverage.
- Text-level only. Voice-level results are not measured yet.
- The holdout was written by an author who never saw the system prompt and is frozen (`evals/holdout/FROZEN.md`).
