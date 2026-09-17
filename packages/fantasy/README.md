# @fantasy-basketball/fantasy

The domain module for league rules, scoring, valuation, and recommendations.
Callers import its small public interface from `src/index.ts`; provider-specific
Fantrax and BALLDONTLIE details remain inside the module as they are added.

`evaluateLeagueFormat` validates the public league-format configuration and
derives the active, bench, and league-wide roster shape used by replacement
value calculations. Player eligibility remains provider data so positions can
change without changing the league rules.

## Building

Run `nx build fantasy` to build the library.

## Running unit tests

Run `nx test fantasy` to execute the unit tests via [Vitest](https://vitest.dev/).
