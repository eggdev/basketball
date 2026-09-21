# Plan 008 — Understand current player situations

**Status:** IN PROGRESS — mechanism implemented; migration, reviewed context, and paid advanced-stat import are pending

## Objective

Explain what is materially different for an NBA player this season: team
movement, transaction type, availability context, projected opportunity,
depth-chart competition, and prior-season role indicators. Keep observed facts,
reviewed reporting, model projections, and derived signals distinct so the
player board and Eve can use the same evidence without inventing causality.

## Evidence contract

- A current team comes from the immutable projection snapshot.
- A prior team comes from game-level team stints in the latest completed NBA
  season. The last game date identifies the team where the player finished the
  season, avoiding false changes for midseason trades. A different team proves
  a team change, not whether it was a trade or signing.
- Trade, signing, waiver, injury, and depth-role labels require a reviewed row
  with a source URL.
- Low games played is labeled `limited season`; it is not called an injury
  unless reviewed injury evidence exists.
- Opportunity direction is either reviewed context or a transparent per-game
  box-score proxy: `FGA + 0.44 × FTA + AST + TOV`. It is not presented as a
  projected NBA usage rate.
- Advanced metrics describe the imported prior season. Every metric retains its
  provider metric-set namespace.

## Provider strategy

BALLDONTLIE is already the production and schedule provider in this repository.
Its paid season-average endpoints expose general advanced/usage, tracking
passing, drives, possessions, speed/distance, and hustle data. That covers
usage, touches, dribbles per touch, potential assists, secondary or “hockey”
assists, and many additional role indicators. These endpoints require the GOAT
tier and a configured `BALLDONTLIE_API_KEY`.

BALLDONTLIE does not expose a reliable offseason transaction classification or
preseason depth chart. Plan 008 therefore accepts a small reviewed CSV for those
facts. A future licensed adapter such as Sportradar may replace that manual feed
without changing the situation module's interface.

## Implemented slice

- [x] Add a pure `buildPlayerSituationBoard` module shared by UI and Eve.
- [x] Preserve NBA team stints when aggregating game-level production.
- [x] Add immutable reviewed context snapshots for movement, injury, and role facts.
- [x] Require source URLs for every reviewed qualitative claim.
- [x] Add a cached BALLDONTLIE season-average adapter for seven metric sets.
- [x] Store advanced metrics as namespaced season records with raw evidence.
- [x] Add the Players `Situation intelligence` table.
- [x] Add Eve's `player_situations` tool and evidence rules.
- [x] Generate migration `0014_damp_ink.sql`.
- [ ] Apply migration 0014 to the live database.
- [ ] Restore a GOAT-tier API key and validate/import 2025–26 advanced metrics.
- [ ] Add and review `data/raw/player-context/2026-27.csv`.
- [ ] Re-import base production so historical team stints are populated.
- [ ] Browser-review the populated desktop and mobile player board.

## Verification

- Domain tests cover verified versus unverified team movement, limited seasons
  without injury attribution, midseason-trade ending teams, missing projection
  inputs, reviewed opportunity overrides, projected competition, and advanced
  metric normalization.
- Importer tests cover context evidence requirements, unresolved identities,
  paid endpoint caching, pagination, and namespaced metric aggregation.
- `bun run check && bun run build` must pass before commit.

## STOP conditions

- Do not scrape NBA.com, Basketball Reference, or another site whose permitted
  automated use is unclear.
- Do not import a transaction or injury label without a reviewable source URL.
- Do not substitute current injury status for an explanation of last season's
  missed games.
- Do not call the box-score proxy “usage rate.”
- Do not commit paid provider payloads or private reviewed CSVs.
