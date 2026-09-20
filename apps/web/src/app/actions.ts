'use server';

import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  PreDraftScenarioError,
  type PreDraftScenarioCommand,
  type PreDraftScenarioCommandResult,
} from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  parsePreDraftScenarioForm,
  parsePreDraftTargetForm,
  type ParsedPreDraftScenarioCommand,
  type PreDraftScenarioActionState,
} from '../lib/pre-draft-scenarios';
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

const runPreDraftScenarioCommand = async (
  command: ParsedPreDraftScenarioCommand,
): Promise<PreDraftScenarioCommandResult> => {
  const scopedCommand = {
    ...command,
    ownerCanonicalKey: leagueOwnerProfile.canonicalKey,
  } as PreDraftScenarioCommand;
  const config = await Effect.runPromise(loadDatabaseConfig());
  return Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.managePreDraftScenario(scopedCommand);
    }).pipe(Effect.provide(databaseLayer(config))),
  );
};

const mutatePreDraftScenario = async (
  formData: FormData,
  intent: ParsedPreDraftScenarioCommand['intent'],
): Promise<
  | { readonly result: PreDraftScenarioCommandResult; readonly success: true }
  | { readonly state: PreDraftScenarioActionState; readonly success: false }
> => {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) {
    return {
      state: { message: 'Sign in as the league owner to manage scenarios.', status: 'error' },
      success: false,
    };
  }
  const parsed = parsePreDraftScenarioForm(formData, intent);
  if (!parsed.success) {
    return { state: { message: parsed.message, status: 'error' }, success: false };
  }
  try {
    return { result: await runPreDraftScenarioCommand(parsed.command), success: true };
  } catch (error) {
    return {
      state: {
        message:
          error instanceof PreDraftScenarioError
            ? error.message
            : 'The scenario could not be saved. Try again.',
        status: 'error',
      },
      success: false,
    };
  }
};

export async function createPreDraftScenarioAction(
  _previousState: PreDraftScenarioActionState,
  formData: FormData,
): Promise<PreDraftScenarioActionState> {
  const mutation = await mutatePreDraftScenario(formData, 'create');
  if (!mutation.success) return mutation.state;
  revalidatePath('/draft');
  redirect(`/draft?plan=${mutation.result.planId}`);
}

export async function duplicatePreDraftScenarioAction(
  _previousState: PreDraftScenarioActionState,
  formData: FormData,
): Promise<PreDraftScenarioActionState> {
  const mutation = await mutatePreDraftScenario(formData, 'duplicate');
  if (!mutation.success) return mutation.state;
  revalidatePath('/draft');
  redirect(`/draft?plan=${mutation.result.planId}`);
}

export async function updatePreDraftScenarioAction(
  _previousState: PreDraftScenarioActionState,
  formData: FormData,
): Promise<PreDraftScenarioActionState> {
  const mutation = await mutatePreDraftScenario(formData, 'update');
  if (!mutation.success) return mutation.state;
  revalidatePath('/draft');
  return { message: 'Scenario changes saved.', status: 'success' };
}

export async function activatePreDraftScenarioAction(
  _previousState: PreDraftScenarioActionState,
  formData: FormData,
): Promise<PreDraftScenarioActionState> {
  const mutation = await mutatePreDraftScenario(formData, 'activate');
  if (!mutation.success) return mutation.state;
  revalidatePath('/draft');
  redirect(`/draft?plan=${mutation.result.planId}`);
}

export async function archivePreDraftScenarioAction(
  _previousState: PreDraftScenarioActionState,
  formData: FormData,
): Promise<PreDraftScenarioActionState> {
  const mutation = await mutatePreDraftScenario(formData, 'archive');
  if (!mutation.success) return mutation.state;
  revalidatePath('/draft');
  redirect(
    mutation.result.activePlanId === null
      ? '/draft'
      : `/draft?plan=${mutation.result.activePlanId}`,
  );
}

export async function savePreDraftTargetAction(
  _previousState: PreDraftScenarioActionState,
  formData: FormData,
): Promise<PreDraftScenarioActionState> {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) {
    return { message: 'Sign in as the league owner to save targets.', status: 'error' };
  }
  const parsed = parsePreDraftTargetForm(formData);
  if (!parsed.success) return { message: parsed.message, status: 'error' };
  try {
    const config = await Effect.runPromise(loadDatabaseConfig());
    await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.savePreDraftTarget({
          ...parsed.input,
          ownerCanonicalKey: leagueOwnerProfile.canonicalKey,
        });
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    revalidatePath('/draft');
    return { message: 'Target saved to this scenario.', status: 'success' };
  } catch (error) {
    return {
      message:
        error instanceof PreDraftScenarioError
          ? error.message
          : 'The target could not be saved. Try again.',
      status: 'error',
    };
  }
}
