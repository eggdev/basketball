/** Candidate dollar values learned from production cohorts, without player price anchors. */
export const PRODUCTION_VALUE_VERSION = 'production-comparables-v1' as const;

export interface ProductionValueSeason {
  readonly seasonKey: string;
  readonly baseBudgetCents: number;
  readonly players: ReadonlyArray<{
    readonly playerId: string;
    readonly fantasyPointsPerGame: number;
    readonly gamesPlayed: number;
    /** Null means no recorded auction price. An explicit zero is a $0 purchase. */
    readonly auctionCostCents: number | null;
  }>;
}

export interface ProductionValueSettings {
  readonly minimumGames: number;
  readonly recencyDecay: number;
  readonly replacementQuantile: number;
  readonly surplusBucketWidth: number;
}

export const productionValueDefaults: ProductionValueSettings = {
  minimumGames: 30,
  recencyDecay: 0.75,
  replacementQuantile: 0.5,
  surplusBucketWidth: 200,
};

export interface ProductionValueModel {
  readonly version: typeof PRODUCTION_VALUE_VERSION;
  readonly baseBudgetCents: number;
  readonly settings: ProductionValueSettings;
  readonly replacementPointsPerGame: number;
  readonly seasons: ReadonlyArray<{
    readonly seasonKey: string;
    readonly replacementPointsPerGame: number;
    readonly zeroPriceSampleCount: number;
    readonly comparisonCount: number;
  }>;
  readonly knots: ReadonlyArray<{
    readonly surplusPoints: number;
    readonly lowerPriceCents: number;
    readonly valueCents: number;
    readonly upperPriceCents: number;
    readonly sampleCount: number;
    readonly seasonCount: number;
  }>;
}

type Weighted = { value: number; weight: number };
const quantile = (rows: readonly Weighted[], fraction: number): number => {
  if (!rows.length) throw new Error('Cannot estimate a quantile without observations');
  const sorted = [...rows].sort((a, b) => a.value - b.value);
  const target = rows.reduce((sum, row) => sum + row.weight, 0) * fraction;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= target) return row.value;
  }
  return sorted[sorted.length - 1]!.value;
};

// Pool adjacent price bands until more surplus production cannot lower value.
function monotone(rows: readonly Weighted[]): number[] {
  const blocks: { first: number; last: number; sum: number; weight: number }[] = [];
  rows.forEach((row, index) => {
    blocks.push({ first: index, last: index, sum: row.value * row.weight, weight: row.weight });
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1]!;
      const left = blocks[blocks.length - 2]!;
      if (left.sum / left.weight <= right.sum / right.weight) break;
      blocks.splice(-2, 2, {
        first: left.first,
        last: right.last,
        sum: left.sum + right.sum,
        weight: left.weight + right.weight,
      });
    }
  });
  const values = Array<number>(rows.length);
  for (const block of blocks) {
    for (let index = block.first; index <= block.last; index++)
      values[index] = block.sum / block.weight;
  }
  return values;
}

function finite(value: number, label: string, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`Invalid ${label}`);
}

