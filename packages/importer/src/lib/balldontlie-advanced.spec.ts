import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Exit, Redacted } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  advancedMetricSets,
  collectAdvancedStats,
  makeBallDontLieAdvancedStatsProvider,
  type AdvancedStatsProvider,
} from './balldontlie-advanced';

describe('BALLDONTLIE advanced stats', () => {
  it('refuses an empty identity set before it can replace stored data', async () => {
    const exit = await Effect.runPromiseExit(
      collectAdvancedStats({
        identities: [],
        provider: {
          listSeasonAverages: () => Effect.succeed([]),
        },
        seasons: [2025],
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain(
      'at least one canonical BALLDONTLIE player identity is required',
    );
  });

  it('refuses an empty provider result instead of deleting stored seasons', async () => {
    const exit = await Effect.runPromiseExit(
      collectAdvancedStats({
        identities: [
          {
            externalId: '246',
            playerId: 'player-jokic',
            playerName: 'Nikola Jokic',
          },
        ],
        provider: {
          listSeasonAverages: () => Effect.succeed([]),
        },
        seasons: [2025],
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('existing data was left unchanged');
  });

  it('combines source-aware metric sets without flattening their meaning', async () => {
    const provider: AdvancedStatsProvider<never> = {
      listSeasonAverages: (metricSet) =>
        Effect.succeed([
          {
            externalPlayerId: '246',
            playerName: 'Nikola Jokic',
            season: 2025,
            sourcePayload: { metricSet },
            stats:
              metricSet.category === 'general' && metricSet.type === 'advanced'
                ? { usg_pct: 0.292 }
                : metricSet.category === 'tracking' && metricSet.type === 'passing'
                  ? { potential_ast: 12.2, secondary_ast: 1.1 }
                  : {},
          },
        ]),
    };
    const plan = await Effect.runPromise(
      collectAdvancedStats({
        identities: [
          {
            externalId: '246',
            playerId: 'player-jokic',
            playerName: 'Nikola Jokic',
          },
        ],
        provider,
        seasons: [2025],
      }),
    );

    expect(plan.summary).toMatchObject({
      metricCount: 3,
      metricSetCount: advancedMetricSets.length,
      playerSeasonCount: 1,
      valid: true,
    });
    expect(plan.records[0]!.metrics).toMatchObject({
      'general.advanced.usg_pct': 0.292,
      'tracking.passing.potential_ast': 12.2,
      'tracking.passing.secondary_ast': 1.1,
    });
  });

  it('paginates the paid season-average endpoint and caches responses', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'basketball-advanced-'));
    let requests = 0;
    const fetchImplementation = (async () => {
      requests += 1;
      return new Response(
        JSON.stringify({
          data: [
            {
              player: { first_name: 'Nikola', id: 246, last_name: 'Jokic' },
              season: 2025,
              stats: { touches: 100, usage_percentage: 0.3 },
            },
          ],
          meta: { per_page: 100 },
        }),
        { headers: { 'x-ratelimit-limit': '60000' }, status: 200 },
      );
    }) as typeof globalThis.fetch;
    const config = {
      apiKey: Redacted.make('secret'),
      cacheDirectory,
      fetch: fetchImplementation,
      initialRequestsPerMinute: 60_000,
    };

    try {
      const first = await Effect.runPromise(
        makeBallDontLieAdvancedStatsProvider(config).listSeasonAverages(
          advancedMetricSets[0],
          ['246'],
          2025,
        ),
      );
      const cached = await Effect.runPromise(
        makeBallDontLieAdvancedStatsProvider({
          ...config,
          fetch: (() => {
            throw new Error('network should not be used');
          }) as typeof globalThis.fetch,
        }).listSeasonAverages(advancedMetricSets[0], ['246'], 2025),
      );

      expect(first[0]).toMatchObject({ externalPlayerId: '246', season: 2025 });
      expect(cached).toEqual(first);
      expect(requests).toBe(1);
    } finally {
      await rm(cacheDirectory, { force: true, recursive: true });
    }
  });
});
