import type { LeagueTeamReconciliationInput } from '@fantasy-basketball/database/runtime';

export interface TeamReconciliationActionState {
  readonly message: string | null;
  readonly status: 'idle' | 'error' | 'success';
}

export type TeamReconciliationFormResult =
  | {
      readonly input: Omit<LeagueTeamReconciliationInput, 'resolvedByUserId'>;
      readonly success: true;
    }
  | {
      readonly message: string;
      readonly success: false;
    };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseTeamReconciliationForm = (formData: FormData): TeamReconciliationFormResult => {
  const target = formData.get('target');
  const teamSeasonIds = [
    ...new Set(
      formData
        .getAll('teamSeasonId')
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim()),
    ),
  ];

  if (
    teamSeasonIds.length === 0 ||
    teamSeasonIds.length > 24 ||
    teamSeasonIds.some((id) => !uuidPattern.test(id))
  ) {
    return { message: 'The selected team-seasons are invalid.', success: false };
  }
  if (typeof target !== 'string' || target === '') {
    return { message: 'Choose an existing manager or create a new one.', success: false };
  }

  if (target === 'new') {
    const displayName = formData.get('displayName');
    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      return { message: 'Enter a name for the new canonical manager.', success: false };
    }
    if (displayName.trim().length > 80) {
      return { message: 'Canonical manager names must be 80 characters or fewer.', success: false };
    }
    return {
      input: {
        target: { displayName: displayName.trim(), kind: 'new' },
        teamSeasonIds,
      },
      success: true,
    };
  }

  if (!uuidPattern.test(target)) {
    return { message: 'The selected canonical manager is invalid.', success: false };
  }
  return {
    input: {
      target: { kind: 'existing', memberId: target },
      teamSeasonIds,
    },
    success: true,
  };
};
