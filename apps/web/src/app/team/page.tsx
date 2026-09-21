import { loadLeaguePerformance } from '../../lib/league-performance';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadLeagueTeamHistory } from '../../lib/league-team-history';
import { loadLatestProjectionSnapshot } from '../../lib/latest-projections';
import { loadPlayerSituationBoard } from '../../lib/player-situations';
import { ownerMemberId } from '../../lib/team-hq';
import { loadViewer } from '../../lib/viewer';
import { resolveSeasonExperience } from '../../lib/season-experience';
import { loadPreDraftWorkspace } from '../../lib/pre-draft-workspace';
import { TeamHq } from './team-hq';

export const dynamic = 'force-dynamic';
export default async function TeamPage() {
  const experience = resolveSeasonExperience();
  const viewer = await loadViewer().catch(() => null);
  if (!viewer)
    return (
      <TeamHq
        authenticated={false}
        snapshot={null}
        performance={null}
        memberId={null}
        projections={null}
        situations={null}
      />
    );
  const [snapshot, performance, history, projections, workspace] = await Promise.all([
    loadLeagueRosters().catch(() => null),
    loadLeaguePerformance().catch(() => null),
    loadLeagueTeamHistory().catch(() => null),
    loadLatestProjectionSnapshot().catch(() => null),
    loadPreDraftWorkspace(experience.seasonKey).catch(() => null),
  ]);
  const situations = projections
    ? await loadPlayerSituationBoard(projections).catch(() => null)
    : null;
  return (
    <TeamHq
      authenticated
      workspace={workspace}
      preparationSeason={experience.seasonKey}
      snapshot={snapshot}
      performance={performance}
      memberId={ownerMemberId(history)}
      projections={projections}
      situations={situations}
    />
  );
}
