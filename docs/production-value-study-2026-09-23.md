# Production value study

Date: September 23, 2026. Status: candidate analysis; production pricing has not changed.

The candidate estimates dollars from projected production above replacement. Historical auctions set the dollar scale across production groups. A player's own previous price does not enter their valuation.

The first run covers five historical seasons and all 430 current projections. It produces a board and a repeatable comparison against existing price models.

## Current pricing

The promoted artifact uses `market-production-50-v1`. It combines a player's price history with a production allocation from prior seasons. Current season projections do not drive its market estimate.

The source also contains version 2 models. Those models correct the auction floor to $0. The separate projected-value calculation allocates the full league budget across projected production above replacement. The usable-points model adds schedule and lineup constraints, then allocates the budget.

These outputs answer different questions:

| Output | Question |
| --- | --- |
| Expected market price | What will this league pay? |
| Production value | What have comparable levels of production cost? |
| Team bid limit | What can this roster justify and afford now? |

Keep all three values separate. The new candidate supplies the second estimate. It does not yet calculate an optimal team bid limit.

## Historical leaders and costs

Nikola Jokic led recorded season fantasy points in every year. All figures use our imported league scoring.

| Season | Total FP | FP/G | Games | Jokic cost | Highest league cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2021-22 | 2,295.6 | 31.02 | 74 | $63 | $63 |
| 2022-23 | 2,115.9 | 30.67 | 69 | $71 | $74 |
| 2023-24 | 2,462.3 | 31.17 | 79 | $83 | $83 |
| 2024-25 | 2,448.5 | 34.98 | 70 | $90 | $90 |
| 2025-26 | 2,225.1 | 34.23 | 65 | $92 | $92 |

Jokic also led FP/G among players with at least 30 games, except in 2023-24. Luka Doncic led that season at 31.84 FP/G over 70 games.

The dollar scale changed while elite production stayed in a similar range. Recent observations therefore receive more weight. One season leader alone cannot define the full curve.

## Average production and replacement

The current league has 12 teams, 13 roster slots per team, and 10 daily active slots. Each team starts with $200. The first three historical seasons had 10 teams.

The top 156 current projections by season points average **15.88 FP/G**, weighted by expected games. This measures an average roster pool. The historical equivalent ranges from 14.58 to 16.21 FP/G.

An average player is still useful. The economic baseline should measure the production available through cheap alternatives.

| Season | Recorded picks | Explicit $0 picks | Median $0 FP/G, at least 30 games |
| --- | ---: | ---: | ---: |
| 2021-22 | 128 | 14 | 12.89 |
| 2022-23 | 127 | 28 | 11.38 |
| 2023-24 | 130 | 32 | 12.47 |
| 2024-25 | 154 | 26 | 11.80 |
| 2025-26 | 156 | 39 | 10.71 |

The weighted median of these season baselines is **11.803 FP/G**. This is our initial replacement proxy. An unknown auction price stays unknown; only recorded $0 purchases enter this cohort.

Dividing all NBA points by roster slots would include production that fantasy teams cannot use. Bench congestion and daily lineup limits prevent full capture. Transactions also change which players fill those slots.

## Candidate algorithm

For each historical season:

1. Measure replacement FP/G from recorded $0 purchases with at least 30 games.
2. Calculate each qualified player's surplus: `max(0, FP/G - replacement FP/G) × games played`.
3. Group surplus in 200-point bands and calculate weighted price quartiles.
4. Fit an increasing price curve through the weighted median prices, with a $0 anchor.

Season weights decay by 0.75 per older observation. Historical dollars scale to the current per-team budget. Adjacent bands with decreasing median prices are pooled with weighted isotonic regression.

For current projections:

```text
surplus FP = max(0, projected FP/G - 11.803) × expected games
candidate value = interpolated historical price at that surplus FP
```

Expected games already accounts for availability. Applying another durability multiplier would count the same penalty twice.

Values round to whole dollars. Production beyond the fitted range gets the top fitted value and an explicit flag. The current curve tops out near $91; that ceiling can change with later evidence.

No current player pool enters this calculation. Adding a rookie or removing an unavailable player does not redistribute other players' values. The current board totals $2,064 against the $2,400 league budget.

