# Plan 007: Simulate saved auction scenarios

> **Executor instructions**: Follow this plan step by step and run every
> verification gate. Stop on any STOP condition; do not improvise. Update this
> plan's row in `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 009198a..HEAD -- packages/fantasy packages/database apps/web/src/app/draft apps/web/src/lib agent package.json README.md`
> Plans 004, 005, and 006 are required. Stop if their usable-value, scenario,
> or manager-demand interfaces are absent or materially different.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/004-value-usable-lineup-production.md`,
  `plans/005-manage-draft-scenarios.md`,
  `plans/006-model-manager-auction-demand.md`
- **Category**: direction / simulation
- **Planned at**: commit `009198a`, 2026-09-18

## Why this matters

The app can describe past prices and evaluate one live bid, but it cannot yet
answer whether a complete plan survives realistic competition. This plan adds a
seeded Monte Carlo auction module using promoted player values, legal budgets
and rosters, saved Brendan scenarios, and uncertainty-aware manager priors. It
reports target hit rates, roster-value distributions, downside, and fallback
paths rather than pretending to predict one exact draft.

## Current state

- `apps/web/src/app/draft/page.tsx:120-127` labels manager demand curves and mock
  simulations as the next model.
- `packages/database/src/lib/schema.ts:516-567` persists plans and targets; Plan
  005 makes their selection/lifecycle explicit.
- `packages/fantasy/src/lib/valuation-lab.ts` and Plan 004 provide market value
  and usable production as separate signals.
- Plan 006 provides stochastic manager participation/willingness distributions.
- The live evaluator's deterministic budget rules in
  `packages/fantasy/src/lib/live-bid.ts` are the behavioral reference for minimum
  bids and remaining-roster reserves. Reuse rules; do not fork them.

The simulation module's external interface should be one operation:

```ts
simulateAuction(input: AuctionSimulationInput): AuctionSimulationResult
```

The input includes immutable IDs/fingerprints for promoted valuation,
season-calendar, league format, manager-demand model, and saved plan; a seed;
iteration count; and documented simulation settings. The result contains
distributions and representative traces. Random number generation, nomination
turns, bidder participation, legal bid resolution, and roster derivation remain
internal.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Fantasy tests | `bun nx run fantasy:test -- --run` | all pass |
| Database tests | `bun nx run database:test -- --run` | all pass |
| Web tests | `bun nx run web:test -- --run` | all pass |
| Agent typecheck | `bun nx run agent:typecheck` | exit 0 |
| Full verification | `bun run check && bun run build` | both exit 0 |

## Suggested executor toolkit

- Use `codebase-design`: one simulation interface should hide the state
  machine and seeded sampling.
- Use `tdd`: auction invariants must be executable, not reviewer intuition.
- Use `neon-postgres` for immutable simulation-run persistence.
- Use `nx-run-tasks` for verification.

## Scope

**In scope**:

- `packages/fantasy/src/lib/auction-simulator.ts` (create)
- `packages/fantasy/src/lib/auction-simulator.spec.ts` (create)
- shared auction budget/roster guard helpers extracted from
  `packages/fantasy/src/lib/live-bid.ts` when necessary
- `packages/fantasy/src/index.ts`
- `packages/database/src/lib/schema.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- generated migration and metadata
- `apps/web/src/lib/auction-simulation.ts` (create)
- `apps/web/src/app/draft/simulations/page.tsx` (create)
- draft-local simulation controls/results components and tests
- `apps/web/src/app/draft/page.tsx`
- `apps/web/src/app/workspace.module.css`
- `agent/tools/auction_scenarios.ts` (create)
- `agent/instructions.md`
- `package.json` only if a benchmark script/target is added
- `README.md`

**Out of scope**:

- Calling Fantrax, placing bids, or using live draft state.
- LLM-controlled bidding decisions inside the simulation loop.
- Claiming playoff/championship probabilities.
- Opponent personality labels or hand-authored manager exceptions.
- Modeling trades, waiver pickups, injuries, or in-season matchups.

## Git workflow

- Branch: `advisor/007-simulate-auctions`
- Conventional commit example: `feat: simulate auction scenarios`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Specify the auction state machine and invariants

Define immutable input/output types and internal state transitions for:

- selecting/nominating an available player;
- manager participation and willingness-to-pay sampling;
- legal winner/price resolution;
- player removal from the pool;
- team budget and roster updates;
- $1 minimum reserve for every remaining roster spot;
- completion when all standard roster spots are filled or no legal award
  remains.

Use a seedable PRNG implemented or injected inside the pure module. Same seed +
same fingerprinted input must return byte-equivalent results. Sort managers and
players by stable IDs before random draws so database order cannot alter a run.

**Verify**: `bun nx run fantasy:test -- --run` -> state-machine tests prove no
duplicate players, negative budgets, overfilled rosters, or unfunded remaining
spots.

### Step 2: Implement bidding and nomination behavior

For each nominated player:

