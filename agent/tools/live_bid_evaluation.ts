import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import {
  evaluateLiveBid,
  evaluateRosterCandidate,
  leagueOwnerProfile,
} from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  currentBidDollars: z.number().finite().nonnegative(),
  draftStateVersion: z.string().trim().min(1).default('eve-manual-check'),
  ownedPlayerNames: z.array(z.string().trim().min(1)).max(13).default([]),
  playerQuery: z.string().trim().min(2),
  remainingBudgetDollars: z.number().finite().nonnegative(),
  remainingRosterSpots: z.number().int().min(1).max(13),
});

const outputSchema = z.object({
  action: z.enum(['caution', 'keep-bidding', 'review', 'stop']),
  availabilityTier: z.enum(['durable', 'fragile', 'managed']),
  currentBidDollars: z.number(),
  draftStateVersion: z.string(),
  fairRangeDollars: z.object({ high: z.number(), low: z.number() }),
  fantasyPointsPerGame: z.number(),
  historicalExpectedPriceDollars: z.number().nullable(),
  marketExpectedPriceDollars: z.number(),
  marketModelId: z.string().nullable(),
  marketPriceSource: z.enum(['calibrated-model', 'historical-average', 'projection-value']),
  marginalPointsPerGame: z.number(),
  methodology: z.string(),
  personalMaxBidDollars: z.number(),
  playerName: z.string(),
  positions: z.array(z.string()),
  priceSignal: z.enum(['at-value', 'over-value', 'under-value']),
  projectedValueDollars: z.number(),
  projectionAsOf: z.string(),
  reasons: z.array(z.string()),
  replacementPointsPerGame: z.number(),
  rosterFit: z.enum(['fills-need', 'neutral', 'redundant']),
  usableValue: z
    .object({
      congestionLoss: z.number(),
      modelVersion: z.string(),
      playoffWeightedGames: z.number(),
      playoffWeightedMarginalPoints: z.number(),
      projectedPoints: z.number(),
      rosterMarginalPoints: z.number(),
      scheduleAsOf: z.string(),
      usablePoints: z.number(),
      valueDollars: z.number(),
    })
    .nullable(),
  season: z.string(),
});

const toCents = (dollars: number): number => Math.round(dollars * 100);
const toDollars = (cents: number): number => cents / 100;

