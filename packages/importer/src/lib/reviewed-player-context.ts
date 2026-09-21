import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type {
  OpportunityDirection,
  PlayerMovementType,
  PlayerSituationContext,
} from '@fantasy-basketball/fantasy';
import { parse } from 'csv-parse/sync';
import { Data, Effect } from 'effect';

import { normalizeProviderPlayerName } from './player-production';

export interface ReviewedContextCanonicalPlayer {
  readonly canonicalName: string;
  readonly normalizedName: string;
  readonly playerId: string;
}

export interface ReviewedPlayerContextRecord extends PlayerSituationContext {
  readonly playerName: string;
  readonly sourcePayload: Readonly<Record<string, string>>;
}

export interface ReviewedPlayerContextIssue {
  readonly candidatePlayerIds: ReadonlyArray<string>;
  readonly kind: 'ambiguous_player' | 'invalid_context' | 'unmatched_player';
  readonly playerName: string;
  readonly reason: string;
}

export interface ReviewedPlayerContextPlan {
  readonly asOf: string;
  readonly fingerprint: string;
  readonly issues: ReadonlyArray<ReviewedPlayerContextIssue>;
  readonly records: ReadonlyArray<ReviewedPlayerContextRecord>;
  readonly seasonKey: string;
  readonly source: 'reviewed-player-context';
  readonly summary: {
    readonly injuryContextCount: number;
    readonly movementContextCount: number;
    readonly playerCount: number;
    readonly roleContextCount: number;
    readonly valid: boolean;
  };
}

export interface ReviewedPlayerContextCommitResult {
  readonly alreadySaved: boolean;
  readonly ingestionRunId: string;
  readonly playerCount: number;
  readonly snapshotId: string;
}

export interface ReviewedPlayerContextCommitter<Error> {
  readonly savePlayerContextSnapshot: (
    batch: Pick<
      ReviewedPlayerContextPlan,
      'asOf' | 'fingerprint' | 'records' | 'seasonKey' | 'source'
    >,
  ) => Effect.Effect<ReviewedPlayerContextCommitResult, Error>;
}

export class ReviewedPlayerContextSourceError extends Data.TaggedError(
  'ReviewedPlayerContextSourceError',
)<{ readonly message: string; readonly reason: string }> {}

export class ReviewedPlayerContextValidationError extends Data.TaggedError(
  'ReviewedPlayerContextValidationError',
)<{ readonly message: string; readonly reason: string }> {}

const movementTypes = new Set<PlayerMovementType>([
  'draft',
  'free-agent-signing',
  're-signing',
  'returning',
  'trade',
  'two-way',
  'unknown',
  'waiver',
]);
const opportunityDirections = new Set<Exclude<OpportunityDirection, 'uncertain'>>([
  'down',
  'steady',
  'up',
]);

const normalizedHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_|_$/g, '');

const normalizedRow = (row: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizedHeader(key), value.trim()]),
  );

const optional = (row: Readonly<Record<string, string>>, key: string): string | null => {
  const value = row[key]?.trim();
  return value === undefined || value === '' ? null : value;
};

