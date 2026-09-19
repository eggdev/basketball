import type { LatestProjectionSnapshot } from '@fantasy-basketball/database/runtime';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

vi.mock('../app-shell', () => ({
  AskEveButton: ({ children }: { readonly children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

import { PlayersView } from './players-view';

const projection = (status: 'current' | 'missing' | 'stale'): LatestProjectionSnapshot => ({
  asOf: '2026-09-19T12:00:00.000Z',
  calendar:
    status === 'missing'
      ? null
      : {
          asOf: '2026-09-19T11:00:00.000Z',
          fingerprint: 'abcdef1234567890',
          playoffPeriods: [
            {
              endAt: '2027-03-21T23:59:59.000Z',
              label: 'Quarterfinal',
              scoringPeriod: 20,
              startAt: '2027-03-15T00:00:00.000Z',
            },
          ],
          snapshotId: 'calendar-1',
          status,
        },
  createdAt: '2026-09-19T12:01:00.000Z',
  modelVersion: 'availability-v3-calendar',
  players: [
    {
      availability: {
        expectedGames: 72,
        expectedGamesMissed: 10,
        rate: 0.878,
        scheduledGames: 82,
        tier: 'managed',
      },
      bonuses: {
        doubleDoubleRate: 0.8,
        expectedDoubleDoubles: 57.6,
        expectedTripleDoubles: 36,
        tripleDoubleRate: 0.5,
      },
      fantasyPoints: 3000,
      fantasyPointsPerGame: 41.667,
      playerId: 'player-1',
      playerName: 'Nikola Jokic',
      positions: ['C'],
      rank: 1,
      schedule:
        status === 'missing'
          ? null
          : {
              fantasyPlayoffWeeks: [
                {
                  endAt: '2027-03-21T23:59:59.000Z',
                  expectedActiveGames: 3.5,
                  expectedFantasyPoints: 145.8,
                  label: 'Quarterfinal',
                  playoffRound: 'quarterfinal',
                  scheduledGames: 4,
                  scoringPeriod: 20,
                  startAt: '2027-03-15T00:00:00.000Z',
                  weight: 0.75,
                  weekKey: 'period-20',
                },
              ],
              weightedExpectedGames: 2.625,
              weightedExpectedPoints: 109.35,
            },
      teamAbbreviation: 'DEN',
      usableValue:
        status === 'missing'
          ? null
          : {
              diagnostics: {
                availabilityExposure: 0.122,
                capturedPlayoffWeightedPoints: 108,
                congestionLoss: 120,
                estimatedCapturedRegularSeasonPoints: 2_880,
                expectedScheduledPoints: 3_000,
                playoffWeightedGames: 2.625,
                positionalReplacementDelta: 800,
                rawProjectedPoints: 3_000,
                usablePoints: 2_988,
              },
              modelVersion: 'usable-lineup-v1',
              schedule: {
                asOf: '2026-09-19T11:00:00.000Z',
                fingerprint: 'abcdef1234567890',
                snapshotId: 'calendar-1',
              },
              valueCents: 6_500,
            },
    },
  ],
  seasonKey: '2026-27',
  snapshotId: 'projection-1',
  source: 'hashtag',
  summary: { durablePlayerCount: 0, fragilePlayerCount: 0, playerCount: 1 },
});

describe('PlayersView season calendar freshness', () => {
  it('shows the current calendar provenance and actual playoff game counts', () => {
    const html = renderToStaticMarkup(
      <PlayersView market={null} projections={projection('current')} rankings={null} />,
    );

    expect(html).toContain('Calendar Current');
    expect(html).toContain('abcdef12');
    expect(html).toContain('Quarterfinal P20');
    expect(html).toContain('4 games');
    expect(html).toContain('usable-lineup-v1');
    expect(html).toContain('2,988.0');
    expect(html).toContain('120.0');
    expect(html).toContain('$65');
    expect(html).not.toContain('Calendar Pending');
  });

  it('marks an older referenced calendar as stale', () => {
    const html = renderToStaticMarkup(
      <PlayersView market={null} projections={projection('stale')} rankings={null} />,
    );

    expect(html).toContain('Calendar Stale');
  });

  it('uses Pending only when schedule data is absent', () => {
    const html = renderToStaticMarkup(
      <PlayersView market={null} projections={projection('missing')} rankings={null} />,
    );

    expect(html).toContain('Calendar Pending');
    expect(html).toContain('playoff schedule pending');
    expect(html).toContain('>Pending<');
  });
});
