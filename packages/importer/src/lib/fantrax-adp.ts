import { createHash } from 'node:crypto';

import { Data, Effect } from 'effect';

import { normalizeProviderPlayerName } from './player-production';

export interface FantraxAdpCanonicalIdentity {
  readonly canonicalName: string;
  readonly fantraxId: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface FantraxAdpImportRecord {
  readonly adp: number;
  readonly canonicalName: string;
  readonly existingPlayerId: string | null;
  readonly fantraxId: string;
  readonly normalizedName: string;
  readonly position: string;
  readonly sourceName: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
}

export interface FantraxAdpImportPlan {
  readonly capturedAt: string;
  readonly fingerprint: string;
  readonly records: ReadonlyArray<FantraxAdpImportRecord>;
  readonly seasonKey: string;
  readonly source: 'fantrax-adp';
  readonly sport: 'NBA';
  readonly summary: {
    readonly existingPlayerCount: number;
    readonly newPlayerCount: number;
    readonly playerCount: number;
  };
}

export interface FantraxAdpCommitResult {
  readonly alreadyImported: boolean;
  readonly ingestionRunId: string;
  readonly newPlayerCount: number;
  readonly playerAdpCount: number;
  readonly snapshotId: string;
}

export interface FantraxAdpCommitter<Error> {
  readonly saveFantraxAdpSnapshot: (
    batch: FantraxAdpImportPlan,
  ) => Effect.Effect<FantraxAdpCommitResult, Error>;
}

export class FantraxAdpSourceError extends Data.TaggedError('FantraxAdpSourceError')<{
  readonly message: string;
  readonly reason: string;
}> {}

export class FantraxAdpValidationError extends Data.TaggedError('FantraxAdpValidationError')<{
  readonly message: string;
  readonly reason: string;
}> {}

const canonicalFantraxName = (sourceName: string): string => {
  const parts = sourceName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return sourceName.trim();
  return `${parts[1]} ${parts[0]}`;
};

const objectRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('each ADP row must be an object');
  }
  return value as Record<string, unknown>;
};

const stringField = (row: Readonly<Record<string, unknown>>, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} is required`);
  return value.trim();
};

export const fetchFantraxAdp = (): Effect.Effect<unknown, FantraxAdpSourceError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch('https://www.fantrax.com/fxea/general/getAdp', {
        body: JSON.stringify({
          limit: 500,
          order: 'ADP',
          showAllPositions: 'true',
          sport: 'NBA',
          start: 0,
        }),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Fantrax returned HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    },
    catch: (cause) =>
      new FantraxAdpSourceError({
        message: 'Fantrax ADP could not be loaded',
        reason: cause instanceof Error ? cause.message : 'Fantrax is unavailable',
      }),
  });

export const planFantraxAdpImport = (input: {
  readonly canonicalIdentities: ReadonlyArray<FantraxAdpCanonicalIdentity>;
  readonly capturedAt: string;
  readonly response: unknown;
  readonly seasonKey: string;
}): Effect.Effect<FantraxAdpImportPlan, FantraxAdpValidationError> =>
  Effect.try({
    try: () => {
      if (!/^\d{4}-\d{2}$/.test(input.seasonKey)) {
        throw new Error('seasonKey must use YYYY-YY format');
      }
      const capturedAt = new Date(input.capturedAt);
      if (Number.isNaN(capturedAt.getTime()))
        throw new Error('capturedAt must be an ISO timestamp');
      if (!Array.isArray(input.response) || input.response.length === 0) {
        throw new Error('Fantrax returned no ADP rows');
      }

      const identitiesByFantraxId = new Map(
        input.canonicalIdentities.map((identity) => [identity.fantraxId, identity]),
      );
      const seenIds = new Set<string>();
      const records = input.response.map((value): FantraxAdpImportRecord => {
        const row = objectRecord(value);
        const fantraxId = stringField(row, 'id');
        if (seenIds.has(fantraxId))
          throw new Error(`Fantrax ID ${fantraxId} appears more than once`);
        seenIds.add(fantraxId);
        const sourceName = stringField(row, 'name');
        const position = stringField(row, 'pos').toUpperCase();
        const adp = typeof row['ADP'] === 'number' ? row['ADP'] : Number(row['ADP']);
        if (!Number.isFinite(adp) || adp <= 0) throw new Error(`${sourceName} has invalid ADP`);
        const existing = identitiesByFantraxId.get(fantraxId) ?? null;
        const canonicalName = existing?.canonicalName ?? canonicalFantraxName(sourceName);
        return {
          adp,
          canonicalName,
          existingPlayerId: existing?.playerId ?? null,
          fantraxId,
          normalizedName: existing?.normalizedName ?? normalizeProviderPlayerName(canonicalName),
          position,
          sourceName,
          sourcePayload: row,
        };
      });
      records.sort(
        (left, right) =>
          left.adp - right.adp || left.canonicalName.localeCompare(right.canonicalName),
      );
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            records: records.map(({ adp, fantraxId, position, sourceName }) => ({
              adp,
              fantraxId,
              position,
              sourceName,
            })),
            seasonKey: input.seasonKey,
            source: 'fantrax-adp',
            sport: 'NBA',
          }),
        )
        .digest('hex');
      const existingPlayerCount = records.filter(
        (record) => record.existingPlayerId !== null,
      ).length;
      return {
        capturedAt: capturedAt.toISOString(),
        fingerprint,
        records,
        seasonKey: input.seasonKey,
        source: 'fantrax-adp' as const,
        sport: 'NBA' as const,
        summary: {
          existingPlayerCount,
          newPlayerCount: records.length - existingPlayerCount,
          playerCount: records.length,
        },
      };
    },
    catch: (cause) =>
      new FantraxAdpValidationError({
        message: 'Fantrax ADP could not be validated',
        reason: cause instanceof Error ? cause.message : 'Fantrax ADP is invalid',
      }),
  });

export const commitFantraxAdpImport = <Error>(
  plan: FantraxAdpImportPlan,
  committer: FantraxAdpCommitter<Error>,
): Effect.Effect<FantraxAdpCommitResult, Error> => committer.saveFantraxAdpSnapshot(plan);