## Initial cost tiers and matrix

These are proposed display bands on the fitted curve. They do not establish separate statistical classes.

| Band | Projected surplus FP | Approximate candidate value |
| --- | ---: | ---: |
| Replacement | 0 | $0 |
| Depth | Above 0 to 400 | $0-$18 |
| Core | Above 400 to 800 | $18-$45 |
| Star | Above 800 to 1,200 | $45-$67 |
| Elite | Above 1,200 | $67-$91 |

The same FP/G can lead to different cost tiers when expected games change:

| Projected FP/G | 50 games | 65 games | 75 games |
| --- | ---: | ---: | ---: |
| 12 | $0 | $0 | $0 |
| 16 | $7 | $10 | $12 |
| 20 | $19 | $27 | $33 |
| 24 | $33 | $45 | $53 |
| 28 | $46 | $60 | $68 |
| 32 | $57 | $74 | $91 |
| 36 | $67 | $91 | $91* |

`*` Production exceeds the fitted range. The model caps the price and reports that condition.

## Current player examples

Projection snapshot: September 19, 2026, for 2026-27. These use the existing point projections unchanged.

| Player | FP/G | Expected games | Previous cost | Promoted market estimate | Candidate production value |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nikola Jokic | 34.22 | 72 | $92 | $73 | $91 |
| Giannis Antetokounmpo | 29.74 | 69 | $77 | $55 | $69 |
| Luka Doncic | 28.71 | 68 | $78 | $62 | $64 |
| Victor Wembanyama | 26.15 | 66 | $82 | $56 | $54 |
| Shai Gilgeous-Alexander | 24.19 | 71 | $69 | $47 | $51 |

Jokic's estimate has only one observation in its smaller adjacent comparison band. The corresponding counts are five for Giannis and Luka, eight for Wembanyama, and 15 for Shai. Elite estimates need more evidence.

Historical quartiles describe paid prices within comparison bands. They are not confidence intervals for future value. Changing the replacement quantile produces a $49-$53 Shai estimate and a $69-$73 Giannis estimate after refitting.

## Historical evaluation

Each test season uses only earlier seasons to fit the curve. Historical preseason projections are missing, so forecasts use the previous season's actual FP/G and games. This is a lag-one proxy, not a test of the current projection system.

The shared comparison covers 531 of 567 recorded auctions across 2022-23 through 2025-26. It includes 113 explicit $0 purchases. Players without prior scored output are excluded and reported in coverage.

| Model | Auction price MAE | Paid-only MAE |
| --- | ---: | ---: |
| Production comparables candidate | $6.47 | $7.51 |
| Previous price | $6.30 | $7.59 |
| Recency market | $6.83 | $8.17 |
| Market/production 50/50 v2 | $6.15 | $6.93 |
| Market/production 75/25 v2 | $6.33 | $7.34 |

The 50/50 baseline predicts paid prices better on this sample. Its v2 implementation differs from the v1 artifact currently promoted.

Price error measures auction prediction. To test draft value, we need to measure subsequent usable production for the dollars spent. A league can repeatedly overpay for a player, and a price predictor can learn that behavior.

## Transactions and remaining evidence

The repository contains 849 roster snapshots and 6,511 inferred changes over five seasons. Those changes include 3,239 adds. The latest season has 747 inferred adds, about 62 per team.

These records establish substantial roster turnover. They do not tell us how many fantasy points each add captured. The imported production covers full NBA seasons, including games before an acquisition and games left on the bench.

The $0 cohort also does not prove continuous waiver availability. Historical production covers 179-211 players per season, which leaves gaps in the replacement pool. Training requires 30 played games and therefore excludes severe injury seasons. That selection can overstate the reliability of expensive players.

Fitting auction prices to realized production creates a historical association. The curve includes expectations that later proved wrong. Ten-team and twelve-team seasons are mixed with recency weights; the current study does not isolate the format effect.

The next model evaluation needs:

1. Archived preseason projections and expected games, frozen before each draft.
2. Daily fantasy lineups and transaction dates matched to daily NBA production.
3. Schedule-aware surplus for each roster, including the production a replacement could capture.
4. Held-out draft simulations that compare usable points gained, budget use, and missed alternatives.

