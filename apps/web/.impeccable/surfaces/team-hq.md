---
version: 1
slug: "team-hq"
primary_target: "src/app/team/team-hq.tsx"
related_targets: ["src/app/team/page.tsx", "src/app/team/draft-prep-hq.tsx", "src/app/season-experience.tsx", "src/lib/season-experience.ts", "src/app/team/team-hq.module.css", "src/app/player-card.tsx", "src/app/player-card.module.css", "src/lib/team-hq.ts", "src/app/app-shell.tsx", "src/app/page.tsx", "src/app/players/players-view.tsx", "src/app/trades/trades-view.tsx"]
---

# Team HQ

Mode: Operate. Code-led implementation extending the existing Front-Office Control Deck.

Audience: Brendan/Clyde returning to one private fantasy basketball team. After the NBA Finals finish, the immediate job is to prepare the next team: refine a plan, scout players, and connect league evidence to draft decisions. During the active season, the roster and league-comparison workspace remains available.

THESIS: Lead with the decision appropriate to the season. Preparation begins with the upcoming season and a concrete planning process; Season & history begins with our roster and observed league evidence.

OWN-WORLD: Inherit the existing Front-Office Control Deck: matte navy, white/cool-gray hierarchy, hairlines, compact corners, and restrained orange decisions. This is code-led work within the inherited Team HQ direction, with no new comp, FORM seed, visual identity, or raster asset. Compact blue and gold player signals extend the existing semantic green/amber/red vocabulary; they do not recolor the shell.

STORY: `/` redirects to `/team`. Automatic mode uses reviewed annual preparation/opening dates from `config/season-experience.json`, with America/New_York date boundaries. It does not poll NBA results or detect the Finals finish in real time. Missing or stale calendar entries show a confirmation notice and default to preparation. The sidebar's Automatic / Draft preparation / Season & history preference is local to this browser. Preparation HQ shows the saved active plan for the upcoming season, links into the planning stages, and offers scouting lenses for targets, durability, new teams, and role upside. Research routes carry a purpose statement and a next step back into Draft Plan.

FIRST VIEWPORT: Preparation starts with “Prepare for [season]”, one start/continue-plan action, and an active-plan summary or honest empty state. Three preparation steps precede the scouting board; the full Draft Plan includes Draft day as its fourth stage. Season & history retains the season picker, local section links, team summary, and roster. Eve starts collapsed on a direct Team HQ load; this remains an initial shell state rather than a route-change reset. The established desktop page width and responsive card grid remain in use.

FORM: Shared PlayerCard disclosures carry identity and evidence. Labeled icon explanations support hover, focus, tap, Escape dismissal, and viewport-clamped portal positioning. Projection tiers use S/A/B/C/D letters with rank-band explanations. Durability and role direction use green/amber/red; sourced team movement uses blue; elite S-tier uses gold. A visible legend and textual caveats prevent color-only meaning. The existing Season & history league lenses remain All-play strength, Weekly scoring, Lineup volume, and Schedule luck; choosing a rival updates the adjacent comparison. Reduced-motion behavior remains inherited.

EVIDENCE: Only projections and situations matching the preparation season populate upcoming scouting. Older estimates remain labeled research rather than next-season forecasts. Missing upcoming projections leave strategy and research usable. In Season & history, rosters remain selected-season draft snapshots before trades and waivers, with projections carrying their own season/as-of date. Canonical owner identity controls roster selection; missing identity never falls back to a similar name. Draft price is not a recommended bid or present trade value; modeled durability is not live injury clearance. The rival trade action retains season and both teams.

FINISH: Current captures and verification live in repository-root `.impeccable/review/offseason/`: `hq-desktop.png`, `hq-mobile.png`, `draft-desktop.png`, `draft-mobile.png`, and `players-mobile.png`. Populated captures use explicitly labeled synthetic fixtures and mocked authentication/actions, not real owner evidence. The production signed-out route was checked; authenticated database writes were not verified. `verification.md` records the validation boundary. The stage URL synchronization correction is implemented, and mounted panels preserve unsaved inputs when switching stages. Independent finish review scored both material fixes resolved and returned ship at that scope. The detector's preexisting shell-token advisories are not new design commitments. Root `DESIGN.md` and `.impeccable/design.json` document only the intentional signal additions alongside the inherited system.
