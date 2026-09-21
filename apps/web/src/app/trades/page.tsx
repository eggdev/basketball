import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { TradesView } from './trades-view';

export const dynamic = 'force-dynamic';

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; team?: string; rival?: string }>;
}) {
  const initialSelection = await searchParams;
  const viewer = await loadViewer().catch(() => null);
  const snapshot = viewer === null ? null : await loadLeagueRosters().catch(() => null);

  return (
    <TradesView
      initialSelection={initialSelection}
      authenticated={viewer !== null}
      snapshot={snapshot}
    />
  );
}
