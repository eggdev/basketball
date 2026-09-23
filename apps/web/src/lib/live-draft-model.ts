import {
  Database,
  databaseLayer,
  loadDatabaseConfig,
  type LatestProjectionSnapshot,
  type CanonicalPlayerIdentity,
  type AuctionValuationRun,
  type HistoricalAuctionMarket,
} from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import type { BridgeState } from './fantrax-bridge';
import { displayPlayerName } from './fantrax-live';
import { loadFantraxCatalog } from './fantrax-live-server';

export interface DraftModelPlayer {
  playerId: string;
  playerName: string;
  rank: number;
  fantasyPointsPerGame: number;
  statsPerGame: Readonly<Record<string, number>>;
  availabilityTier: string;
  availabilityRate: number | null;
  marketPriceCents: number | null;
  fairLowCents: number | null;
  fairHighCents: number | null;
  expectedGames: number | null;
  positions: readonly string[];
  team: string;
  previousPriceCents: number | null;
  previousSeason: string | null;
}
export interface DraftPlayerCard {
  name: string;
  position: string;
  team: string;
  projection: DraftModelPlayer | null;
}
export interface DraftPlayerDirectory {
  summary: DraftModelSummary;
  players: Record<string, DraftPlayerCard>;
}
export interface DraftModelSummary {
  status: 'ready' | 'unavailable';
  note: string;
  season: string | null;
  asOf: string | null;
  snapshotId: string | null;
  modelVersion: string | null;
  valuationModel: string | null;
  playerCount: number;
  mappedCount: number;
}
export interface DraftModelReference {
  summary: DraftModelSummary;
  candidate: DraftModelPlayer | null;
  roster: DraftModelPlayer[];
  unmatchedRosterCount: number;
  priceSignal: 'below-reference' | 'within-reference' | 'above-reference' | 'unavailable';
}
interface ModelInputs {
  projection: LatestProjectionSnapshot | null;
  identities: ReadonlyArray<CanonicalPlayerIdentity>;
  valuation: AuctionValuationRun | null;
  history?: HistoricalAuctionMarket | null;
}

let cached: { expires: number; task: Promise<ModelInputs> } | undefined;
async function loadModelInputs(): Promise<ModelInputs> {
  if (cached && cached.expires > Date.now()) return cached.task;
  const task = (async () => {
    const config = await Effect.runPromise(loadDatabaseConfig());
    return Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const [projection, identities, history] = yield* Effect.all(
          [
            db.latestProjectionSnapshot,
            db.canonicalPlayerIdentities,
            db.historicalAuctionMarket.pipe(Effect.catchAll(() => Effect.succeed(null))),
          ],
          { concurrency: 3 },
        );
        const valuation = projection
          ? yield* db.promotedAuctionValuationRun(projection.seasonKey)
          : null;
        return { projection, identities, valuation, history };
      }).pipe(Effect.provide(databaseLayer(config))),
    );
  })();
  cached = { expires: Date.now() + 60_000, task };
  try {
    return await task;
  } catch (error) {
    if (cached?.task === task) cached = undefined;
    throw error;
  }
}

