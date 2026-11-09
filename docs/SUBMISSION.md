# Submission text

Ready to paste into the submission form. Numbers are filled in only from `docs/RELIABILITY.md` and `docs/PITCH_FACTS.md`.

## Name

Action layer for bank apps

## One line

An AI layer that does the work inside a bank's existing mobile app. The customer says one sentence, the assistant walks the real screens and chains the features. It stops at the bank's own confirmation screen, and the bank never shares its source code.

## Problem

Banking apps have many features and are slow to use, and many people find typing hard. In-app chatbots mostly answer in text, and then the customer still does every step by hand. The friction sits between the steps: finding the screen, re-entering data, not knowing the status. Banks hesitate to let an AI act for customers because they need hard guarantees: no money moves without the customer, no customer data leaks to the model, and every step is auditable.

## Solution

- **The customer** speaks or types one request, for example *"I lost my debit card, block it and send a replacement to the Quba branch"*. The app screens then fill themselves, live on the phone and on any mirrored screen. Each critical step stops at the bank's own confirmation screen.
- **The bank** installs a Bridge inside its own environment and exposes only the capabilities it chooses, as manifests over the internal APIs it already has. The model sees only tokens and masked values. Tools can only *prepare* an action, never commit it. The commit needs a one-time, 120-second confirmation bound to the exact payload, sent from the bank's screen straight to the Bridge.
- **Deterministic guards** check every tool call: intent, the provenance of the payee and the amount, schema, risk tier and limits. Bank data such as memos is untrusted, so a prompt injection in a transaction memo cannot trigger anything.
- **The bank console** shows live sessions and an append-only audit log, plus kill switches per capability, limits, and a human handoff queue with full context. A new capability can be switched on without a deploy.

## What is real

- **Built and running:** the agent, the guards, the Bridge with MCP, the confirmation flow, the audit log and the console, phone-to-projector mirroring, and speech-to-text.
- **Mocked:** the core bank (a fictional bank with deliberately internal API names), the fingerprint step, and market data (labelled "Simulated").
- **Described as production work, not built:** delegated short-lived tokens, CIBA approval and on-premises deployment.

## Evidence

- Invariant tests run without any model: `pnpm test`.
- Reliability on a blind, frozen set of synthetic scenarios with a deterministic oracle (no model grading): see `docs/RELIABILITY.md`.
- Every capability and its test status: `docs/CAPABILITY_MATRIX.md`.

## Links

- Live demo: https://app-production-7364.up.railway.app/app (phone) · `/stage` (projector) · `/console` (bank)
- Architecture: `docs/architecture.png`
