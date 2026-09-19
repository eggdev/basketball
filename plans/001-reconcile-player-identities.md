# Plan 001: Reconcile canonical player identities transactionally

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the STOP conditions occurs, stop and report; do not
> improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 009198a..HEAD -- packages/database packages/importer packages/fantasy/src/lib/valuation-lab.ts packages/fantasy/src/lib/valuation-lab.spec.ts package.json README.md`
> If any in-scope file changed, compare the Current state excerpts with live
> code. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction / data integrity
- **Planned at**: commit `009198a`, 2026-09-18
- **Execution status**: DONE and independently reviewed at worktree commit
  `da6932d`. Migration 0009 is applied; all 12 approved suffix-format duplicates
  have immutable audit rows, and the live valuation bridge count is zero.

The reviewed candidates are Trey Murphy III, Jabari Smith Jr., Jaren Jackson
Jr., Kevin Porter Jr., Wendell Carter Jr., Tim Hardaway Jr., Dereck Lively II,
Michael Porter Jr., Robert Williams III, Larry Nance Jr., Kelly Oubre Jr., and
Jimmy Butler III. In each case the historical source owns the Fantrax and
BALLDONTLIE identities and the current projection target owns neither.

## Why this matters

The valuation lab currently joins some current projections to historical
players by a suffix-insensitive name heuristic. That keeps the UI useful but
allows one real player to remain split across canonical UUIDs, silently hiding
auction, production, ADP, roster, or projection history from later models. This
plan creates one small preview/commit interface that hides every foreign-key
rewrite, refuses ambiguous collisions, records an audit row, and removes the
runtime name bridge after the real records are reconciled.

## Current state

- `packages/database/src/lib/schema.ts:23-55` defines `players` and
  `player_identities`; provider identities already have a unique
  `(source, external_id)` constraint.
- `packages/fantasy/src/lib/valuation-lab.ts:578-617` builds a normalized-name
  map and chooses a unique suffix-insensitive historical ID when the current
  UUID has no history.
- `packages/fantasy/src/lib/valuation-lab.ts:651-666` reports those bridges as a
  known limitation requiring a durable merge.
- `packages/database/src/lib/database.ts:857-910` is the narrow Effect
  `DatabaseService` interface. Match the existing deep-module convention:
  callers receive typed operations while SQL and transactions remain inside
  the Neon adapter.
- Player foreign keys currently appear in `player_identities`,
  `roster_period_entries`, `inferred_roster_changes`, `player_projections`,
  `player_adp`, `pre_draft_targets`, `player_season_stats`, `auction_results`,
  and `player_rankings`. Several have composite uniqueness constraints. A
  collision must block the merge; do not choose a row automatically.
- Database errors are converted to `DatabaseUnavailable` with a named
  operation. Follow `reconcileLeagueTeamIdentity` in
  `packages/database/src/lib/database.ts:2790-2888` as the transaction/error
  pattern.

Target interface at the database seam:

```ts
interface PlayerIdentityMergeInput {
  sourcePlayerId: string;
  targetPlayerId: string;
  reason: string;
  resolvedByUserId: string;
}

interface PlayerIdentityMergePreview {
  fingerprint: string;
  source: CanonicalPlayer;
  target: CanonicalPlayer;
  referenceCounts: Readonly<Record<string, number>>;
  conflicts: ReadonlyArray<{ table: string; key: string }>;
}

// preview is read-only; commit requires the preview fingerprint and refuses
// when conflicts are non-empty or the database changed after preview.
```

Keep the external interface to `previewPlayerIdentityMerge(input)` and
`mergePlayerIdentities(input, expectedFingerprint)`. The static table rewrite
list, collision queries, audit insert, and delete remain implementation details.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate migration | `bun nx run database:db-generate` | exit 0 and one new committed migration |
| Database tests | `bun nx run database:test -- --run` | all tests pass |
| Fantasy tests | `bun nx run fantasy:test -- --run` | all tests pass |
| Typecheck | `bun nx run-many -t typecheck -p database,importer,fantasy` | exit 0 |
| Full verification | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use the `codebase-design` skill if available. The merge workflow should be a
  deep module: two operations at the interface, all relational complexity in
  the implementation.
- Use the `neon-postgres` skill if available when reviewing transaction and
  constraint behavior. Do not run the migration against production during
  implementation.

## Scope

**In scope**:

- `packages/database/src/lib/schema.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- `packages/database/src/lib/player-identity-reconciliation.ts` (create)
- `packages/database/src/lib/player-identity-reconciliation.spec.ts` (create)
- `packages/database/migrations/00NN_*.sql` and matching `meta/*` generated by Drizzle
- `packages/importer/scripts/reconcile-player-identities.ts` (create)
- `packages/importer/package.json`
- `package.json`
- `packages/fantasy/src/lib/valuation-lab.ts`
- `packages/fantasy/src/lib/valuation-lab.spec.ts`
- `README.md`

**Out of scope**:

- Fuzzy or automatic player merges.
- A public web UI for reconciliation.
- Manager/team identity reconciliation.
- Editing ignored league data or provider caches.
- Deleting conflicting rows to make a merge pass.

## Git workflow

- Branch: `advisor/001-reconcile-player-identities`
- Use conventional commits, for example
  `feat: reconcile canonical player identities`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the merge audit model and pure preview fingerprint