export function fitProductionValue(input: {
  readonly history: readonly ProductionValueSeason[];
  readonly baseBudgetCents: number;
  readonly settings?: Partial<ProductionValueSettings>;
}): ProductionValueModel {
  const settings = { ...productionValueDefaults, ...input.settings };
  finite(input.baseBudgetCents, 'base budget', 1);
  finite(settings.minimumGames, 'minimum games', 1);
  finite(settings.surplusBucketWidth, 'bucket width', 1);
  if (!(settings.recencyDecay > 0 && settings.recencyDecay <= 1))
    throw new RangeError('Invalid recency decay');
  if (!(settings.replacementQuantile > 0 && settings.replacementQuantile < 1))
    throw new RangeError('Invalid replacement quantile');
  const history = [...input.history].sort((a, b) => a.seasonKey.localeCompare(b.seasonKey));
  if (new Set(history.map((season) => season.seasonKey)).size !== history.length)
    throw new Error('Duplicate seasons');
  const bins = new Map<
    number,
    { surplus: number; price: number; weight: number; season: string }[]
  >();
  const baselines: Weighted[] = [];
  const seasons = history.map((season, seasonIndex) => {
    finite(season.baseBudgetCents, 'historical budget', 1);
    if (new Set(season.players.map((player) => player.playerId)).size !== season.players.length)
      throw new Error('Duplicate players');
    for (const player of season.players) {
      finite(player.fantasyPointsPerGame, 'FP/G', -Infinity);
      finite(player.gamesPlayed, 'games played');
      if (player.auctionCostCents !== null) finite(player.auctionCostCents, 'auction cost');
    }
    const qualified = season.players.filter(
      (player) => player.gamesPlayed >= settings.minimumGames,
    );
    const zeroPrices = qualified.filter((player) => player.auctionCostCents === 0);
    if (zeroPrices.length < 5)
      throw new Error(`${season.seasonKey} needs at least five qualified $0 purchases`);
    const replacement = quantile(
      zeroPrices.map((player) => ({ value: player.fantasyPointsPerGame, weight: 1 })),
      settings.replacementQuantile,
    );
    const weight = settings.recencyDecay ** (history.length - seasonIndex - 1);
    baselines.push({ value: replacement, weight });
    let comparisonCount = 0;
    for (const player of qualified) {
      if (player.auctionCostCents === null) continue;
      const surplus = Math.max(0, player.fantasyPointsPerGame - replacement) * player.gamesPlayed;
      if (!surplus) continue;
      const bucket = Math.floor(surplus / settings.surplusBucketWidth);
      const rows = bins.get(bucket) ?? [];
      rows.push({
        surplus,
        price: (player.auctionCostCents * input.baseBudgetCents) / season.baseBudgetCents,
        weight,
        season: season.seasonKey,
      });
      bins.set(bucket, rows);
      comparisonCount++;
    }
    return {
      seasonKey: season.seasonKey,
      replacementPointsPerGame: replacement,
      zeroPriceSampleCount: zeroPrices.length,
      comparisonCount,
    };
  });
  const groups = [...bins.entries()].sort(([a], [b]) => a - b).map(([, rows]) => rows);
  if (groups.length < 2) throw new Error('Not enough production bands to fit a dollar curve');
  const weights = groups.map((rows) => rows.reduce((sum, row) => sum + row.weight, 0));
  const curves = [0.25, 0.5, 0.75].map((fraction) =>
    monotone(
      groups.map((rows, index) => ({
        value: quantile(
          rows.map((row) => ({ value: row.price, weight: row.weight })),
          fraction,
        ),
        weight: weights[index]!,
      })),
    ),
  );
  return {
    version: PRODUCTION_VALUE_VERSION,
    baseBudgetCents: input.baseBudgetCents,
    settings,
    replacementPointsPerGame: quantile(baselines, 0.5),
    seasons,
    knots: [
      {
        surplusPoints: 0,
        lowerPriceCents: 0,
        valueCents: 0,
        upperPriceCents: 0,
        sampleCount: 0,
        seasonCount: 0,
      },
      ...groups.map((rows, index) => ({
        surplusPoints:
          rows.reduce((sum, row) => sum + row.surplus * row.weight, 0) / weights[index]!,
        lowerPriceCents: curves[0]![index]!,
        valueCents: curves[1]![index]!,
        upperPriceCents: curves[2]![index]!,
        sampleCount: rows.length,
        seasonCount: new Set(rows.map((row) => row.season)).size,
      })),
    ],
  };
}

export function valueProjectedProduction(
  model: ProductionValueModel,
  input: {
    readonly fantasyPointsPerGame: number;
    readonly expectedGames: number;
  },
) {
  finite(input.fantasyPointsPerGame, 'projected FP/G', -Infinity);
  finite(input.expectedGames, 'expected games');
  // Expected games already incorporates availability. Do not apply a second durability penalty.
  const surplusPoints =
    Math.max(0, input.fantasyPointsPerGame - model.replacementPointsPerGame) * input.expectedGames;
  const last = model.knots[model.knots.length - 1]!;
  const upperIndex = model.knots.findIndex((knot) => knot.surplusPoints >= surplusPoints);
  const right = upperIndex < 0 ? last : model.knots[upperIndex]!;
  const left = upperIndex <= 0 ? right : model.knots[upperIndex - 1]!;
  const span = right.surplusPoints - left.surplusPoints;
  const fraction = span === 0 ? 0 : (surplusPoints - left.surplusPoints) / span;
  const interpolate = (key: 'lowerPriceCents' | 'valueCents' | 'upperPriceCents') =>
    Math.round((left[key] + (right[key] - left[key]) * fraction) / 100) * 100;
  const counts = [left, right]
    .filter((knot) => knot.sampleCount > 0)
    .map((knot) => knot.sampleCount);
  return {
    surplusPoints,
    replacementPointsPerGame: model.replacementPointsPerGame,
    valueCents: interpolate('valueCents'),
    comparableLowCents: interpolate('lowerPriceCents'),
    comparableHighCents: interpolate('upperPriceCents'),
    // These are historical price quartiles, not forecast confidence limits.
    comparableCount: counts.length ? Math.min(...counts) : 0,
    beyondSupport: surplusPoints > last.surplusPoints,
  };
}
