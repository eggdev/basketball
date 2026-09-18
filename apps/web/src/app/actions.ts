'use server';

import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import {
  type PreDraftGoal,
  type PreDraftRiskTolerance,
  type PreDraftTargetStance,
} from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';
import { revalidatePath } from 'next/cache';

import {
  parseTeamReconciliationForm,
  type TeamReconciliationActionState,
} from '../lib/team-reconciliation';
import { loadViewer } from '../lib/viewer';

export async function reconcileTeamIdentityAction(
  _previousState: TeamReconciliationActionState,
  formData: FormData,
): Promise<TeamReconciliationActionState> {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) {
    return { message: 'Sign in as the league owner to reconcile teams.', status: 'error' };
  }

  const parsed = parseTeamReconciliationForm(formData);
  if (!parsed.success) return { message: parsed.message, status: 'error' };

  try {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.reconcileLeagueTeamIdentity({
          ...parsed.input,
          resolvedByUserId: viewer.id,
        });
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    revalidatePath('/');
    return {
      message: `${result.resolvedTeamSeasonCount} team-season${result.resolvedTeamSeasonCount === 1 ? '' : 's'} assigned to ${result.displayName}.`,
      status: 'success',
    };
  } catch {
    return { message: 'The team assignment could not be saved. Try again.', status: 'error' };
  }
}

const formText = (formData: FormData, key: string): string =>
  String(formData.get(key) ?? '').trim();

const formDollars = (formData: FormData, key: string): number => {
  const value = Number(formText(formData, key));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be non-negative`);
  return Math.round(value * 100);
};

export async function savePreDraftPlanAction(formData: FormData): Promise<void> {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) throw new Error('Sign in as the league owner to save a draft plan.');
  const primaryGoal = formText(formData, 'primaryGoal') as PreDraftGoal;
  const riskTolerance = formText(formData, 'riskTolerance') as PreDraftRiskTolerance;
  if (!['make-playoffs', 'win-championship'].includes(primaryGoal)) {
    throw new Error('Choose a valid draft goal.');
  }
  if (!['conservative', 'balanced', 'aggressive'].includes(riskTolerance)) {
    throw new Error('Choose a valid risk tolerance.');
  }
  const config = await Effect.runPromise(loadDatabaseConfig());
  await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.savePreDraftPlan({
        anchorBudgetCents: formDollars(formData, 'anchorBudget'),
        coreBudgetCents: formDollars(formData, 'coreBudget'),
        endgameBudgetCents: formDollars(formData, 'endgameBudget'),
        name: formText(formData, 'name'),
        notes: formText(formData, 'notes'),
        ownerCanonicalKey: leagueOwnerProfile.canonicalKey,
        primaryGoal,
        riskTolerance,
        seasonKey: formText(formData, 'seasonKey'),
        strategyAngle: formText(formData, 'strategyAngle'),
        streamingSlots: Number(formText(formData, 'streamingSlots')),
      });
    }).pipe(Effect.provide(databaseLayer(config))),
  );
  revalidatePath('/draft');
}

export async function savePreDraftTargetAction(formData: FormData): Promise<void> {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) throw new Error('Sign in as the league owner to save draft targets.');
  const stance = formText(formData, 'stance') as PreDraftTargetStance;
  if (!['avoid', 'target', 'watch'].includes(stance)) throw new Error('Choose a valid stance.');
  const maxBid = formText(formData, 'maxBid');
  const maxBidDollars = maxBid === '' ? null : Number(maxBid);
  const priority = Number(formText(formData, 'priority'));
  if (
    (maxBidDollars !== null && (!Number.isFinite(maxBidDollars) || maxBidDollars < 0)) ||
    !Number.isInteger(priority)
  ) {
    throw new Error('Enter a valid maximum bid and priority.');
  }
  const config = await Effect.runPromise(loadDatabaseConfig());
  await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.savePreDraftTarget({
        maxBidCents: maxBidDollars === null ? null : Math.round(maxBidDollars * 100),
        planId: formText(formData, 'planId'),
        playerId: formText(formData, 'playerId'),
        priority,
        rationale: formText(formData, 'rationale'),
        stance,
      });
    }).pipe(Effect.provide(databaseLayer(config))),
  );
  revalidatePath('/draft');
}
