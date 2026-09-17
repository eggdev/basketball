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
