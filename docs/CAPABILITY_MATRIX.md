# Capability Matrix

Status meanings:
- `tested`: the Bridge path passes automated tests (`tests/bridge.*.test.ts`, `tests/console.test.ts`), and the capability passed end to end through the agent, either in scripted runs without a model (`tests/agent.guards.test.ts`) or with a model in the offline evaluation.
- `implemented (bridge tested)`: the Bridge path is proven without a model; no model evaluation yet.
- `implemented`: code exists, no automated proof.

Only `tested` rows may be claimed in the pitch.

**Holdout #2** (reported): Claude Opus 5.5 through the event gateway, 2026-11-09, 112 scenarios × 5 repeats = 560 runs, offline evaluation on synthetic scenarios; 520/560 passed, no S1 or S2. See `docs/RELIABILITY.md`. "-" means no holdout 2 scenario expected that effect.

**Holdout #1** (coverage only): Claude Sonnet 5.5, 110 scenarios × 5 repeats, 2026-11-08. That set was later used for tuning and is contaminated (`evals/holdout/FROZEN.md`).

Counts are per expected bank effect; a chain scenario counts once for each effect it contains, and a failed chain counts as failed for every effect in it.

| Priority | UI screen | Capability ID | Tier | Status | Holdout #2 (Opus) | Holdout #1 (Sonnet, contaminated) |
|---|---|---|---|---|---|---|
| V0 | Home | `accounts.list` | R0 | tested | read-only | read-only |
| V0 | History | `transactions.search` | R0 | tested | injection group 35/35 | injection group 35/35 |
| V0 | Transfers | `contacts.search` | R0 | tested | ambiguous contact 25/35 | ambiguous contact 35/35 |
| V0 | Transfer to contact | `transfer.contact.prepare` | R3 | tested | transfers 115/130 (all kinds) | transfers 110/125 (all kinds) |
| V0 | Card detail | `card.block.prepare` | R2 | tested | 25/25 | 30/30 |
| V0 | Pay biller | `bill.pay.prepare` | R3 | tested | bills 45/55 (single and batch) | bills 45/45 |
| V0 | Payments | `bills.list_unpaid` | R0 | tested | read-only | read-only |
| V0 | Cards | `cards.list` | R0 | tested | read-only | read-only |
| P0 | Own accounts | `transfer.own.prepare` | R3 | tested | in transfers 115/130 | in transfers 110/125 |
| P0 | By phone | `transfer.phone.prepare` | R3 | tested | in transfers 115/130 | in transfers 110/125 |
| P0 | By card | `transfer.card.prepare` | R3 | tested | in transfers 115/130 | in transfers 110/125 |
| P0 | Template | `templates.list`, `transfer.template.prepare` | R0 / R3 | tested | in transfers 115/130 | in transfers 110/125 |
| P0 | Card detail | `card.unblock.prepare` | R3 | tested | 5/5 | 5/5 |
| P0 | Top up | `topup.mobile.prepare`, `topup.own.prepare` | R3 | tested | 25/30 | 25/25 |
| P0 | any | `app.open_screen` (runtime tool) | R0 | tested | - | read-only |
| P1 | Analytics | `analytics.spend_by_category`, `analytics.compare_periods`, `analytics.top_expenses`, `analytics.income_sources` | R0 | tested | read-only | read-only; answer lint checks every amount |
| P1 | Subscriptions | `subscriptions.list`, `subscription.cancel.prepare` | R0 / R2 | tested | 10/15 ("get rid of" not read as cancel; fixed after the run) | 25/25 |
| P1 | Bills | `bills.pay_all.prepare` | R3 | tested | in bills 45/55 | in bills 45/45 |
| P1 | Replace card | `branches.list`, `card.replace.prepare` | R0 / R2 | tested | 15/15 | 20/20 |
| P1 | Recurring | `transfer.recurring.prepare` (start weekday, day and month added after holdout 2; dev scenarios pass) | R3 | tested | 0/20 (every scenario asked for a start date or weekday, which the capability did not support at the time; the assistant said so and asked) | 25/25 |
| P1 | Split | `split.calculate`, `payment.request.prepare` | R0 / R2 | tested | 10/10 | 25/25 |
| P1 | Support | `kb.search` (BM25 over `domains/bank/kb`) | R0 | tested | - | read-only |
| P1 | any | `handoff.create` (runtime tool, record built from the ledger) | R0 | tested | handoff rate 1.8% | handoff rate 1.8% |
| P1 | any | chained requests (several capabilities in one sentence) | - | tested | chains group 40/50 | chains group 50/50 |
| P2 | Invest | `market.screen`, `market.quote`, `portfolio.get` | R0 | tested | in invest order 20/20 | not in holdout #1; dev set passes on Opus |
| P2 | Invest order | `invest.order.prepare` | R3 | tested | 20/20 | not in holdout #1 |
| P2 | FX (optional pack) | `fx.rates` | R0 | tested | - | switched on live from the console (`tests/console.test.ts`) |
| P1 | International transfer | `transfer.intl.prepare` (IBAN as a vault token, BIC checked, fee 0.2% min 15) | R3 | tested | - (added after holdout 2; Bridge tests and live model run) | - |
| P1 | Exchange | `fx.exchange.prepare` (bank buy/sell rate, amount on either side) | R3 | tested | - (added after holdout 2; Bridge tests and live model run) | - |
| P2 | Card settings | `card.settings.prepare` (online, contactless, abroad), `card.limit.prepare` (purchase, cash, online) | R3 | tested | - (Bridge tests and live model run) | - |
| P2 | New card | `card.new.prepare` (virtual at once, physical to a branch) | R2 | tested | - (Bridge tests and live model run) | - |
| P2 | Deposits | `deposits.list`, `deposit.open.prepare` (bank rates and terms) | R0 / R3 | tested | - (Bridge tests and live model run) | - |
| P2 | Loans | `loan.apply.prepare` (application only, bank prices and decides) | R2 | tested | - (Bridge tests and live model run) | - |
| P2 | Budget, statements | `budget.*`, `statement.get` | R0 | none | - | - |

Local (agent-side, not bank capabilities): `task_plan`.

Voice input: server speech-to-text (Scribe v2, fallback Groq Whisper) is `implemented` with adapter tests (`tests/stt.test.ts`) and a live check on the deployment; browser speech is the fallback. Speech accuracy figures come from the team's separate bake-off, not from this repository.
