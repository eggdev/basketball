# Plan 002: Persist and promote immutable auction valuation runs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before continuing. Stop
> on any STOP condition; do not improvise. Update this plan's row in
> `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 009198a..HEAD -- packages/fantasy packages/database packages/importer apps/web/src/lib apps/web/src/app/draft package.json README.md`
> Plan 001 is expected to change identity-related portions. Reconcile those
> changes, but stop if valuation interfaces or projection snapshot shapes have
> changed incompatibly.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/001-reconcile-player-identities.md`
- **Category**: direction / model governance
- **Planned at**: commit `009198a`, 2026-09-18

## Why this matters

The calibration lab currently rebuilds four candidate models in memory on each
request and the live board consumes whichever model wins at that moment. A new
projection or corrected historical record can therefore change the selected
model without leaving a durable explanation. Persisted candidates plus explicit
promotion make every live recommendation reproducible and give the public case
study an auditable chain from input snapshots to selected model and player
prices.

## Current state

- `packages/fantasy/src/lib/valuation-lab.ts:112-121` returns the model results,
  selected model, current estimates, methodology, limitations, and
  `walk-forward-v1` version as a pure value.
- `packages/fantasy/src/lib/valuation-lab.ts:536-563` evaluates four fixed
  candidates and selects the lowest drafted-player MAE in memory.
- `apps/web/src/app/draft/valuation/page.tsx:36-45` rebuilds the lab from the
  latest rankings, projection, and league settings on every request.
- `apps/web/src/lib/create-live-bid-board.ts:18-35` independently rebuilds the
  same lab for the live board.
- `packages/database/src/lib/schema.ts:408-467` persists immutable projection
  snapshots, while `schema.ts:624-664` persists ranking runs. There is no
  equivalent valuation-run record.
- Import commands use a validate-first, explicit-commit pattern. Match
  `projections:validate` / `projections:import` in `package.json` and
  `packages/importer/scripts/import-projections.ts`.

The deep module interface should be three operations:

```ts
readonly auctionValuationRun: (runId: string) => Effect<...>;
readonly promotedAuctionValuationRun: (seasonKey: string) => Effect<... | null>;
readonly saveAuctionValuationRun: (artifact: AuctionValuationArtifact) => Effect<...>;
readonly promoteAuctionValuationRun: (runId: string, promotedByUserId: string) => Effect<...>;
```

The artifact must include its own stable fingerprint, model version, input
projection snapshot ID, exact historical ranking-run IDs or deterministic
historical-input fingerprint, league settings, all candidate metrics, selected
model rationale, limitations, and current player estimates. SQL layout remains
inside the database implementation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate migration | `bun nx run database:db-generate` | one additive migration |
| Fantasy tests | `bun nx run fantasy:test -- --run` | all pass |
| Database tests | `bun nx run database:test -- --run` | all pass |
| Importer tests | `bun nx run importer:test -- --run` | all pass |
| Web tests | `bun nx run web:test -- --run` | all pass |
| Full verification | `bun run check && bun run build` | both exit 0 |

## Suggested executor toolkit

- Use `codebase-design` for the valuation artifact seam: callers should not
  learn storage tables or reconstruct artifacts.
- Use `neon-postgres` for immutable-run constraints and promotion transaction
  review. Do not migrate production during implementation.
- Use `nx-run-tasks` for the verification commands.

## Scope

**In scope**:

- `packages/fantasy/src/lib/valuation-lab.ts`
- `packages/fantasy/src/lib/valuation-lab.spec.ts`
- `packages/fantasy/src/index.ts`
- `packages/database/src/lib/schema.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- `packages/database/migrations/00NN_*.sql` and matching generated metadata
- `packages/importer/src/lib/auction-valuation-run.ts` (create)
- `packages/importer/src/lib/auction-valuation-run.spec.ts` (create)
- `packages/importer/scripts/calibrate-auction-values.ts` (create)
- `packages/importer/src/index.ts`
- `packages/importer/package.json`
- `apps/web/src/lib/valuation-lab.ts`
- `apps/web/src/lib/create-live-bid-board.ts`
- `apps/web/src/lib/live-bid-evaluator.ts`
- `apps/web/src/app/draft/valuation/page.tsx`
- `apps/web/src/app/draft/page.tsx`
- related web tests under the same feature directories
- `package.json`
- `README.md`

**Out of scope**:

- Adding new predictive features or changing model formulas.
- Automatically promoting the lowest-MAE candidate.
- Treating a candidate run as live before explicit promotion.
- Keeping the suffix-based identity bridge from Plan 001.
- Deleting prior runs when a new run is promoted.

## Git workflow

- Branch: `advisor/002-persist-valuation-runs`
- Conventional commit example:
  `feat: persist promoted auction valuations`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define a deterministic valuation artifact

Add a versioned `AuctionValuationArtifact` type and pure builder around
`AuctionValuationLab`. Include:

- artifact/model version;
- season and league budget/roster/team settings;
- projection snapshot ID, model version, and as-of timestamp;
- deterministic historical-input fingerprint and included season keys;
- complete candidate summaries and per-season metrics;
- selected-model ID and explicit selection rule;
- methodology and limitations;
- current player estimates;
- stable SHA-256 fingerprint created from canonical key ordering.

