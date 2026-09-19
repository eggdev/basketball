# Plan 005: Make pre-draft scenarios selectable and comparable

> **Executor instructions**: Follow this plan step by step. Run each verification
> gate and stop on any STOP condition. Update this plan's row in
> `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 009198a..HEAD -- packages/database/src/lib/schema.ts packages/database/src/lib/database.ts apps/web/src/app/draft apps/web/src/app/actions.ts apps/web/src/lib/pre-draft-workspace.ts agent/instructions/owner-context.ts`
> Stop if another change has already introduced explicit active-plan semantics
> or changed the plan ownership model.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction / planning workflow
- **Planned at**: commit `009198a`, 2026-09-18

## Why this matters

The database already permits several named plans, but the read model silently
chooses the most recently updated active row and the UI shows only that plan.
That makes alternative builds difficult to find, compare, or intentionally use
with Eve and the live evaluator. This plan makes scenario identity explicit and
adds copy, activate, archive, and comparison workflows without putting scenario
selection logic in every caller.

## Current state

- `packages/database/src/lib/schema.ts:516-567` stores named plans and targets;
  uniqueness is owner + season + name and `status` defaults to `active`.
- `packages/database/src/lib/database.ts:818-832` exposes only one `plan` in
  `PreDraftWorkspace`.
- `packages/database/src/lib/database.ts:2595-2605` picks the most recently
  updated active plan implicitly.
- `packages/database/src/lib/database.ts:2627-2701` upserts by plan name and
  reactivates the row.
- `apps/web/src/app/draft/page.tsx:139-247` renders one editable plan;
  `page.tsx:312-394` scopes targets to that one plan.
- `apps/web/src/app/actions.ts:61-122` has save-plan and save-target server
  actions with authenticated writes and `revalidatePath('/draft')`.
- `apps/web/src/lib/pre-draft-workspace.ts:10-17` is the server adapter used by
  pages and evaluators. Keep active-plan selection inside the database module.

Target workspace interface:

```ts
interface PreDraftWorkspace {
  league: ...;
  owner: ...;
  activePlanId: string | null;
  selectedPlan: PreDraftPlan | null;
  plans: readonly PreDraftPlanSummary[];
}
```

One database command interface should handle `create`, `duplicate`, `update`,
`activate`, and `archive` with ownership/season checks. Callers must not emulate
activation by timestamps.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate migration | `bun nx run database:db-generate` | one additive migration |
| Database tests | `bun nx run database:test -- --run` | all pass |
| Web tests | `bun nx run web:test -- --run` | all pass |
| Typecheck | `bun nx run-many -t typecheck -p database,web,agent` | exit 0 |
| Full verification | `bun run check && bun run build` | both exit 0 |

## Suggested executor toolkit

- Use `codebase-design`: scenario lifecycle belongs behind one database module
  interface, not distributed server-action SQL.
- Use `neon-postgres` for partial uniqueness/selection constraints.
- Use `nx-run-tasks` for verification.

## Scope

**In scope**:

- `packages/database/src/lib/schema.ts`
- `packages/database/src/lib/database.ts`
- `packages/database/src/lib/database.spec.ts`
- generated database migration and metadata
- `apps/web/src/lib/pre-draft-workspace.ts`
- `apps/web/src/lib/pre-draft-scenarios.ts` (create)
- `apps/web/src/lib/pre-draft-scenarios.spec.ts` (create)
- `apps/web/src/app/actions.ts`
- `apps/web/src/app/draft/page.tsx`
- optional draft-local client view extracted from that page
- `apps/web/src/app/workspace.module.css`
- `apps/web/specs/index.spec.tsx`
- `agent/instructions/owner-context.ts`
- related agent tests, if present
- `README.md`

**Out of scope**:

- Mock-auction execution.
- Automatically choosing the statistically best plan.
- Sharing plans with other league managers.
- Deleting plans permanently; archive instead.
- Changing scoring, projections, or live bid formulas.

## Git workflow

- Branch: `advisor/005-manage-draft-scenarios`
- Conventional commit example: `feat: manage pre-draft scenarios`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add explicit active-plan selection

Add a small `pre_draft_plan_selections` table keyed by league member + league
season with an active plan FK and timestamps. Prefer this over overloading every
plan's status: one row expresses one selection, while plans may independently be
`draft`, `active`, or `archived`. Add constraints ensuring the selected plan
belongs to the same member/season in the commit operation; if the database
cannot express the cross-row rule declaratively, enforce it transactionally.

