'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Horizontally scrollable comparison regions must be keyboard focusable. */

import type {
  PreDraftPlan,
  PreDraftPlanSummary,
  PreDraftScenarioDetailsInput,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';

import { formatPrice } from '../../lib/format';
import type { PreDraftScenarioActionState } from '../../lib/pre-draft-scenarios';
import {
  activatePreDraftScenarioAction,
  archivePreDraftScenarioAction,
  createPreDraftScenarioAction,
  duplicatePreDraftScenarioAction,
  savePreDraftTargetAction,
  updatePreDraftScenarioAction,
} from '../actions';
import { AskEveButton } from '../app-shell';
import styles from '../workspace.module.css';
import flow from '../workflow.module.css';

interface AdpOption {
  readonly playerId: string;
  readonly playerName: string;
  readonly position: string;
  readonly rank: number;
}

const idleState: PreDraftScenarioActionState = { message: null, status: 'idle' };

function SubmitButton({
  children,
  className,
  disabled = false,
  pendingLabel,
}: {
  readonly children: React.ReactNode;
  readonly className: string;
  readonly disabled?: boolean;
  readonly pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={disabled || pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}

function ActionMessage({ state }: { readonly state: PreDraftScenarioActionState }) {
  if (state.status === 'idle' || state.message === null) return null;
  return (
    <output
      aria-live="polite"
      className={state.status === 'error' ? styles.formError : styles.formSuccess}
    >
      {state.message}
    </output>
  );
}

function ScenarioDetailsFields({
  details,
  hidden = false,
  budgetCents = 20000,
}: {
  readonly details: PreDraftScenarioDetailsInput;
  readonly hidden?: boolean;
  readonly budgetCents?: number;
}) {
  const [budgets, setBudgets] = useState([
    details.anchorBudgetCents / 100,
    details.coreBudgetCents / 100,
    details.endgameBudgetCents / 100,
  ]);
  const allocated = budgets.reduce((total, amount) => total + amount, 0);
  if (hidden) {
    return (
      <>
        <input name="strategyAngle" type="hidden" value={details.strategyAngle} />
        <input name="primaryGoal" type="hidden" value={details.primaryGoal} />
        <input name="riskTolerance" type="hidden" value={details.riskTolerance} />
        <input name="anchorBudget" type="hidden" value={details.anchorBudgetCents / 100} />
        <input name="coreBudget" type="hidden" value={details.coreBudgetCents / 100} />
        <input name="endgameBudget" type="hidden" value={details.endgameBudgetCents / 100} />
        <input name="streamingSlots" type="hidden" value={details.streamingSlots} />
        <input name="notes" type="hidden" value={details.notes} />
      </>
    );
  }
  return (
    <>
      <fieldset className={flow.formSection}>
        <legend>Roster strategy</legend>
        <p>Give this version a clear thesis and decide how much risk you are willing to carry.</p>
        <div className={flow.formFields}>
          <label className={styles.field}>
            <span>Scenario name</span>
            <input defaultValue={details.name} maxLength={80} name="name" required />
          </label>
          <label className={`${styles.field} ${styles.formWide}`}>
            <span>Strategy angle</span>
            <input
              defaultValue={details.strategyAngle}
              maxLength={240}
              name="strategyAngle"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Minimum outcome</span>
            <select defaultValue={details.primaryGoal} name="primaryGoal">
              <option value="make-playoffs">Make the playoffs</option>
              <option value="win-championship">Win the championship</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Risk tolerance</span>
            <select defaultValue={details.riskTolerance} name="riskTolerance">
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className={flow.formSection}>
        <legend>Allocate the auction budget</legend>
        <p>
          Anchors buy your leading players. Core builds the middle of the roster. Endgame preserves
          inexpensive depth.
        </p>
        <div className={flow.formFields}>
          <label className={styles.field}>
            <span>Anchor budget ($)</span>
            <input
              value={budgets[0]}
              onChange={(event) =>
                setBudgets((current) =>
                  current.map((value, index) => (index === 0 ? Number(event.target.value) : value)),
                )
              }
              min={0}
              name="anchorBudget"
              step="0.01"
              type="number"
            />
          </label>
          <label className={styles.field}>
            <span>Core budget ($)</span>
            <input
              value={budgets[1]}
              onChange={(event) =>
                setBudgets((current) =>
                  current.map((value, index) => (index === 1 ? Number(event.target.value) : value)),
                )
              }
              min={0}
              name="coreBudget"
              step="0.01"
              type="number"
            />
          </label>
          <label className={styles.field}>
            <span>Endgame budget ($)</span>
            <input
              value={budgets[2]}
              onChange={(event) =>
                setBudgets((current) =>
                  current.map((value, index) => (index === 2 ? Number(event.target.value) : value)),
                )
              }
              min={0}
              name="endgameBudget"
              step="0.01"
              type="number"
            />
          </label>
          <output
            className={flow.budget}
            data-over={allocated * 100 > budgetCents}
            aria-live="polite"
          >
            <span>
              {formatPrice(Math.round(allocated * 100))} allocated of {formatPrice(budgetCents)}
            </span>
            <strong>
              {allocated * 100 > budgetCents
                ? `${formatPrice(Math.round(allocated * 100 - budgetCents))} over budget`
                : `${formatPrice(Math.round(budgetCents - allocated * 100))} unallocated`}
            </strong>
          </output>
        </div>
      </fieldset>
      <fieldset className={flow.formSection}>
        <legend>Flexibility & working notes</legend>
        <p>Decide what you will leave open and record the assumptions to revisit.</p>
        <div className={flow.formFields}>
          <label className={styles.field}>
            <span>Streaming slots</span>
            <input
              defaultValue={details.streamingSlots}
              max={3}
              min={0}
              name="streamingSlots"
              type="number"
            />
          </label>
          <label className={`${styles.field} ${styles.formWide}`}>
            <span>Working notes</span>
            <textarea defaultValue={details.notes} maxLength={1_500} name="notes" rows={4} />
          </label>
        </div>
      </fieldset>
    </>
  );
}

const scenarioLabel = (
  plan: PreDraftPlanSummary,
  activePlanId: string | null,
  selectedPlanId: string | null,
): string => {
  if (plan.status === 'archived') return 'Archived';
  if (plan.id === activePlanId) return 'Active';
  if (plan.id === selectedPlanId) return 'Preview';
  return 'Draft';
};

const stanceCounts = (plan: PreDraftPlanSummary) => ({
  avoid: plan.targets.filter((target) => target.stance === 'avoid').length,
  target: plan.targets.filter((target) => target.stance === 'target').length,
  watch: plan.targets.filter((target) => target.stance === 'watch').length,
});

export function ScenarioWorkspace({
  mode = 'all',
  comparePlanIds,
  defaults,
  seasonKey,
  workspace,
}: {
  readonly mode?: 'all' | 'plan' | 'review';
  readonly comparePlanIds: ReadonlyArray<string>;
  readonly defaults: PreDraftScenarioDetailsInput;
  readonly seasonKey: string;
  readonly workspace: PreDraftWorkspace;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createState, createAction] = useActionState(createPreDraftScenarioAction, idleState);
  const [duplicateState, duplicateAction] = useActionState(
    duplicatePreDraftScenarioAction,
    idleState,
  );
  const [updateState, updateAction] = useActionState(updatePreDraftScenarioAction, idleState);
  const [activateState, activateAction] = useActionState(activatePreDraftScenarioAction, idleState);
  const [archiveState, archiveAction] = useActionState(archivePreDraftScenarioAction, idleState);
  const selectedPlan = workspace.selectedPlan;
  const activePlan = workspace.activePlan;
  const availablePlans = workspace.plans.filter((plan) => plan.status !== 'archived');
  const comparedPlans = comparePlanIds
    .map((id) => workspace.plans.find((plan) => plan.id === id))
    .filter((plan): plan is PreDraftPlanSummary => plan !== undefined && plan.status !== 'archived')
    .slice(0, 3);

  const navigateWith = (changes: {
    readonly compare?: ReadonlyArray<string>;
    readonly plan?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (changes.plan !== undefined) params.set('plan', changes.plan);
    if (changes.compare !== undefined) {
      if (changes.compare.length < 2) params.delete('compare');
      else params.set('compare', changes.compare.join(','));
    }
    router.push(`/draft?${params.toString()}`, { scroll: false });
  };

  const toggleComparison = (planId: string) => {
    const current = comparedPlans.map((plan) => plan.id);
    navigateWith({
      compare: current.includes(planId)
        ? current.filter((id) => id !== planId)
        : [...current, planId].slice(0, 3),
    });
  };

  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{mode === 'review' ? 'Review saved scenarios' : 'Your working plan'}</h2>
          <p>Select a working build without changing the plan that powers live recommendations.</p>
        </div>
        <span className={styles.badge}>{availablePlans.length} available</span>
      </header>

      <div className={styles.scenarioWorkspace}>
        <div className={styles.scenarioToolbar}>
          <label className={`${styles.field} ${styles.scenarioSelect}`}>
            <span>Selected scenario</span>
            <select
              disabled={workspace.plans.length === 0}
              onChange={(event) => navigateWith({ plan: event.target.value })}
              value={selectedPlan?.id ?? ''}
            >
              {workspace.plans.length === 0 ? <option value="">No scenarios saved</option> : null}
              {workspace.plans.map((plan) => (
                <option disabled={plan.status === 'archived'} key={plan.id} value={plan.id}>
                  {plan.name} ·{' '}
                  {scenarioLabel(plan, workspace.activePlanId, selectedPlan?.id ?? null)}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.scenarioActions}>
            <details className={styles.scenarioDisclosure}>
              <summary>New scenario</summary>
              <form action={createAction} className={styles.scenarioInlineForm}>
                <input name="seasonKey" type="hidden" value={seasonKey} />
                <ScenarioDetailsFields details={defaults} hidden />
                <label className={styles.field}>
                  <span>Scenario name</span>
                  <input maxLength={80} name="name" placeholder="Balanced build" required />
                </label>
                <SubmitButton className={styles.primaryButton} pendingLabel="Creating…">
                  Create
                </SubmitButton>
                <ActionMessage state={createState} />
              </form>
            </details>

            {selectedPlan === null ? null : (
              <details className={styles.scenarioDisclosure}>
                <summary>Duplicate</summary>
                <form action={duplicateAction} className={styles.scenarioInlineForm}>
                  <input name="seasonKey" type="hidden" value={seasonKey} />
                  <input name="sourcePlanId" type="hidden" value={selectedPlan.id} />
                  <label className={styles.field}>
                    <span>Copy name</span>
                    <input
                      defaultValue={`${selectedPlan.name} copy`}
                      maxLength={80}
                      name="name"
                      required
                    />
                  </label>
                  <SubmitButton className={styles.primaryButton} pendingLabel="Copying…">
                    Copy targets
                  </SubmitButton>
                  <ActionMessage state={duplicateState} />
                </form>
              </details>
            )}

            {mode !== 'plan' &&
            selectedPlan !== null &&
            selectedPlan.id !== workspace.activePlanId ? (
              <>
                <form action={activateAction}>
                  <input name="seasonKey" type="hidden" value={seasonKey} />
                  <input name="planId" type="hidden" value={selectedPlan.id} />
                  <SubmitButton className={styles.primaryButton} pendingLabel="Activating…">
                    Make active
                  </SubmitButton>
                </form>
                <form action={archiveAction}>
                  <input name="seasonKey" type="hidden" value={seasonKey} />
                  <input name="planId" type="hidden" value={selectedPlan.id} />
                  <SubmitButton className={styles.secondaryButton} pendingLabel="Archiving…">
                    Archive
                  </SubmitButton>
                </form>
              </>
            ) : null}
          </div>
        </div>

        <ActionMessage state={activateState.status === 'idle' ? archiveState : activateState} />

        {selectedPlan === null ? (
          <div className={styles.empty}>
            <strong>Create the first scenario</strong>
            Start with the owner defaults, then tune its budget and player stances.
          </div>
        ) : (
          <>
            <div
              className={
                selectedPlan.id === workspace.activePlanId
                  ? styles.scenarioActiveMode
                  : styles.scenarioPreviewMode
              }
            >
              <div>
                <strong>
                  {selectedPlan.id === workspace.activePlanId
                    ? 'Active scenario'
                    : `Previewing ${selectedPlan.name}`}
                </strong>
                <span>
                  {selectedPlan.id === workspace.activePlanId
                    ? 'This scenario powers the live bid cap and Eve’s default owner context.'
                    : `${activePlan?.name ?? 'No scenario'} remains active for live recommendations until you explicitly switch.`}
                </span>
              </div>
              {selectedPlan.id === workspace.activePlanId ? (
                <span className={`${styles.statusBadge} ${styles.statusReady}`}>Live context</span>
              ) : (
                <AskEveButton
                  className={styles.secondaryButton}
                  context={{ planId: selectedPlan.id, season: seasonKey }}
                  prompt={`Compare the preview scenario “${selectedPlan.name}” with the active scenario “${activePlan?.name ?? 'none'}.” Treat “${selectedPlan.name}” as a workshop preview only; do not use it as a live-draft guardrail unless I activate it.`}
                >
                  Workshop with Eve
                </AskEveButton>
              )}
            </div>

            {mode !== 'review' ? (
              <form
                action={updateAction}
                className={styles.planForm}
                key={`${selectedPlan.id}:${selectedPlan.updatedAt}`}
              >
                <input name="seasonKey" type="hidden" value={seasonKey} />
                <input name="planId" type="hidden" value={selectedPlan.id} />
                <div className={styles.formGrid}>
                  <ScenarioDetailsFields
                    details={selectedPlan}
                    budgetCents={workspace.league?.baseBudgetCents}
                  />
                </div>
                <div className={styles.formActions}>
                  <span>
                    Planned budget:{' '}
                    {formatPrice(
                      selectedPlan.anchorBudgetCents +
                        selectedPlan.coreBudgetCents +
                        selectedPlan.endgameBudgetCents,
                    )}{' '}
                    · {selectedPlan.id === workspace.activePlanId ? 'Active' : 'Preview only'}
                  </span>
                  <SubmitButton className={styles.primaryButton} pendingLabel="Saving…">
                    Save scenario
                  </SubmitButton>
                </div>
                <ActionMessage state={updateState} />
              </form>
            ) : (
              <div className={flow.review}>
                <h3>{selectedPlan.strategyAngle}</h3>
                <dl>
                  <div>
                    <dt>Anchors</dt>
                    <dd>{formatPrice(selectedPlan.anchorBudgetCents)}</dd>
                  </div>
                  <div>
                    <dt>Core</dt>
                    <dd>{formatPrice(selectedPlan.coreBudgetCents)}</dd>
                  </div>
                  <div>
                    <dt>Endgame</dt>
                    <dd>{formatPrice(selectedPlan.endgameBudgetCents)}</dd>
                  </div>
                </dl>
                <p>
                  {selectedPlan.riskTolerance} risk · {selectedPlan.streamingSlots} streaming
                  slot(s) · {selectedPlan.targets.length} player stances
                </p>
                <p>{selectedPlan.notes || 'No working notes saved.'}</p>
                {selectedPlan.targets.length === 0 ? (
                  <p>Add player stances before treating this as a complete draft plan.</p>
                ) : null}
              </div>
            )}
          </>
        )}

        {mode !== 'plan' && availablePlans.length > 1 ? (
          <section
            aria-labelledby="scenario-comparison-title"
            className={styles.scenarioComparison}
          >
            <div className={styles.scenarioComparisonHeader}>
              <div>
                <h3 id="scenario-comparison-title">Compare scenarios</h3>
                <p>Select two or three builds. The comparison stays in this URL.</p>
              </div>
              <fieldset className={styles.comparePicker}>
                <legend className={styles.visuallyHidden}>Scenarios to compare</legend>
                {availablePlans.map((plan) => {
                  const checked = comparedPlans.some((candidate) => candidate.id === plan.id);
                  return (
                    <label className={styles.compareChoice} key={plan.id}>
                      <input
                        checked={checked}
                        disabled={!checked && comparedPlans.length >= 3}
                        onChange={() => toggleComparison(plan.id)}
                        type="checkbox"
                      />
                      <span>{plan.name}</span>
                    </label>
                  );
                })}
              </fieldset>
            </div>

            {comparedPlans.length < 2 ? (
              <p className={styles.comparisonHint}>Choose at least two scenarios to compare.</p>
            ) : (
              <section
                aria-label="Scenario comparison table"
                className={styles.comparisonViewport}
                tabIndex={0}
              >
                <table className={styles.comparisonTable}>
                  <thead>
                    <tr>
                      <th scope="col">Decision</th>
                      {comparedPlans.map((plan) => (
                        <th key={plan.id} scope="col">
                          {plan.name}
                          <small>
                            {scenarioLabel(plan, workspace.activePlanId, selectedPlan?.id ?? null)}
                          </small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Angle</th>
                      {comparedPlans.map((plan) => (
                        <td key={plan.id}>{plan.strategyAngle}</td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Budget</th>
                      {comparedPlans.map((plan) => (
                        <td key={plan.id}>
                          {formatPrice(plan.anchorBudgetCents)} anchor ·{' '}
                          {formatPrice(plan.coreBudgetCents)} core ·{' '}
                          {formatPrice(plan.endgameBudgetCents)} endgame
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Risk / stream</th>
                      {comparedPlans.map((plan) => (
                        <td key={plan.id}>
                          {plan.riskTolerance} · {plan.streamingSlots} streaming slot
                          {plan.streamingSlots === 1 ? '' : 's'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Stances</th>
                      {comparedPlans.map((plan) => {
                        const counts = stanceCounts(plan);
                        return (
                          <td key={plan.id}>
                            {counts.target} targets · {counts.watch} watches · {counts.avoid} avoids
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <th scope="row">Player caps</th>
                      {comparedPlans.map((plan) => (
                        <td key={plan.id}>
                          {plan.targets.length === 0 ? (
                            <span className={styles.muted}>No player stances</span>
                          ) : (
                            <ul className={styles.comparisonTargets}>
                              {plan.targets.map((target) => (
                                <li key={target.targetId}>
                                  <strong>{target.playerName}</strong>
                                  <span>
                                    {target.stance}
                                    {target.maxBidCents === null
                                      ? ''
                                      : ` · ${formatPrice(target.maxBidCents)}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </section>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}

export function ScenarioTargetWorkspace({
  adpBoard,
  plan,
  seasonKey,
}: {
  readonly adpBoard: ReadonlyArray<AdpOption>;
  readonly plan: PreDraftPlan | null;
  readonly seasonKey: string;
}) {
  const [targetState, targetAction] = useActionState(savePreDraftTargetAction, idleState);
  const targetIds = new Set(plan?.targets.map((target) => target.playerId) ?? []);
  const availablePlayers = adpBoard.filter((player) => !targetIds.has(player.playerId));

  if (plan === null) {
    return (
      <div className={styles.empty}>
        <strong>Create a scenario first</strong>
        Player convictions and bid guardrails stay attached to one scenario.
      </div>
    );
  }

  return (
    <div className={styles.targetWorkspace}>
      <form action={targetAction} className={styles.targetForm}>
        <input name="planId" type="hidden" value={plan.id} />
        <input name="seasonKey" type="hidden" value={seasonKey} />
        <label className={styles.field}>
          <span>Player</span>
          <select disabled={availablePlayers.length === 0} name="playerId" required>
            {availablePlayers.map((player) => (
              <option key={player.playerId} value={player.playerId}>
                {player.rank}. {player.playerName} ({player.position})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Stance</span>
          <select defaultValue="watch" name="stance">
            <option value="target">Target</option>
            <option value="watch">Watch</option>
            <option value="avoid">Avoid</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Max bid ($)</span>
          <input min={0} name="maxBid" placeholder="Optional" step="0.01" type="number" />
        </label>
        <label className={styles.field}>
          <span>Priority</span>
          <select defaultValue="3" name="priority">
            {[1, 2, 3, 4, 5].map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className={`${styles.field} ${styles.formWide}`}>
          <span>Why this stance?</span>
          <input maxLength={240} name="rationale" placeholder="Optional working thesis" />
        </label>
        <SubmitButton
          className={styles.secondaryButton}
          disabled={availablePlayers.length === 0}
          pendingLabel="Saving…"
        >
          Add to scenario
        </SubmitButton>
      </form>
      <ActionMessage state={targetState} />
      {plan.targets.length === 0 ? (
        <div className={styles.empty}>
          <strong>No targets yet</strong>
          Use the current public board to record the first player thesis.
        </div>
      ) : (
        <ul className={styles.targetList}>
          {plan.targets.map((target) => (
            <li key={target.targetId}>
              <span>
                <strong>{target.playerName}</strong>
                <small>{target.rationale || `Priority ${target.priority}`}</small>
              </span>
              <span>
                {target.stance}
                {target.maxBidCents === null ? '' : ` · ${formatPrice(target.maxBidCents)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