- obtain each manager's participation/willingness distribution from Plan 006;
- sample within that distribution using the run PRNG;
- apply current budget/roster legality;
- use Brendan's saved target stance, max bid, risk posture, budget buckets, and
  streaming-slot intent as constraints/signals;
- resolve a winning price using an explicitly documented second-price-like or
  ascending-bid rule that never exceeds the winner's sampled willingness.

When historical nomination coverage is inadequate, use a league-prior/random
nomination policy and label it. Do not invent manager-specific nomination
preferences.

**Verify**: fixtures cover one bidder, tied bidders, target max bid, avoid
stance, exhausted tier budget, no legal bidder, and deterministic tie-breaking.

### Step 3: Aggregate Monte Carlo scenario outcomes

Run a configurable number of iterations and return distributions for:

- total usable regular-season and playoff-weighted roster value;
- projected availability/fragility concentration;
- target acquisition and avoid-player rates;
- spend by budget tier, final unspent budget, and streaming slots preserved;
- position/lineup coverage and congestion loss;
- downside percentiles and common fallback players;
- representative best/median/worst traces selected deterministically.

Do not name any result `playoff probability`. Use `scenario score`, `usable
points`, or the exact measured quantity.

**Verify**: aggregation tests use fixed seeds and exact expected percentiles;
iteration order does not change output.

### Step 4: Add immutable simulation-run persistence

Add `auction_simulation_runs` with owner, league season, plan ID, seed,
iteration count, simulator version, every input artifact ID/fingerprint,
settings, summary result JSON, status, and timestamps. Store representative
traces separately or in bounded compressed JSON; do not store every event from
thousands of iterations.

`saveAuctionSimulationRun` must be idempotent by full input fingerprint. A plan
edit creates a different fingerprint/run rather than rewriting old results.

**Verify**: database tests/typecheck and generated migration; identical input
returns the existing run, changed seed/plan/artifact produces a new run.

### Step 5: Build the scenario simulation room

Add `/draft/simulations` with:

- scenario picker from Plan 005;
- promoted valuation/schedule/manager-model provenance;
- seed and bounded iteration controls with sensible defaults;
- run action and progress/pending state;
- comparison of multiple saved scenarios on distributions and downside;
- target hit/fallback tables and representative roster traces;
- clear limitations/sample warnings.

Run simulation server-side. Bound iteration count and execution time for
Vercel; if the desired workload exceeds the request budget, STOP and introduce
a durable job design rather than fire-and-forget work in a request.

**Verify**: web tests cover missing promoted inputs, successful fixed-seed run,
scenario comparison, stale artifact labeling, and authenticated ownership.

### Step 6: Give Eve read-only simulation access

Add a bounded tool to list or inspect saved simulation runs by scenario. Return
provenance, distributions, target rates, downside, and limitations. Eve may
compare results and suggest assumptions to test; it must not trigger an
unbounded run or describe results as certainty.

**Verify**: agent typecheck/tests prove bounded result size, owner scoping, and
required model/version/sample fields.

### Step 7: Benchmark and document

Add a deterministic benchmark for a 12-team, 13-player, 430-player board at the
default iteration count. Record warm p50/p95 runtime and memory in the README or
a checked-in benchmark note. Choose the default so a normal request fits the
deployment limit with headroom.

**Verify**: benchmark exits 0 within the documented threshold;
`bun run check && bun run build` -> both exit 0.

## Test plan

- Pure state-machine tests for every auction legality invariant.
- Seed-repeatability tests and input-order invariance.
- Statistical aggregation tests use deterministic fixtures, not flaky random
  tolerances.
- Regression tests prove Brendan's saved max bid and avoid stance are never
  violated.
- Persistence tests cover idempotency and immutable provenance.
- UI tests cover authenticated access, stale/missing inputs, comparison, and
  noncausal labels.

## Done criteria

- [ ] Same seed and input fingerprint produce identical results.
- [ ] Every simulated draft obeys player uniqueness, roster size, budgets, and minimum reserves.
- [ ] Opponent bids sample Plan 006 distributions and preserve their uncertainty.
- [ ] Results report distributions, target rates, fallback paths, and downside.
- [ ] No output is labeled playoff/championship probability.
- [ ] Saved runs retain exact plan/model/calendar/demand provenance and are immutable.
- [ ] Default workload fits the documented Vercel execution budget with headroom.
- [ ] `bun run check && bun run build` exits 0.

## STOP conditions

- Any required Plan 004/005/006 interface or promoted artifact is unavailable.
- Simulation rules cannot share budget/roster invariants with live evaluation.
- Default iterations exceed the server request time/memory budget; design a
  durable queued job before continuing.
- Manager profiles lack uncertainty intervals and would be reduced to fixed bids.
- A result requires being described as real playoff probability to appear useful.

## Maintenance notes

- Simulator/model versions and every input fingerprint are part of result
  identity; changing rules must create a new run.
- Reviewers should scrutinize legality invariants, deterministic random order,
  Vercel runtime, and epistemic labels.
- The durable live auction ledger remains separate future work. Its real events
  can later replay through this state machine for evaluation, but this plan must
  not couple simulation to Fantrax transport.
