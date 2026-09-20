# Plan 004: Value usable daily-lineup production

> **Executor instructions**: Follow this plan step by step and run each
> verification gate. Stop on any STOP condition; do not improvise. Update this
> plan's row in `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat a02ceb2..HEAD -- packages/fantasy packages/database packages/importer/src/lib/auction-valuation-run.ts packages/importer/scripts/calibrate-auction-values.ts apps/web/src/lib apps/web/src/app/draft apps/web/src/app/players agent config/league-format.json`
> Plans 002 and 003 are reconciled into this version. Stop if valuation artifact
> persistence, the promoted-run read model, dated calendar games, or projection
> calendar provenance change semantically after `a02ceb2`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/002-persist-promote-valuation-runs.md`,
  `plans/003-import-nba-schedules.md`
- **Category**: direction / valuation model
- **Planned at**: commit `a02ceb2`, 2026-09-19
- **Implementation review**: APPROVED at `afcd3ce`, 2026-09-19, and integrated
  onto `main` at `cf1eb8d`, 2026-09-20.
- **Production rollout**: COMPLETE, 2026-09-20. Migration `0012` was applied,
  candidate `c0adf9f2-9be9-4ad4-b5bc-a7173146b02c` was reviewed and promoted,
  and superseded run `790e08e0-cd49-4813-9dc4-43d977825912` remains the tested
  rollback target.
- **Reconciled after Plans 002–003**: immutable valuation candidates now persist
  through `auction_valuation_runs` / `auction_valuation_players`, projection
  snapshots carry calendar snapshot provenance, and `latestSeasonCalendar`
  exposes the individual dated NBA games required by the optimizer.

## Why this matters

Current auction dollars are allocated above one global points-per-game
replacement line. That ignores the league's seven constrained positions, three
flex slots, daily changes, bench conflicts, playoff-week schedule, and reserved
streaming slot. This plan creates a pure usable-points module that hides daily
assignment complexity behind two calculations: a league board and the marginal
fit of one candidate on a concrete roster. It introduces the new basis as an
explicit model version and requires evaluation/promotion rather than silently
replacing live caps.

## Current state

- `config/league-format.json:6-79` records daily lineups and PG, SG, G, SF, PF,
  F, C, and three FLX slots, with 10 active and three reserve players.
- `packages/fantasy/src/lib/valuation-lab.ts:229-265` documents and implements a
  single global FPPG replacement line over `teamCount * rosterSize` players.
- `packages/fantasy/src/lib/projections.ts:51-84` exposes positions,
  availability, season points, and playoff-week schedule values.
- `packages/fantasy/src/lib/live-bid.ts` consumes projected values and uses
  owned-player positions for only a coarse roster-fit heuristic.
- Plan 003 supplies dated NBA games and Fantrax playoff periods. Plan 002
  supplies immutable candidates and explicit promotion.

The pure module interface must stay small:

```ts
buildUsablePointsBoard(input: UsablePointsBoardInput): UsablePointsBoard
evaluateRosterCandidate(input: RosterCandidateInput): RosterCandidateValue
```

`buildUsablePointsBoard` hides the daily maximum-weight eligibility assignment,
replacement calculation, streaming-slot reservation, auction-pool allocation,
and playoff weighting. `evaluateRosterCandidate` returns the difference between
an owned roster's optimized result with and without the candidate. Neither
operation reads a database or calls a provider.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Fantasy tests | `bun nx run fantasy:test -- --run` | all pass |
| Importer tests | `bun nx run importer:test -- --run` | all pass |
| Database tests | `bun nx run database:test -- --run` | all pass |
| Generate migration | `bun nx run database:db-generate` | one additive migration if durable player diagnostics require columns |
| Web tests | `bun nx run web:test -- --run` | all pass |
| Typecheck | `bun nx run-many -t typecheck -p fantasy,database,importer,web,agent` | exit 0 |
| Full verification | `bun run check && bun run build` | both exit 0 |

## Suggested executor toolkit

- Use `codebase-design`. The assignment algorithm is an internal implementation;
  do not expose graph/DP state through the interface.
- Use `tdd` if available: this model changes money recommendations and needs
  characterization tests before callers switch.
- Use `nx-run-tasks` for all verification.

## Scope

**In scope**:

- `packages/fantasy/src/lib/usable-points.ts` (create)
- `packages/fantasy/src/lib/usable-points.spec.ts` (create)
- `packages/fantasy/src/lib/valuation-lab.ts`
- `packages/fantasy/src/lib/valuation-lab.spec.ts`
- `packages/fantasy/src/lib/live-bid.ts`
- `packages/fantasy/src/lib/live-bid.spec.ts`
- `packages/fantasy/src/lib/league-format.ts`
- `packages/fantasy/src/index.ts`
- valuation artifact types added by Plan 002
- schedule read types added by Plan 003
- `packages/database/src/lib/schema.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- `packages/database/migrations/00NN_*.sql` and generated metadata, only if
  required to persist immutable per-player usable-value diagnostics