function buildModelPlayers(inputs: ModelInputs, season: number) {
  const { projection, identities, valuation } = inputs;
  const applicable = projection && Number(projection.seasonKey.split('-')[0]) === season;
  const matchingValuation =
    applicable &&
    valuation?.projection.snapshotId === projection.snapshotId &&
    valuation.seasonKey === projection.seasonKey
      ? valuation
      : null;
  const byCanonical = new Map(
    applicable ? projection.players.map((player) => [player.playerId, player]) : [],
  );
  const prices = new Map(
    matchingValuation?.current.players.map((player) => [player.playerId, player]) ?? [],
  );
  const byFantrax = new Map<string, DraftModelPlayer>();
  const history = new Map(inputs.history?.players.map((player) => [player.playerId, player]) ?? []);
  for (const identity of identities) {
    const player = byCanonical.get(identity.playerId);
    if (!player) continue;
    const price = prices.get(player.playerId);
    const previous = history.get(player.playerId);
    const previousSeason = `${season - 1}-${String(season).slice(-2)}`;
    byFantrax.set(identity.fantraxId, {
      playerId: player.playerId,
      playerName: player.playerName,
      rank: player.rank,
      fantasyPointsPerGame: player.fantasyPointsPerGame,
      statsPerGame: player.statsPerGame ?? {},
      availabilityTier: player.availability.tier,
      availabilityRate: player.availability.rate ?? null,
      marketPriceCents: price?.isModeled ? price.marketEstimateCents : null,
      fairLowCents: price?.isModeled ? price.fairLowCents : null,
      fairHighCents: price?.isModeled ? price.fairHighCents : null,
      expectedGames: player.availability.expectedGames ?? null,
      positions: player.positions ?? [],
      team: player.teamAbbreviation ?? '',
      previousPriceCents:
        previous?.latestSeason === previousSeason ? previous.latestPriceCents : null,
      previousSeason: previous?.latestSeason === previousSeason ? previousSeason : null,
    });
  }
  return {
    byFantrax,
    summary: {
      status: applicable ? 'ready' : 'unavailable',
      note: applicable
        ? 'Ranks and prices use the main league points model. Projected category stats are available for this trial.'
        : projection
          ? 'The latest projection season does not match this league.'
          : 'No generated projections are available.',
      season: projection?.seasonKey ?? null,
      asOf: projection?.asOf ?? null,
      snapshotId: projection?.snapshotId ?? null,
      modelVersion: projection?.modelVersion ?? null,
      valuationModel: matchingValuation?.selectedModelId ?? null,
      playerCount: applicable ? projection.players.length : 0,
      mappedCount: new Set([...byFantrax.values()].map((player) => player.playerId)).size,
    } satisfies DraftModelSummary,
  };
}

export function buildDraftModelReference(
  inputs: ModelInputs,
  season: number,
  state?: BridgeState,
  teamId?: string,
): DraftModelReference {
  const { summary, byFantrax } = buildModelPlayers(inputs, season);
  const own = state?.rosters.filter((player) => player.teamId === teamId) ?? [];
  const roster = own.flatMap((player) => byFantrax.get(player.playerId) ?? []);
  const candidate = state?.nominatedPlayerId
    ? (byFantrax.get(state.nominatedPlayerId) ?? null)
    : null;
  const bid = state?.currentBidCents;
  return {
    summary,
    candidate,
    roster,
    unmatchedRosterCount: own.length - roster.length,
    priceSignal:
      bid == null || candidate?.fairLowCents == null || candidate.fairHighCents == null
        ? 'unavailable'
        : bid < candidate.fairLowCents
          ? 'below-reference'
          : bid > candidate.fairHighCents
            ? 'above-reference'
            : 'within-reference',
  };
}

// Player facts are available before Jev returns and stay stable across bid changes.
export async function loadDraftPlayerDirectory(season: number): Promise<DraftPlayerDirectory> {
  const [inputs, catalog] = await Promise.all([
    loadModelInputs().catch(() => ({ projection: null, identities: [], valuation: null })),
    loadFantraxCatalog().catch(() => ({})),
  ]);
  const { summary, byFantrax } = buildModelPlayers(inputs, season);
  const players: Record<string, DraftPlayerCard> = {};
  for (const [id, projection] of byFantrax) {
    players[id] = {
      name: projection.playerName,
      position: projection.positions.join('/'),
      team: projection.team,
      projection,
    };
  }
  for (const [id, player] of Object.entries(catalog)) {
    players[id] = {
      name: displayPlayerName(player.name),
      position: player.position ?? '',
      team: player.team ?? '',
      projection: byFantrax.get(id) ?? null,
    };
  }
  return { summary, players };
}

export async function loadDraftModelReference(
  season: number,
  state?: BridgeState,
  teamId?: string,
): Promise<DraftModelReference> {
  try {
    return buildDraftModelReference(await loadModelInputs(), season, state, teamId);
  } catch {
    return {
      summary: {
        status: 'unavailable',
        note: 'Generated rankings could not be loaded. Budget checks remain active.',
        season: null,
        asOf: null,
        snapshotId: null,
        modelVersion: null,
        valuationModel: null,
        playerCount: 0,
        mappedCount: 0,
      },
      candidate: null,
      roster: [],
      unmatchedRosterCount: state?.rosters.filter((player) => player.teamId === teamId).length ?? 0,
      priceSignal: 'unavailable',
    };
  }
}
