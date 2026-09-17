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
