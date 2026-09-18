import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadHistoricalRankings } from '../../lib/historical-rankings';
import { loadLatestProjectionSnapshot } from '../../lib/latest-projections';
import { PlayersView } from './players-view';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const [market, projections, rankings] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    loadLatestProjectionSnapshot().catch(() => null),
    loadHistoricalRankings().catch(() => null),
  ]);

  return <PlayersView market={market} projections={projections} rankings={rankings} />;
}
