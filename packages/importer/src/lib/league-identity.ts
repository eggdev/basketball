export interface LeagueIdentitySourceTeam {
  readonly division: string | null;
  readonly leagueHistoryId: string;
  readonly leagueId: string;
  readonly managerLabel: string | null;
  readonly seasonKey: string;
  readonly sourceTeamId: string;
  readonly teamName: string;
}

export interface CanonicalLeagueMember {
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly leagueHistoryId: string;
}

export type LeagueTeamIdentityResolution =
  | 'explicit'
  | 'manager_alias'
  | 'manager_label'
  | 'team_name_history'
  | 'unresolved';

export interface CanonicalLeagueTeamSeason extends LeagueIdentitySourceTeam {
  readonly identityConfidence: number;
  readonly identityResolution: LeagueTeamIdentityResolution;
  readonly memberKey: string | null;
}

export interface LeagueIdentityPlan {
  readonly members: ReadonlyArray<CanonicalLeagueMember>;
  readonly teams: ReadonlyArray<CanonicalLeagueTeamSeason>;
}

interface ConfiguredMember {
  readonly displayName: string;
  readonly key: string;
  readonly managerAliases: ReadonlyArray<string>;
  readonly teams: ReadonlyArray<{
    readonly seasonKey: string;
    readonly sourceTeamId: string;
  }>;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeLeagueIdentity = (value: string): string =>
  value
    .normalize('NFKD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

const requiredString = (record: JsonObject, field: string): string => {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
};

const parseConfiguration = (value: unknown): ReadonlyArray<ConfiguredMember> => {
  if (!isObject(value) || !Array.isArray(value['members'])) {
    throw new Error('league member config must contain a members array');
  }

  const keys = new Set<string>();
  return value['members'].map((candidate, memberIndex) => {
    if (!isObject(candidate)) throw new Error(`members[${memberIndex}] must be an object`);
    const key = requiredString(candidate, 'key');
    if (normalizeLeagueIdentity(key) !== key) {
      throw new Error(`member key ${key} must be lowercase kebab-case`);
    }
    if (keys.has(key)) throw new Error(`member key ${key} is duplicated`);
    keys.add(key);

    const aliases = candidate['manager_aliases'] ?? [];
    const teams = candidate['teams'] ?? [];
    if (!Array.isArray(aliases) || !aliases.every((alias) => typeof alias === 'string')) {
      throw new Error(`${key}.manager_aliases must be an array of strings`);
    }
    if (!Array.isArray(teams)) throw new Error(`${key}.teams must be an array`);

    return {
      displayName: requiredString(candidate, 'display_name'),
      key,
      managerAliases: aliases.map((alias) => alias.trim()).filter(Boolean),
      teams: teams.map((team, teamIndex) => {
        if (!isObject(team)) throw new Error(`${key}.teams[${teamIndex}] must be an object`);
        return {
          seasonKey: requiredString(team, 'season'),
          sourceTeamId: requiredString(team, 'source_team_id'),
        };
      }),
    };
  });
};

/**
 * Resolves season-specific Fantrax teams to canonical league members while
 * preserving uncertainty. No fuzzy matching is performed.
 */
export const resolveLeagueIdentity = (
  configuration: unknown,
  sourceTeams: ReadonlyArray<LeagueIdentitySourceTeam>,
): LeagueIdentityPlan => {
  const configuredMembers = parseConfiguration(configuration);
  const leagueHistoryIds = new Set(sourceTeams.map((team) => team.leagueHistoryId));
  if (leagueHistoryIds.size !== 1) {
    throw new Error('league identity can only be resolved within one Fantrax league history');
  }
  const leagueHistoryId = sourceTeams[0]?.leagueHistoryId;
  if (leagueHistoryId === undefined) throw new Error('league identity requires at least one team');

  const memberByKey = new Map<string, CanonicalLeagueMember>();
  const aliasToMember = new Map<string, string>();
  const assignmentToMember = new Map<string, string>();

  for (const member of configuredMembers) {
    memberByKey.set(member.key, {
      canonicalKey: member.key,
      displayName: member.displayName,
      leagueHistoryId,
    });
    for (const alias of [member.displayName, ...member.managerAliases]) {
      const normalized = normalizeLeagueIdentity(alias);
      const claimed = aliasToMember.get(normalized);
      if (claimed !== undefined && claimed !== member.key) {
        throw new Error(`manager alias ${alias} is claimed by multiple members`);
      }
      aliasToMember.set(normalized, member.key);
    }
    for (const team of member.teams) {
      const assignment = `${team.seasonKey}:${team.sourceTeamId}`;
      const claimed = assignmentToMember.get(assignment);
      if (claimed !== undefined && claimed !== member.key) {
        throw new Error(`team ${assignment} is claimed by multiple members`);
      }
      assignmentToMember.set(assignment, member.key);
    }
  }

  const priorMembersByTeamName = new Map<string, Set<string>>();
  const teams = [...sourceTeams]
    .sort(
      (left, right) =>
        left.seasonKey.localeCompare(right.seasonKey) ||
        left.sourceTeamId.localeCompare(right.sourceTeamId),
    )
    .map((team): CanonicalLeagueTeamSeason => {
      const assignmentKey = `${team.seasonKey}:${team.sourceTeamId}`;
      const explicitMember = assignmentToMember.get(assignmentKey);
      const normalizedManager =
        team.managerLabel === null ? null : normalizeLeagueIdentity(team.managerLabel);
      const configuredAlias =
        normalizedManager === null ? undefined : aliasToMember.get(normalizedManager);

      let memberKey: string | null = explicitMember ?? configuredAlias ?? null;
      let identityResolution: LeagueTeamIdentityResolution =
        explicitMember !== undefined
          ? 'explicit'
          : configuredAlias !== undefined
            ? 'manager_alias'
            : 'unresolved';
      let identityConfidence = memberKey === null ? 0 : 100;

      if (memberKey === null && team.managerLabel !== null) {
        memberKey = normalizeLeagueIdentity(team.managerLabel);
        identityResolution = 'manager_label';
        identityConfidence = 100;
        if (!memberByKey.has(memberKey)) {
          memberByKey.set(memberKey, {
            canonicalKey: memberKey,
            displayName: team.managerLabel,
            leagueHistoryId,
          });
        }
      }

      if (
        explicitMember !== undefined &&
        configuredAlias !== undefined &&
        explicitMember !== configuredAlias
      ) {
        throw new Error(
          `${assignmentKey} conflicts with manager alias ${team.managerLabel ?? 'unknown'}`,
        );
      }

      const normalizedTeamName = normalizeLeagueIdentity(team.teamName);
      if (memberKey === null) {
        const historicalMatches = priorMembersByTeamName.get(normalizedTeamName);
        if (historicalMatches?.size === 1) {
          memberKey = [...historicalMatches][0]!;
          identityResolution = 'team_name_history';
          identityConfidence = 90;
        }
      }

      if (memberKey !== null) {
        const members = priorMembersByTeamName.get(normalizedTeamName) ?? new Set<string>();
        members.add(memberKey);
        priorMembersByTeamName.set(normalizedTeamName, members);
      }

      return {
        ...team,
        identityConfidence,
        identityResolution,
        memberKey,
      };
    });

  const usedMemberKeys = new Set(
    teams.flatMap((team) => (team.memberKey === null ? [] : [team.memberKey])),
  );
  return {
    members: [...memberByKey.values()]
      .filter((member) => usedMemberKeys.has(member.canonicalKey))
      .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)),
    teams,
  };
};
