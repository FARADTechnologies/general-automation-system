# Capability Matrix

Status meanings:
- `tested`: the Bridge path passes automated tests (`tests/bridge.*.test.ts`, `tests/console.test.ts`), and the capability passed end to end through the agent, either in scripted runs without a model (`tests/agent.guards.test.ts`) or with a model in the offline evaluation.
- `implemented (bridge tested)`: the Bridge path is proven without a model; no model evaluation yet.
- `implemented`: code exists, no automated proof.

Only `tested` rows may be claimed in the pitch.

**Holdout #2** (reported): Claude Opus 5.5 through the event gateway, 2026-11-09, offline evaluation on synthetic scenarios. Only 250 of 560 planned runs completed (the first 50 scenarios × 5 repeats) before the gateway went down; groups covered are golden, paraphrase, ambiguous contact and missing information. See `docs/RELIABILITY.md`. "-" means the capability was not in the completed part.

**Holdout #1** (coverage only): Claude Sonnet 5.5, 110 scenarios × 5 repeats, 2026-11-08. That set was later used for tuning and is contaminated (`evals/holdout/FROZEN.md`).

Counts are per expected bank effect; a chain scenario counts once for each effect it contains, and a failed chain counts as failed for every effect in it.

| Priority | UI screen | Capability ID | Tier | Status | Holdout #2 (Opus, partial) | Holdout #1 (Sonnet, contaminated) |
|---|---|---|---|---|---|---|
| V0 | Home | `accounts.list` | R0 | tested | read-only | read-only |
| V0 | History | `transactions.search` | R0 | tested | - | injection group 35/35 |
| V0 | Transfers | `contacts.search` | R0 | tested | ambiguous contact 25/35 | ambiguous contact 35/35 |
| V0 | Transfer to contact | `transfer.contact.prepare` | R3 | tested | transfers 80/90 (all kinds) | transfers 110/125 (all kinds) |
| V0 | Card detail | `card.block.prepare` | R2 | tested | 15/15 | 30/30 |
| V0 | Pay biller | `bill.pay.prepare` | R3 | tested | bills 20/25 (single and batch) | bills 45/45 |
| V0 | Payments | `bills.list_unpaid` | R0 | tested | read-only | read-only |
| V0 | Cards | `cards.list` | R0 | tested | read-only | read-only |
| P0 | Own accounts | `transfer.own.prepare` | R3 | tested | in transfers 80/90 | in transfers 110/125 |
| P0 | By phone | `transfer.phone.prepare` | R3 | tested | in transfers 80/90 | in transfers 110/125 |
| P0 | By card | `transfer.card.prepare` | R3 | tested | in transfers 80/90 | in transfers 110/125 |
| P0 | Template | `templates.list`, `transfer.template.prepare` | R0 / R3 | tested | in transfers 80/90 | in transfers 110/125 |
| P0 | Card detail | `card.unblock.prepare` | R3 | tested | 5/5 | 5/5 |
| P0 | Top up | `topup.mobile.prepare`, `topup.own.prepare` | R3 | tested | 10/10 | 25/25 |
| P0 | any | `app.open_screen` (runtime tool) | R0 | tested | - | read-only |
| P1 | Analytics | `analytics.spend_by_category`, `analytics.compare_periods`, `analytics.top_expenses`, `analytics.income_sources` | R0 | tested | read-only | read-only; answer lint checks every amount |
| P1 | Subscriptions | `subscriptions.list`, `subscription.cancel.prepare` | R0 / R2 | tested | 5/10 ("get rid of" not read as cancel; fixed after the run) | 25/25 |
| P1 | Bills | `bills.pay_all.prepare` | R3 | tested | in bills 20/25 | in bills 45/45 |
| P1 | Replace card | `branches.list`, `card.replace.prepare` | R0 / R2 | tested | 5/5 | 20/20 |
| P1 | Recurring | `transfer.recurring.prepare` | R3 | tested (no start date) | 0/10 (both asked for a later start date, which the capability does not support; the assistant said so and asked) | 25/25 |
| P1 | Split | `split.calculate`, `payment.request.prepare` | R0 / R2 | tested | 5/5 | 25/25 |
| P1 | Support | `kb.search` (BM25 over `domains/bank/kb`) | R0 | tested | - | read-only |
| P1 | any | `handoff.create` (runtime tool, record built from the ledger) | R0 | tested | handoff rate 2.0% | handoff rate 1.8% |
| P1 | any | chained requests (several capabilities in one sentence) | - | tested | - (dev set 43/43 includes chains; demo chain recorded live) | chains group 50/50 |
| P2 | Invest | `market.screen`, `market.quote`, `portfolio.get` | R0 | tested | in invest order 5/5 | not in holdout #1; dev set passes on Opus |
| P2 | Invest order | `invest.order.prepare` | R3 | tested | 5/5 | not in holdout #1 |
| P2 | FX (optional pack) | `fx.rates` | R0 | tested | - | switched on live from the console (`tests/console.test.ts`) |
| P2 | Budget, statements, card limits | `budget.*`, `statement.get`, `card.limit.prepare` | R0-R3 | none | - | - |

Local (agent-side, not bank capabilities): `task_plan`.

Voice input: server speech-to-text (Scribe v2, fallback Groq Whisper) is `implemented` with adapter tests (`tests/stt.test.ts`) and a live check on the deployment; browser speech is the fallback. Speech accuracy figures come from the team's separate bake-off, not from this repository.
