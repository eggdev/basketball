import { describe, expect, it } from 'vitest';
import { currentLeagueScoring } from '@fantasy-basketball/fantasy';
import {
  parseRotoworldSource,
  planRotoworldImport,
  type RotoworldSource,
} from './rotoworld-projections';

const source: RotoworldSource = {
  source: 'rotoworld',
  seasonKey: '2024-25',
  extractorVersion: 'rotoworld-pdf-v1',
  sourceUrl: 'https://example.test/draft-kit.pdf',
  sha256: 'a'.repeat(64),
  retrievedAt: '2026-09-23T19:00:00Z',
  publicationVerified: false,
  pdfMetadata: { ModDate: '2024-10-01T15:30:09-05' },
  rows: [
    {
      sourceName: 'Luka Doncic',
      headerTeam: 'DAL',
      team: 'DAL',
      position: 'PG',
      page: 5,
      headerPage: 5,
      column: 1,
      rawRow: 'PROJ DAL ...',
      issues: [],
      values: {
        games: 68,
        minutes: 36.8,
        points: 33.9,
        fieldGoalsMade: 11.4,
        fieldGoalsAttempted: 23.2,
        fieldGoalPercentage: 49,
        freeThrowsMade: 7.1,
        freeThrowsAttempted: 9,
        freeThrowPercentage: 79,
        threePointersMade: 4.2,
        rebounds: 9.6,
        assists: 10.2,
        steals: 1.5,
        blocks: 0.6,
        turnovers: 4,
        yahooPoints: 61,
      },
    },
  ],
};
const canonicalPlayers = [
  { playerId: 'luka', canonicalName: 'Luka Doncic', normalizedName: 'luka doncic' },
];
const prior = {
  playerId: 'luka',
  seasonKey: '2023-24',
  gamesPlayed: 70,
  stats: { double_double: 40, triple_double: 15 },
};
const plan = (overrides: Partial<Parameters<typeof planRotoworldImport>[0]> = {}) =>
  planRotoworldImport({
    source,
    canonicalPlayers,
    history: [prior],
    rules: currentLeagueScoring,
    ...overrides,
  });

describe('Rotoworld historical projections', () => {
  it('preserves source games and statistics while separating estimated bonuses and dates', () => {
    const result = plan();
    expect(result.batch.source).toBe('rotoworld');
    expect(result.batch.asOf).toBe('2024-10-01T20:30:09.000Z');
    expect(result.batch.sourceCapturedAt).toBe(source.retrievedAt);
    expect(result.batch.sourceMetadata?.['publicationVerified']).toBe(false);
    const row = result.batch.records[0]!;
    expect(row.existingPlayerId).toBe('luka');
    expect(row.projection.availability.expectedGames).toBe(68);
    expect(row.projection.statsPerGame.fieldGoalsMade).toBe(11.4);
    expect(row.projection.bonuses.tripleDoubleRate).toBeGreaterThan(0);
    expect(row.sourcePayload['pdfPage']).toBe('5');
  });
  it('excludes target and future seasons from individual rates and the pooled prior', () => {
    const future = {
      ...prior,
      playerId: 'other',
      seasonKey: '2025-26',
      stats: { double_double: 70, triple_double: 70 },
    };
    const target = {
      ...prior,
      seasonKey: '2024-25',
      stats: { double_double: 70, triple_double: 70 },
    };
    expect(plan({ history: [prior, future, target] }).batch.fingerprint).toBe(
      plan().batch.fingerprint,
    );
    expect(plan({ history: [prior, future, target] }).batch.records).toEqual(plan().batch.records);
  });
  it('keeps retrieval changes and newly assigned database IDs out of the content fingerprint', () => {
    const before = plan({ canonicalPlayers: [], history: [] });
    const after = plan({ history: [], source: { ...source, retrievedAt: '2026-09-24T19:00:00Z' } });
    expect(before.batch.fingerprint).toBe(after.batch.fingerprint);
  });
  it('retains impossible source stats in attribution and excludes them from calculated forecasts', () => {
    const invalid = {
      ...source.rows[0]!,
      sourceName: 'Vince Williams',
      values: { ...source.rows[0]!.values, fieldGoalsMade: 0.7 },
    };
    const result = plan({ source: { ...source, rows: [...source.rows, invalid] } });
    expect(result.summary).toMatchObject({
      sourcePlayers: 2,
      scoredPlayers: 1,
      excludedPlayers: 1,
    });
    expect(result.attribution[1]!.row.values.fieldGoalsMade).toBe(0.7);
    expect(result.attribution[1]!.errors).toContain('Invalid shooting counts');
  });
  it('rejects ambiguous identities and malformed source data', () => {
    expect(() =>
      plan({
        canonicalPlayers: [...canonicalPlayers, { ...canonicalPlayers[0]!, playerId: 'duplicate' }],
      }),
    ).toThrow('Ambiguous');
    expect(() => parseRotoworldSource({ ...source, seasonKey: '2025-26' })).toThrow('2024-25');
    expect(() => plan({ source: { ...source, rows: [] } })).toThrow('No source');
    expect(() => plan({ source: { ...source, pdfMetadata: {} } })).toThrow('revision date');
  });
});
