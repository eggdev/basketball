---
version: 1
slug: "draft-workflow"
primary_target: "src/app/draft/draft-workflow.tsx"
related_targets: ["src/app/draft/page.tsx", "src/app/draft/scenario-workspace.tsx", "src/app/draft/live-bid-panel.tsx", "src/app/workflow.module.css"]
---

# Draft Plan

Mode: Operate. Code-led extension of the existing navy/orange Team HQ direction.

THESIS: Turn preparation into an editable sequence of decisions with a saved scenario that can guide draft day.

STORY: Shape the plan → Build the shortlist → Review the plan → Draft day. Stage controls and previous/continue actions expose the sequence. The URL carries `step` while preserving selected-plan query context; navigation updates the visible step. Panels remain mounted and hidden between stages, preserving unsaved form values during stage changes. This is not a promise of persistence after leaving or reloading the route.

FORM: Strategy, goal, risk, anchor/core/endgame budget, streaming slots, and notes are editable. Budget allocation reports allocated, unallocated, and over-budget amounts. Shortlist decisions record target/watch/avoid, priority, optional bid limit, and rationale. Review compares saved alternatives and allows explicit plan activation; the selected working scenario stays visible. Draft day presents live bidding separately from planning. Market ADP and price research sit behind an expandable supporting section in the shortlist stage.

OWN-WORLD: Use inherited compact fields, tonal panels, hairlines, tabular amounts, and orange current-stage/action emphasis. No new visual identity, comp, or FORM seed. Mobile stacks the process and forms while preserving labels and evidence.

EVIDENCE: Saved strategy is owner judgment. Projection rank bands, historical prices, and market ADP are distinct sources, never automatic bids. Stage movement does not save a scenario; owner actions save or activate it. Manual live purchases remain local to the browser. AI explanation does not replace deterministic bidding constraints.

FINISH: `.impeccable/review/offseason/` contains desktop/mobile synthetic captures and `verification.md`. Stage-preservation and query-context tests cover the workflow, including the implemented URL synchronization correction. Populated captures use mocked actions and do not verify authenticated database writes. Independent finish review scored both material fixes resolved and returned ship at that scope.
