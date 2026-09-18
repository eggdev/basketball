import { loadLeaguePerformance } from '../../lib/league-performance';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { LeagueView } from './league-view';

export const dynamic = 'force-dynamic';

export default async function LeaguePage() {
  const viewer = await loadViewer().catch(() => null);
  const [snapshot, performance] =
    viewer === null
      ? [null, null]
      : await Promise.all([
          loadLeagueRosters().catch(() => null),
          loadLeaguePerformance().catch(() => null),
        ]);

  return (
    <LeagueView authenticated={viewer !== null} performance={performance} snapshot={snapshot} />
  );
}
