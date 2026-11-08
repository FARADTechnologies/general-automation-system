# Holdout set (frozen)

Written on 2026-11-08 by an author who had not seen the system prompt or agent code, from a product and data description only.

- File: `scenarios.yaml`
- SHA-256: `6ac0b07845966787440ff875638ac8ff5585bf9f28e87339442361e8ac504643`
- Status: frozen. Used only for reported numbers. Any change to the prompt or guards made after reading a holdout failure must be recorded here and the set marked contaminated.

## Contamination log

- 2026-11-08 23:50 CONTAMINATED. After the first run (530/550), the four failing scenarios were read. Two exposed a real defect in the intent guard (typo "trasnfer", and a verbless request "To Nigar Ismayilova, 70 manat"), which was then fixed. Numbers from this set after that change are no longer clean holdout numbers. Reported numbers move to `evals/holdout2`, written blind by a different author.
