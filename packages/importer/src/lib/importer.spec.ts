import { Effect, Exit } from 'effect';

import {
  commitHistoricalAuctionImport,
  planHistoricalAuctionImport,
  type HistoricalAuctionSourceBundle,
} from './importer';

const auctionCsv = `season,league_id,fantrax_pick,roster_slot,team_id,team_name,manager_label,player_key,fantrax_player_id,player_name,source_player_name,price,price_source,match_method,match_confidence,drafted_at_ms
2024-25,league-1,1,1,team-1,Synthetic Team,Manager One,nikola-jokic,player-1,Nikola Jokic,Jokic,12.50,csv,unique_first_or_last,0.95,1700000000000
2024-25,league-1,2,2,team-1,Synthetic Team,Manager One,shai-gilgeous-alexander,player-2,Shai Gilgeous-Alexander,SGA,0,csv,alias,1.0,1700000001000
`;

const validBundle: HistoricalAuctionSourceBundle = {
  auctionCsv,
  configJson: JSON.stringify({
    base_budget: 200,
    expected_roster_size: 13,
  }),
  leagueMembersJson: JSON.stringify({ members: [] }),
  leagueSeasonsJson: JSON.stringify([
    {
      league_history_id: 'history-1',
      league_id: 'league-1',
      season: '2024-25',
      status: 'historical',
      team_count: 1,
      teams: [{ division: 'East', id: 'team-1', name: 'Synthetic Team' }],
    },
  ]),
  validationJson: JSON.stringify({
    valid: true,
    summary: { errors: 0, normalized_rows: 2, warnings: 0 },
    seasons: [
      {
        errors: 0,
        league_id: 'league-1',
        normalized_price_count: 2,
        normalized_total_spend: '12.50',
        season: '2024-25',
        source: 'csv+fantrax',
        team_count: 1,
        warnings: 0,
      },
    ],
  }),
};

describe('planHistoricalAuctionImport', () => {
  it('produces a reviewable, cents-safe import plan', async () => {
    const plan = await Effect.runPromise(planHistoricalAuctionImport(validBundle));

    expect(plan.summary).toEqual({
      auctionCount: 2,
      canonicalMemberCount: 1,
      leagueTeamSeasonCount: 1,
      seasonCount: 1,
      totalAmountCents: 1250,
      uniquePlayerCount: 2,
      unresolvedTeamSeasonCount: 0,
      warningCount: 0,
    });
    expect(plan.seasons[0]).toMatchObject({
      baseBudgetCents: 20_000,
      leagueHistoryId: 'history-1',
      leagueId: 'league-1',
      rosterSize: 13,
      seasonKey: '2024-25',
      teamCount: 1,
    });
    expect(plan.auctions.map((auction) => auction.amountCents)).toEqual([1250, 0]);
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses data rejected by the upstream validator', async () => {
    const invalidBundle = {
      ...validBundle,
      validationJson: JSON.stringify({
        valid: false,
        summary: { errors: 1, normalized_rows: 2, warnings: 0 },
        seasons: [],
      }),
    };

    const exit = await Effect.runPromiseExit(planHistoricalAuctionImport(invalidBundle));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('upstream_validation_failed');
  });

  it('syncs a live season and its teams before the draft has any rows', async () => {
    const leagueSeasons = JSON.parse(validBundle.leagueSeasonsJson) as Array<unknown>;
    const validation = JSON.parse(validBundle.validationJson) as {
      seasons: Array<unknown>;
    };
    const plan = await Effect.runPromise(
      planHistoricalAuctionImport({
        ...validBundle,
        leagueSeasonsJson: JSON.stringify([
          ...leagueSeasons,
          {
            league_history_id: 'history-1',
            league_id: 'league-2',
            season: '2025-26',
            status: 'live',
            team_count: 1,
            teams: [{ division: 'East', id: 'team-2', name: 'Synthetic Team' }],
          },
        ]),
        validationJson: JSON.stringify({
          ...validation,
          valid: true,
          summary: { errors: 0, normalized_rows: 2, warnings: 0 },
          seasons: [
            ...validation.seasons,
            {
              errors: 0,
              league_id: 'league-2',
              normalized_price_count: 0,
              normalized_total_spend: '0',
              season: '2025-26',
              source: 'fantrax_live',
              team_count: 1,
              warnings: 0,
            },
          ],
        }),
      }),
    );

    expect(plan.seasons.map((season) => season.seasonKey)).toEqual(['2024-25', '2025-26']);
    expect(plan.leagueTeams).toHaveLength(2);
    expect(plan.leagueTeams[1]).toMatchObject({
      identityResolution: 'team_name_history',
      memberKey: 'manager-one',
      seasonKey: '2025-26',
    });
  });
});

describe('commitHistoricalAuctionImport', () => {
  it('commits the validated plan through the database seam', async () => {
    const plan = await Effect.runPromise(planHistoricalAuctionImport(validBundle));
    let committedFingerprint = '';
    const committer = {
      replaceHistoricalAuctions: (batch) =>
        Effect.sync(() => {
          committedFingerprint = batch.fingerprint;
          return {
            auctionCount: batch.auctions.length,
            canonicalMemberCount: batch.leagueMembers.length,
            ingestionRunId: 'run-1',
            leagueTeamSeasonCount: batch.leagueTeams.length,
            playerCount: batch.players.length,
            seasonCount: batch.seasons.length,
            unresolvedTeamSeasonCount: batch.leagueTeams.filter((team) => team.memberKey === null)
              .length,
          };
        }),
    };

    const result = await Effect.runPromise(commitHistoricalAuctionImport(plan, committer));

    expect(result).toEqual({
      auctionCount: 2,
      canonicalMemberCount: 1,
      ingestionRunId: 'run-1',
      leagueTeamSeasonCount: 1,
      playerCount: 2,
      seasonCount: 1,
      unresolvedTeamSeasonCount: 0,
    });
    expect(committedFingerprint).toBe(plan.fingerprint);
  });
});