export default defineTool({
  description:
    'Evaluate one live auction bid with the same deterministic value, personal cap, budget, roster-fit, and saved-plan guardrails used by the draft UI. Use this before giving Brendan a live keep-bidding, caution, or stop recommendation. It never performs a Fantrax action.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ currentBidDollars, playerQuery }) =>
      `Evaluate ${playerQuery} at $${currentBidDollars}`,
    complete: (_input, output) =>
      `${output.action} on ${output.playerName} at $${output.currentBidDollars}`,
  },
  async execute(input) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const context = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        const [projection, market, workspace] = yield* Effect.all([
          database.latestProjectionSnapshot,
          database.historicalAuctionMarket,
          database.preDraftWorkspace(leagueOwnerProfile.canonicalKey),
        ]);
        const valuation =
          projection === null
            ? null
            : yield* database.promotedAuctionValuationRun(projection.seasonKey);
        return { market, projection, valuation, workspace };
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    if (context.projection === null) throw new Error('No projection snapshot is available');
    if (context.workspace.league === null) throw new Error('No current league season is available');

    const query = input.playerQuery.toLocaleLowerCase();
    const matches = context.projection.players.filter((player) =>
      player.playerName.toLocaleLowerCase().includes(query),
    );
    if (matches.length === 0) throw new Error(`No projected player matches ${input.playerQuery}`);
    const exactMatch = matches.find((player) => player.playerName.toLocaleLowerCase() === query);
    if (exactMatch === undefined && matches.length > 1) {
      throw new Error(
        `Player query is ambiguous: ${matches
          .slice(0, 5)
          .map((player) => player.playerName)
          .join(', ')}`,
      );
    }
    const player = exactMatch ?? matches[0]!;
    const normalizedOwnedNames = new Set(
      input.ownedPlayerNames.map((name) => name.toLocaleLowerCase()),
    );
    const ownedPlayerIds = context.projection.players
      .filter((candidate) => normalizedOwnedNames.has(candidate.playerName.toLocaleLowerCase()))
      .map((candidate) => candidate.playerId);
    const historicalMarket = context.market.players.find(
      (candidate) => candidate.playerId === player.playerId,
    );
    const target = context.workspace.plan?.targets.find(
      (candidate) => candidate.playerId === player.playerId,
    );
    const valuation =
      context.valuation?.projection.snapshotId === context.projection.snapshotId
        ? context.valuation
        : null;
    const calibratedPlayer = valuation?.current.players.find(
      (candidate) => candidate.playerId === player.playerId,
    );
    const rosterMarginalValue =
      valuation?.productionValue == null ||
      calibratedPlayer?.usableValueCents == null ||
      calibratedPlayer.usableDiagnostics == null
        ? null
        : (() => {
            const marginal = evaluateRosterCandidate({
              candidate: {
                availabilityRate: player.availability.rate,
                fantasyPoints: player.fantasyPoints,
                fantasyPointsPerGame: player.fantasyPointsPerGame,
                playerId: player.playerId,
                playerName: player.playerName,
                positions: player.positions,
                projectionRank: player.rank,
                teamAbbreviation: player.teamAbbreviation,
              },
              lineupSlots: valuation.productionValue.leagueFormat.lineupSlots.map((slot) => ({
                ...slot,
                code: slot.code as 'C' | 'F' | 'FLX' | 'G' | 'PF' | 'PG' | 'SF' | 'SG',
                eligiblePositions: slot.eligiblePositions as ReadonlyArray<
                  'C' | 'PF' | 'PG' | 'SF' | 'SG'
                >,
              })),
              roster: context.projection.players
                .filter((candidate) => ownedPlayerIds.includes(candidate.playerId))
                .map((candidate) => ({
                  availabilityRate: candidate.availability.rate,
                  fantasyPoints: candidate.fantasyPoints,
                  fantasyPointsPerGame: candidate.fantasyPointsPerGame,
                  playerId: candidate.playerId,
                  playerName: candidate.playerName,
                  positions: candidate.positions,
                  projectionRank: candidate.rank,
                  teamAbbreviation: candidate.teamAbbreviation,
                })),
              seasonCalendar: valuation.productionValue.seasonCalendar,
            });
            const standalonePoints =
              marginal.candidateStandaloneRegularSeasonPoints +
              marginal.candidateStandalonePlayoffWeightedPoints;
            const marginalPoints =
              marginal.marginalRegularSeasonPoints + marginal.marginalPlayoffWeightedPoints;
            const marginalRatio =
              standalonePoints === 0
                ? 0
                : Math.max(0, Math.min(1, marginalPoints / standalonePoints));
            return {
              ...marginal,
              capturedPlayoffWeightedPoints:
                calibratedPlayer.usableDiagnostics.capturedPlayoffWeightedPoints,
              congestionLoss: calibratedPlayer.usableDiagnostics.congestionLoss,
              modelVersion: valuation.productionValue.modelVersion,
              playoffWeightedGames: calibratedPlayer.usableDiagnostics.playoffWeightedGames,
              projectedPoints: player.fantasyPoints,
              scheduleAsOf: valuation.productionValue.schedule.asOf,
              usablePoints: calibratedPlayer.usableDiagnostics.usablePoints,
              valueCents: Math.round(calibratedPlayer.usableValueCents * marginalRatio),
            };
          })();
    const evaluation = evaluateLiveBid({
      baseBudgetCents: context.workspace.league.baseBudgetCents,
      calibratedMarket:
        calibratedPlayer === undefined || !calibratedPlayer.isModeled || valuation === null
          ? null
          : {
              expectedPriceCents: calibratedPlayer.marketEstimateCents,
              fairHighCents: calibratedPlayer.fairHighCents,
              fairLowCents: calibratedPlayer.fairLowCents,
              modelId: valuation.selectedModelId,
              seasonsBacktested: valuation.historicalInputs.seasonKeys.length,
            },
      currentPriceCents: toCents(input.currentBidDollars),
      draftStateVersion: input.draftStateVersion,
      historicalMarket:
        historicalMarket === undefined
          ? null
          : {
              expectedPriceCents: historicalMarket.expectedPriceCents,
              maximumPriceCents: historicalMarket.maximumPriceCents,
              minimumPriceCents: historicalMarket.minimumPriceCents,
              seasonsDrafted: historicalMarket.seasonsDrafted,
            },
      ownedPlayerIds,
      playerId: player.playerId,
      players: context.projection.players.map((candidate) => ({
        availabilityTier: candidate.availability.tier,
        fantasyPoints: candidate.fantasyPoints,
        fantasyPointsPerGame: candidate.fantasyPointsPerGame,
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        positions: candidate.positions,
        rank: candidate.rank,
      })),
      remainingBudgetCents: toCents(input.remainingBudgetDollars),
      remainingRosterSpots: input.remainingRosterSpots,
      rosterMarginalValue,
      rosterSize: context.workspace.league.rosterSize,
      target:
        target === undefined ? null : { maxBidCents: target.maxBidCents, stance: target.stance },
      teamCount: context.workspace.league.teamCount,
    });

    return {
      action: evaluation.action,
      availabilityTier: evaluation.impact.availabilityTier,
      currentBidDollars: toDollars(evaluation.market.currentPriceCents),
      draftStateVersion: evaluation.draftStateVersion,
      fairRangeDollars: {
        high: toDollars(evaluation.market.fairHighCents),
        low: toDollars(evaluation.market.fairLowCents),
      },
      fantasyPointsPerGame: evaluation.impact.fantasyPointsPerGame,
      historicalExpectedPriceDollars:
        evaluation.market.historicalExpectedPriceCents === null
          ? null
          : toDollars(evaluation.market.historicalExpectedPriceCents),
      marketExpectedPriceDollars: toDollars(evaluation.market.expectedPriceCents),
      marketModelId: evaluation.market.calibrationModelId,
      marketPriceSource: evaluation.market.priceSource,
      marginalPointsPerGame: evaluation.impact.marginalPointsPerGame,
      methodology: evaluation.methodology,
      personalMaxBidDollars: toDollars(evaluation.personal.maxBidCents),
      playerName: evaluation.player.name,
      positions: [...evaluation.impact.positions],
      priceSignal: evaluation.market.priceSignal,
      projectedValueDollars: toDollars(evaluation.market.projectedValueCents),
      projectionAsOf: context.projection.asOf,
      reasons: [...evaluation.reasons],
      replacementPointsPerGame: evaluation.impact.replacementPointsPerGame,
      rosterFit: evaluation.impact.rosterFit,
      season: context.projection.seasonKey,
      usableValue:
        evaluation.impact.rosterMarginalValue === null
          ? null
          : {
              congestionLoss: evaluation.impact.rosterMarginalValue.congestionLoss,
              modelVersion: evaluation.impact.rosterMarginalValue.modelVersion,
              playoffWeightedGames: evaluation.impact.rosterMarginalValue.playoffWeightedGames,
              playoffWeightedMarginalPoints:
                evaluation.impact.rosterMarginalValue.marginalPlayoffWeightedPoints,
              projectedPoints: evaluation.impact.rosterMarginalValue.projectedPoints,
              rosterMarginalPoints:
                evaluation.impact.rosterMarginalValue.marginalRegularSeasonPoints,
              scheduleAsOf: evaluation.impact.rosterMarginalValue.scheduleAsOf,
              usablePoints: evaluation.impact.rosterMarginalValue.usablePoints,
              valueDollars: toDollars(evaluation.impact.rosterMarginalValue.valueCents),
            },
    };
  },
});
