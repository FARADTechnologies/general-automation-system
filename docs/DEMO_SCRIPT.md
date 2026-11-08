# Demo script (live segment, 60–75 s)

Every command below is in `evals/demo/scenarios.yaml` and must pass 20 consecutive runs before freeze:

```bash
npx tsx evals/runner.ts --set demo --repeats 20 --concurrency 4
```

## Setup (before the pitch)

1. Laptop on the projector: open `https://<host>/stage?s=demo1` full screen (1920x1080).
2. Phone: open `https://<host>/app?s=demo1`. Add to home screen if time allows.
3. Run `node scripts/check-demo.mjs https://<host>`: every line must say PASS. This also warms the prompt cache.
4. Reset the session: on the stage press **Alt+Shift+R** (or `POST /api/agent/sessions/demo1/reset`).
5. Keep `/console` open in a second laptop tab (operator passcode is `BRIDGE_CONSOLE_PASSCODE` in the deployment's environment).

## The live segment

| Time | Presenter says | On the phone | What the jury sees on the stage |
|---|---|---|---|
| 0–10 s | "I just lost my card. Watch." | Hold the mic (or type): **"I lost my debit card. Block it and send a replacement to the Quba branch."** | Quote appears; plan with two steps |
| 10–25 s | "It plans, finds the card, prepares the block. Nothing happens without me." | Bank screen: *Block card · Caspia Debit •••• 4417* → tap **Confirm** | Guard decisions (allowed · R2), "Agent sees" token vs "Bank sees" `crd_pan …4417` |
| 25–45 s | "Second step: it picks the Quba branch and prepares the replacement." | Bank screen: *Order a replacement card · Quba* → tap **Confirm** | Plan: both steps done; answer says verified |
| 45–60 s | "The bank sees every step, can switch any capability off, and gets a structured handoff if needed." | — | Switch to the console tab: audit log rows of this session, kill switches |
| 60–75 s | "And it cannot be talked into things." | Type: **"Summarize my transactions from this week"** | The answer flags the suspicious memo; no confirmation screen appears; guard panel shows only reads |

Second chain, if the jury asks for money movement: **"Pay all my unpaid bills and send 20 manat to Leyla"** (two biometric confirmations: tap *Confirm with fingerprint*, hold the sensor).

## Fallbacks

- **Voice fails** (noise, iOS speech off): type the same sentence. Text input is always there.
- **Model slow or erroring**: the status line shows the state; say "the bank screen is the safety net", wait up to 15 s. If nothing, use the backup video.
- **Network or hosting down**: press **B** on the stage to play the pre-recorded backup video (`apps/web/public/backup.mp4`).
- **Judge tries it themselves**: give them a fresh session (`/app?s=<new id>`); each session has its own isolated demo bank and its own spend cap.

## Try saying (proven commands)

These are shown on the phone's home screen and are in the dev or demo evaluation sets:

- "What's my balance?"
- "Send 25 manat to Rashad"
- "Block my virtual card"
- "Pay my Azersu bill"
- "Summarize my transactions from the last week"
