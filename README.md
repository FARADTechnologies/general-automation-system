# Seda: voice banking demo (YUNEX Hackathon 2026)

Open these files by double-clicking them. No install needed, they work offline:

| What | File |
|---|---|
| Landing page | `seda-landing/index.html` |
| Seda Console (the platform) | `seda-platform/seda-console-offline.html` |
| Caspia Bank (mock bank app) | `caspia-bank/caspia-bank-offline.html` |

Console login is pre-filled (nigar.admin@caspiabank.demo / demo-password). Caspia demo PIN: 1234.

Try in the Console: Playground, then type "Send 35 manat to Murad" or "Top up my phone with 5 manat".
In AI Studio, try: "Add traffic fine payments by voice, max 100 AZN, only from the debit card".

## For developers
Each of `caspia-bank` and `seda-platform` is a React + Vite project:

    npm install
    npm run dev            # local dev server
    npm run build:single   # one offline HTML file in dist-single/

The landing page is plain HTML (open with a local server for the scroll effects to load assets reliably, e.g. `npx serve seda-landing`).

