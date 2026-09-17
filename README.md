# Fantasy Basketball

A league-specific Fantrax draft and trade assistant. The application combines a
typed Effect domain module, an Eve agent, and a Next.js draft-room interface in
an Nx monorepo managed by Bun.

## Repository layout

- `apps/web/` — Next.js dashboard and Eve chat client.
- `agent/` — Eve instructions, HTTP channel, and typed tools.
- `packages/auth/` — Better Auth configuration, owner allowlist, and committed
  auth-schema migrations.
- `packages/database/` — Effect/Postgres service, Drizzle schema, and committed
  fantasy-data migrations.
- `packages/importer/` — the Effect validation and commit boundary that moves
  reviewed historical auction snapshots into Postgres.
- `packages/fantasy/` — the deep domain module for scoring, valuation, rankings,
  and recommendations. External provider details stay behind this interface.
- `config/` and `data/` — league configuration, raw auction exports, normalized
  history, and validation reports.
- `src/fantasy_basketball/` and `tests/` — the existing Python importer. It stays
  in place as the migration oracle until the TypeScript importer reproduces its
  validated output.

## Requirements

- Node.js 24
- Bun 1.3.9

Install dependencies:

```bash
bun install
```

## Development

Start the Next.js application and its Eve runtime:

```bash
bun run dev
```

The chat needs a model credential that is deliberately not included in the
repository. If a turn fails in a fresh clone, open Eve's terminal UI, run
`/login`, and then restart the web development command.

Open Eve's interactive terminal UI without the web application:

```bash
bun run dev:agent:ui
```

Useful workspace commands:

```bash
bun run check
bun run build
bunx nx graph
bunx eve info
```

`bun run check` runs TypeScript checks, Vitest, Oxlint, and the retained Python
test suite.

## Environment

Copy `.env.example` to `.env` and supply local values. `.env` and other local
environment files are ignored by Git.

```dotenv
BALLDONTLIE_API_KEY=
DATABASE_URL=
DATABASE_URL_UNPOOLED=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
AUTH_ALLOWED_EMAIL=
```

Do not commit provider or model credentials. Eve model credentials can be set
through its local `/login` flow or the deployment environment.

The application uses `DATABASE_URL` for pooled request traffic and reserves
`DATABASE_URL_UNPOOLED` for migrations. Apply both committed schemas with:

```bash
bun nx run database:db-migrate
bun nx run auth:auth-db-migrate
```

GitHub is the intended sign-in provider. Configure its OAuth callback as
`https://<deployment-domain>/api/auth/callback/github`; account creation fails
closed unless the returned email is listed in `AUTH_ALLOWED_EMAIL`.

Create the private league configuration from the checked-in example:

```bash
cp config/seasons.example.json config/seasons.json
```

Real league IDs, manager names, auction exports, normalized output, and provider
responses remain local and are ignored by Git.

## Historical auction data

The raw spreadsheet exports under `data/raw/auctions/` remain unchanged. The
Python importer joins them to Fantrax player and team IDs and writes canonical
records under `data/normalized/`. It remains the source-normalization and
reconciliation step:

```bash
PYTHONPATH=src python3 -m fantasy_basketball --refresh --strict
```

Omit `--refresh` to use cached Fantrax responses.

Do not rewrite historical source names just to make an import pass. Add scoped
aliases to `config/player_aliases.csv`.

Review the normalized snapshot without touching Postgres:

```bash
bun run data:validate
```

After reviewing its row counts, spend totals, warnings, and fingerprint, commit
that exact snapshot to Neon:

```bash
bun run data:import
```

The TypeScript importer refuses a failed Python validation report, stores money
as integer cents, and reconciles each season's row count and spend before any
database work. The commit runs atomically and replaces auction results only for
the included seasons. Canonical players and seasons are upserted, while every
run retains its own immutable source records and fingerprint for auditing. Real
league files remain ignored by Git.

The draft room reads that history through one Postgres market snapshot. Its
expected cost is a linear recency-weighted estimate from observed prices; newer
seasons receive larger weights. After a player's first observed purchase, a
later undrafted season contributes $0; seasons before a player's debut do not.
This is an explainable historical estimate, not a production projection or
recommended maximum bid.

## Player production and historical scoring

Historical regular-season production is imported from BALLDONTLIE and kept
separate from the league-specific scoring model. The scoring weights live in
the versioned, public `config/scoring.json`, so a rules change can be reviewed
and evaluated without downloading the source box scores again.

```bash
bun run production:validate
bun run production:import
bun run scoring:validate
bun run scoring:import
```

The scoring validation is read-only and reports a deterministic fingerprint
plus each season's leaders. The explicit import writes one scoring rule set and
one historical ranking run per season in a single transaction. Historical
rankings are actual season totals under the configured rules; projections,
replacement value, and recommended auction prices are intentionally separate
future model runs.

## Current implementation status

The initial vertical slice can score a stat line with the league's custom rules
through both the Effect module and Eve's `score_stat_line` tool. Neon now holds
five validated historical auction seasons (2021–22 through 2025–26), with 695
purchases mapped onto 235 canonical Fantrax players. The draft board exposes a
searchable historical market with expected, latest, trend, and observed-range
prices. Eve can query the same snapshot through its
`historical_auction_market` tool, so chat and UI share one calculation.

Five seasons of player production can now be scored against the league rules
and stored as historical actual rankings. Historical auction cost remains an
observed market signal rather than a ranking; availability, projections, and
replacement value still need to be joined before the app recommends bids.

The scoring configuration currently models triple-double and double-double
bonuses as cumulative. That behavior is explicit and tested, but should be
confirmed against Fantrax before rankings are published.

The Eve channel accepts the same Better Auth session as the Next.js app, Vercel
OIDC for service traffic, and local development identities only outside
production. Unauthenticated production browser traffic fails closed.
