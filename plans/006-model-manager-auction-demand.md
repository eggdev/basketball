# Plan 006: Learn uncertainty-aware manager auction demand profiles

> **Executor instructions**: Follow this plan step by step and run every
> verification command. Stop on any STOP condition; do not improvise. Update
> this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 009198a..HEAD -- packages/fantasy packages/database/src/lib/database.ts packages/database/src/lib/schema.ts apps/web/src/app/managers apps/web/src/app/waivers agent/tools/league_team_history.ts`
> Plans 001 and 002 are expected to change player and valuation references. Stop
> if promoted walk-forward price estimates cannot be queried by historical
> season and player.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/001-reconcile-player-identities.md`,
  `plans/002-persist-promote-valuation-runs.md`
- **Category**: direction / behavioral model
- **Planned at**: commit `009198a`, 2026-09-18

## Why this matters

Manager pages currently show repeat players and season spend, but mock auctions
need distributions: how concentrated each manager's spending is, which price
tiers they favor, how much they deviate from leakage-free league estimates, and
how strong repeat-player loyalty appears. Only a few seasons exist per manager,
so this plan shrinks individual signals toward a league prior and evaluates
next-season behavior before simulation consumes them. It must communicate
uncertainty instead of manufacturing precise personalities from tiny samples.

## Current state

- `packages/database/src/lib/database.ts:1667-1705` computes only five favorite
  players per manager, ranked by repeat selections and spend.
- `packages/database/src/lib/database.ts:1722-1758` aggregates purchase count,
  average cost, and total spend by season.
- `packages/database/src/lib/schema.ts:593-621` already retains auction amount,
  nomination order, roster slot, team, player, and season for each purchase.
- `apps/web/src/app/managers/[memberId]/page.tsx:86-124` shows season totals and
  explicitly says standings, transactions, and outcomes still need joining.
- `apps/web/src/app/waivers/waivers-view.tsx:210-269` already labels manager
  churn/outcome relationships as associations rather than causes. Preserve that
  epistemic language.
- Plan 002 provides versioned walk-forward price predictions; only predictions
  made without target-season outcomes may be used as historical price baselines.

The pure deep-module interface should be:

```ts
buildManagerDemandProfiles(input: ManagerDemandInput): ManagerDemandModel
scoreManagerDemand(model: ManagerDemandModel, candidate: DemandCandidate): DemandDistribution
```

The first operation hides feature extraction, league-prior estimation,
recency/sample weighting, shrinkage, and walk-forward diagnostics. The second
returns a price/demand distribution for simulation, never one deterministic bid.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Fantasy tests | `bun nx run fantasy:test -- --run` | all pass |
| Database tests | `bun nx run database:test -- --run` | all pass |
| Web tests | `bun nx run web:test -- --run` | all pass |
| Agent typecheck | `bun nx run agent:typecheck` | exit 0 |
| Full verification | `bun run check && bun run build` | both exit 0 |

## Suggested executor toolkit

- Use `codebase-design`: keep raw query shape and statistical internals out of
  the two-operation interface.
- Use `tdd`: small samples and temporal leakage make invariant tests essential.
- Use `nx-run-tasks` for verification.

## Scope

**In scope**:

