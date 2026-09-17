import { resolveLeagueIdentity, type LeagueIdentitySourceTeam } from './league-identity';

const team = (
  seasonKey: string,
  sourceTeamId: string,
  teamName: string,
  managerLabel: string | null,
): LeagueIdentitySourceTeam => ({
  division: null,
  leagueHistoryId: 'history-1',
  leagueId: `league-${seasonKey}`,
  managerLabel,
  seasonKey,
  sourceTeamId,
  teamName,
});

describe('resolveLeagueIdentity', () => {
  it('joins aliases and carries exact team names without fuzzy guesses', () => {
    const result = resolveLeagueIdentity(
      {
        members: [
          {
            display_name: 'Manager One',
            key: 'manager-one',
            manager_aliases: ['M. One'],
            teams: [],
          },
        ],
      },
      [
        team('2023-24', 'team-1', 'Moon Shots', 'M. One'),
        team('2024-25', 'team-2', 'Moon Shots', null),
        team('2025-26', 'team-3', 'Moonshot Reloaded', null),
      ],
    );

    expect(result.members).toEqual([
      {
        canonicalKey: 'manager-one',
        displayName: 'Manager One',
        leagueHistoryId: 'history-1',
      },
    ]);
    expect(result.teams.map((entry) => [entry.memberKey, entry.identityResolution])).toEqual([
      ['manager-one', 'manager_alias'],
      ['manager-one', 'team_name_history'],
      [null, 'unresolved'],
    ]);
  });

  it('lets an explicit season team assignment resolve a renamed team', () => {
    const result = resolveLeagueIdentity(
      {
        members: [
          {
            display_name: 'Manager One',
            key: 'manager-one',
            manager_aliases: [],
            teams: [{ season: '2025-26', source_team_id: 'team-3' }],
          },
        ],
      },
      [team('2025-26', 'team-3', 'A Totally New Name', null)],
    );

    expect(result.teams[0]).toMatchObject({
      identityConfidence: 100,
      identityResolution: 'explicit',
      memberKey: 'manager-one',
    });
  });
});
