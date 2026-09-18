import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadHistoricalRankings } from '../../lib/historical-rankings';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { WaiversView } from './waivers-view';

export const dynamic = 'force-dynamic';

export default async function WaiversPage() {
  const viewer = await loadViewer().catch(() => null);
  const [market, rankings, rosterSnapshot] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    loadHistoricalRankings().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueRosters().catch(() => null),
  ]);

  return (
    <WaiversView
      authenticated={viewer !== null}
      market={market}
      rankings={rankings}
      rosterSnapshot={rosterSnapshot}
    />
  );
}
