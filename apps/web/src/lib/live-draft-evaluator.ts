import { createGateway, experimental_evaluate } from 'ai';
import {
  bridgeVersion,
  draftGuardrail,
  type BridgeEvaluation,
  type BridgeState,
} from './fantrax-bridge';
import { displayPlayerName } from './fantrax-live';
import { loadFantraxCatalog, loadFantraxLeague } from './fantrax-live-server';
import { loadDraftModelReference } from './live-draft-model';

export async function evaluateDraftChange(
  state: BridgeState,
  teamId: string,
  signal?: AbortSignal,
): Promise<BridgeEvaluation> {
  const start = Date.now();
  const [league, catalog] = await Promise.all([
    loadFantraxLeague(state.leagueId),
    loadFantraxCatalog(),
  ]);
  if (!league.teamInfo[teamId]) throw new Error('This team does not belong to the league.');
  const reference = await loadDraftModelReference(league.seasonYear, state, teamId);
  const baseline = draftGuardrail(
    state,
    teamId,
    league.draftSettings.minimumBid,
    league.draftSettings.minimumBidIncrement,
  );
  const candidate = state.nominatedPlayerId ? catalog[state.nominatedPlayerId] : null;
  const result: BridgeEvaluation = {
    ...baseline,
    version: bridgeVersion(state, teamId),
    evaluatedAt: new Date().toISOString(),
    durationMs: 0,
    playerName: candidate ? displayPlayerName(candidate.name) : state.nominatedPlayerId,
    source: 'guardrails',
    rosterFit: null,
    focus: null,
    error: null,
    reference,
    leagueRules: {
      season: league.seasonYear,
      scoringType: league.scoringSystem.type,
      categories: Object.keys(league.scoringSystem.scoringCategories['PLAYER'] ?? {}),
      rosterSize: league.rosterInfo.maxTotalPlayers,
      minimumBidCents: league.draftSettings.minimumBid,
      incrementCents: league.draftSettings.minimumBidIncrement,
    },
  };
  // A pending roster repair cannot support a roster judgment.
  if (state.rosterSyncPending) return { ...result, durationMs: Date.now() - start };
  try {
    const apiKey =
      process.env['AI_GATEWAY_API_KEY']?.trim() || process.env['EGGDEV_AI_GATEWAY_KEY']?.trim();
    const gateway = apiKey ? createGateway({ apiKey }) : createGateway();
    const judged = await experimental_evaluate({
      model: gateway.evaluationModel('typesafe-ai/jev'),
      abortSignal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
      maxRetries: 0,
      questions: {
        rosterFit: {
          type: 'choice',
          instructions:
            'Use supplied positions and generated projected category stats to assess roster fit for the listed categories. Unknown players or no candidate means unknown. Never infer injuries or missing statistics. Reference ranks and prices use another league scoring model and do not establish mock-league value.',
          criteria: {
            useful: 'Candidate adds a position with limited current coverage.',
            crowded: 'Candidate adds to positions already heavily represented.',
            neutral: 'Candidate adds ordinary depth to the current roster.',
            unknown: 'The state does not support a position assessment.',
          },
        },
        focus: {
          type: 'choice',
          instructions:
            'Select the next review focus for this exact team and league. Respect deterministic guardrails. Generated projections and main-league reference prices may be supplied. Compare with those reference values for this technology trial, while recognizing their different scoring rules. Never turn a reference price into a recommended bid.',
          criteria: {
            await_result: 'The team holds the high bid and should wait for the result.',
            await_draft: 'The draft is paused, finished, or has not started.',
            prepare_nomination:
              'No player is currently nominated; review remaining positions before the next nomination.',
            preserve_budget:
              'The next bid would exceed the legal cap or there are no roster slots.',
            review_position: 'Position congestion deserves attention before any further bid.',
            check_value: 'Check a league-specific player valuation before choosing a bid.',
          },
        },
      },
      state: {
        league: {
          id: state.leagueId,
          season: league.seasonYear,
          scoringType: league.scoringSystem.type,
          categories: Object.keys(league.scoringSystem.scoringCategories['PLAYER'] ?? {}),
          rosterSize: league.rosterInfo.maxTotalPlayers,
        },
        teamId,
        status: state.status,
        candidate: state.nominatedPlayerId
          ? {
              id: state.nominatedPlayerId,
              name: result.playerName,
              positions: candidate?.position ?? null,
            }
          : null,
        currentBidCents: state.currentBidCents,
        bidderTeamId: state.bidderTeamId,
        nominatingTeamId: state.nominatingTeamId,
        budget: state.teams[teamId],
        guardrail: baseline,
        roster: state.rosters
          .filter((player) => player.teamId === teamId)
          .map((player) => ({
            id: player.playerId,
            name: catalog[player.playerId]?.name ?? player.playerId,
            positions: catalog[player.playerId]?.position ?? null,
            priceCents: player.priceCents,
          })),
        leagueValueModel: null,
        generatedReference: {
          summary: { ...reference.summary },
          candidate: reference.candidate ? { ...reference.candidate } : null,
          roster: reference.roster.map((player) => ({ ...player })),
          unmatchedRosterCount: reference.unmatchedRosterCount,
          priceSignal: reference.priceSignal,
        },
      },
    });
    return {
      ...result,
      source: 'jev',
      rosterFit: judged.answers.rosterFit.choice,
      focus: judged.answers.focus.choice,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...result,
      durationMs: Date.now() - start,
      error: 'Jev is unavailable for this update. Budget checks remain active.',
    };
  }
}
