import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database';
import {
  buildAuctionValuationLab,
  fitProductionValue,
  valueProjectedProduction,
  type ProductionValueSeason,
} from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';

// Read-only study. This command never imports or promotes a valuation run.
const run = async () => {
  const config = await Effect.runPromise(loadDatabaseConfig());
  const input = await Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      const [projection, rankings, activity, workspace] = yield* Effect.all(
        [
          db.latestProjectionSnapshot,
          db.historicalRankings,
          db.leagueRosterActivity,
          db.preDraftWorkspace('clyde'),
        ],
        { concurrency: 4 },
      );
      if (!projection || !workspace.league)
        throw new Error('Current projections and league settings are required');
      const promoted = yield* db.promotedAuctionValuationRun(projection.seasonKey);
      return { projection, rankings, activity, league: workspace.league, promoted };
    }).pipe(Effect.provide(databaseLayer(config))),
  );
  const seasons = input.rankings.seasons
    .filter((season) => season.seasonKey < input.projection.seasonKey)
    .sort((a, b) => a.seasonKey.localeCompare(b.seasonKey));
  const history: ProductionValueSeason[] = seasons.map((season) => {
    const prices = new Map(
      season.auctionPlayers.map((player) => [player.playerId, player.auctionCostCents]),
    );
    return {
      seasonKey: season.seasonKey,
      baseBudgetCents: season.baseBudgetCents,
      players: season.players.map((player) => ({
        ...player,
        auctionCostCents: prices.get(player.playerId) ?? null,
      })),
    };
  });
  const model = fitProductionValue({ history, baseBudgetCents: input.league.baseBudgetCents });
  const lab = buildAuctionValuationLab({
    historicalSeasons: seasons.map((season) => ({
      ...season,
      auctionPrices: season.auctionPlayers,
    })),
  });
  const predictions: {
    season: string;
    playerId: string;
    actualCents: number;
    predictedCents: number;
    model: string;
  }[] = [];
  const coverage = seasons.slice(1).map((target, index) => {
    const fitted = fitProductionValue({
      history: history.slice(0, index + 1),
      baseBudgetCents: target.baseBudgetCents,
    });
    const priorPlayers = new Map(
      seasons[index]!.players.map((player) => [player.playerId, player]),
    );
    let predictedCount = 0;
    for (const player of target.auctionPlayers) {
      const previous = priorPlayers.get(player.playerId);
      if (!previous) continue;
      predictedCount++;
      // A disclosed lag-one proxy. Archived preseason forecasts are not available for these years.
      const value = valueProjectedProduction(fitted, {
        fantasyPointsPerGame: previous.fantasyPointsPerGame,
        expectedGames: previous.gamesPlayed,
      });
      predictions.push({
        season: target.seasonKey,
        playerId: player.playerId,
        actualCents: player.auctionCostCents,
        predictedCents: value.valueCents,
        model: model.version,
      });
      for (const baseline of lab.models) {
        const estimate = baseline.predictions.find(
          (row) => row.seasonKey === target.seasonKey && row.playerId === player.playerId,
        );
        if (estimate)
          predictions.push({
            season: target.seasonKey,
            playerId: player.playerId,
            actualCents: player.auctionCostCents,
            predictedCents: estimate.predictedPriceCents,
            model: baseline.id,
          });
      }
    }
    return {
      season: target.seasonKey,
      recordedAuctions: target.auctionPlayers.length,
      predictedCount,
    };
  });
  const metrics = [model.version, ...lab.models.map((row) => row.id)].map((name) => {
    const rows = predictions.filter((row) => row.model === name);
    const paid = rows.filter((row) => row.actualCents > 0);
    const mae = (values: typeof rows) =>
      values.length
        ? values.reduce((sum, row) => sum + Math.abs(row.predictedCents - row.actualCents), 0) /
          values.length /
          100
        : null;
    return {
      model: name,
      count: rows.length,
      priceMaeDollars: mae(rows),
      paidCount: paid.length,
      paidPriceMaeDollars: mae(paid),
      seasons: coverage.map((season) => ({
        season: season.season,
        priceMaeDollars: mae(rows.filter((row) => row.season === season.season)),
      })),
    };
  });
  const recordedByPlayer = new Map(
    seasons.at(-1)!.auctionPlayers.map((player) => [player.playerId, player.auctionCostCents]),
  );
  const promoted = new Map(
    input.promoted?.current.players.map((player) => [player.playerId, player]) ?? [],
  );
  const averagePool = [...input.projection.players]
    .sort((a, b) => b.fantasyPoints - a.fantasyPoints)
    .slice(0, input.league.teamCount * input.league.rosterSize);
  const averageFpg =
    averagePool.reduce((sum, player) => sum + player.fantasyPoints, 0) /
    averagePool.reduce((sum, player) => sum + player.availability.expectedGames, 0);
  const current = input.projection.players
    .map((player) => ({
      playerId: player.playerId,
      name: player.playerName,
      rank: player.rank,
      fantasyPoints: player.fantasyPoints,
      fantasyPointsPerGame: player.fantasyPointsPerGame,
      expectedGames: player.availability.expectedGames,
      availabilityRate: player.availability.rate,
      pointsPerGameAboveAverage: player.fantasyPointsPerGame - averageFpg,
      ...valueProjectedProduction(model, {
        fantasyPointsPerGame: player.fantasyPointsPerGame,
        expectedGames: player.availability.expectedGames,
      }),
      previousCostCents: recordedByPlayer.get(player.playerId) ?? null,
      promotedMarketCents: promoted.get(player.playerId)?.marketEstimateCents ?? null,
    }))
    .sort((a, b) => b.valueCents - a.valueCents || b.surplusPoints - a.surplusPoints);
  const seasonAudit = seasons.map((season) => {
    const price = new Map(
      season.auctionPlayers.map((player) => [player.playerId, player.auctionCostCents]),
    );
    const leader = [...season.players].sort((a, b) => b.fantasyPoints - a.fantasyPoints)[0]!;
    const fpgLeader = [...season.players]
      .filter((player) => player.gamesPlayed >= 30)
      .sort((a, b) => b.fantasyPointsPerGame - a.fantasyPointsPerGame)[0]!;
    const activity = input.activity.seasons.find((item) => item.seasonKey === season.seasonKey);
    const pool = [...season.players]
      .sort((a, b) => b.fantasyPoints - a.fantasyPoints)
      .slice(0, season.teamCount * season.rosterSize);
    const known = new Set(season.players.map((player) => player.playerId));
    return {
      season: season.seasonKey,
      teams: season.teamCount,
      rosterSize: season.rosterSize,
      scoredPlayers: season.players.length,
      recordedAuctions: season.auctionPlayers.length,
      zeroDollarPurchases: season.auctionPlayers.filter((player) => player.auctionCostCents === 0)
        .length,
      recordedSpendDollars:
        season.auctionPlayers.reduce((sum, player) => sum + player.auctionCostCents, 0) / 100,
      maximumPaidDollars:
        Math.max(...season.auctionPlayers.map((player) => player.auctionCostCents)) / 100,
      leader: {
        name: leader.playerName,
        fantasyPoints: leader.fantasyPoints,
        fantasyPointsPerGame: leader.fantasyPointsPerGame,
        games: leader.gamesPlayed,
        costDollars: price.has(leader.playerId) ? price.get(leader.playerId)! / 100 : null,
      },
      fpgLeader: {
        name: fpgLeader.playerName,
        fantasyPointsPerGame: fpgLeader.fantasyPointsPerGame,
        games: fpgLeader.gamesPlayed,
      },
      topRosterPoolFpg:
        pool.reduce((sum, player) => sum + player.fantasyPoints, 0) /
        pool.reduce((sum, player) => sum + player.gamesPlayed, 0),
      auctionPlayersWithoutScoredOutput: season.auctionPlayers.filter(
        (player) => !known.has(player.playerId),
      ).length,
      rosterSnapshots: activity?.snapshotCount ?? 0,
      inferredAdds: activity?.changes.filter((change) => change.changeType === 'add').length ?? 0,
    };
  });
  const sensitivity = [0.25, 0.5, 0.75].map((replacementQuantile) => {
    const fitted = fitProductionValue({
      history,
      baseBudgetCents: input.league.baseBudgetCents,
      settings: { replacementQuantile },
    });
    return {
      replacementQuantile,
      replacementPointsPerGame: fitted.replacementPointsPerGame,
      topFive: input.projection.players
        .slice(0, 5)
        .map((player) => ({
          name: player.playerName,
          ...valueProjectedProduction(fitted, {
            fantasyPointsPerGame: player.fantasyPointsPerGame,
            expectedGames: player.availability.expectedGames,
          }),
        })),
    };
  });
  const snapshot = {
    history,
    projection: input.projection,
    league: {
      baseBudgetCents: input.league.baseBudgetCents,
      teamCount: input.league.teamCount,
      rosterSize: input.league.rosterSize,
    },
  };
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'candidate-analysis',
    fingerprint,
    projectionSnapshot: input.projection.snapshotId,
    projectionAsOf: input.projection.asOf,
    promotedModel: input.promoted?.selectedModelId,
    promotedUsableModel: input.promoted?.productionValue?.modelVersion,
    model,
    averageRosterPoolFpg: averageFpg,
    seasonAudit,
    coverage,
    metrics,
    sensitivity,
    current,
    candidateTotalDollars: current.reduce((sum, player) => sum + player.valueCents, 0) / 100,
    limitations: [
      'Prices describe production cohorts. They are not validated optimal bid limits or forecast confidence intervals.',
      'Historical inputs contain a partial NBA player pool. Unknown auction prices remain distinct from recorded $0 purchases.',
      'The $0 purchase cohort is a replacement proxy. These players were not necessarily available on waivers throughout the season.',
      'Training requires 30 played games. Excluding severe injury seasons introduces selection bias; expected games needs separate validation.',
      'Training pairs auction prices with same-season realized output. This is a hindsight association, not a causal estimate of willingness to pay.',
      'Historical forecasts use prior-season actual FP/G and games. Archived preseason projections are missing.',
      'Thin elite cohorts and injury or role changes limit reliability. Values beyond supported production are capped and flagged.',
      'Daily captured scoring and transaction timestamps are unavailable. Inferred adds are not measured streaming points.',
      'The curve mixes ten-team and twelve-team seasons with recency weights. It does not estimate their separate causal effects.',
    ],
  };
  const directory = 'data/reports/production-value';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/model-inputs.json`, JSON.stringify(snapshot, null, 2));
  await writeFile(`${directory}/analysis.json`, JSON.stringify(report, null, 2));
  const columns = [
    'name',
    'rank',
    'fantasyPointsPerGame',
    'expectedGames',
    'fantasyPoints',
    'surplusPoints',
    'valueCents',
    'comparableLowCents',
    'comparableHighCents',
    'comparableCount',
    'beyondSupport',
    'previousCostCents',
    'promotedMarketCents',
  ] as const;
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  await writeFile(
    `${directory}/board.csv`,
    [
      columns.join(','),
      ...current.map((row) => columns.map((key) => escape(row[key])).join(',')),
    ].join('\n') + '\n',
  );
  console.log(
    JSON.stringify(
      {
        directory,
        fingerprint,
        replacementFpg: model.replacementPointsPerGame,
        averageRosterPoolFpg: averageFpg,
        metrics,
        coverage,
        topTen: current
          .slice(0, 10)
          .map(({ name, valueCents, comparableCount }) => ({ name, valueCents, comparableCount })),
      },
      null,
      2,
    ),
  );
};
run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