The existing usable-points engine can support the third step. We should validate its capture assumptions before using it to set final bid limits.

## External market and live display

[Hashtag Basketball's auction page](https://hashtagbasketball.com/fantasy-basketball-auction-values) separates projected values from Yahoo and ESPN average prices. Its values depend on league settings and scoring categories. Those defaults do not match this custom points league.

External averages can provide a market reference, especially for rookies. Keep that reference separate from production value and record its date and settings.

For the draft card, the useful proposed comparison is `candidate value - next bid`. Pair that dollar gap with FP/G and durability. An affordability indicator must still use the team's actual remaining budget. A small comparison sample should show a visible uncertainty marker.

## Reproduce and inspect

### Historical forecast sources

Source check: September 23, 2026. Historical preseason forecasts have a concrete acquisition path. The [Rotoworld importer](rotoworld-historical-forecasts.md) now extracts and attributes its 2024-25 forecasts. The candidate study still uses the original lag-one evaluation; source timing must be verified before a strict historical draft test.

| Source | Verified content | Remaining check |
| --- | --- | --- |
| [Razzball 2023-24](https://basketball.razzball.com/top-155-roto-projections-2023-24/) | Dated September 19, 2023; per-game stat forecasts for 155 players | The article notes later trade updates. Establish the revision available before our draft. |
| [Razzball 2024-25](https://basketball.razzball.com/top-156-roto-projections-2024-25/) | Dated September 27, 2024; per-game stat forecasts for 156 players | Expected games are excluded. Check publication against our draft date. |
| [Razzball 2025-26](https://basketball.razzball.com/top-155-roto-projections-2025-26/) | Dated October 1, 2025; a published projection table | Verify usable player coverage and the draft cutoff. |
| [Rotoworld 2024-25 draft kit](https://nbcsports.brightspotcdn.com/03/10/b09f526442aab7ad4db7ba3584ed/rotoworld-2024-25-fantasy-basketball-kit.pdf) | Player tables include separate projected rows with expected games and shooting volume | Verify publication timing, deduplicate positions, and check extracted table values. |

Start with the Rotoworld 2024-25 kit to test a season with both rate and availability forecasts. Use Razzball as an independent per-game forecast comparison. Its historical articles provide a route to more years, with expected games supplied by a separately labeled pre-draft estimate.

Our scoring needs shooting misses and double-double/triple-double bonuses. Shooting percentages and attempt volume support estimated misses. The verified tables lack bonus-event forecasts. Estimate those rates from earlier seasons and record that derivation. Never use the target season's realized bonus counts or games to complete a preseason forecast.

Preserve each source's season, publisher, publication date, revision evidence, retrieval date, and content hash. Store forecast fields separately from derived estimates. A season label alone does not prove that a current page contains its original preseason forecast.

The [Basketball Monster historical archive](https://history.basketballmonster.com/) describes past player statistics and rankings. Historical preseason exports remain unverified. Provider exports or dated web captures are additional paths to investigate.

### Run the study

From the repository root, with the existing database environment:

```sh
bun --env-file=apps/web/.env.local nx run importer:production-value-analyze
```

The command reads the database and writes local files under `data/reports/production-value/`. It does not import or promote a valuation run.

- `analysis.json`: fitted curve, season leaders, test metrics, sensitivity, and current values.
- `board.csv`: all 430 players; monetary columns are integer cents.
- `model-inputs.json`: model input snapshot for this run.

Input fingerprint: `45b31cbb63395d9372eccae29af8b20c7d9ec5475fc275de5e723d1efe30b1ca`.
Projection snapshot: `13a4bac1-c4cb-45f1-877b-c464b27009d5`.

The implementation lives in `packages/fantasy/src/lib/production-value.ts`. Its tests cover the $0 floor, durability, missing prices, monotonic values, and sparse upper support.

Validation: `bun run check` passed repository type checks, tests, and lint. The analysis command completed against the current database. The optional local chart is saved as `data/reports/production-value/value-curve.png` and `.svg`.
