# Fantasy Basketball

A league-specific Fantrax draft and trade assistant. The application combines a
typed Effect domain module, an Eve agent, and a Next.js draft-room interface in
an Nx monorepo managed by Bun.

## Repository layout

- `apps/web/` — Next.js dashboard and Eve chat client.
- `agent/` — Eve instructions, HTTP channel, and typed tools.
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
```

Do not commit provider or model credentials. Eve model credentials can be set
through its local `/login` flow or the deployment environment.

Create the private league configuration from the checked-in example:

```bash
cp config/seasons.example.json config/seasons.json
```

Real league IDs, manager names, auction exports, normalized output, and provider
responses remain local and are ignored by Git.

## Historical importer

The raw spreadsheet exports under `data/raw/auctions/` remain unchanged. The
Python importer joins them to Fantrax player and team IDs and writes canonical
records under `data/normalized/`:

```bash
PYTHONPATH=src python3 -m fantasy_basketball --refresh --strict
```

Omit `--refresh` to use cached Fantrax responses.

Do not rewrite historical source names just to make an import pass. Add scoped
aliases to `config/player_aliases.csv`.

## Current implementation status

The initial vertical slice can score a stat line with the league's custom rules
through both the Effect module and Eve's `score_stat_line` tool. The draft board
is intentionally an empty state until a production-data adapter is connected.

The scoring configuration currently models triple-double and double-double
bonuses as cumulative. That behavior is explicit and tested, but should be
confirmed against Fantrax before rankings are published.

The generated Eve channel permits local development and fails closed for
production browser traffic. Replace its placeholder production authentication
policy before deployment.
