import { createHash } from 'node:crypto';
import type { ProjectionSnapshotBatch } from '@fantasy-basketball/database';
import { buildProjectionRun, type ScoringRules } from '@fantasy-basketball/fantasy';
import { Schema } from 'effect';
import type { ProjectionCanonicalPlayer, ProjectionHistoryRecord } from './hashtag-projections';
import { normalizeProviderPlayerName } from './player-production';

const number = Schema.Number.pipe(Schema.finite(), Schema.nonNegative());
const sourceSchema = Schema.Struct({
  source: Schema.Literal('rotoworld'),
  seasonKey: Schema.Literal('2024-25'),
  extractorVersion: Schema.Literal('rotoworld-pdf-v1'),
  sourceUrl: Schema.String,
  sha256: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{64}$/)),
  retrievedAt: Schema.String,
  pdfMetadata: Schema.Record({ key: Schema.String, value: Schema.String }),
  publicationVerified: Schema.Literal(false),
  rows: Schema.Array(
    Schema.Struct({
      sourceName: Schema.String,
      headerTeam: Schema.String,
      position: Schema.Literal('PG', 'SG', 'SF', 'PF', 'C'),
      headerPage: number,
      page: number,
      column: number,
      team: Schema.String,
      rawRow: Schema.String,
      issues: Schema.Array(Schema.String),
      values: Schema.Struct({
        games: number,
        minutes: number,
        points: number,
        fieldGoalsMade: number,
        fieldGoalsAttempted: number,
        fieldGoalPercentage: number,
        freeThrowsMade: number,
        freeThrowsAttempted: number,
        freeThrowPercentage: number,
        threePointersMade: number,
        rebounds: number,
        assists: number,
        steals: number,
        blocks: number,
        turnovers: number,
        yahooPoints: number,
      }),
    }),
  ),
});

export const parseRotoworldSource = (value: unknown) =>
  Schema.decodeUnknownSync(sourceSchema)(value);
export type RotoworldSource = Schema.Schema.Type<typeof sourceSchema>;

// Explicit full-name aliases. Never use a fuzzy match to attach historical forecasts.
const aliases: Readonly<Record<string, string>> = {
  'robert dillingham': 'Rob Dillingham',
  'cam thomas': 'Cameron Thomas',
  'nic claxton': 'Nicolas Claxton',
};
const withoutSuffix = (name: string) =>
  normalizeProviderPlayerName(name).replace(/(?: (?:jr|sr|ii|iii|iv))+$/, '');

