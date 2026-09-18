# Local league data

The directories below contain private league exports and generated records and
are intentionally ignored by Git:

- `raw/` — source auction CSV exports
- `normalized/` — canonical importer output
- `reports/` — validation reports
- `cache/` — cached provider responses

Keep real manager names, team names, league identifiers, and provider responses
out of the public repository. Synthetic, reviewable fixtures belong under the
relevant test project instead.

## Hashtag projection snapshots

Save the paid Hashtag export at `raw/hashtag/2026-27.csv`. Paid projection data
stays local because `raw/` is ignored. The importer accepts Hashtag-style
headers and requires:

`PLAYER`, `POS`, `TEAM`, `GP`, `FG%`, `FT%`, `3PM`, `PTS`, `TREB`, `AST`,
`STL`, `BLK`, and `TO`.

`FG%` and `FT%` should include projected makes and attempts, such as
`0.573 (10.5/18.3)`. Separate `FGM`/`FGA` and `FTM`/`FTA` columns are also
accepted. Full player names are preferred; first-initial abbreviations are
matched only when they identify exactly one canonical player.

Validate without writing:

```sh
bun run projections:validate
```

Commit an immutable snapshot after validation:

```sh
bun run projections:import
```

Use `--file=...`, `--season=...`, `--as-of=...`, or `--model-version=...` after
the Nx argument separator when importing a different snapshot.

## Fantrax ADP snapshots

The Fantrax public ADP endpoint is fetched once per command; it does not require
a bot-style page scraper or a private league credential. Validate the current
response without writing:

```sh
bun run adp:validate
```

Commit a fingerprinted snapshot after reviewing its counts and leaders:

```sh
bun run adp:import
```

Unchanged responses are idempotent. When Fantrax values change, the next import
creates a new immutable snapshot and the app derives movement against the prior
snapshot. Positive movement means a player is being selected earlier. ADP is a
public demand signal, not a points projection or direct auction-dollar value.

## Fantrax league performance

Historical standings and weekly matchup scores are fetched from Fantrax's documented
`getStandings` and `getMatchupScores` endpoints. Validate every configured historical
season without writing to Postgres:

```sh
bun run performance:validate
```

Commit the validated, fingerprinted result:

```sh
bun run performance:import
```

Provider responses are cached under `cache/fantrax/<season>/` and remain ignored by
Git. Pass `--refresh` after the Nx argument separator to deliberately refetch them,
or `--seasons=2024-25,2025-26` to limit a run. The importer spaces live requests and
stores the exact source rows alongside normalized standings and matchups for audit.

Fantrax matchup scores are weekly scoring-period totals, not daily results. The app
derives schedule-neutral all-play percentage, expected wins, schedule luck, scoring
consistency, and active games from those weekly totals. These metrics describe team
performance; they do not prove which draft pick, trade, or waiver move caused it.

## Fantrax daily roster history

The v1.8 public API does not expose an authoritative transaction endpoint. It does
expose historical daily rosters through `getTeamRosters`, so the importer stores every
roster period and derives ownership changes between adjacent snapshots:

```sh
bun run rosters:validate
bun run rosters:import
```

The first populated period in each season is a baseline rather than hundreds of
acquisitions. Later ownership appearances are labeled as inferred adds, disappearances
as drops, and immediate team-to-team movements as team changes. Active, reserve, IR,
and eligible-position changes on the same team remain in the snapshots but are not
misclassified as transactions.

Responses are cached under `cache/fantrax/<season>/roster-periods/`. Missing responses
are fetched at a conservative one request per second with retry backoff; pass
`--request-interval-ms=...` only when deliberately changing that behavior. These
records cannot reveal waiver priority, FAAB, multi-player trade packages, or Fantrax's
official transaction label, so the UI and Eve consistently call them inferred roster
activity.
