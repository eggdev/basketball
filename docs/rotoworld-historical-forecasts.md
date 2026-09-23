# Rotoworld historical forecasts

The importer extracts 286 player forecasts from the [2024-25 Rotoworld draft kit](https://nbcsports.brightspotcdn.com/03/10/b09f526442aab7ad4db7ba3584ed/rotoworld-2024-25-fantasy-basketball-kit.pdf). It links each forecast to a canonical player. One inconsistent source row is retained outside calculated forecasts.

## Run the import

Requirements: Python 3.11 or newer, Poppler's `pdftotext`, and the existing database environment. On macOS, install Poppler with `brew install poppler`.

Validate and write the local source and attribution files:

```sh
bun --env-file=apps/web/.env.local nx run importer:rotoworld-projection-import
```

Save the historical snapshot and player associations:

```sh
bun --env-file=apps/web/.env.local nx run importer:rotoworld-projection-import -- --commit
```

The command downloads the PDF if the local file is absent. It reuses the saved file on later runs. A content fingerprint makes repeated commits return the same snapshot.

## Stored data

The database uses the existing projection snapshot tables with source `rotoworld` and season `2024-25`. Each calculated forecast has a canonical player ID. Source payloads retain the PDF page, original row, and numeric values.

The first import matches 284 existing players. It creates canonical records for Gary Harris and Dariq Whitehead. Matching uses exact names, three explicit aliases, and unique matches after removing suffixes. Ambiguous matches stop the import.

Expected games and per-game statistics come directly from the PDF. Our scoring engine estimates double-double and triple-double rates from completed seasons before 2024-25. These derived bonuses stay separate from the source values. The target season and future seasons are excluded before the engine computes player rates or pooled priors.

Positions identify the PDF's profile sections. They do not establish historical Fantrax eligibility. This snapshot has no attached daily lineup schedule.

The importer writes these local artifacts:

| Path | Content |
| --- | --- |
| `data/raw/rotoworld/2024-25.pdf` | Original PDF |
| `data/normalized/rotoworld/2024-25-source.json` | All 286 source rows, metadata, and integrity notes |
| `data/normalized/rotoworld/2024-25-linked.json` | Player attribution and 285 calculated forecasts |
| `data/normalized/rotoworld/2024-25-linked.csv` | Compact attribution table, including the excluded row |

## Source integrity

The extractor reads positioned words by column. This handles player profiles whose tables continue onto another page. A plain text extraction can attach a continued table to the wrong player.

The importer retains four source warnings:

| Player | PDF page | Finding | Treatment |
| --- | ---: | --- | --- |
| Donte DiVincenzo | 23 | Team differs between heading and projection | Preserve both; use projection team |
| Karl-Anthony Towns | 46 | Team differs between heading and projection | Preserve both; use projection team |
| Julius Randle | 48 | Team differs between heading and projection | Preserve both; use projection team |
| Vince Williams | 40 | 1.0 made threes exceeds 0.7 total made field goals | Preserve source row; exclude calculated forecast |

Page numbers count PDF pages from one, including the cover. Vince Williams' row was checked against the rendered PDF. Its values are source errors. His raw row and canonical player ID also remain in the snapshot's excluded-row metadata.

PDF SHA-256: `65802c4ee339d82a38e956bc4e56c6be724711122622e93725143b3e08c729ec`.

## Forecast timing

The PDF revision metadata gives October 1, 2024, at 20:30:09 UTC. The historical snapshot uses that timestamp as its forecast date and explicitly records the date basis. Actual retrieval time is stored separately.

`publicationVerified` remains `false`. PDF metadata alone does not prove that this version was available before the league draft. A strict historical draft evaluation must first verify that cutoff. The source was retrieved in September 2026.

The 2024-25 snapshot leaves the active 2026-27 projection snapshot unchanged. The importer reports both IDs for verification.

## Validation

Python tests cover column order and profiles across page breaks. They also verify that extraction preserves source errors. TypeScript tests cover name ambiguity, content fingerprints, and separation of source values from derived bonuses. A leakage test adds target-season and future results and verifies that the forecast does not change.

The September 23, 2026 import saved snapshot `d9d17e11-9e59-48fa-8198-6626e3220c11` with 285 calculated forecasts. All 286 source players have canonical IDs, including the excluded row. A repeated import returned the same snapshot and fingerprint. The active 2026-27 snapshot stayed `13a4bac1-c4cb-45f1-877b-c464b27009d5`.

`bun run check` passed repository type checks, tests, and lint. The extraction was run against the original PDF, and the inconsistent Vince Williams row was visually checked on PDF page 40.