const sourceUrl = (value: string | null, label: string): string => {
  if (value === null) throw new Error(`${label} source URL is required`);
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${label} source URL must use HTTP or HTTPS`);
  }
  return url.toString();
};

const team = (value: string | null, label: string): string | null => {
  if (value === null) return null;
  const abbreviation = value.toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(abbreviation)) {
    throw new Error(`${label} must be a team abbreviation`);
  }
  return abbreviation;
};

const date = (value: string | null): string | null => {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('movement effective date must use YYYY-MM-DD');
  }
  return value;
};

const movement = (row: Readonly<Record<string, string>>): PlayerSituationContext['movement'] => {
  const typeValue = optional(row, 'movement_type');
  const fromTeamAbbreviation = team(optional(row, 'from_team'), 'from team');
  const toTeamAbbreviation = team(optional(row, 'to_team'), 'to team');
  const effectiveDate = date(optional(row, 'effective_date'));
  const note = optional(row, 'movement_note');
  const url = optional(row, 'movement_source_url');
  const hasMovement = [
    typeValue,
    fromTeamAbbreviation,
    toTeamAbbreviation,
    effectiveDate,
    note,
    url,
  ].some((value) => value !== null);
  if (!hasMovement) return null;
  if (typeValue === null || !movementTypes.has(typeValue as PlayerMovementType)) {
    throw new Error('movement type is invalid');
  }
  return {
    effectiveDate,
    fromTeamAbbreviation,
    note,
    sourceUrl: sourceUrl(url, 'movement'),
    toTeamAbbreviation,
    type: typeValue as PlayerMovementType,
  };
};

const injury = (row: Readonly<Record<string, string>>): PlayerSituationContext['injury'] => {
  const status = optional(row, 'injury_status');
  const summary = optional(row, 'injury_summary');
  const url = optional(row, 'injury_source_url');
  if (status === null && summary === null && url === null) return null;
  if (summary === null) throw new Error('injury summary is required');
  return { sourceUrl: sourceUrl(url, 'injury'), status, summary };
};

const role = (row: Readonly<Record<string, string>>): PlayerSituationContext['role'] => {
  const depthRole = optional(row, 'depth_role');
  const note = optional(row, 'role_note');
  const directionValue = optional(row, 'opportunity_direction');
  const url = optional(row, 'role_source_url');
  if (depthRole === null && note === null && directionValue === null && url === null) return null;
  if (note === null) throw new Error('role note is required');
  if (
    directionValue !== null &&
    !opportunityDirections.has(directionValue as Exclude<OpportunityDirection, 'uncertain'>)
  ) {
    throw new Error('opportunity direction must be up, steady, or down');
  }
  return {
    depthRole,
    note,
    opportunityDirection: directionValue as Exclude<OpportunityDirection, 'uncertain'> | null,
    sourceUrl: sourceUrl(url, 'role'),
  };
};

export const loadReviewedPlayerContextCsv = (
  path: string,
): Effect.Effect<string, ReviewedPlayerContextSourceError> =>
  Effect.tryPromise({
    try: () => readFile(path, 'utf8'),
    catch: (cause) =>
      new ReviewedPlayerContextSourceError({
        message: 'Reviewed player context could not be loaded',
        reason: cause instanceof Error ? cause.message : 'source file is unavailable',
      }),
  });

export const planReviewedPlayerContextImport = (input: {
  readonly asOf: string;
  readonly canonicalPlayers: ReadonlyArray<ReviewedContextCanonicalPlayer>;
  readonly csv: string;
  readonly seasonKey: string;
}): Effect.Effect<ReviewedPlayerContextPlan, ReviewedPlayerContextValidationError> =>
  Effect.try({
    try: () => {
      const asOf = new Date(input.asOf);
      if (Number.isNaN(asOf.getTime())) throw new Error('as-of must be a valid timestamp');
      if (!/^\d{4}-\d{2}$/.test(input.seasonKey)) {
        throw new Error('season key must use YYYY-YY');
      }
      const rows = parse(input.csv, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
      const playersById = new Map(
        input.canonicalPlayers.map((player) => [player.playerId, player]),
      );
      const playersByName = new Map<string, ReviewedContextCanonicalPlayer[]>();
      input.canonicalPlayers.forEach((player) => {
        const key = normalizeProviderPlayerName(player.normalizedName || player.canonicalName);
        playersByName.set(key, [...(playersByName.get(key) ?? []), player]);
      });
      const issues: ReviewedPlayerContextIssue[] = [];
      const records: ReviewedPlayerContextRecord[] = [];
      const seenPlayers = new Set<string>();

      rows.forEach((sourceRow) => {
        const row = normalizedRow(sourceRow);
        const playerName = optional(row, 'player') ?? '';
        const explicitPlayerId = optional(row, 'player_id');
        const candidates =
          explicitPlayerId === null
            ? (playersByName.get(normalizeProviderPlayerName(playerName)) ?? [])
            : [playersById.get(explicitPlayerId)].filter(
                (player): player is ReviewedContextCanonicalPlayer => player !== undefined,
              );
        if (candidates.length !== 1) {
          issues.push({
            candidatePlayerIds: candidates.map((player) => player.playerId),
            kind: candidates.length === 0 ? 'unmatched_player' : 'ambiguous_player',
            playerName: playerName || explicitPlayerId || 'unknown player',
            reason:
              candidates.length === 0 ? 'no canonical player matched' : 'multiple players matched',
          });
          return;
        }
        const player = candidates[0]!;
        if (seenPlayers.has(player.playerId)) {
          issues.push({
            candidatePlayerIds: [player.playerId],
            kind: 'invalid_context',
            playerName: player.canonicalName,
            reason: 'player appears more than once',
          });
          return;
        }

        try {
          const parsedMovement = movement(row);
          const parsedInjury = injury(row);
          const parsedRole = role(row);
          if (parsedMovement === null && parsedInjury === null && parsedRole === null) {
            throw new Error('at least one movement, injury, or role fact is required');
          }
          seenPlayers.add(player.playerId);
          records.push({
            injury: parsedInjury,
            movement: parsedMovement,
            playerId: player.playerId,
            playerName: player.canonicalName,
            role: parsedRole,
            sourcePayload: row,
          });
        } catch (cause) {
          issues.push({
            candidatePlayerIds: [player.playerId],
            kind: 'invalid_context',
            playerName: player.canonicalName,
            reason: cause instanceof Error ? cause.message : 'context is invalid',
          });
        }
      });

      records.sort((left, right) => left.playerId.localeCompare(right.playerId));
      issues.sort(
        (left, right) =>
          left.playerName.localeCompare(right.playerName) || left.kind.localeCompare(right.kind),
      );
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            asOf: asOf.toISOString(),
            issues,
            records,
            seasonKey: input.seasonKey,
            source: 'reviewed-player-context',
          }),
        )
        .digest('hex');

      return {
        asOf: asOf.toISOString(),
        fingerprint,
        issues,
        records,
        seasonKey: input.seasonKey,
        source: 'reviewed-player-context' as const,
        summary: {
          injuryContextCount: records.filter((record) => record.injury !== null).length,
          movementContextCount: records.filter((record) => record.movement !== null).length,
          playerCount: records.length,
          roleContextCount: records.filter((record) => record.role !== null).length,
          valid: issues.length === 0,
        },
      };
    },
    catch: (cause) =>
      new ReviewedPlayerContextValidationError({
        message: 'Reviewed player context could not be validated',
        reason: cause instanceof Error ? cause.message : 'context source is invalid',
      }),
  });

export const commitReviewedPlayerContextImport = <Error>(
  plan: ReviewedPlayerContextPlan,
  committer: ReviewedPlayerContextCommitter<Error>,
): Effect.Effect<
  ReviewedPlayerContextCommitResult,
  Error | ReviewedPlayerContextValidationError
> =>
  plan.summary.valid
    ? committer.savePlayerContextSnapshot(plan)
    : Effect.fail(
        new ReviewedPlayerContextValidationError({
          message: 'Reviewed player context contains unresolved issues',
          reason: `${plan.issues.length} issue(s) require review`,
        }),
      );
