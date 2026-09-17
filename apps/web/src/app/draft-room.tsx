'use client';

import type {
  HistoricalAuctionMarket,
  HistoricalAuctionMarketPlayer,
} from '@fantasy-basketball/database/runtime';
import { useEveAgent } from 'eve/react';
import { type FormEvent, useMemo, useState } from 'react';

import styles from './draft-room.module.css';

const dollars = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const formatPrice = (cents: number) => dollars.format(cents / 100);

const formatTrend = (player: HistoricalAuctionMarketPlayer) => {
  if (player.trendCents === null) return 'New';
  if (player.trendCents === 0) return 'Flat';
  return `${player.trendCents > 0 ? '+' : '−'}${formatPrice(Math.abs(player.trendCents))}`;
};

export interface DraftRoomProps {
  readonly market: HistoricalAuctionMarket | null;
}

export function DraftRoom({ market }: DraftRoomProps) {
  const agent = useEveAgent();
  const [message, setMessage] = useState('');
  const [playerQuery, setPlayerQuery] = useState('');
  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const isResuming = agent.status === 'resuming';
  const filteredPlayers = useMemo(() => {
    const query = playerQuery.trim().toLocaleLowerCase();
    if (query.length === 0) return market?.players ?? [];
    return (market?.players ?? []).filter((player) =>
      player.name.toLocaleLowerCase().includes(query),
    );
  }, [market, playerQuery]);
  const leagueFacts = [
    ['Teams', '12'],
    ['Roster', '13'],
    ['Base budget', '$200'],
    ['Imported drafts', String(market?.summary.seasonCount ?? 0)],
  ] as const;

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (nextMessage.length === 0 || isResuming) return;

    setMessage('');
    void agent.send(nextMessage, isBusy ? { turnPolicy: 'steer' } : undefined);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Fantrax draft room</p>
          <h1>Fantasy Basketball</h1>
        </div>
        <div className={`${styles.status} ${market === null ? styles.statusPending : ''}`}>
          <span aria-hidden="true" />
          {market === null ? 'Historical market unavailable' : 'Historical market connected'}
        </div>
      </header>

      <section className={styles.facts} aria-label="League settings">
        {leagueFacts.map(([label, value]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className={styles.workspace}>
        <section className={styles.board}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Draft board</p>
              <h2>Historical player market</h2>
            </div>
            <label className={styles.playerSearch}>
              <span>Find player</span>
              <input
                onChange={(event) => setPlayerQuery(event.target.value)}
                placeholder={`Search ${market?.summary.playerCount ?? 0} players`}
                type="search"
                value={playerQuery}
              />
            </label>
          </div>

          {market === null ? (
            <div className={styles.emptyState}>
              <p>The historical market could not be loaded.</p>
              <span>
                The draft room remains available, but auction values need a working database
                connection.
              </span>
            </div>
          ) : (
            <>
              <div className={styles.marketSummary}>
                <div>
                  <strong>{market.summary.playerCount}</strong>
                  <span>players</span>
                </div>
                <div>
                  <strong>{market.summary.purchaseCount}</strong>
                  <span>purchases</span>
                </div>
                <div>
                  <strong>{formatPrice(market.summary.totalSpendCents)}</strong>
                  <span>historical spend</span>
                </div>
                <p>Newer seasons weigh more; later undrafted seasons count as $0.</p>
              </div>

              <div className={styles.tableViewport}>
                <table className={styles.marketTable}>
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Expected</th>
                      <th scope="col">Latest</th>
                      <th scope="col">Trend</th>
                      <th scope="col">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player) => (
                      <tr key={player.playerId}>
                        <th scope="row">
                          <strong>{player.name}</strong>
                          <span>
                            {player.seasonsDrafted} draft{player.seasonsDrafted === 1 ? '' : 's'} ·{' '}
                            {player.latestSeason}
                          </span>
                        </th>
                        <td className={styles.expectedPrice}>
                          {formatPrice(player.expectedPriceCents)}
                        </td>
                        <td>{formatPrice(player.latestPriceCents)}</td>
                        <td>
                          <span
                            className={
                              player.trendCents === null || player.trendCents === 0
                                ? styles.trendNeutral
                                : player.trendCents > 0
                                  ? styles.trendUp
                                  : styles.trendDown
                            }
                          >
                            {formatTrend(player)}
                          </span>
                        </td>
                        <td>
                          {formatPrice(player.minimumPriceCents)}–
                          {formatPrice(player.maximumPriceCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPlayers.length === 0 ? (
                  <p className={styles.noResults}>No historical player matches “{playerQuery}”.</p>
                ) : null}
              </div>
            </>
          )}
        </section>

        <aside className={styles.chat}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Eve analyst</p>
              <h2>Draft chat</h2>
            </div>
            <span className={styles.agentStatus}>{agent.status}</span>
          </div>

          <div className={styles.messages} aria-live="polite">
            {agent.data.messages.length === 0 ? (
              <div className={styles.chatEmpty}>
                Ask about the scoring system or historical auction market. Production-based rankings
                and trade targets will appear as their data modules come online.
              </div>
            ) : (
              agent.data.messages.map((item) => (
                <article
                  className={item.role === 'user' ? styles.userMessage : styles.agentMessage}
                  key={item.id}
                >
                  <small>{item.role === 'user' ? 'You' : 'Analyst'}</small>
                  {item.parts.map((part, index) =>
                    part.type === 'text' ? <p key={index}>{part.text}</p> : null,
                  )}
                </article>
              ))
            )}
          </div>

          {agent.error ? <p className={styles.error}>{agent.error.message}</p> : null}

          <form className={styles.composer} onSubmit={sendMessage}>
            <label htmlFor="draft-message">Message the analyst</label>
            <div>
              <input
                autoComplete="off"
                disabled={isResuming}
                id="draft-message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="How would this stat line score?"
                value={message}
              />
              <button disabled={isResuming || message.trim().length === 0}>
                {isBusy ? 'Update' : 'Send'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
