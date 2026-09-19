# Fantasy Basketball

A league-specific Fantrax draft and trade assistant. The application combines a
typed Effect domain module, an Eve agent, and a routed Next.js decision room in
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
AI_GATEWAY_API_KEY=
OPENAI_API_KEY=
```

Do not commit provider or model credentials. Eve model credentials can be set
through its local `/login` flow or the deployment environment.

Production uses Vercel AI Gateway through project OIDC by default. The Vercel
team must have AI Gateway billing verification enabled. Alternatively, set
`OPENAI_API_KEY` in the deployment environment; the agent automatically uses
the direct OpenAI provider when that variable is present.

The live draft evaluator also uses AI Gateway for TypeSafe AI's Jev evaluation
model. Local development can use `AI_GATEWAY_API_KEY`; the deployment can use
the same project OIDC identity as Eve. A Jev failure never changes the numeric
cap: the UI falls back to the deterministic valuation and labels that state.

The application uses `DATABASE_URL` for pooled request traffic and reserves
`DATABASE_URL_UNPOOLED` for migrations. Apply both committed schemas with:

```bash
bun nx run database:db-migrate
bun nx run auth:auth-db-migrate
```

GitHub is the intended sign-in provider. Configure its OAuth callback as
`https://<deployment-domain>/api/auth/callback/github`; account creation fails
closed unless the returned email is listed in `AUTH_ALLOWED_EMAIL`. Production
deployments also require `BETTER_AUTH_URL` to be the canonical HTTPS origin;
the app refuses to fall back to localhost in production.

Create the private league configuration from the checked-in example:

```bash
cp config/seasons.example.json config/seasons.json
cp config/league-members.example.json config/league-members.json
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
the included seasons. Canonical players, members, season-specific teams, and
seasons are upserted, while every run retains its own immutable source records
and fingerprint for auditing. Real league files remain ignored by Git.

Fantrax team IDs change each season, so manager history is resolved separately
from team names. The importer uses durable owner-confirmed overrides first,
then explicit entries from the ignored `config/league-members.json`, observed
CSV manager labels, and exact prior team-name continuity. It never uses fuzzy
name guesses. The signed-in League History view groups unresolved exact team
names across seasons and can assign them to an existing or new canonical
manager. Those Neon-backed overrides survive future imports.

## Player identity reconciliation

Canonical player identities are reconciled only through a reviewed, transactional
operator workflow. First run a dry preview with the source UUID, target UUID,
reason, and the Better Auth user ID of the human resolver:

```bash
bun run players:reconcile -- --source <source-player-uuid> --target <target-player-uuid> \
  --reason "<reviewed reason>" --resolved-by <better-auth-user-id>
```

Review the canonical names, every source reference count, and every reported
logical-key conflict. A conflict blocks the merge; never delete or choose among
conflicting rows to force it through. After a human has approved the exact
identity move and verified a current database restore archive, commit the same
reviewed input:

```bash
bun run players:reconcile:commit -- --source <source-player-uuid> --target <target-player-uuid> \
  --reason "<reviewed reason>" --resolved-by <better-auth-user-id>
