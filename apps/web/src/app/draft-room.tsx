'use client';

import { useEveAgent } from 'eve/react';
import { FormEvent, useState } from 'react';

import styles from './draft-room.module.css';

const leagueFacts = [
  ['Teams', '12'],
  ['Roster', '13'],
  ['Base budget', '$200'],
  ['Imported drafts', '5'],
] as const;

export function DraftRoom() {
  const agent = useEveAgent();
  const [message, setMessage] = useState('');
  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const isResuming = agent.status === 'resuming';

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
        <div className={styles.status}>
          <span aria-hidden="true" />
          Data adapters ready to connect
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
              <h2>Available players</h2>
            </div>
            <button type="button" disabled>
              Sync Fantrax
            </button>
          </div>

          <div className={styles.emptyState}>
            <p>Player production is the next data seam.</p>
            <span>
              Historical auctions are normalized. Connect BALLDONTLIE before publishing rankings or
              dollar values.
            </span>
          </div>
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
                Ask about the scoring system now. Rankings, bids, and trade targets will appear as
                their data modules come online.
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
