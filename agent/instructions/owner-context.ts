import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';
import { defineDynamic, defineInstructions } from 'eve/instructions';

const fallback = `The authenticated league owner is ${leagueOwnerProfile.displayName}, also known in this league as ${leagueOwnerProfile.nickname}. Address first-person requests as Brendan's team. His minimum season outcome is ${leagueOwnerProfile.goals.minimumOutcome.toLocaleLowerCase()}; the primary upside goal is to ${leagueOwnerProfile.goals.primaryOutcome.toLocaleLowerCase()}. Prioritize availability, playoff-week usability, and a workable streaming slot when evaluating plans.`;

export default defineDynamic({
  events: {
    'turn.started': async () => {
      try {
        const config = await Effect.runPromise(loadDatabaseConfig());
        const workspace = await Effect.runPromise(
          Effect.gen(function* () {
            const database = yield* Database;
            return yield* database.preDraftWorkspace(leagueOwnerProfile.canonicalKey);
          }).pipe(Effect.provide(databaseLayer(config))),
        );
        const plan = workspace.plan;
        const planContext =
          plan === null
            ? `No pre-draft scenario has been saved yet. Use the default angle “${leagueOwnerProfile.defaultPlan.strategyAngle}” as a hypothesis, not a settled decision.`
            : `The active ${workspace.league?.seasonKey ?? 'pre-draft'} scenario is “${plan.name}.” Its angle is “${plan.strategyAngle},” risk tolerance is ${plan.riskTolerance}, and its minimum goal is ${plan.primaryGoal === 'make-playoffs' ? 'make the playoffs' : 'win the championship'}. Budget guardrails are $${(plan.anchorBudgetCents / 100).toFixed(0)} for anchors, $${(plan.coreBudgetCents / 100).toFixed(0)} for the core, and $${(plan.endgameBudgetCents / 100).toFixed(0)} for the endgame, with ${plan.streamingSlots} streaming slot(s). Working notes: ${plan.notes || 'none'}. Saved player stances: ${plan.targets.length === 0 ? 'none yet' : plan.targets.map((target) => `${target.playerName} (${target.stance}${target.maxBidCents === null ? '' : `, max $${(target.maxBidCents / 100).toFixed(0)}`})`).join('; ')}.`;
        return defineInstructions({ content: `${fallback}\n\n${planContext}` });
      } catch {
        return defineInstructions({ content: fallback });
      }
    },
  },
});
