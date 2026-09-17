'use server';

import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
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