```

The commit re-previews while locking both players, refuses stale fingerprints,
moves every known player reference in one transaction, writes an immutable audit
row, and deletes the source record. It is irreversible without a database
restore. Similar names, including suffix-only variants, are evidence for a
human review and never authorization to merge.

The draft room reads that history through one Postgres market snapshot. Its
expected cost is a linear recency-weighted estimate from observed prices; newer
seasons receive larger weights. After a player's first observed purchase, a
later undrafted season contributes $0; seasons before a player's debut do not.
This is an explainable historical estimate, not a production projection or
recommended maximum bid.

The pre-draft room is anchored to the canonical league owner, Brendan Eggers
(Clyde), rather than an email address or a historical team name. It persists
named strategy scenarios, budget guardrails, risk posture, streaming-slot
intent, and player target/watch/avoid decisions. Eve reloads the active plan as
turn-scoped system context, so a saved UI change informs the next conversation
without exposing Better Auth identifiers in the repository.

Fantrax public ADP is stored as immutable, fingerprinted snapshots. Run
`bun run adp:validate` to review a response and `bun run adp:import` to commit
it. The current board and Eve tool derive movement from the previous changed
snapshot; positive movement means a player is being drafted earlier. ADP stays
separate from both production projections and this league's auction prices.

Historical league outcomes come from Fantrax standings and weekly matchup-score
endpoints. Run `bun run performance:validate` to review all configured historical
seasons, then `bun run performance:import` to commit the fingerprinted result. The
League view and Eve expose playoff finish, regular-season record, all-play strength,
schedule luck, scoring consistency, and active games. Weekly matchup data is useful
for evaluating performance but cannot by itself identify or attribute a trade or
waiver transaction; that requires a separate transaction ledger or dated roster
snapshots.

Daily Fantrax roster periods form a separate ownership-history layer. Run
`bun run rosters:validate` to cache and validate all configured historical periods,
then `bun run rosters:import` to commit them. The importer uses each season's first
populated roster as its baseline and derives later adds, drops, and immediate
team-to-team movements without treating lineup-slot changes as transactions. The
Waiver Research route and Eve expose this activity with an explicit inference label:
the public API does not reveal waiver priority, FAAB, trade packages, or authoritative
transaction types.

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

The versioned `config/league-format.json` captures the lineup shape separately
from player eligibility. The current format has ten active slots and three
reserve slots within the 13-player roster limit, plus one IR slot that does not
count toward that limit. That produces 120 active slots, 156 standard roster
spots, and 168 maximum player holdings across the league. Lineups can be
changed daily, so later valuation runs must account for schedule density and
usable bench games rather than treating the ten active slots as a fixed weekly
lineup.

## Versioned season calendars

The calendar importer joins the official BALLDONTLIE regular-season schedule to
the active Fantrax league's dated scoring periods. It selects the sole `live`
season from the ignored `config/seasons.json` by default; use `--season=YYYY-YY`
only for an explicit override.

```bash
bun run season-calendar:validate
bun run season-calendar:import
```

Validation is read-only and prints the provider timestamp, scoring-period
boundaries, per-team regular-season and playoff counts, postponed games, and a
deterministic fingerprint. Import reruns the same validation and saves a new
immutable snapshot. BALLDONTLIE pages retain the existing rate-limit, retry, and
local-cache behavior; Fantrax league info is fetched once and cached under
`data/cache/fantrax/<season>/league-info.json`. Refreshing after a postponement
creates a new snapshot rather than modifying history.

Projection imports record the exact calendar snapshot and fingerprint. A normal
commit refuses missing or unmapped team schedules; `--allow-missing-schedule` is
an explicit compatibility escape hatch and records that limitation in the
projection snapshot. The player board labels current, stale, and genuinely
missing calendar data separately.

## Auction valuation promotion

Auction calibration is an explicit two-stage workflow. `bun run valuation:validate`
builds a deterministic preview and prints its projection snapshot, historical-input
fingerprint, candidate metrics, selected model, and estimate count without writing.
`bun run valuation:import` saves the same artifact as an immutable candidate and is
idempotent by fingerprint. Saving never makes a candidate live.

Promote a reviewed candidate with
`bun run valuation:promote -- --promote=<run-id> --actor=<user-id>`. Promotion records
the actor and time, supersedes the prior promoted run for that season, and leaves all
candidate inputs and player estimates unchanged. Roll back by promoting an older run
whose season and projection snapshot are still compatible.

The draft room consumes only the promoted run linked to the exact current projection
snapshot. A missing or stale promotion is shown visibly and falls back to deterministic
projection and historical-market values. Promotion governs live price estimates only;
it never changes source projections or historical records.
The promoted artifact may also carry versioned usable-lineup production
utility. Re-promoting the prior compatible run is the rollback path.

## Current implementation status

The application can score a stat line with the league's custom rules through
both the Effect module and Eve's `score_stat_line` tool. Neon holds five
validated historical auction seasons (2021–22 through 2025–26), with 695
purchases mapped onto 235 canonical Fantrax players. Six seasons of team
metadata (including the live 2026–27 league) produce 13 historical canonical
managers and 66 team-season records.

The web application now has dedicated league, player, manager, draft, trade,
waiver-research, and settings routes. Eve remains mounted in the shared
application shell, keeps its session while navigating, and receives the current
route plus page-specific context with each prompt. Private team history remains
behind Better Auth. Eve queries the same auction, team-history, and roster
snapshots through `historical_auction_market`, `league_team_history`, and
`league_rosters`.

Competitive outcomes are stored as separate signals: playoff champion is the
primary winning tier, while playoff finish, regular-season rank, total points,
matchup wins, all-play strength, consistency, and schedule luck remain available
for comparison rather than being collapsed into one generic result.

Five seasons of player production produce 1,001 stored player-season historical
actual rankings. The player workspace joins those results to same-season draft
cost and the weighted historical market while labeling them as actuals, not
forecasts. Historical auction cost remains an observed market signal rather
than a ranking. The projection importer now converts a locally supplied
Hashtag snapshot into availability-adjusted league points, including estimated
double-/triple-double bonuses and versioned playoff-week schedule weighting. The
valuation lab compares four fixed price models through walk-forward tests: each
season is predicted only from earlier auctions and lagged production. It selects
the lowest drafted-player mean absolute error, derives price-tier ranges from
historical errors, and keeps hindsight realized value visibly separate. Only an
explicitly promoted, snapshot-compatible selection feeds the draft UI and Eve's
live-bid tool.

The live draft room keeps the legacy global points-per-game value available for
comparison and adds the versioned `usable-lineup-v1` experiment. That model
optimizes daily position eligibility against the dated NBA schedule, accounts
for availability, lineup congestion, playoff-period weights, and the reserved
streaming slot, and conserves the exact auction pool after $1 minimum bids.
Calibrated market price remains a prediction of what this league may pay;
usable value is separate production utility. Brendan's personal cap uses the
candidate's marginal optimized value on the currently owned roster when the
promoted artifact matches the exact projection and schedule snapshots.

The authenticated draft page prepares the complete bid board once, then
evaluates deterministic guardrails synchronously in the browser while Jev
reviews qualitative roster and plan fit in the background.
Jev latency therefore cannot delay the actionable bid signal. Players without
a defensible historical signal fall back to projection value during live
evaluation rather than presenting a false calibrated price. Manual draft-room
state and the last 20 evaluations survive refresh in the browser; the feature
is read-only and cannot place a Fantrax bid.

Usable-lineup artifacts are immutable candidates. Importing one does not make
it live: an operator must review it and explicitly promote its run ID. To roll
back, promote the previous compatible run again. The model is not yet a
historical injury backtest or playoff-probability model because daily historical
availability is not preserved.

The scoring configuration currently models triple-double and double-double
bonuses as cumulative. That behavior is explicit and tested, but should be
confirmed against Fantrax before rankings are published.

The Eve channel accepts the same Better Auth session as the Next.js app, Vercel
OIDC for service traffic, and local development identities only outside
production. Unauthenticated production browser traffic fails closed.