- `packages/fantasy/src/lib/manager-demand.ts` (create)
- `packages/fantasy/src/lib/manager-demand.spec.ts` (create)
- `packages/fantasy/src/index.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- schema/migration files only if profiles are persisted rather than calculated
  from a versioned artifact
- `apps/web/src/lib/manager-demand.ts` (create adapter)
- `apps/web/src/app/managers/[memberId]/page.tsx`
- `apps/web/src/app/managers/page.tsx`
- relevant manager page tests
- `agent/tools/league_team_history.ts` or a new bounded
  `manager_demand_profiles.ts` tool
- `agent/instructions.md`
- `README.md`

**Out of scope**:

- Personality claims or causal claims about winning.
- Features requiring unavailable historical preseason ADP, projections,
  injuries, or positions.
- Using target-season auction prices or production to predict that same season.
- Training an opaque ML model when a smoothed, inspectable statistical model is
  sufficient.
- Mock-auction state transitions; those belong to Plan 007.

## Git workflow

- Branch: `advisor/006-manager-demand-model`
- Conventional commit example: `feat: model manager auction demand`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Build a leakage-safe manager-season dataset

Add one database read model containing every resolved manager purchase with
season, price/base-budget share, purchase or nomination order when present,
player ID, repeat-player history available before that season, and the Plan 002
walk-forward predicted price/range for that season. Join standings and inferred
roster activity only as descriptive outcomes, not predictive inputs for auction
bids.

Exclude unresolved manager seasons from individual profiles but retain them in
league-level price-tier priors when ownership identity is unnecessary. Include
coverage/missingness flags for nomination order and walk-forward estimates.

**Verify**: database typecheck/tests prove deterministic order, no target-season
realized production in feature fields, and unresolved owners are labeled rather
than misattributed.

### Step 2: Define interpretable demand features and league priors

In `manager-demand.ts`, calculate per manager:

- share of budget in anchor/core/endgame tiers;
- top-one/top-three spend concentration;
- roster price entropy or an equivalent stars-and-scrubs measure;
- price residual versus the leakage-safe market estimate;
- repeat-player selection rate and repeat-player price premium;
- purchase/nomination timing distribution when coverage permits;
- season-to-season variance and effective sample size.

Compute the same distributions league-wide. Shrink each individual estimate
toward the league prior as a documented function of effective seasons and
purchases. If coverage is insufficient, return the league prior plus a wide
uncertainty band rather than zero or a confident manager value.

**Verify**: `bun nx run fantasy:test -- --run` -> hand-calculated fixtures prove
feature math, shrinkage, missing-data fallback, and deterministic output.

### Step 3: Return stochastic demand, not a fixed bid

Implement `scoreManagerDemand` using candidate market estimate/tier, current
manager budget/roster progress, repeat-player flag, and simulation phase. Return
at minimum:

- participation probability;
- willingness-to-pay median;
- lower/upper interval;
- uncertainty/effective sample size;
- top contributing signals as structured explanations.

Clamp willingness to legal remaining budget/minimum-reserve constraints in the
simulator, not in this statistical profile. Seed any sampling outside this
function; scoring the same inputs must be pure.

**Verify**: tests prove a repeat target can move a well-supported profile, a
one-season manager remains close to league prior, missing nomination data does
not become an early/late preference, and all probabilities/intervals are valid.

### Step 4: Run walk-forward diagnostics

For each season after the first, train profiles only on earlier seasons and
evaluate held-out manager purchases. Report:

- price interval coverage and absolute error versus a league-prior baseline;
- price-tier calibration;
- repeat-player precision/recall where meaningful;
- number of managers/seasons/purchases and missing-data rates.

Do not promote a profile model solely because it fits training history. Give the
model an explicit version and serialize settings/diagnostics for Plan 007.

**Verify**: a leakage test changes held-out season results without changing the
profile used to predict that season; diagnostics compare against the league
prior baseline.

### Step 5: Surface profiles with strong uncertainty labels

Update manager pages to show price-shape, repeat loyalty, price residual,
timing coverage, and confidence/effective sample. Join playoff outcome and
roster churn in a separate descriptive section. Use language such as
`observed`, `association`, and `limited sample`; never `will bid` or `caused`.

Expose a bounded Eve tool that returns structured profiles and diagnostics, not
raw private auction rows. Update instructions to disclose sample size and avoid
causal language.

**Verify**: web and agent tests prove low-sample labels appear, missing features
are omitted/labeled, and Eve output includes model version and sample size.

### Step 6: Document model boundaries

Document features, shrinkage, walk-forward evaluation, unavailable inputs, and
why output is a prior for simulation rather than a prediction of a person's
intent.

**Verify**: `bun run check && bun run build` -> both exit 0.

## Test plan

- Use small numeric fixtures with exact expected tier shares and shrinkage.
- Add property/invariant tests for probabilities in `[0,1]`, ordered intervals,
  finite outputs, deterministic sorting, and no held-out leakage.
- Test missing nomination order, one-season managers, unresolved teams, changed
  team names under one canonical manager, and repeat players.
- Page tests must assert uncertainty/sample labels, not exact prose paragraphs.

## Done criteria

- [ ] Every resolved manager receives a versioned profile or explicit prior-only fallback.
- [ ] Individual features shrink toward a league prior based on sample size.
- [ ] Walk-forward diagnostics compare against a league-only baseline.
- [ ] Scoring returns a distribution with structured explanations, not a fixed bid.
- [ ] No unavailable historical ADP/projection/injury feature is fabricated.
- [ ] Manager UI and Eve disclose effective sample and uncertainty.
- [ ] `bun run check && bun run build` exits 0.

## STOP conditions

- Historical prediction rows cannot be proven leakage-free.
- Fewer than two prior seasons exist for every held-out evaluation fold.
- A proposed feature depends on historical data not timestamped before its
  auction.
- The implementation starts encoding named-manager rules or subjective labels.
- The model cannot outperform or calibrate comparably to the league prior; in
  that case keep the prior-only model and report the result.

## Maintenance notes

- Small samples will remain the central limitation. New seasons should update
  effective sample and diagnostics rather than reset profiles.
- Reviewers should inspect temporal joins, shrinkage, and wording more closely
  than visual polish.
- Plan 007 must preserve intervals and sample confidence; it must not collapse
  profiles to one deterministic maximum bid.

