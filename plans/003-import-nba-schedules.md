# Plan 003: Import versioned NBA schedules and Fantrax playoff periods

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Stop
> on any STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 009198a..HEAD -- packages/importer packages/database packages/fantasy/src/lib/projections.ts apps/web/src/app/players package.json data/README.md README.md`
> Reconcile expected Plan 001 identity changes. Stop if projection schedule
> types or Fantrax league-info parsing changed semantically.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-reconcile-player-identities.md`
- **Category**: direction / data ingestion
- **Planned at**: commit `009198a`, 2026-09-18

## Why this matters

The projection domain already calculates availability-adjusted playoff-week
value when schedules are supplied, but the production importer never supplies
them. This plan creates one versioned season-calendar interface backed by
officially timestamped NBA games and the league's Fantrax scoring periods. It
preserves dates for later daily-lineup optimization and makes missing or stale
schedule data explicit rather than silently treating every team alike.

## Current state

- `packages/fantasy/src/lib/projections.ts:25-35` defines playoff weeks and a
  player season schedule; `projections.ts:256-283` calculates weighted expected
  games and points.
- `packages/importer/src/lib/hashtag-projections.ts:275-283` accepts optional
  `schedulesByTeam`.
- `packages/importer/scripts/import-projections.ts:55-64` calls the planner
  without that input, so every stored player schedule is currently `null`.
- `packages/importer/src/lib/player-production.ts:361-498` already implements a
  cached, rate-limited BALLDONTLIE adapter with retry and cursor protection.
- `packages/importer/src/lib/fantrax-league-performance.ts:230-265` already
  parses `playoffs` and `scoringPeriods` from `getLeagueInfo`, including start
  and end timestamps.
- `apps/web/src/app/players/players-view.tsx:189-193` tells users playoff value
  is pending until the NBA schedule and playoff window are configured.
- BALLDONTLIE's official docs define `GET /v1/games` with `seasons[]`,
  `season_type`, `per_page`, dates, team objects, postponed state, and cursor
  pagination: <https://docs.balldontlie.io/>.

The deep module interface should expose one read model:

```ts
interface SeasonCalendar {
  seasonKey: string;
  nbaScheduleSnapshotId: string;
  fantraxCapturedAt: string;
  games: readonly { date: string; homeTeam: string; awayTeam: string; postponed: boolean }[];
  fantasyPeriods: readonly {
    scoringPeriod: number;
    startAt: string;
    endAt: string;
    phase: 'regular-season' | 'playoffs';
    playoffRound: 'quarterfinal' | 'semifinal' | 'final' | null;
  }[];
  schedulesByTeam: Readonly<Record<string, PlayerSeasonSchedule>>;
}
```

Provider paging and payload shapes remain behind injected provider adapters.
Tests use in-memory adapters; production uses Fantrax and BALLDONTLIE.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate migration | `bun nx run database:db-generate` | one additive migration |
| Importer tests | `bun nx run importer:test -- --run` | all pass |
| Fantasy tests | `bun nx run fantasy:test -- --run` | all pass |
| Typecheck | `bun nx run-many -t typecheck -p database,importer,fantasy,web` | exit 0 |
| Full verification | `bun run check && bun run build` | both exit 0 |

## Suggested executor toolkit

- Use `codebase-design`: `SeasonCalendar` is the external interface; the two
  provider adapters and calendar join are implementation details.
- Use `neon-postgres` for immutable snapshot constraints.
- Consult only the current official BALLDONTLIE documentation for endpoint
  fields; do not copy an unofficial SDK's assumptions.

## Scope

**In scope**:

- `packages/importer/src/lib/player-production.ts` only for extracting/reusing
  shared provider transport or adding `listRegularSeasonGames`