export function planRotoworldImport(input: {
  source: RotoworldSource;
  canonicalPlayers: readonly ProjectionCanonicalPlayer[];
  history: readonly ProjectionHistoryRecord[];
  rules: ScoringRules;
}) {
  const { source } = input;
  if (!source.rows.length) throw new Error('No source projections');
  const metadataDate = source.pdfMetadata['ModDate'];
  const asOf = new Date((metadataDate ?? '').replace(/([+-]\d{2})$/, '$1:00'));
  if (!Number.isFinite(asOf.getTime()) || asOf.getUTCFullYear() !== 2024)
    throw new Error('Expected a 2024 PDF revision date');
  if (!Number.isFinite(new Date(source.retrievedAt).getTime()))
    throw new Error('Invalid source retrieval date');
  const seen = new Set<string>();
  const attribution = source.rows.map((row) => {
    const sourceNormalized = normalizeProviderPlayerName(row.sourceName);
    const name = aliases[sourceNormalized] ?? row.sourceName;
    const normalized = normalizeProviderPlayerName(name);
    const exact = input.canonicalPlayers.filter(
      (player) => normalizeProviderPlayerName(player.canonicalName) === normalized,
    );
    const candidates = exact.length
      ? exact
      : input.canonicalPlayers.filter(
          (player) => withoutSuffix(player.canonicalName) === withoutSuffix(name),
        );
    if (candidates.length > 1) throw new Error(`Ambiguous player: ${row.sourceName}`);
    const existing = candidates[0] ?? null;
    const canonicalName = existing?.canonicalName ?? name;
    const normalizedName = normalizeProviderPlayerName(canonicalName);
    if (seen.has(normalizedName)) throw new Error(`Duplicate player: ${row.sourceName}`);
    seen.add(normalizedName);
    const values = row.values;
    if (!Number.isInteger(values.games) || values.games < 1 || values.games > 82)
      throw new Error(`Invalid expected games: ${row.sourceName}`);
    const errors = row.issues.filter(
      (issue) => issue !== 'Projection team differs from player heading',
    );
    // Recheck raw stat integrity at the import boundary, even when source issues are absent.
    if (
      values.threePointersMade > values.fieldGoalsMade ||
      values.fieldGoalsMade > values.fieldGoalsAttempted ||
      values.freeThrowsMade > values.freeThrowsAttempted
    )
      errors.push('Invalid shooting counts');
    if (
      Math.abs(
        values.points -
          (2 * values.fieldGoalsMade + values.threePointersMade + values.freeThrowsMade),
      ) > 0.35
    )
      errors.push('Points disagree with shooting components');
    if (values.fieldGoalPercentage > 100 || values.freeThrowPercentage > 100)
      errors.push('Invalid shooting percentage');
    return {
      row,
      canonicalName,
      normalizedName,
      playerId: existing?.playerId ?? null,
      matchMethod:
        existing === null
          ? 'new-player'
          : aliases[sourceNormalized]
            ? 'alias'
            : exact.length
              ? 'exact'
              : 'unique-without-suffix',
      sourceExternalId: sourceNormalized,
      excludedFromScoring: errors.length > 0,
      errors: [...new Set(errors)],
    };
  });
  // Filter before computing either individual bonus rates or the pooled prior.
  const history = input.history
    .filter(
      (row) =>
        row.seasonKey < source.seasonKey &&
        row.gamesPlayed > 0 &&
        typeof row.stats['double_double'] === 'number' &&
        typeof row.stats['triple_double'] === 'number',
    )
    .map((row) => ({
      playerId: row.playerId,
      seasonKey: row.seasonKey,
      gamesPlayed: row.gamesPlayed,
      doubleDoubles: row.stats['double_double']!,
      tripleDoubles: row.stats['triple_double']!,
    }));
  const scored = attribution.filter((row) => !row.excludedFromScoring);
  const run = buildProjectionRun({
    history,
    rules: input.rules,
    players: scored.map(({ row, canonicalName, playerId, sourceExternalId }) => ({
      playerId: playerId ?? `rotoworld:${sourceExternalId}`,
      playerName: canonicalName,
      expectedGames: row.values.games,
      positions: [row.position],
      teamAbbreviation: row.team,
      statsPerGame: {
        points: row.values.points,
        rebounds: row.values.rebounds,
        assists: row.values.assists,
        steals: row.values.steals,
        blocks: row.values.blocks,
        turnovers: row.values.turnovers,
        threePointersMade: row.values.threePointersMade,
        fieldGoalsMade: row.values.fieldGoalsMade,
        fieldGoalsAttempted: row.values.fieldGoalsAttempted,
        freeThrowsMade: row.values.freeThrowsMade,
        freeThrowsAttempted: row.values.freeThrowsAttempted,
      },
    })),
  });
  const projections = new Map(run.players.map((player) => [player.playerId, player]));
  const records = scored.map((row) => ({
    canonicalName: row.canonicalName,
    existingPlayerId: row.playerId,
    normalizedName: row.normalizedName,
    sourceExternalId: row.sourceExternalId,
    sourceName: row.row.sourceName,
    sourcePayload: {
      sourceUrl: source.sourceUrl,
      sourceSha256: source.sha256,
      pdfPage: String(row.row.page),
      sourceRow: row.row.rawRow,
      sourceValues: JSON.stringify(row.row.values),
      headerTeam: row.row.headerTeam,
      issues: JSON.stringify(row.row.issues),
      matchMethod: row.matchMethod,
      dateBasis: 'PDF revision metadata; publication before draft unverified',
      bonusBasis: 'Derived from completed seasons before 2024-25; not supplied by Rotoworld',
    },
    projection: projections.get(row.playerId ?? `rotoworld:${row.sourceExternalId}`)!,
  }));
  const modelVersion = 'rotoworld-2024-25-preseason-bonuses-v1';
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        sourceSha256: source.sha256,
        modelVersion,
        rules: input.rules,
        asOf: asOf.toISOString(),
        records: records.map((row) => ({
          name: row.canonicalName,
          sourceExternalId: row.sourceExternalId,
          projection: { ...row.projection, playerId: row.sourceExternalId },
        })),
      }),
    )
    .digest('hex');
  const batch: ProjectionSnapshotBatch = {
    source: 'rotoworld',
    seasonKey: source.seasonKey,
    asOf: asOf.toISOString(),
    sourceCapturedAt: source.retrievedAt,
    calendar: null,
    modelVersion,
    fingerprint,
    records,
    sourceMetadata: {
      sourceUrl: source.sourceUrl,
      sha256: source.sha256,
      retrievedAt: source.retrievedAt,
      pdfMetadata: source.pdfMetadata,
      publicationVerified: false,
      excludedRows: attribution.filter((row) => row.excludedFromScoring),
      bonusHistorySeasons: [...new Set(history.map((row) => row.seasonKey))].sort(),
      bonusPriors: run.bonusPriors,
    },
    limitations: [
      'Forecast date uses PDF revision metadata. Publication before the league draft is unverified; do not use in a strict pre-draft backtest yet.',
      'Source stat lines and expected games are preserved. Bonus rates are our estimates using only completed seasons before 2024-25.',
      'Source positions are editorial profile sections, not historical Fantrax eligibility. Historical lineup schedules are not attached.',
      'Source rows with inconsistent stat counts are archived but excluded from calculated forecasts. Team changes are retained with warnings.',
    ],
  };
  return {
    batch,
    attribution,
    summary: {
      sourcePlayers: attribution.length,
      scoredPlayers: records.length,
      excludedPlayers: attribution.filter((row) => row.excludedFromScoring).length,
      newPlayers: records.filter((row) => row.existingPlayerId === null).length,
      sourceWarningPlayers: attribution.filter((row) => row.row.issues.length > 0).length,
    },
  };
}
