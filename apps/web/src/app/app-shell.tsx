'use client';

import { useEveAgent } from 'eve/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { authClient } from '../lib/auth-client';
import styles from './app-shell.module.css';

export interface AppViewer {
  readonly email: string;
  readonly id: string;
  readonly image?: string | null;
  readonly name: string;
}

type EvePageContext = Readonly<Record<string, boolean | number | string | null>>;

interface EveChatValue {
  readonly enabled: boolean;
  readonly send: (message: string, context?: EvePageContext) => void;
}

const EveChatContext = createContext<EveChatValue | null>(null);

export function useEveChat(): EveChatValue {
  const value = useContext(EveChatContext);
  if (value === null) throw new Error('useEveChat must be used inside AppShell');
  return value;
}

export function AskEveButton({
  children = 'Ask Eve',
  className,
  context,
  prompt,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly context?: EvePageContext;
  readonly prompt: string;
}) {
  const chat = useEveChat();

  return (
    <button
      className={className}
      disabled={!chat.enabled}
      onClick={() => chat.send(prompt, context)}
      type="button"
    >
      {children}
    </button>
  );
}

interface NavigationGroup {
  readonly label: string;
  readonly links: ReadonlyArray<{
    readonly href: string;
    readonly icon: string;
    readonly label: string;
  }>;
}

const navigation: ReadonlyArray<NavigationGroup> = [
  {
    label: 'Research',
    links: [
      { href: '/league', label: 'League', icon: 'L' },
      { href: '/players', label: 'Players', icon: 'P' },
      { href: '/managers', label: 'Managers', icon: 'M' },
    ],
  },
  {
    label: 'Decision rooms',
    links: [
      { href: '/draft', label: 'Draft', icon: 'D' },
      { href: '/trades', label: 'Trades', icon: 'T' },
      { href: '/waivers', label: 'Waivers', icon: 'W' },
    ],
  },
  {
    label: 'System',
    links: [{ href: '/settings', label: 'League settings', icon: 'S' }],
  },
];

const routePrompts: Readonly<Record<string, ReadonlyArray<string>>> = {
  '/draft': [
    'Build a draft plan from our historical prices and roster construction.',
    'Which players does this league consistently overpay for?',
  ],
  '/league': [
    'Compare the latest complete league rosters and identify construction patterns.',
    'Which teams found the most auction value in the latest draft?',
  ],
  '/managers': [
    'Which managers show the clearest repeat-player preferences?',
    'Compare spending styles across the league.',
  ],
  '/players': [
    'Compare historical fantasy production with this league’s auction market.',
    'Which historical performers look inexpensive relative to league prices?',
  ],
  '/trades': [
    'Help me compare two rosters for a balanced trade conversation.',
    'Which teams have complementary roster construction?',
  ],
  '/waivers': [
    'What should a daily-lineup streaming strategy optimize for?',
    'Which historically relevant players should stay on a watchlist?',
  ],
};

const routeTitle = (pathname: string): string => {
  if (pathname.startsWith('/managers/')) return 'Manager profile';
  return (
    navigation.flatMap((group) => group.links).find((link) => link.href === pathname)?.label ??
    'Fantasy Basketball'
  );
};

const compactLayoutQuery = '(max-width: 1180px)';

