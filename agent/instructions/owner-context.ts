import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type PreDraftPlan,
  type PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';
import { defineDynamic, defineInstructions } from 'eve/instructions';

const fallback = `The authenticated league owner is ${leagueOwnerProfile.displayName}, also known in this league as ${leagueOwnerProfile.nickname}. Address first-person requests as Brendan's team. His minimum season outcome is ${leagueOwnerProfile.goals.minimumOutcome.toLocaleLowerCase()}; the primary upside goal is to ${leagueOwnerProfile.goals.primaryOutcome.toLocaleLowerCase()}. Prioritize availability, playoff-week usability, and a workable streaming slot when evaluating plans.`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const messageText = (message: unknown): ReadonlyArray<string> => {
  if (typeof message !== 'object' || message === null || !('content' in message)) return [];
  const content = (message as { readonly content?: unknown }).content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) =>
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part &&
    typeof part.text === 'string'
      ? [part.text]
      : [],
  );
};

/** Reads the ephemeral page context Eve adds to the current turn, never durable auth data. */
export const requestedPreviewPlanId = (messages: ReadonlyArray<unknown>): string | undefined => {
  for (const message of [...messages].reverse()) {
    for (const text of messageText(message)) {
      try {
        const context = JSON.parse(text) as { readonly planId?: unknown; readonly route?: unknown };
        if (
          context.route === '/draft' &&
          typeof context.planId === 'string' &&
          uuidPattern.test(context.planId)
        ) {
          return context.planId;
        }
      } catch {
        // Ordinary user messages are not expected to be JSON page context.
      }
    }
  }
  return undefined;
};

const describePlan = (plan: PreDraftPlan): string =>
  `Its angle is “${plan.strategyAngle},” risk tolerance is ${plan.riskTolerance}, and its minimum goal is ${plan.primaryGoal === 'make-playoffs' ? 'make the playoffs' : 'win the championship'}. Budget guardrails are $${(plan.anchorBudgetCents / 100).toFixed(0)} for anchors, $${(plan.coreBudgetCents / 100).toFixed(0)} for the core, and $${(plan.endgameBudgetCents / 100).toFixed(0)} for the endgame, with ${plan.streamingSlots} streaming slot(s). Working notes: ${plan.notes || 'none'}. Saved player stances: ${plan.targets.length === 0 ? 'none yet' : plan.targets.map((target) => `${target.playerName} (${target.stance}${target.maxBidCents === null ? '' : `, max $${(target.maxBidCents / 100).toFixed(0)}`})`).join('; ')}.`;

/** Serializes only planning context; Better Auth user/session identifiers never enter instructions. */
export const serializeOwnerScenarioContext = (workspace: PreDraftWorkspace): string => {
  const activePlan = workspace.activePlan;
  if (activePlan === null) {
    return `No active pre-draft scenario has been saved yet. Use the default angle “${leagueOwnerProfile.defaultPlan.strategyAngle}” as a hypothesis, not a settled decision.`;
  }
  const activeContext = `The active ${workspace.league?.seasonKey ?? 'pre-draft'} scenario is “${activePlan.name}” (plan ID ${activePlan.id}). ${describePlan(activePlan)}`;
  const previewPlan = workspace.selectedPlan;
  if (previewPlan === null || previewPlan.id === activePlan.id) return activeContext;
  return `${activeContext}\n\nThe selected preview scenario is “${previewPlan.name}” (plan ID ${previewPlan.id}). ${describePlan(previewPlan)} This preview is workshop context only. Never treat its budgets, targets, or risk posture as live-draft guardrails until the owner explicitly activates it.`;
};

export default defineDynamic({
  events: {
    'turn.started': async (_event, context) => {
      try {
        const config = await Effect.runPromise(loadDatabaseConfig());
        const previewPlanId = requestedPreviewPlanId(context.messages);
        const workspace = await Effect.runPromise(
          Effect.gen(function* () {
            const database = yield* Database;
            return yield* database.preDraftWorkspace(
              leagueOwnerProfile.canonicalKey,
              undefined,
              previewPlanId,
            );
          }).pipe(Effect.provide(databaseLayer(config))),
        );
        return defineInstructions({
          content: `${fallback}\n\n${serializeOwnerScenarioContext(workspace)}`,
        });
      } catch {
        return defineInstructions({ content: fallback });
      }
    },
  },
});