Generate and inspect the migration. Existing deployments have no selection;
the read model may deterministically choose the newest non-archived plan once
and write a selection only on the first explicit activation. Do not perform a
surprising data migration based on timestamps.

**Verify**: `bun nx run database:typecheck` -> exit 0 and migration is additive.

### Step 2: Deepen the scenario persistence interface

Replace the timestamp-based single-plan read with a workspace that returns plan
summaries, `activePlanId`, and `selectedPlan`. Accept an optional requested plan
ID for preview; validate owner/season and reject archived/foreign plans.

Add transactional commands:

- create with a unique name;
- duplicate from a source plan, including targets, with a new name;
- update by immutable plan ID rather than name upsert;
- activate exactly one plan;
- archive a nonactive plan, or require a replacement activation in the same
  transaction.

Never authorize by plan ID alone. Every command includes the canonical owner
and season and verifies membership.

**Verify**: `bun nx run database:test -- --run` -> pure command validation tests
cover foreign plan IDs, duplicate names, target copying, active archive refusal,
and deterministic default selection.

### Step 3: Add typed server-action parsing

Create `pre-draft-scenarios.ts` for pure FormData parsing/validation, following
`team-reconciliation.ts`. Keep actions in `actions.ts` thin: authenticate,
parse, call one database command, and revalidate `/draft`.

Use separate action intents or separate actions for create/copy/activate/archive
rather than a magic form with ambiguous fields. Return actionable errors via
`useActionState` for mutations that can fail normally.

**Verify**: `bun nx run web:test -- --run` -> parser tests cover required names,
UUID shape, budgets, streaming range, lifecycle intents, and no partial command
on validation failure.

### Step 4: Build scenario selection and comparison UI

On `/draft`, add:

- a compact scenario selector with Active/Preview/Archived labels;
- create and duplicate actions;
- explicit `Make active` and `Archive` controls;
- route selection through `?plan=<id>` so refresh/share within the authenticated
  app preserves the preview;
- comparison for two or three plans showing budgets, risk, streaming slots,
  targets/watches/avoids, and target max bids.

Editing a preview must update that plan by ID; it must not silently activate it.
The live bid panel and default Eve context continue to use only the active plan,
unless the user explicitly chooses a preview-scoped workshop prompt.

**Verify**: `bun nx run web:test -- --run` -> integration tests cover create,
duplicate with targets, activate, archive, query-param preview, refresh state,
and clear distinction between preview and active live context.

### Step 5: Align Eve context

Update owner context so each turn identifies active plan ID/name and, when
applicable, selected preview plan ID/name. Tell Eve never to treat preview
changes as live-draft guardrails until activation. Update page prompts to ask
for scenario comparison using explicit names.

**Verify**: agent typecheck/tests pass and serialized owner context contains no
Better Auth identifiers.

### Step 6: Document lifecycle semantics

Document active versus preview versus archived, target copying, and the fact
that only the active plan powers default live recommendations.

**Verify**: `bun run check && bun run build` -> both exit 0.

## Test plan

- Follow `team-reconciliation.spec.ts` for typed action parsing.
- Add database pure validation tests for every lifecycle transition.
- Extend `apps/web/specs/index.spec.tsx` or add a focused draft scenario test for
  the rendered selection and comparison states.
- Test that duplicate copies targets with new target IDs and leaves the source
  unchanged.

## Done criteria

- [ ] The workspace lists all nondeleted plans and has one explicit active plan.
- [ ] Create, duplicate, update, activate, and archive enforce owner/season scope.
- [ ] A query-selected preview survives refresh but does not affect live guards.
- [ ] Two or three scenarios can be compared on decision-relevant fields.
- [ ] Eve receives active and preview roles explicitly.
- [ ] No code selects the active plan via `order by updated_at desc limit 1`.
- [ ] `bun run check && bun run build` exits 0.

## STOP conditions

- Existing production has several plans whose intended active choice cannot be
  determined safely; request the user's choice rather than infer it.
- A command could mutate a plan without verifying canonical owner and season.
- Archiving the active plan would leave live evaluation with an implicit plan.
- UI work requires storing ignored private data in source files.

## Maintenance notes

- Simulation runs in Plan 007 must record immutable plan ID plus a scenario
  input fingerprint; a later plan edit must not rewrite old simulation meaning.
- Reviewers should scrutinize active/preview separation and ownership checks.
- Deletion remains intentionally deferred because archived plans may be
  referenced by future simulation and conversation records.

