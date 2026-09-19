import { createHash } from 'node:crypto';

export interface PlayerIdentityMergeInput {
  readonly reason: string;
  readonly resolvedByUserId: string;
  readonly sourcePlayerId: string;
  readonly targetPlayerId: string;
}

export interface PlayerIdentityMergePlayer {
  readonly canonicalName: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface PlayerIdentityMergeConflict {
  readonly key: string;
  readonly table: string;
}

export interface PlayerIdentityMergePreview {
  readonly conflicts: ReadonlyArray<PlayerIdentityMergeConflict>;
  readonly fingerprint: string;
  readonly referenceCounts: Readonly<Record<string, number>>;
  readonly source: PlayerIdentityMergePlayer;
  readonly target: PlayerIdentityMergePlayer;
}

export const PLAYER_IDENTITY_MERGE_REFERENCE_TABLES = [
  'player_identities',
  'roster_period_entries',
  'inferred_roster_changes',
  'player_projections',
  'player_adp',
  'pre_draft_targets',
  'player_season_stats',
  'auction_results',
  'player_rankings',
] as const;

export type PlayerIdentityMergeReferenceTable =
  (typeof PLAYER_IDENTITY_MERGE_REFERENCE_TABLES)[number];

export const PLAYER_IDENTITY_MERGE_CONFLICT_TABLES = [
  'roster_period_entries',
  'inferred_roster_changes',
  'player_projections',
  'player_adp',
  'pre_draft_targets',
  'player_season_stats',
  'auction_results',
  'player_rankings',
] as const;

export type PlayerIdentityMergeConflictTable =
  (typeof PLAYER_IDENTITY_MERGE_CONFLICT_TABLES)[number];

export interface PlayerIdentityMergeCommitPlan {
  readonly movedReferenceCounts: Readonly<Record<string, number>>;
}

type PreviewPayload = Omit<PlayerIdentityMergePreview, 'fingerprint'>;

export const validatePlayerIdentityMergeInput = (input: PlayerIdentityMergeInput): void => {
  if (
    input.sourcePlayerId.trim() === '' ||
    input.targetPlayerId.trim() === '' ||
    input.sourcePlayerId === input.targetPlayerId ||
    input.reason.trim() === '' ||
    input.resolvedByUserId.trim() === ''
  ) {
    throw new Error('A player merge requires distinct players, a reason, and a resolver');
  }
};

export const resolvePlayerIdentityMergePlayers = (
  input: PlayerIdentityMergeInput,
  players: ReadonlyArray<PlayerIdentityMergePlayer>,
): Readonly<{ source: PlayerIdentityMergePlayer; target: PlayerIdentityMergePlayer }> => {
  validatePlayerIdentityMergeInput(input);
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const source = playersById.get(input.sourcePlayerId);
  const target = playersById.get(input.targetPlayerId);
  if (source === undefined || target === undefined) {
    throw new Error('Both canonical players must exist before a merge can be previewed');
  }
  return { source, target };
};

const sortRecord = (record: Readonly<Record<string, number>>): Readonly<Record<string, number>> =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));

const normalizePreviewPayload = (preview: PreviewPayload): PreviewPayload => ({
  conflicts: [...preview.conflicts]
    .map((conflict) => ({ key: conflict.key, table: conflict.table }))
    .sort((left, right) => left.table.localeCompare(right.table) || left.key.localeCompare(right.key)),
  referenceCounts: sortRecord(preview.referenceCounts),
  source: {
    canonicalName: preview.source.canonicalName,
    normalizedName: preview.source.normalizedName,
    playerId: preview.source.playerId,
  },
  target: {
    canonicalName: preview.target.canonicalName,
    normalizedName: preview.target.normalizedName,
    playerId: preview.target.playerId,
  },
});

export const playerIdentityMergeFingerprint = (preview: PreviewPayload): string =>
  createHash('sha256').update(JSON.stringify(normalizePreviewPayload(preview))).digest('hex');

export const makePlayerIdentityMergePreview = (preview: PreviewPayload): PlayerIdentityMergePreview => {
  const normalized = normalizePreviewPayload(preview);
  return {
    ...normalized,
    fingerprint: playerIdentityMergeFingerprint(normalized),
  };
};

export const planPlayerIdentityMergeCommit = (
  preview: PlayerIdentityMergePreview,
  expectedFingerprint: string,
): PlayerIdentityMergeCommitPlan => {
  if (expectedFingerprint.trim() === '') {
    throw new Error('A player merge requires a preview fingerprint');
  }
  if (preview.fingerprint !== expectedFingerprint) {
    throw new Error('The player merge preview is stale');
  }
  if (preview.conflicts.length > 0) {
    throw new Error('The player merge has reference conflicts');
  }
  return { movedReferenceCounts: preview.referenceCounts };
};
