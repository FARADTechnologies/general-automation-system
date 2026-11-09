# Holdout 2 (frozen, reported set)

Written on 2026-11-09 by an author who never saw the system prompt, the agent code or any other scenario file, from a product and data description only. This set replaces `evals/holdout` (contaminated, see its FROZEN.md) for reported numbers.

- File: `scenarios.yaml` (112 scenarios)
- SHA-256: `fc353f56e8f7a13a4d2eddecb13fadad088bb59dd39f3efea293f7edd73ad563`
- Status: frozen. Not read while tuning. Any change made after reading a failure here must be logged below and the set marked contaminated.

## Contamination log

- 2026-11-09: first run on Claude Opus 5.5. 250 of 560 runs completed before the model gateway went down; the other 310 were re-run later from the same commit (c494c11) once the gateway was back, so all 560 ran on the same code, prompt and model. After reading the failures of the first 250, three fixes were made: spelled amounts with qapik, keeping the task open when a clarifying question follows a confirmed step, and "get rid of" as a cancel request. The published figures come from that first run, before the fixes. Any later run on this set is contaminated for those three behaviours and must say so.
