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
