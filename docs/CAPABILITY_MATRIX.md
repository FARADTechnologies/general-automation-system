# Capability Matrix

Status: `none` (not built), `implemented` (code exists, not proven), `tested` (passes automated tests). Only `tested` rows may be claimed in the pitch.
Pass counts come from `evals/` runs and are filled in from M6.
V0 `tested` means: the Bridge path passes `tests/bridge.invariants.test.ts`, the agent path passes the scripted runs in `tests/agent.guards.test.ts`, and a live model run (`LIVE=1 tests/agent.live.test.ts`, 5 scenarios) passed on 2026-11-08. These are single runs, not reliability numbers; those come from the M6 evaluation.

| Priority | UI screen | Capability ID | Tier | Status | Eval pass |
|---|---|---|---|---|---|
| V0 | Home | `accounts.list` | R0 | tested | - |
| V0 | History | `transactions.search` | R0 | tested | - |
| V0 | Transfers | `contacts.search` | R0 | tested | - |
| V0 | Transfer to contact | `transfer.contact.prepare` | R3 | tested | - |
| V0 | Card detail | `card.block.prepare` | R2 | tested | - |
| V0 | Pay biller | `bill.pay.prepare` | R3 | tested | - |
| V0 | Payments | `bills.list_unpaid` | R0 | tested | - |
| V0 | Cards | `cards.list` | R0 | tested | - |
| P0 | Own accounts | `transfer.own.prepare` | R3 | none | - |
| P0 | By phone | `transfer.phone.prepare` | R3 | none | - |
| P0 | By card | `transfer.card.prepare` | R3 | none | - |
| P0 | Template | `templates.list`, `transfer.template.prepare` | R0 / R3 | none | - |
| P0 | Card detail | `card.unblock.prepare` | R3 | none | - |
| P0 | Pay biller | `topup.mobile.prepare` | R3 | none | - |
| P0 | any | `app.open_screen` | R0 | none | - |
| P1 | Analytics | `analytics.spend_by_category`, `analytics.compare_periods`, `analytics.top_expenses`, `analytics.income_sources` | R0 | none | - |
| P1 | Subscriptions | `subscriptions.list`, `subscription.cancel.prepare` | R0 / R2 | none | - |
| P1 | Bills | `bills.pay_all.prepare` | R3 | none | - |
| P1 | Replace card | `branches.list`, `card.replace.prepare` | R0 / R2 | none | - |
| P1 | Recurring | `transfer.recurring.prepare` | R3 | none | - |
| P1 | Split | `split.calculate`, `split.request.prepare` | R0 / R2 | none | - |
| P1 | Support | `kb.search` | R0 | none | - |
| P1 | any | `handoff.create` | R0 | none | - |
| P2 | Invest | `market.screen`, `market.quote`, `portfolio.get` | R0 | none | - |
| P2 | Invest order | `invest.order.prepare` | R3 | none | - |
| P2 | Budget, statements, limits, FX | `budget.*`, `statement.get`, `card.limit.prepare`, `fx.quote` | R0-R3 | none | - |

Local (agent-side, not bank capabilities): `task_plan`.
