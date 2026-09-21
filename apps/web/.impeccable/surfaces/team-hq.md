---
version: 1
slug: "team-hq"
primary_target: "src/app/team/team-hq.tsx"
related_targets: ["src/app/team/page.tsx", "src/app/team/team-hq.module.css", "src/app/player-card.tsx", "src/app/player-card.module.css", "src/lib/team-hq.ts", "src/app/app-shell.tsx", "src/app/page.tsx", "src/app/players/players-view.tsx", "src/app/trades/trades-view.tsx"]
---

# Team HQ

Mode: Operate. Code-led implementation extending the existing Front-Office Control Deck.

Audience: Brendan/Clyde returning to one private fantasy basketball team. The immediate job is to understand our roster, compare observed league performance, and take a specific opponent into trade analysis.

THESIS: Begin with our team and make the reusable player read the unit of investigation. League evidence and the next action follow the roster in the same workspace.

OWN-WORLD: Inherit the matte navy, white/cool-gray information hierarchy, hairlines, compact corners, and restrained orange decision signal. No new visual identity or raster asset is introduced. The page uses a larger operational heading and clear section titles while the cards keep compact evidence typography.

STORY: `/` redirects to `/team`. The owner sees team identity and observed season results, then the searchable draft roster, league comparison, and next moves. Season changes reset roster search and the selected rival. Canonical manager identity determines our team; missing identity never falls back to a similarly named team. Signed-out and missing-roster states explain the boundary and link to available research or identity/league review.

FIRST VIEWPORT: A Team HQ title and season control sit above local section links, the team summary, and the roster. Eve starts collapsed on a direct Team HQ load; opening it remains part of the shared shell. This is an initial state, not a global route-change reset. On desktop the page has a 1480px maximum width and 32px padding; mobile uses 24px 16px padding at 680px. Roster cards use an auto-fit grid with 250px minimum columns and 12px gaps.

FORM: Shared `PlayerCard` disclosures carry player identity and available evidence. Four labeled icon explanations work on hover, focus, and tap, with Escape dismissal and viewport-clamped portal positioning. Compact cards carry the same behavior into projection research and trade rosters. Team HQ’s league lenses are All-play strength, Weekly scoring, Lineup volume, and Schedule luck. Selecting a rival updates the adjacent comparison without leaving the page. The two-column league comparison stacks at 1100px; lens controls wrap with 42px minimum height on mobile. Bar magnitude uses `scaleX`, a left transform origin, and a 350ms transition; global reduced-motion preferences collapse motion. Numeric values and explanatory text remain visible, including the meaning of negative schedule luck.

EVIDENCE: The roster is explicitly a selected-season draft snapshot, before trades and waivers. Latest player projections carry their own season and as-of date and must not be read as historical roster results, live injury clearance, or confirmed ownership. Observed draft price is neither a bid recommendation nor present trade value. The rival trade action carries season, our team, and rival query parameters; missing data keeps honest empty states.

FINISH: Review artifacts in the repository-root `.impeccable/review/` include `desktop.png`, `mobile.png`, `desktop-league.png`, and `mobile-league.png`. These views use synthetic fixtures, not real owner league evidence. Shared component behavior is documented in root `DESIGN.md` and `.impeccable/design.json`; the final review disposition is ship, with the tooltip correction resolved. `.impeccable/review/verification.md` records the synthetic fixture boundary, 49 passing web tests, lint/type checks, and the successful production build.
