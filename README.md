# Caspia Bank — mock mobile banking app (English)

A detailed, fictional bank app for the YUNEX demo. No real bank, no real money.
**Demo PIN: 1234.** Data is saved in the browser; reset it in *More → Settings → Reset demo data*.

## Run it
- **Windows:** double-click `start-demo.bat` (installs once, then opens http://localhost:5173).
- **Any OS:** `npm install` then `npm run dev`.
- **On your phone:** run `npm run dev`, then open the "Network" address it prints (same Wi-Fi). Add it to your home screen for full-screen.
- **One file:** `npm run build:single` → `dist-single/index.html` works offline, can be hosted anywhere.

## What's inside
| Area | Screens |
|---|---|
| Login | PIN pad, fingerprint login, auto-lock after 5 min |
| Home | Total balance (hide/show), quick actions, cards, upcoming payments, promo, 30-day spending, recent activity |
| Transfers | To any card (recipient name lookup), by phone, between own accounts (AZN⇄USD), SWIFT abroad, request money, templates |
| Payments | Due bills, 6 categories / 16 services (Azercell, Azərişıq, Azərsu, Azəriqaz, CityNet, traffic fines…), account lookup, QR scan-to-pay + my QR |
| Cards | 3 cards, freeze/unfreeze, reveal details with fingerprint, daily limits, PIN, online/contactless/abroad toggles, statement, order virtual/physical card |
| History | Search, filters (direction, card, category), grouped by day, transaction detail (receipt, share, split, dispute), analytics (donut, weekly bars) |
| Products | Cash loan + schedule + early payment, installments, loan calculator, deposits + calculator, cashback (withdraw, offers, missed-cashback insight), currency exchange |
| Account | Profile, IBANs, notifications, security (real device fingerprint via WebAuthn), devices, dark mode, branches & ATMs, support (FAQ + chat) |

Every money movement uses the same safe flow: **prepare (bank validates) → one summary ("Send 35 AZN to Murad A., card ending 4067?") → fingerprint or PIN → receipt.**

## Ready for the voice / MCP integration (not connected yet)
- `src/bank/api.js` is the mock core-banking API: `prepare(op)` → `execute(id, proof)`. An MCP server can expose exactly these.
- `window.caspia.navigate('/payments/azerishiq')` moves the app to any screen; `window.caspia.bank` and `window.caspia.getState()` are available.
- `window.__caspiaConfirm.start(op)` opens the standard confirmation sheet.
- Important controls have stable `data-nav-id` attributes (e.g. `tab-payments`, `to-card`, `continue`, `confirm-fingerprint`) so a navigator can highlight and click them step by step. Elements with `data-hl="true"` get a highlight ring.
- Every `say` string in `prepare()` is the one-sentence summary to read aloud.

## Change the brand
Edit `src/config.js` (name, call-centre number, demo PIN) and the color tokens at the top of `src/styles.css`.
