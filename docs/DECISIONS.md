# Decisions

One line per reversible decision. Newest at the bottom.

- 2026-11-08 Repository keeps its name `general-automation-system`; renaming gives no benefit now.
- 2026-11-08 Designer deliveries imported from the original zips into `import/design-with-dashboard` and `import/design-app-only`; dependencies, build output and single-file bundles left out (rebuildable with `npm run build:single`).
- 2026-11-08 The designer's own tooling folder and two capture scripts with local machine paths are not imported; they are tooling, not product.
- 2026-11-08 Base for `apps/web` is the Caspia app (identical in both deliveries); the dashboard delivery contributes only selected console panels, rebuilt on real data.
- 2026-11-08 Frontend stays React 18 + Vite 5 + react-router 6 (designer's stack). New code is TypeScript; designer JSX is converted file by file only when touched.
- 2026-11-08 Stable element IDs reuse the designer's existing `data-nav-id` attribute instead of introducing a second attribute.
- 2026-11-08 The browser-side mock bank (`bank/api.js`, localStorage state) is replaced by Core Bank + Bridge; the client keeps no business logic.
- 2026-11-08 `MemoryRouter` is replaced by a browser router under `/app`, driven by hub UI state, so deep links and mirroring work.
- 2026-11-08 Seed data is rebuilt server-side to match the brief (cards 4417/9026/7731, brief contact list, 90 days, injection memo, canaries); designer seed is not reused.
- 2026-11-08 Landing page and the dashboard's "AI Studio", "Money Coach", "Versions", login and "planned" pages are dropped from the product (see `docs/AUDIT.md`).
- 2026-11-08 Working product name stays "Seda" (designer's) until the captain decides otherwise; bank brand stays "Caspia".
- 2026-11-08 Development guide lives in `CONTRIBUTING.md`.
- 2026-11-08 Package manager is pnpm via corepack (workspace monorepo).
