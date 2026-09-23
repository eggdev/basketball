# Live draft trial: September 23, 2026

The local app can follow Fantrax auction picks for multiple leagues.
The signed-in browser bridge adds current nominations, bids, and Jev checks.
Open `/draft/live`, select a saved league, and confirm your team.
The mock starts at 1:00 PM EDT on September 23.

## Today’s test

1. Start the app with `bun run dev:web` and open the live room.
2. Confirm the mock name, your team, and the $188 opening legal cap.
3. Keep Fantrax beside the app. Enter current nominations and bids manually.
4. Compare each completed purchase with the pick list and team budgets.
5. Download the review and capture history after the draft.

League shortcuts live in ignored `config/live-leagues.json` during local development.
Copy `config/live-leagues.example.json` and replace its IDs for another checkout.
The browser saves additional leagues under the signed-in user, or a local user before sign-in.
Notes use separate keys for each user, league, and team.
Main league research and saved plans retain their existing scope.

The server polls Fantrax when the room requests an update.
Each changed snapshot appends to `data/reports/live-drafts/<league-id>/events.jsonl` during development.
These ignored files preserve the public source response and capture time.
A complete snapshot replaces prior state, so repeated polls do not duplicate purchases.
Corrections and resets produce new capture entries.
Keep this tab open and the computer awake to maintain capture.
A suspended tab or stopped server creates a capture gap.

## Findings that affect this trial

| Finding | Evidence | Effect |
| --- | --- | --- |
| Scoring differs | Mock reports category scoring; main league reports custom points. | Main league prices cannot serve as mock recommendations. |
| Bid floors differ | Mock minimum is $1; main league minimum is $0. | Mock opening cap is $188 for a $200 budget and 13 slots. |
| Category count differs from league name | The mock name says 9cat; the API lists eight categories and omits turnovers. | Confirm rules in Fantrax before building a category model. |
| Draft status is ambiguous | Both feeds report `running` before completed picks; the main league omits a draft date. | The UI separates connection status from scheduled start and pick activity. |
| Current bids are absent from the public feed | The public endpoint returns completed purchases. | The signed-in bridge supplies current auction state. Manual entry remains available. |

The polling interval is three seconds after each successful response.
Fantrax publication delay is still unknown.
The UI retains the last good snapshot after an error and marks its budget checks stale.
Retries back off to 30 seconds. A manual refresh retries immediately.

Budget checks assume equal starting budgets and empty starting rosters.
Keepers, traded budgets, and other commissioner adjustments need explicit support.
The cap represents a budget constraint; it does not establish player value.
The live auction panel uses the budgets and caps returned by the signed-in draft endpoint.
The public purchase tables still calculate totals from completed picks.

## Connect current bids and Jev

1. Open the local live room and choose your team. Click **Copy bridge script**.
2. Open your signed-in Fantrax draft tab. Open Chrome’s Console with Option-Command-J and run the script.
3. Click **Open live copilot** in the Fantrax page. Keep both tabs open.
4. Check the current bid and team in the new local window. Use **Stop bridge** in Fantrax to disconnect.

The script observes the JSON decoder used by Fantrax’s socket handler.
It preserves the decoder’s return value and restores the decoder when stopped.
This also observes socket messages after a reconnect.
Chrome’s `queryObjects` console utility printed a socket array but returned `undefined` during the trial.
The bridge no longer depends on that utility.
The bridge reads `getLiveDraft` and `liveDraft` with `function: getPickInfo` from Fantrax’s own draft client API.
It never sends a bid, nomination, or draft control command.
Only selected draft fields cross into the local app. Login cookies and socket URLs stay in Fantrax.

The local window checks the sender origin, opening window, pairing token, league, and event sequence.
Every meaningful state change is saved before a model result is required.
Timer ticks and transport heartbeats do not call Jev.
Bid bursts wait 150 milliseconds before evaluating the newest state.
A new state cancels the previous request. Late results cannot replace a current decision.
Jev failures leave the budget checks active and display a retry button.

Read requests run two seconds after the previous response, with slower retries after failures.
Complete roster reads run every ten seconds and after purchases or corrections.
Socket events update the panel as they arrive.
An older read response cannot overwrite a socket event received during that request.
The panel waits for roster recovery after a purchase, undo, or reset.
An eight-second gap marks the auction panel stale and removes its active recommendation.
Refreshes of the Fantrax page require running the script again.