- `packages/importer/src/lib/auction-valuation-run.ts`
- `packages/importer/src/lib/auction-valuation-run.spec.ts`
- `packages/importer/scripts/calibrate-auction-values.ts`
- `apps/web/src/lib/create-live-bid-board.ts`
- `apps/web/src/lib/live-bid-board.ts`
- `apps/web/src/lib/live-bid-evaluator.ts`
- `apps/web/src/lib/valuation-lab.ts`
- `apps/web/src/app/draft/live-bid-panel.tsx`
- `apps/web/src/app/draft/valuation/page.tsx`
- `apps/web/src/app/players/players-view.tsx`
- related tests in those directories
- `agent/tools/live_bid_evaluation.ts`
- `agent/instructions.md`
- `README.md`

**Out of scope**:

- Predicting injuries, rest days, or starting lineups beyond supplied
  availability probabilities.
- Automatically promoting the new model.
- Replacing the league-price model with production value; market price and
  personal production value remain distinct.
- Claiming the output is playoff probability.
- Optimizing actual Fantrax lineups or making transactions.

## Git workflow

- Branch: `advisor/004-usable-lineup-value`
- Conventional commit example: `feat: value usable lineup production`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Lock down current valuation behavior

Before changing interfaces, extend `valuation-lab.spec.ts` and
`live-bid.spec.ts` with characterization cases for:

- global replacement value and exact auction-pool conservation;
- player ties and deterministic ordering;
- current personal caps with empty and partially filled rosters;
- projection value remaining separate from expected league price.

These tests protect the legacy `global-fppg-v1` basis while the new basis is
added alongside it.

**Verify**: `bun nx run fantasy:test -- --run` -> new characterization tests
pass before production code changes.

### Step 2: Implement deterministic daily lineup assignment

Create `usable-points.ts`. For each NBA date, assign eligible roster players to
the configured active slots to maximize expected fantasy points. Expected value
for a scheduled game is `fantasyPointsPerGame * availabilityRate`; do not count
an unscheduled player. Handle multi-position eligibility and repeated FLX slots.

Use a deterministic dynamic program or maximum-weight matching appropriate for
at most 13 roster players and 10 slots. Tie-break by player ID and slot order.
Return selected/benched player IDs and totals for diagnostics, but keep internal
algorithm state private.

**Verify**: `bun nx run fantasy:test -- --run` -> tests cover multi-position
assignment, flex competition, an empty roster, fewer than 10 available players,
same-day congestion, tie determinism, and no double assignment.

### Step 3: Build the league usable-points board

Implement `buildUsablePointsBoard` using the season calendar, league format,
team/roster counts, projected players, and streaming-slot count. Calculate:

- raw projected points;
- expected scheduled points;
- estimated captured regular-season points;
- captured playoff-weighted points;
- congestion/bench loss;
- positional scarcity/replacement delta;
- availability exposure;
- dollar value while reserving every draftable roster spot's $1 minimum.

For the league-wide board, allocate aggregate daily slot capacity as
`teamCount * slot.maxActive`. Reserve configured streaming slots per team from
long-term roster valuation rather than assigning their season-long value to a
single drafted player. Preserve auction-pool conservation exactly in cents.

Give the basis a new explicit version such as `usable-lineup-v1`. Keep
`global-fppg-v1` callable for comparison and rollback.

**Verify**: tests prove total dollars equal the league auction pool, constrained
positions can change replacement values, schedule density changes usable value,
and reserving a streaming slot reduces long-term drafted capacity without
creating or destroying dollars.

### Step 4: Calculate marginal value for Brendan's actual roster

Implement `evaluateRosterCandidate` by running the same optimizer with and
without the candidate. Return marginal regular-season captured points,
playoff-weighted marginal points, days benched, filled slot needs, and
concentration risk. Never estimate this by adding standalone player value.

Update `evaluateLiveBid` input so personal cap calculation can consume the
candidate's roster-marginal value while hard budget/minimum-slot guards remain
unchanged. Deterministic hard stops still own all dollar decisions; Jev may only
downgrade qualitative fit as before.