const subscribeToCompactLayout = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(compactLayoutQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const isCompactLayout = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(compactLayoutQuery).matches;

export function AppShell({
  children,
  viewer,
}: {
  readonly children: ReactNode;
  readonly viewer: AppViewer | null;
}) {
  const pathname = usePathname();
  const agent = useEveAgent();
  const [message, setMessage] = useState('');
  const compactLayout = useSyncExternalStore(
    subscribeToCompactLayout,
    isCompactLayout,
    () => false,
  );
  const [desktopChatOpen, setDesktopChatOpen] = useState(true);
  const [compactChatOpen, setCompactChatOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const chatEnabled = viewer !== null || process.env.NODE_ENV !== 'production';
  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const isResuming = agent.status === 'resuming';
  const promptKey = useMemo(
    () => Object.keys(routePrompts).find((key) => pathname.startsWith(key)) ?? '/players',
    [pathname],
  );
  const chatOpen = compactLayout ? compactChatOpen : desktopChatOpen;

  const setChatOpen = (open: boolean) => {
    if (compactLayout) setCompactChatOpen(open);
    else setDesktopChatOpen(open);
  };

  const send = (text: string, context: EvePageContext = {}) => {
    const trimmed = text.trim();
    if (!chatEnabled || isResuming || trimmed.length === 0) return;
    setChatOpen(true);
    void agent.send(trimmed, {
      clientContext: { route: pathname, ...context },
      ...(isBusy ? { turnPolicy: 'steer' as const } : {}),
    });
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = message.trim();
    if (nextMessage.length === 0) return;
    setMessage('');
    send(nextMessage);
  };

  const signIn = async () => {
    setAuthError(null);
    const result = await authClient.signIn.social({
      callbackURL: window.location.href,
      provider: 'github',
    });
    if (result.error) setAuthError(result.error.message ?? 'Sign-in failed');
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  return (
    <EveChatContext.Provider value={{ enabled: chatEnabled, send }}>
      <div className={styles.shell} data-chat-open={chatOpen}>
        <button
          aria-label="Close navigation"
          className={styles.navScrim}
          data-open={navOpen}
          onClick={() => setNavOpen(false)}
          type="button"
        />
        <aside className={styles.navigation} data-open={navOpen}>
          <div className={styles.brand}>
            <span aria-hidden="true">FB</span>
            <div>
              <strong>Draft Room</strong>
              <small>League intelligence</small>
            </div>
          </div>

          <nav aria-label="Primary navigation">
            {navigation.map((group) => (
              <section key={group.label}>
                <p>{group.label}</p>
                {group.links.map((link) => {
                  const active =
                    pathname === link.href ||
                    (link.href === '/managers' && pathname.startsWith('/managers/'));
                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      href={link.href}
                      key={link.href}
                      onClick={() => setNavOpen(false)}
                    >
                      <span aria-hidden="true">{link.icon}</span>
                      {link.label}
                    </Link>
                  );
                })}
              </section>
            ))}
          </nav>

          <div className={styles.navFooter}>
            <div className={styles.connection}>
              <span aria-hidden="true" />
              <div>
                <strong>{viewer === null ? 'Public research' : 'Owner session'}</strong>
                <small>{viewer?.name ?? 'Sign in for private league data'}</small>
              </div>
            </div>
            {viewer === null ? (
              <button onClick={() => void signIn()} type="button">
                Sign in with GitHub
              </button>
            ) : (
              <button onClick={() => void signOut()} type="button">
                Sign out
              </button>
            )}
            {authError ? <p className={styles.authError}>{authError}</p> : null}
          </div>
        </aside>

        <div className={styles.contentColumn}>
          <header className={styles.topbar}>
            <button
              aria-label="Open navigation"
              className={styles.menuButton}
              onClick={() => setNavOpen(true)}
              type="button"
            >
              ☰
            </button>
            <div>
              <small>Fantrax decision room</small>
              <strong>{routeTitle(pathname)}</strong>
            </div>
            <button
              aria-expanded={chatOpen}
              className={styles.chatToggle}
              onClick={() => setChatOpen(!chatOpen)}
              type="button"
            >
              {chatOpen ? 'Hide Eve' : 'Ask Eve'}
            </button>
          </header>
          <div className={styles.content}>{children}</div>
        </div>

        <button
          aria-label="Close Eve chat"
          className={styles.chatScrim}
          data-open={chatOpen}
          onClick={() => setChatOpen(false)}
          type="button"
        />
        <aside aria-label="Eve analyst" className={styles.chatPanel}>
          <header className={styles.chatHeader}>
            <div>
              <p>Eve analyst</p>
              <h2>League chat</h2>
            </div>
            <div className={styles.chatActions}>
              <span>{agent.status}</span>
              {isBusy ? (
                <button onClick={() => void agent.cancel()} type="button">
                  Stop
                </button>
              ) : null}
              {agent.data.messages.length > 0 && !isBusy ? (
                <button onClick={() => agent.reset()} type="button">
                  New
                </button>
              ) : null}
              <button
                aria-label="Close Eve chat"
                className={styles.closeChat}
                onClick={() => setChatOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </header>

          <div className={styles.quickPrompts}>
            {(routePrompts[promptKey] ?? []).map((prompt) => (
              <button
                disabled={!chatEnabled || isResuming}
                key={prompt}
                onClick={() => send(prompt)}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div aria-live="polite" className={styles.messages}>
            {!chatEnabled ? (
              <div className={styles.emptyChat}>
                <strong>Sign in to talk to Eve.</strong>
                <span>The agent uses the same protected league data as these pages.</span>
              </div>
            ) : agent.data.messages.length === 0 ? (
              <div className={styles.emptyChat}>
                <strong>Ask from anywhere.</strong>
                <span>
                  The current route is attached to each turn so Eve knows what you are reviewing.
                </span>
              </div>
            ) : (
              agent.data.messages.map((item) => (
                <article
                  className={item.role === 'user' ? styles.userMessage : styles.agentMessage}
                  key={item.id}
                >
                  <small>{item.role === 'user' ? 'You' : 'Eve'}</small>
                  {item.parts.map((part, index) =>
                    part.type === 'text' ? <p key={index}>{part.text}</p> : null,
                  )}
                </article>
              ))
            )}
          </div>

          {agent.error ? <p className={styles.chatError}>{agent.error.message}</p> : null}

          <form className={styles.composer} onSubmit={sendMessage}>
            <label htmlFor="eve-message">Message Eve</label>
            <div>
              <textarea
                disabled={!chatEnabled || isResuming}
                id="eve-message"
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={
                  chatEnabled ? 'Ask about a player, team, or price…' : 'Sign in to chat'
                }
                rows={2}
                value={message}
              />
              <button disabled={!chatEnabled || isResuming || message.trim().length === 0}>
                {isBusy ? 'Steer' : 'Send'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </EveChatContext.Provider>
  );
}
