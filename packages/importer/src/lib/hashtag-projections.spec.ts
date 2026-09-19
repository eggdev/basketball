import { currentLeagueScoring } from '@fantasy-basketball/fantasy';
import { Effect, Exit } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  commitHashtagProjectionImport,
  planHashtagProjectionImport,
  type ProjectionSnapshotCommitter,
} from './hashtag-projections';

const csv = `PLAYER,POS,TEAM,GP,FG%,FT%,3PM,PTS,TREB,AST,STL,BLK,TO,DD,TD
N.Jokic,C,DEN,72,"0.573 (10.5/18.3)","0.816 (5.6/6.8)",1.8,28.4,12.7,10.4,1.6,0.7,3.5,0.8,0.5
Rookie Example,PG SG,BKN,70,"0.450 (7.2/16.0)","0.800 (4.0/5.0)",2.2,20.6,4.2,6.1,1.2,0.3,2.5,0.1,0
`;

const input = {
  asOf: '2026-09-18',
  calendar: {
    fingerprint: 'a'.repeat(64),
    schedulesByTeam: {
      BKN: {
        fantasyPlayoffWeeks: [
          { label: 'Championship', scheduledGames: 4, weight: 1.5, weekKey: 'period-22' },
        ],
        regularSeasonScheduledGames: 82,
      },
      DEN: {
        fantasyPlayoffWeeks: [
          { label: 'Championship', scheduledGames: 3, weight: 1.5, weekKey: 'period-22' },
        ],
        regularSeasonScheduledGames: 82,
      },
    },
    snapshotId: 'calendar-1',
  },
  canonicalPlayers: [
    {
      canonicalName: 'Nikola Jokic',
      normalizedName: 'nikola jokic',
      playerId: 'player-jokic',
    },
  ],
  csv,
  history: [
    {
      gamesPlayed: 70,
      playerId: 'player-jokic',
      seasonKey: '2025-26',
      stats: { double_double: 60, triple_double: 35 },
    },
  ],
  modelVersion: 'availability-v1',
  rules: currentLeagueScoring,
  seasonKey: '2026-27',
};

