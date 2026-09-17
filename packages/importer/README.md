# Historical auction importer

This package is the commit boundary between locally normalized league exports
and Neon. It accepts the Python importer's normalized CSV, season metadata, and
validation report; produces a deterministic, reviewable plan; and only writes
that plan when the caller explicitly requests a commit.

The public module deliberately exposes two operations:

- `planHistoricalAuctionImport` validates and reconciles source data without a
  database dependency.
- `commitHistoricalAuctionImport` sends a validated plan through a small
  structural persistence interface.

From the repository root:

```bash
bun run data:validate
bun run data:import
```

The first command is always read-only. The second reruns validation and then
performs the atomic Neon import. Source files and generated data are private,
ignored inputs; no league data is bundled into this package.

## Player production

The production importer resolves the canonical Fantrax player universe against
BALLDONTLIE, downloads regular-season box scores through a cached and
rate-limited provider adapter, and aggregates scoring ingredients by player and
season. The default five-season backfill is read-only until `--commit` is
explicitly selected:

```bash
bun run production:validate
bun run production:import
```

Use `--seasons=2024,2025` to select NBA season start years, or `--refresh` to
bypass the ignored local response cache. Identity mismatches make the plan
invalid and block a partial database commit. Provider naming differences are
kept explicit in `config/balldontlie_player_overrides.json`; its keys are stable
Fantrax player IDs and its values are BALLDONTLIE player IDs.