**Verify**: `bun nx run fantasy:test -- --run` -> a strong but redundant guard
has lower marginal value on a guard-heavy roster, while the same player retains
standalone market value; hard stops are unchanged.

### Step 5: Add the model as a candidate valuation artifact

Extend the Plan 002 artifact inputs with league-format version and schedule
snapshot fingerprint. Produce a new candidate run using usable points. Do not
edit or supersede previous artifacts automatically. The valuation lab must show
legacy and usable-points outputs side by side and explain why price prediction
metrics and production utility are different axes.

Update the valuation command to load `latestSeasonCalendar(seasonKey)` and the
checked-in league format, then pass those exact versioned inputs into artifact
planning. Persist the usable-value diagnostics needed by the promoted read
model on immutable valuation rows (using an additive migration if the current
columns cannot represent them); do not recompute them in the web request path.

Because historical daily availability is not yet preserved, do not claim the
new usable-points basis has a full historical injury backtest. Mark this as a
current-season production-value experiment and retain the market-price
walk-forward metrics unchanged.

**Verify**: importer and database tests prove artifact fingerprint changes with
lineup format, streaming slots, or schedule snapshot; it stays stable for
reordered equivalent inputs, and a saved/read candidate preserves the usable
diagnostics without request-time recomputation.

### Step 6: Surface usable-value explanations everywhere

Update player, valuation, live bid, and Eve output with concise fields:

- projected versus usable points;
- congestion loss;
- playoff-weighted games/points;
- roster-marginal points;
- usable-points model version and schedule as-of.

Update the live board preparation once, not the synchronous evaluator. The
button path must remain a pure in-memory calculation and retain the existing
sub-300ms target.

**Verify**: `bun nx run web:test -- --run` -> instant fallback still renders
without awaiting Jev, and player/valuation views label schedule/model
provenance. Run the existing evaluator benchmark; p95 must remain below 300ms.

### Step 7: Promote only after review

Create a candidate usable-points run through Plan 002's workflow. Compare
rank/value changes, auction-pool conservation, position scarcity, fragile
players, and playoff-heavy schedules. Promotion remains a separate operator
action. Document how to roll back to the prior promoted run.

**Verify**: `bun run check && bun run build` -> both exit 0.

## Test plan

- Use table-driven pure tests in `usable-points.spec.ts`; no database or network.
- Include small hand-solvable rosters where the exact optimal assignment is
  obvious, plus invariants for no double assignment and dollar conservation.
- Extend live-bid tests for personal roster marginal value and unchanged budget
  stops.
- Extend web integration tests to prove the prepared board keeps the click path
  synchronous.

## Done criteria

- [x] A pure module returns deterministic daily assignments and usable values.
- [x] Multi-position eligibility, 10 slots, bench congestion, streaming reserve,
  availability, and playoff schedule affect values explicitly.
- [x] Auction dollars conserve the exact pool and reserve $1 minimum bids.
- [x] Live personal caps use roster-marginal utility without changing hard guards.
- [x] Legacy and new value bases remain versioned and comparable.
- [x] The candidate command consumes the exact dated calendar and persists the
  usable diagnostics returned by the promoted-run read model.
- [x] No new model becomes live without explicit persisted-run promotion.
- [x] Live evaluator p95 remains below 300ms on the prepared board benchmark.
- [x] `bun run check && bun run build` exits 0.

## Review result

The isolated implementation was approved after one revision round. Review
caught and corrected exact same-day Fantrax period boundaries, NBA games outside
the fantasy competition window, single-player concentration classification,
repeated full-calendar JSON in the projection read query, and misleading usable
point labels. The final review reran all affected tests without Nx cache, the
full repository check, the production build, and migration 0012 against a
disposable PostgreSQL database.

## STOP conditions

- Plan 003 does not expose dated games for the projection season.
- The active league format differs from the checked-in 10-slot/13-roster model
  and cannot be parsed by `league-format.ts`.
- The optimizer needs remote I/O or database access to calculate one bid.
- The new model cannot conserve the auction pool exactly.
- Implementation would silently replace the promoted model.
- Historical limitations would be presented as validated playoff probability.

## Maintenance notes

- A schedule refresh or format change requires a new valuation artifact.
- Reviewers should scrutinize eligibility assignment, streaming-slot accounting,
  tie determinism, and separation between market price and personal utility.
- Future game-level historical data can add real captured-points backtests
  without changing this module's external interface.