describe('planHashtagProjectionImport', () => {
  it('normalizes a Hashtag export, reconciles abbreviations, and creates new players', async () => {
    const plan = await Effect.runPromise(planHashtagProjectionImport(input));

    expect(plan.summary).toEqual({
      existingPlayerCount: 1,
      newPlayerCount: 1,
      playerCount: 2,
      unresolvedPlayerCount: 0,
      valid: true,
    });
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.calendar).toEqual({ fingerprint: 'a'.repeat(64), snapshotId: 'calendar-1' });
    expect(plan.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: 'Nikola Jokic',
          existingPlayerId: 'player-jokic',
          sourceName: 'N.Jokic',
          projection: expect.objectContaining({
            availability: expect.objectContaining({ expectedGames: 72 }),
            statsPerGame: expect.objectContaining({
              fieldGoalsAttempted: 18.3,
              fieldGoalsMade: 10.5,
            }),
            bonuses: {
              doubleDoubleRate: 0.8,
              expectedDoubleDoubles: 57.6,
              expectedTripleDoubles: 36,
              tripleDoubleRate: 0.5,
            },
            schedule: expect.objectContaining({
              fantasyPlayoffWeeks: [expect.objectContaining({ scheduledGames: 3 })],
            }),
          }),
        }),
        expect.objectContaining({
          canonicalName: 'Rookie Example',
          existingPlayerId: null,
          normalizedName: 'rookie example',
          projection: expect.objectContaining({ positions: ['PG', 'SG'] }),
        }),
      ]),
    );
  });

  it('treats punctuated multiple initials as a complete player name', async () => {
    const plan = await Effect.runPromise(
      planHashtagProjectionImport({
        ...input,
        csv: csv.replace('Rookie Example', 'L.J. Cryer'),
      }),
    );

    expect(plan.summary.valid).toBe(true);
    expect(plan.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalName: 'LJ Cryer', sourceName: 'L.J. Cryer' }),
      ]),
    );
  });

  it('keeps the source fingerprint stable after new players are reconciled', async () => {
    const firstPlan = await Effect.runPromise(planHashtagProjectionImport(input));
    const reconciledPlan = await Effect.runPromise(
      planHashtagProjectionImport({
        ...input,
        canonicalPlayers: [
          ...input.canonicalPlayers,
          {
            canonicalName: 'Rookie Example',
            normalizedName: 'rookie example',
            playerId: 'player-rookie',
          },
        ],
      }),
    );

    expect(reconciledPlan.fingerprint).toBe(firstPlan.fingerprint);
  });

  it('reports an unknown abbreviated player instead of inventing an identity', async () => {
    const plan = await Effect.runPromise(
      planHashtagProjectionImport({
        ...input,
        csv: csv.replace('Rookie Example', 'R.Example'),
      }),
    );

    expect(plan.summary.valid).toBe(false);
    expect(plan.issues).toEqual([
      { candidatePlayerIds: [], kind: 'unresolved_abbreviation', sourceName: 'R.Example' },
    ]);
  });

  it('blocks a projection team that is absent from the exact calendar snapshot', async () => {
    const plan = await Effect.runPromise(
      planHashtagProjectionImport({
        ...input,
        csv: csv.replace('BKN', 'SEA'),
      }),
    );

    expect(plan.summary.valid).toBe(false);
    expect(plan.issues).toContainEqual({
      candidatePlayerIds: [],
      kind: 'unresolved_team_schedule',
      sourceName: 'Rookie Example (SEA)',
    });
  });

  it.each([
    ['GS', 'GSW'],
    ['NO', 'NOP'],
    ['NY', 'NYK'],
    ['PHO', 'PHX'],
    ['SA', 'SAS'],
  ])('maps the Hashtag %s team code to the NBA %s schedule', async (sourceTeam, nbaTeam) => {
    const schedule = {
      fantasyPlayoffWeeks: [
        { label: 'Championship', scheduledGames: 3, weight: 1.5, weekKey: 'period-22' },
      ],
      regularSeasonScheduledGames: 82,
    };
    const plan = await Effect.runPromise(
      planHashtagProjectionImport({
        ...input,
        calendar: {
          ...input.calendar,
          schedulesByTeam: { ...input.calendar.schedulesByTeam, [nbaTeam]: schedule },
        },
        csv: csv.replace('Rookie Example,PG SG,BKN', `Rookie Example,PG SG,${sourceTeam}`),
      }),
    );

    expect(plan.summary.valid).toBe(true);
    expect(
      plan.records.find((record) => record.canonicalName === 'Rookie Example')?.projection,
    ).toMatchObject({
      schedule: { fantasyPlayoffWeeks: [{ scheduledGames: 3 }] },
      teamAbbreviation: nbaTeam,
    });
  });

  it('commits only a fully reconciled projection snapshot', async () => {
    const plan = await Effect.runPromise(planHashtagProjectionImport(input));
    const saveProjectionSnapshot = vi.fn<
      ProjectionSnapshotCommitter<never>['saveProjectionSnapshot']
    >(() =>
      Effect.succeed({
        ingestionRunId: 'run-1',
        newPlayerCount: 1,
        playerProjectionCount: 2,
        snapshotId: 'snapshot-1',
      }),
    );

    const result = await Effect.runPromise(
      commitHashtagProjectionImport(plan, { saveProjectionSnapshot }),
    );

    expect(result.playerProjectionCount).toBe(2);
    expect(saveProjectionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: plan.fingerprint, records: plan.records }),
    );
  });

  it('returns a typed validation error for missing shooting volume', async () => {
    const exit = await Effect.runPromiseExit(
      planHashtagProjectionImport({ ...input, csv: csv.replace('(10.5/18.3)', '') }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('field goal percentage must include projected makes/attempts');
  });

  it('requires an explicit escape hatch to commit without schedule provenance', async () => {
    const plan = await Effect.runPromise(
      planHashtagProjectionImport({ ...input, calendar: undefined }),
    );
    const saveProjectionSnapshot = vi.fn<
      ProjectionSnapshotCommitter<never>['saveProjectionSnapshot']
    >(() =>
      Effect.succeed({
        ingestionRunId: 'run-1',
        newPlayerCount: 1,
        playerProjectionCount: 2,
        snapshotId: 'snapshot-1',
      }),
    );

    const refused = await Effect.runPromiseExit(
      commitHashtagProjectionImport(plan, { saveProjectionSnapshot }),
    );
    expect(Exit.isFailure(refused)).toBe(true);
    expect(String(refused)).toContain('allow-missing-schedule');

    await Effect.runPromise(
      commitHashtagProjectionImport(
        plan,
        { saveProjectionSnapshot },
        { allowMissingSchedule: true },
      ),
    );
    expect(saveProjectionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ calendar: null, limitations: ['missing-season-calendar'] }),
    );
  });
});
