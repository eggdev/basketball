# @fantasy-basketball/fantasy

The domain module for league rules, scoring, valuation, and recommendations.
Callers import its small public interface from `src/index.ts`; provider-specific
Fantrax and BALLDONTLIE details remain inside the module as they are added.

`evaluateLeagueFormat` validates the public league-format configuration and
derives the active, bench, and league-wide roster shape used by replacement
value calculations. Player eligibility remains provider data so positions can
change without changing the league rules.

`allocateLeagueAuctionPool` centralizes the league's auction economy: $0 is a
legal uncontested price, positive bids move in $1 increments, and no cash is
reserved for unfilled roster spots. Production-value callers choose ranking and
replacement policy; the shared module owns exact budget allocation.

## Building

Run `nx build fantasy` to build the library.

## Running unit tests

Run `nx test fantasy` to execute the unit tests via [Vitest](https://vitest.dev/).
