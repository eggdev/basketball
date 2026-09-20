# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is Brendan Eggers, also known in the league as Clyde. He uses a private decision room before and during his Fantrax fantasy basketball season to prepare for the auction, manage a live draft, evaluate trades, research waivers, and understand competing managers.

Public visitors may inspect the non-private research surfaces, but private league data and personalized analysis require the authenticated league-owner account. The product is not currently intended as a general-purpose tool for other leagues or managers.

## Product Purpose

Fantasy Basketball Draft Room turns this league's audited historical data, current market signals, scoring rules, and roster constraints into explainable draft, trade, and waiver decisions with Eve. Success means helping Brendan make better-supported decisions, preserve a workable streaming slot, reach the playoffs at minimum, and compete for the league championship.

## Positioning

The product is grounded in one league's reviewed Fantrax history and Brendan's owner-specific strategy rather than generic fantasy advice. It keeps observed auction prices, historical production, projections, recommended bids, inferred roster activity, and live draft state as distinct evidence layers, then gives Eve the active workspace context needed to explain a recommendation without overstating what the data proves.

## Operating Context

- Brendan prepares named pre-draft scenarios with budget guardrails, risk posture, streaming-slot intent, and player target, watch, or avoid decisions.
- During the auction, the live draft room tracks nominations, purchases, remaining budgets, roster needs, and a deterministic maximum bid; AI evaluation may explain the decision but does not replace the numeric cap.
- Research views compare historical league performance, manager behavior, player production, league auction prices, Fantrax ADP, roster construction, and inferred ownership changes.
- Trade analysis begins with roster comparisons and must disclose when it only has draft-day snapshots rather than current ownership, injuries, transactions, or rest-of-season projections.
- Waiver research uses daily roster snapshots to infer adds, drops, and team changes. Fantrax does not expose waiver priority, FAAB, trade packages, or authoritative transaction labels through the available data.
- League rules use daily lineup changes, ten active slots, three reserve slots within a 13-player roster limit, and one additional IR slot.

## Capabilities and Constraints

- The routed Next.js application provides League, Players, Managers, Draft, Trades, Waivers, and League Settings workspaces plus a contextual Eve conversation panel.
- GitHub is the intended sign-in provider. Account creation fails closed unless the returned email is on the owner allowlist.
- Private league identifiers, manager names, raw exports, normalized output, and provider responses remain local and are not committed.
- Historical imports are reviewed, fingerprinted, and kept auditable. Player identity merges require explicit human review and are never inferred from similar names.
- Auction prices describe observed league behavior; historical rankings describe actual past production under versioned rules. Neither is silently presented as a projection or recommended bid.
- Roster activity is explicitly labeled as inferred rather than a confirmed transaction ledger.
- AI-provider failure must not change deterministic valuation logic. The interface should expose the fallback state clearly.
- The current product serves one private league and one canonical owner. Multi-league and multi-owner product support are undecided rather than assumed.

## Brand Commitments

- The product name is **Fantasy Basketball Draft Room**.
- The embedded analyst is named **Eve**.
- The voice is direct, analytical, league-aware, and candid about uncertainty. Recommendations should distinguish facts, inferences, assumptions, and missing data.
- Private owner access, evidence-backed analysis, and the rule against presenting inferred activity as confirmed fact must be preserved.

## Evidence on Hand

- Product and workflow documentation: `README.md`
- Existing product interface and copy: `apps/web/src/app/`
- Eve's analytical behavior and evidence boundaries: `agent/instructions.md`
- Canonical owner goals and strategy context: `packages/fantasy/src/lib/league-owner.ts` and `agent/instructions/owner-context.ts`
- Versioned scoring and roster constraints: `config/scoring.json` and `config/league-format.json`
- Domain logic and tests for valuation, projections, scoring, and live bidding: `packages/fantasy/src/lib/`
- Audited database schema, historical importers, and reconciliation workflows: `packages/database/`, `packages/importer/`, and `src/fantasy_basketball/`
- The repository contains no approved testimonials, customer logos, press claims, or broad multi-league performance claims. Future work must not fabricate them.

## Product Principles

1. **League evidence before generic advice.** Prefer this league's reviewed history, rules, and current signals over category-wide assumptions.
2. **Separate observation from recommendation.** Keep prices, production, projections, inferences, and strategic decisions traceable to their actual source.
3. **Make decisions explainable under pressure.** Surface the decisive context, constraints, and uncertainty quickly enough to support live draft and in-season action.
4. **Keep the owner in control.** Human-reviewed identity, strategy, and irreversible data decisions outrank automated guesses.
5. **Fail honestly.** Preserve deterministic outputs when AI or data providers fail, label degraded states, and never imply evidence the product does not have.
