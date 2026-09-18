/** Public, league-facing identity and planning defaults for the app's owner. */
export const leagueOwnerProfile = {
  canonicalKey: 'clyde',
  displayName: 'Brendan Eggers',
  nickname: 'Clyde',
  goals: {
    minimumOutcome: 'Make the playoffs',
    primaryOutcome: 'Win the playoff championship',
  },
  defaultPlan: {
    anchorBudgetCents: 10_000,
    coreBudgetCents: 8_000,
    endgameBudgetCents: 2_000,
    name: 'Balanced playoff floor',
    notes:
      'Prioritize availability, daily-lineup volume, and enough endgame flexibility to preserve one streaming slot.',
    primaryGoal: 'make-playoffs' as const,
    riskTolerance: 'balanced' as const,
    strategyAngle: 'Durable stars with a flexible middle class',
    streamingSlots: 1,
  },
} as const;
