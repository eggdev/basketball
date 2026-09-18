import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadHistoricalRankings } from '../../lib/historical-rankings';
import { PlayersView } from './players-view';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const [market, rankings] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    loadHistoricalRankings().catch(() => null),
  ]);

  return <PlayersView market={market} rankings={rankings} />;
}