Do not place timestamps generated at runtime inside the fingerprint. Do not
silently omit predictions needed to reproduce displayed metrics.

**Verify**: `bun nx run fantasy:test -- --run` -> tests prove identical inputs
produce identical artifacts/fingerprints, changed projection or league settings
change the fingerprint, and input ordering does not.

### Step 2: Add immutable run storage and one promoted run per season

Add:

- `auction_valuation_runs`: immutable artifact metadata, input references,
  fingerprint, full candidate result JSON, status, creation time, and promotion
  metadata;
- `auction_valuation_players`: run/player estimates required by draft queries.

Use a unique fingerprint and a partial unique index allowing at most one
`promoted` run per league season. Promotion must be transactional: demote the
previous promoted run to `superseded`, promote the requested candidate, and
record actor/time. Candidate artifact columns and player rows must never be
updated after creation.

Generate and inspect the migration.

**Verify**: `bun nx run database:typecheck` -> exit 0; schema tests/typechecks
confirm cents remain integers and player/run uniqueness is enforced.

### Step 3: Implement persistence and promotion operations

Implement the database interface described above. `saveAuctionValuationRun`
must be idempotent by fingerprint and insert the run plus all player estimates
in one transaction. `promoteAuctionValuationRun` must refuse:

- unknown or incomplete runs;
- a run whose season does not match its projection snapshot;
- a run whose referenced player IDs no longer exist;
- promotion without an actor ID.

The promoted read model must return enough data for `createLiveBidBoard` without
re-running calibration.

**Verify**: `bun nx run database:test -- --run` -> all pure serialization and
promotion-state tests pass. If no disposable Postgres harness exists, keep SQL
localized and state that limitation in the plan status note; do not connect to
production from tests.

### Step 4: Add validate, import, and promote commands

Create `calibrate-auction-values.ts` following existing importer scripts:

- no flag: load inputs, build artifact, print fingerprint, candidate metrics,
  selected model, input snapshot IDs, and current estimate count; no writes;
- `--commit`: persist the candidate idempotently but do not promote it;
- `--promote=<run-id>`: promote an already persisted run explicitly and print
  the displaced promoted run, if any.

Add Nx/root scripts `valuation:validate`, `valuation:import`, and
`valuation:promote`. Never accept a model result from stdin or an unvalidated
JSON blob.

**Verify**: `bun nx run importer:test -- --run` -> tests cover dry-run purity,
stable fingerprint, idempotent save request, and required promotion ID.

### Step 5: Make the UI and live evaluator read the promoted run

Change `createLiveBidBoard` to accept a promoted valuation read model instead
of rebuilding the lab. Update both the draft page and server evaluator to load
that same run. A promoted run is usable only when its season and projection
snapshot ID equal the currently loaded projection; otherwise the board must
fall back to historical/projection value and show a stale-calibration warning.

The valuation page may calculate a preview for research, but it must clearly
label `Preview`, `Persisted candidate`, `Promoted`, or `Stale`. Show run ID,
fingerprint prefix, projection as-of, and promotion time. Never imply that a
preview powers live advice.

**Verify**: `bun nx run web:test -- --run` -> tests prove live evaluation uses
the promoted values, refuses stale snapshot linkage, and does not invoke the lab
builder on the hot path.

### Step 6: Document the promotion contract

Document the three commands, immutable inputs, promotion review, stale behavior,
and rollback by promoting an older compatible run. Explain that promotion
governs live price estimates; it does not change source projections or
historical records.

**Verify**: `bun run check && bun run build` -> both exit 0.

## Test plan

- Extend `valuation-lab.spec.ts` for deterministic artifact creation.
- Add importer tests patterned after
  `packages/importer/src/lib/hashtag-projections.spec.ts`.
- Add web tests near `live-bid-board.spec.ts` proving exact promoted-run use,
  stale fallback, and absence of runtime calibration.
- Cover promotion replacement, idempotent fingerprint insertion, cents
  preservation, missing input references, and stable candidate metric JSON.

## Done criteria

- [ ] Each valuation candidate is immutable and reproducible from recorded inputs.
- [ ] Exactly one run can be promoted per league season.
- [ ] Promotion is explicit and attributable; saving never auto-promotes.
- [ ] Draft UI, HTTP evaluator, and Eve live tool consume the same promoted run.
- [ ] A stale/missing run fails visibly to a deterministic fallback.
- [ ] `rg -n "createAuctionValuationLab" apps/web/src/lib/create-live-bid-board.ts apps/web/src/lib/live-bid-evaluator.ts` returns no hot-path calls.
- [ ] `bun run check && bun run build` exits 0.
- [ ] Only in-scope files and `plans/README.md` are modified.

## STOP conditions

- Plan 001 has not removed unresolved current/historical player bridges.
- An artifact cannot identify its exact projection snapshot or historical input
  fingerprint.
- Promotion would require mutating a stored candidate artifact.
- Current live callers cannot agree on one promoted run without duplicating
  selection logic.
- Database migration generation includes destructive changes unrelated to the
  new tables.

## Maintenance notes

- Every future model feature must increment the artifact/model version and be
  represented in the fingerprinted parameters.
- Reviewers should verify no future data enters a historical walk-forward fold.
- Plan 004 will create a new usable-points valuation basis; it must create and
  promote a new run, never edit this plan's earlier artifacts.