Jev uses the selected league’s scoring categories, current budget, and available generated projections for the candidate and roster.
The projection snapshot has 430 players for 2026–27, dated September 19.
Stored Fantrax IDs link 356 players, including the top 78. Unknown IDs produce an explicit missing-projection message.
The matching promoted price model is `market-production-50-v1`.
The room shows its ranks and prices as main league reference values.
Those values use the main league points rules. The mock still has no category price model.
Jev receives projected category stats and the price comparison for the technology trial.
Budget stops retain the selected league’s limits. Saved main league plans stay outside this evaluation.
The server rejects projection seasons that differ from the league season.
Prices require a promoted valuation tied to the exact projection snapshot.

## Production trial

Production requires the existing allowed owner sign-in for bridge scripts, generated models, evaluation, and capture exports.
POST routes reject missing or foreign origins. Public completed-pick snapshots remain available without sign-in.
Production capture uses the additive `fantasy.live_draft_events` table from migration `0015_unusual_ulik.sql`.
Each read selects both the authenticated user and the Fantrax league ID.
The table remains separate from imported seasons and auction history.
Local development retains its JSONL capture so the current trial can continue during deployment.

1. Run the database migrations, then deploy the verified commit.
2. Sign in on the production app and open `/draft/live` with the selected league and team.
3. Copy the production bridge script and run it in Fantrax. Click **Open live copilot**.
4. Confirm the displayed model coverage and Jev result. Download capture history after a state change.

Starting the production bridge replaces the local bridge observer in that Fantrax tab.
The local app then marks its auction state stale. Its public completed-pick feed can continue.
The production trial uses the current owner allowlist; full multi-user league membership remains future work.
The migration was applied before deployment. A smoke test verified capture writes, exports, and separation by owner and league.
The test removed its temporary rows after verification.

## Changes needed for full league support

| Priority | Current boundary | Required change |
| --- | --- | --- |
| P1 | `preDraftWorkspace` selects the latest updated league within a season. Several other loaders select by season alone. | Require league-season identity across loaders and mutations. |
| P1 | User access uses one owner allowlist and a fixed canonical owner profile. | Add user-to-league membership and selected team authorization. |
| P1 | Projections, promoted valuations, calendars, and scoring assumptions share season-level context. | Bind model artifacts to league rules and reject incompatible inputs. |
| P1 | Eve tools load the main league and active plan. | Pass authorized league identity through every agent tool and conversation. |
| P2 | Saved league shortcuts and notes are local. Captures require an open room. | Persist membership, sessions, and a draft event log before deployment. |

The trial keeps mock results outside the historical auction database.
Importing a second current-season league now could change which league existing queries select.
The manual bid panel now separates browser state by owner, season, and owner membership.
Old unscoped manual state remains untouched and is not loaded into the new scope.

Eve still uses main league context. Its chat is disabled inside the live room until league scope reaches its tools.
Vercel supplies development database settings. Production OAuth secrets cannot be exported through `vercel env pull`.
The public live room works without those secrets; private planning needs a valid sign-in setup.

## Validation and open questions

The full `bun run check` suite passed during implementation.
Tests cover provider parsing, budget reserves, corrected purchases, resets, and separate browser state.
Bridge tests cover sender checks, socket updates, roster recovery, rapid bids, and late evaluation results.
The real Jev gateway returned a successful pre-draft evaluation with the Vercel development credentials.
The signed-in bridge connected at 12:01 PM EDT on September 23.
Its first saved state reported $200 remaining, 13 open slots, and a $188 legal cap for the selected team.
Fantrax reported status `0` before the draft. Jev returned `wait` with focus `await_draft` in 652 milliseconds.
Both the bridge state and Jev result were saved to the local capture file.
Client tests cover connection errors, stale checks, and request cancellation after leaving a room.
Browser checks cover the real mock feed and switching to the main league.
A browser-only fixture simulated a $60 purchase, leaving $140 and a $129 legal cap.
The room stopped a $130 bid. A simulated disconnect retained the purchase and marked the budget stale.
The fixture stayed outside the local capture files. The real feed was restored after the test.
Desktop and 390-pixel mobile views had no horizontal page overflow.

During the draft, record the Fantrax completion time and the first capture that contains each pick.
Measure publication delay from those times, while allowing for clock differences.
Test an undo or reset only if the mock commissioner performs one.
Verify that every purchased player has a catalog name and appears on the correct team.
Use the notes field for observed failures and the capture history to reproduce them.