Add `playerIdentityMerges` to `schema.ts`. Store a generated ID, source and
target player UUID values without foreign keys (the source row is deleted by a
successful merge), canonical names at merge time, preview fingerprint, reason,
resolver user ID, reference-count JSON, and timestamp. Generate a Drizzle
migration; inspect it to confirm it only adds this table and indexes.

Create `player-identity-reconciliation.ts` with pure functions that normalize a
sorted preview payload and create a stable SHA-256 fingerprint. The fingerprint
must not depend on object-key or query-row order. Export its types from the
database runtime module only when callers require them.

**Verify**: `bun nx run database:test -- --run` -> tests prove equivalent
reordered previews have the same fingerprint and changed references/conflicts
change it.

### Step 2: Implement collision-safe preview

Add `previewPlayerIdentityMerge` to `DatabaseService` and the Postgres adapter.
Validate distinct, existing source/target players. Query reference counts and
collision keys for every current player foreign-key table. Return deterministic
table/key ordering and the pure fingerprint. Do not mutate data.

For tables with a uniqueness constraint, report the logical key that would
collide after replacing the source UUID with the target UUID. Do not report a
conflict merely because both players occur in different seasons or snapshots.

**Verify**: `bun nx run database:typecheck` -> exit 0. Unit tests cover missing
players, same-player input, stable ordering, and at least one representative
composite-key collision.

### Step 3: Implement one transactional commit

Add `mergePlayerIdentities`. Inside one transaction:

1. Lock both `players` rows.
2. Recompute the preview and compare its fingerprint with
   `expectedFingerprint`.
3. Refuse stale fingerprints or any non-empty conflict list.
4. Update every player foreign key from source to target.
5. Insert the immutable audit record.
6. Delete the now-unreferenced source player.
7. Assert no source references remain before commit.

Return the audit ID and moved reference counts. Map failures to a dedicated
database operation name without exposing SQL details.

**Verify**: `bun nx run database:test -- --run` -> all tests pass; the pure
operation-plan tests prove every known reference table is included and a new
table cannot be added to the declared registry without updating its assertion.

### Step 4: Add a dry-run-first operator command

Create `reconcile-player-identities.ts` with required `--source`, `--target`,
and `--reason` arguments. Default behavior prints names, reference counts,
conflicts, and the preview fingerprint without writing. `--commit` must rerun
preview and supply its fingerprint to the commit. Require an explicit
`--resolved-by` value for the audit actor; never infer a Better Auth ID in a CLI.

Add an Nx target and root scripts:

- `players:reconcile` -> dry run
- `players:reconcile:commit` -> forwards `--commit`

Never print provider credentials or database URLs.

**Verify**: `bun nx run importer:typecheck` -> exit 0; invoking the command with
no arguments exits non-zero with usage text and performs no database call.

### Step 5: Remove the runtime heuristic after the real merges are committed

First run the dry-run command for every bridge currently reported by the
valuation lab and review conflicts. Only after the operator has committed the
approved merges, remove `playerNameKey`, `historicalIdsByName`, and the
suffix-only fallback from `buildAuctionValuationLab`. Current and historical
records must join only by canonical UUID or an explicit `historicalPlayerId`
supplied by a caller.

Replace the suffix-bridge test with tests proving split UUIDs remain unjoined
and reconciled UUIDs join normally. Remove the durable-merge limitation text.

**Verify**: `bun nx run fantasy:test -- --run` -> all tests pass and
`rg -n "suffix-insensitive|historicalIdsByName|playerNameKey" packages/fantasy/src/lib/valuation-lab.ts`
returns no matches.

### Step 6: Document the workflow

Document dry run, conflict review, commit, and the fact that merges are
irreversible without database restore. State that name similarity is evidence
for a human, never merge authorization.

**Verify**: `bun run check` -> exit 0.

## Test plan

- Model pure tests after `packages/fantasy/src/lib/valuation-lab.spec.ts` and
  database error tests after `packages/database/src/lib/database.spec.ts`.
- Cover deterministic fingerprints, same-ID rejection, missing IDs, every
  unique-key collision family, stale-preview rejection, complete reference
  registry coverage, and successful no-conflict planning.
- If the repository has no disposable Postgres integration harness, do not add
  a test that touches Neon. Test the pure reconciliation planner and keep SQL in
  one reviewed transaction. Record the missing integration harness as a
  maintenance note.

## Done criteria

- [x] A dry run reports every source reference and collision without writing.
- [x] Commit requires a matching preview fingerprint and zero conflicts.
- [x] One transaction moves all known references, audits the merge, and deletes the source.
- [x] The valuation lab no longer performs name-based runtime identity joins.
- [x] `bun nx run-many -t typecheck -p database,importer,fantasy` exits 0.
- [x] `bun nx run database:test -- --run` and `bun nx run fantasy:test -- --run` pass.
- [x] `bun run check` exits 0.
- [x] Only in-scope files and `plans/README.md` are modified.

## STOP conditions

- The preview finds conflicting logical rows. Report them; do not delete,
  combine, or select a winner.
- Any player-referencing table exists outside the declared registry.
- The merge requires disabling foreign keys or uniqueness constraints.
- A source player has provider identities that a human has not approved moving.
- The current production data cannot be backed up/restored before an operator
  runs the commit command.

## Maintenance notes

- Every future table with a `player_id` foreign key must be added to the merge
  registry and its coverage test.
- Reviewers should scrutinize lock order, stale-preview protection, composite
  uniqueness checks, and audit completeness.
- Plan 002 will add valuation-player references and must either land after all
  current merges or extend this registry before any later merge.