- `packages/importer/src/lib/nba-season-calendar.ts` (create)
- `packages/importer/src/lib/nba-season-calendar.spec.ts` (create)
- `packages/importer/scripts/import-season-calendar.ts` (create)
- `packages/importer/scripts/import-projections.ts`
- `packages/importer/src/lib/hashtag-projections.ts`
- `packages/importer/src/lib/hashtag-projections.spec.ts`
- `packages/importer/src/index.ts`
- `packages/importer/package.json`
- `packages/database/src/lib/schema.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- `packages/database/migrations/00NN_*.sql` and generated metadata
- `packages/fantasy/src/lib/projections.ts`
- `packages/fantasy/src/lib/projections.spec.ts`
- `apps/web/src/app/players/players-view.tsx`
- related page/load adapters under `apps/web/src/lib/`
- `package.json`
- `README.md`
- `data/README.md`

**Out of scope**:

- Scraping NBA or Fantrax HTML.
- Betting, odds, or predicted game outcomes.
- Automatically changing schedules when a game is postponed; refresh creates a
  new immutable snapshot.
- Daily lineup assignment and auction-dollar changes; those belong to Plan 004.
- Hardcoding the 2026-27 playoff dates in TypeScript.

## Git workflow

- Branch: `advisor/003-import-season-calendars`
- Conventional commit example: `feat: import season schedules`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define and validate the season-calendar plan

Create a pure `planSeasonCalendarImport` that accepts:

- season key and as-of timestamp;
- raw Fantrax league-info payload;
- parsed BALLDONTLIE regular-season games;
- source IDs and payload provenance.

Validate season format, nonempty scoring periods, ordered/nonoverlapping period
dates, one final scoring period, playoff-round derivation, NBA game dates,
recognized team abbreviations, and duplicate provider game IDs. Exclude
preseason/play-in/NBA playoff games. Preserve postponed games but mark them so
the calendar can be refreshed when rescheduled. Produce a deterministic
fingerprint and summary counts.

**Verify**: `bun nx run importer:test -- --run` -> tests cover normal season,
missing playoffs, duplicate games, overlapping periods, postponed games, and
fingerprint stability under reordered input.

### Step 2: Extend the provider adapter without duplicating transport

Refactor the existing BALLDONTLIE transport only as far as necessary to add
`listRegularSeasonGames(seasonStartYear)`. Use `GET /v1/games`,
`seasons[]=<year>`, `season_type=regular`, and `per_page=100`, preserving the
existing cache, request interval, adaptive rate-limit headers, retry behavior,
and repeated-cursor guard.

Add a narrow Fantrax league-info adapter or reuse the existing documented
fetcher. Fetch `getLeagueInfo` once for the configured league; do not fetch all
matchup periods. Both dependencies must be injected ports with in-memory test
adapters.

**Verify**: `bun nx run importer:test -- --run` -> mocked transport tests assert
the exact official query parameters, cursor paging, cache reuse, and no network
call on cache hit.

### Step 3: Persist immutable calendars

Add schema for:

- `nba_schedule_snapshots`: source, season, as-of, fingerprint, ingestion run;
- `nba_schedule_games`: snapshot, provider game ID, date/time, home/away team,
  season type, postponed/status, source record;
- `league_scoring_periods`: league season, captured ingestion run, period
  number, start/end, phase, playoff round.

Add `saveSeasonCalendar` and `latestSeasonCalendar(seasonKey)` to the database
interface. Save one validated plan atomically and idempotently by fingerprint.
The read model must return dated games as well as per-team counts for the whole
NBA regular season and each Fantrax playoff period.

**Verify**: `bun nx run database:typecheck` -> exit 0; generated migration is
additive and contains the intended uniqueness/index constraints.

### Step 4: Add validate/import commands

Create `season-calendar:validate` and `season-calendar:import`. Default to the
live season from ignored league configuration rather than a literal year.
Validation prints provider as-of times, period boundaries, game/team counts,
postponed count, and fingerprint; it never writes. Import reruns validation and
commits exactly that plan.

**Verify**: command tests or pure argument tests prove missing API key, missing
live league, and invalid season fail clearly without leaking credentials.

### Step 5: Feed the calendar into projection import

Load `latestSeasonCalendar(seasonKey)` in `import-projections.ts`, convert it to
`schedulesByTeam`, and pass it to `planHashtagProjectionImport`. Require exact
team abbreviations; unresolved projection teams must appear in validation and
block commit rather than receive a fabricated 82-game schedule.

Store schedule snapshot ID/fingerprint in projection snapshot parameters so a
projection can be reproduced. If no calendar exists, validation may still show
the old schedule-null preview, but commit must require an explicit
`--allow-missing-schedule` escape hatch and record that limitation.

**Verify**: `bun nx run importer:test -- --run` -> tests show DEN/other teams
receive correct regular-season and playoff counts and an unknown abbreviation
blocks normal commit.

### Step 6: Surface freshness and remove the pending placeholder

Show calendar as-of/fingerprint prefix and actual playoff-period counts on the
player board. Display `Stale` when the calendar season differs from the
projection season or when the projection does not reference the latest calendar
snapshot. Keep `Pending` only when schedule data is genuinely absent.

**Verify**: `bun nx run web:test -- --run` -> page tests cover current, stale,
and missing schedules; `bun run check && bun run build` -> both exit 0.

## Test plan

- Follow `player-production.spec.ts` for provider adapter tests and
  `hashtag-projections.spec.ts` for plan validation.
- Cover timezone boundaries with ISO timestamps, inclusive game dates at period
  start/end, postponed games, team abbreviation mapping, duplicate game IDs,
  cursor repetition, cache hits, and immutable fingerprint changes.
- Projection tests must retain the existing expected-active-games assertions
  and add provenance assertions.

## Done criteria

- [ ] One command validates and one explicitly imports the active season calendar.
- [ ] NBA games come from the official endpoint through cached/rate-limited transport.
- [ ] Fantrax playoff periods come from league info rather than hardcoded dates.
- [ ] Stored projections reference the exact calendar snapshot/fingerprint used.
- [ ] Player projections contain schedule values for every resolved NBA team.
- [ ] Stale and missing schedules are visible in the UI.
- [ ] `bun run check && bun run build` exits 0.
- [ ] Only in-scope files and `plans/README.md` are modified.

## STOP conditions

- The current BALLDONTLIE subscription does not authorize `GET /v1/games`.
- Fantrax league info lacks scoring-period dates for the live season.
- Provider team abbreviations cannot be mapped uniquely.
- The importer would need an HTML scraper or undocumented authenticated action.
- A generated migration includes destructive unrelated changes.

## Maintenance notes

- Refreshing after postponements creates a new immutable snapshot; never edit an
  old snapshot in place.
- Future providers can be adapters at the existing season-calendar seam.
- Plan 004 relies on dated games, not merely weekly totals; reviewers must make
  sure the read model preserves individual game dates.

