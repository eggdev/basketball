'use client';

import { useEveAgent } from 'eve/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useCallback,
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { authClient } from '../lib/auth-client';
import {
  createEveConversationHistory,
  type EveConversation,
  type EveConversationHistory,
  getEveConversationStorageKey,
  loadEveConversationHistory,
  saveEveConversationHistory,
  saveEveConversationSession,
  saveEveConversationSnapshot,
  selectEveConversation,
  startNewEveConversation,
  titleEveConversation,
} from '../lib/eve-conversation-history';
import styles from './app-shell.module.css';
import { ChatMarkdown } from './chat-markdown';

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

interface EveChatFailure {
  readonly detail: string;
  readonly title: string;
}

interface EveRequest {
  readonly context: EvePageContext;
  readonly text: string;
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
    readonly icon: NavigationIconName;
    readonly label: string;
  }>;
}

type NavigationIconName =
  | 'draft'
  | 'league'
  | 'managers'
  | 'players'
  | 'settings'
  | 'trades'
  | 'waivers';

function NavigationIcon({ name }: { readonly name: NavigationIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {name === 'league' ? (
        <>
          <path d="M5 19v-7M12 19V5M19 19V9" />
          <path d="M3 19h18" />
        </>
      ) : name === 'players' ? (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5.5 19c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" />
        </>
      ) : name === 'managers' ? (
        <>
          <circle cx="9" cy="8" r="2.5" />
          <circle cx="16.5" cy="9.5" r="2" />
          <path d="M3.5 19c.6-4 2.5-6 5.5-6 2.8 0 4.7 1.8 5.4 5.2M14 14c3.3-.5 5.5 1.2 6.2 4.5" />
        </>
      ) : name === 'draft' ? (
        <>
          <rect height="16" rx="2" width="14" x="5" y="4" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      ) : name === 'trades' ? (
        <>
          <path d="M4 8h13M14 5l3 3-3 3" />
          <path d="M20 16H7M10 13l-3 3 3 3" />
        </>
      ) : name === 'waivers' ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.7-4 2.6-6 5.5-6 1.7 0 3.1.6 4.1 1.8M17 12v7M13.5 15.5h7" />
        </>
      ) : (
        <>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </>
      )}
    </svg>
  );
}

const navigation: ReadonlyArray<NavigationGroup> = [
  {
    label: 'Research',
    links: [
      { href: '/league', label: 'League', icon: 'league' },
      { href: '/players', label: 'Players', icon: 'players' },
      { href: '/managers', label: 'Managers', icon: 'managers' },
    ],
  },
  {
    label: 'Decision rooms',
    links: [
      { href: '/draft', label: 'Draft', icon: 'draft' },
      { href: '/trades', label: 'Trades', icon: 'trades' },
      { href: '/waivers', label: 'Waivers', icon: 'waivers' },
    ],
  },
  {
    label: 'System',
    links: [{ href: '/settings', label: 'League settings', icon: 'settings' }],
  },
];

const routePrompts: Readonly<Record<string, ReadonlyArray<string>>> = {
  '/draft': [
    'Challenge my active draft plan.',
    'Where does Fantrax ADP diverge from our league market?',
  ],
  '/league': [
    'Find roster-building patterns in the latest complete season.',
    'Which teams found the best auction value?',
  ],
  '/managers': [
    'Which managers repeat the same player targets?',
    'Compare spending styles across the league.',
  ],
  '/players': [
    'Compare player production with our auction market.',
    'Which players look inexpensive in this league?',
  ],
  '/settings': [
    'How do these scoring weights change player value?',
    'Which roster constraints matter most during the auction?',
  ],
  '/trades': [
    'Compare two rosters for a balanced trade.',
    'Which teams have complementary builds?',
  ],
  '/waivers': [
    'What should my streaming strategy optimize for?',
    'Which undrafted performers belong on a watchlist?',
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
const eveHistoryChangeEvent = 'fantasy-basketball:eve-history-change';

const statusLabels = {
  error: 'Needs attention',
  ready: 'Ready',
  resuming: 'Restoring chat',
  streaming: 'Analyzing',
  submitted: 'Connecting',
} as const;

const formatConversationTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));

export const describeEveError = (error: Error | undefined): EveChatFailure | null => {
  if (error === undefined) return null;

  const message = error.message.toLocaleLowerCase();
  if (
    message.includes('free tier') ||
    message.includes('paid credits') ||
    message.includes('gateway-free-tier-model-restricted')
  ) {
    return {
      detail:
        'GPT-5.6 Luna requires paid Vercel AI Gateway credits. Top up the Gateway balance, then retry the message.',
      title: 'Luna needs paid Gateway credits',
    };
  }

  if (
    message.includes('customer_verification_required') ||
    message.includes('valid credit card') ||
    message.includes('ai gateway') ||
    message.includes('model call failed') ||
    message.includes('model_call_failed')
  ) {
    return {
      detail:
        'The model provider rejected this turn. Verify Vercel AI Gateway billing or configure OPENAI_API_KEY, then retry the message.',
      title: 'The model provider is unavailable',
    };
  }

  if (
    message.includes('401') ||
    message.includes('authentication') ||
    message.includes('unauthorized')
  ) {
    return {
      detail: 'Your owner session may have expired. Refresh the page and sign in again.',
      title: 'Eve could not verify your session',
    };
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('route')) {
    return {
      detail: 'The Eve service could not be reached. Your message is available to retry.',
      title: 'The agent connection was interrupted',
    };
  }

  return {
    detail: 'The turn did not complete. Start a fresh session and retry the message.',
    title: 'Eve could not finish that request',
  };
};

export const getLatestEveTurnError = (
  events: ReturnType<typeof useEveAgent>['events'],
): Error | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === 'turn.failed') {
      return new Error(`${event.data.code}: ${event.data.message}`);
    }

    if (
      event.type === 'turn.completed' ||
      event.type === 'turn.cancelled' ||
      event.type === 'message.received'
    ) {
      return undefined;
    }
  }

  return undefined;
};

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
  const storageKey = getEveConversationStorageKey(viewer?.id);
  const subscribeToHistory = useCallback(
    (onChange: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === storageKey) onChange();
      };
      const handleLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === storageKey) onChange();
      };
      window.addEventListener('storage', handleStorage);
      window.addEventListener(eveHistoryChangeEvent, handleLocalChange);
      return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(eveHistoryChangeEvent, handleLocalChange);
      };
    },
    [storageKey],
  );
  const getHistorySnapshot = useCallback(
    () => window.localStorage.getItem(storageKey) ?? '',
    [storageKey],
  );
  const serializedHistory = useSyncExternalStore(
    subscribeToHistory,
    getHistorySnapshot,
    () => null,
  );
  const fallbackHistory = useMemo(
    () =>
      createEveConversationHistory(
        '1970-01-01T00:00:00.000Z',
        `pending-${viewer?.id ?? 'local-development'}`,
      ),
    [viewer?.id],
  );
  const history = useMemo(() => {
    if (serializedHistory === null || serializedHistory === '') return fallbackHistory;
    return loadEveConversationHistory(
      { getItem: () => serializedHistory, setItem: () => undefined },
      storageKey,
    );
  }, [fallbackHistory, serializedHistory, storageKey]);
  const historyReady = serializedHistory !== null;

  const updateHistory = useCallback(
    (update: (current: EveConversationHistory) => EveConversationHistory) => {
      const persisted = window.localStorage.getItem(storageKey);
      const current =
        persisted === null ? history : loadEveConversationHistory(window.localStorage, storageKey);
      const next = update(current);
      saveEveConversationHistory(window.localStorage, storageKey, next);
      window.dispatchEvent(new CustomEvent(eveHistoryChangeEvent, { detail: storageKey }));
    },
    [history, storageKey],
  );

  const activeConversation =
    history.conversations.find(
      (conversation) => conversation.id === history.activeConversationId,
    ) ?? history.conversations[0];

  return (
    <AppShellRuntime
      conversation={activeConversation}
      conversationHistory={history.conversations}
      historyReady={historyReady}
      key={historyReady ? activeConversation.id : 'hydrating'}
      onConversationPrompt={(conversationId, message) =>
        updateHistory((current) => titleEveConversation(current, conversationId, message))
      }
      onConversationSession={(conversationId, session) =>
        updateHistory((current) => saveEveConversationSession(current, conversationId, session))
      }
      onConversationSnapshot={(conversationId, snapshot) =>
        updateHistory((current) => saveEveConversationSnapshot(current, conversationId, snapshot))
      }
      onNewConversation={() => updateHistory(startNewEveConversation)}
      onSelectConversation={(conversationId) =>
        updateHistory((current) => selectEveConversation(current, conversationId))
      }
      viewer={viewer}
    >
      {children}
    </AppShellRuntime>
  );
}

interface AppShellRuntimeProps {
  readonly children: ReactNode;
  readonly conversation: EveConversation;
  readonly conversationHistory: readonly EveConversation[];
  readonly historyReady: boolean;
  readonly onConversationPrompt: (conversationId: string, message: string) => void;
  readonly onConversationSession: (
    conversationId: string,
    session: ReturnType<typeof useEveAgent>['session'],
  ) => void;
  readonly onConversationSnapshot: (
    conversationId: string,
    snapshot: Pick<ReturnType<typeof useEveAgent>, 'events' | 'session'>,
  ) => void;
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly viewer: AppViewer | null;
}

function AppShellRuntime({
  children,
  conversation,
  conversationHistory,
  historyReady,
  onConversationPrompt,
  onConversationSession,
  onConversationSnapshot,
  onNewConversation,
  onSelectConversation,
  viewer,
}: AppShellRuntimeProps) {
  const pathname = usePathname();
  const agent = useEveAgent({
    initialEvents: conversation.events,
    initialSession: conversation.session,
    onFinish: (snapshot) => onConversationSnapshot(conversation.id, snapshot),
    onSessionChange: (session) => onConversationSession(conversation.id, session),
    resume: historyReady && conversation.session !== undefined,
  });
  const [message, setMessage] = useState('');
  const compactLayout = useSyncExternalStore(
    subscribeToCompactLayout,
    isCompactLayout,
    () => false,
  );
  const [desktopChatOpen, setDesktopChatOpen] = useState(true);
  const [compactChatOpen, setCompactChatOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<EveRequest | null>(null);
  const chatEnabled = viewer !== null || process.env.NODE_ENV !== 'production';
  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const isResuming = agent.status === 'resuming';
  const turnError = isBusy || isResuming ? undefined : getLatestEveTurnError(agent.events);
  const chatFailure = describeEveError(agent.error ?? turnError);
  const promptKey = useMemo(
    () => Object.keys(routePrompts).find((key) => pathname.startsWith(key)) ?? '/players',
    [pathname],
  );
  const savedConversations = useMemo(
    () =>
      [...conversationHistory]
        .filter(
          (item) =>
            item.id === conversation.id || item.session !== undefined || item.events.length > 0,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [conversation.id, conversationHistory],
  );
  const chatOpen = compactLayout ? compactChatOpen : desktopChatOpen;

  const setChatOpen = (open: boolean) => {
    if (compactLayout) setCompactChatOpen(open);
    else setDesktopChatOpen(open);
  };

  const dispatch = (request: EveRequest) => {
    onConversationPrompt(conversation.id, request.text);
    setLastRequest(request);
    setChatOpen(true);
    void agent
      .send(request.text, {
        clientContext: { route: pathname, ...request.context },
        ...(isBusy ? { turnPolicy: 'steer' as const } : {}),
      })
      // useEveAgent projects the failure into agent.error for the UI.
      .catch(() => undefined);
  };

  const send = (text: string, context: EvePageContext = {}) => {
    const trimmed = text.trim();
    if (!chatEnabled || isResuming || trimmed.length === 0) return;
    dispatch({ context, text: trimmed });
  };

  const retryLastRequest = () => {
    if (lastRequest === null || isBusy || isResuming) return;
    dispatch({
      context: lastRequest.context,
      text: lastRequest.text,
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
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
                <path d="M4.5 9.2c4.8.4 8.5 4.1 8.9 8.9M10.6 4.1c.4 4.8 4.1 8.5 8.9 8.9M4.7 15h14.6M9 4.7v14.6" />
              </svg>
            </span>
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
                      <span aria-hidden="true">
                        <NavigationIcon name={link.icon} />
                      </span>
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
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div>
              <strong>{routeTitle(pathname)}</strong>
              <small>Fantrax decision room</small>
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
              <h2>League chat</h2>
            </div>
            <div className={styles.chatActions}>
              <output aria-label="Eve status">
                {chatFailure === null ? statusLabels[agent.status] : 'Needs attention'}
              </output>
              {isBusy ? (
                <button onClick={() => void agent.cancel()} type="button">
                  Stop
                </button>
              ) : null}
              <button
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((open) => !open)}
                type="button"
              >
                History
              </button>
              <button
                onClick={() => {
                  onNewConversation();
                  setHistoryOpen(false);
                }}
                type="button"
              >
                New
              </button>
              <button
                aria-label="Close Eve chat"
                className={styles.closeChat}
                onClick={() => setChatOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </header>

          {historyOpen ? (
            <section aria-label="Eve conversation history" className={styles.chatHistory}>
              <div className={styles.historyHeading}>
                <div>
                  <strong>Recent conversations</strong>
                  <span>Stored in this browser and resumed from Eve.</span>
                </div>
                <button
                  onClick={() => {
                    onNewConversation();
                    setHistoryOpen(false);
                  }}
                  type="button"
                >
                  Start new
                </button>
              </div>
              <div className={styles.historyList}>
                {savedConversations.map((item) => (
                  <button
                    aria-current={item.id === conversation.id ? 'true' : undefined}
                    className={styles.historyItem}
                    key={item.id}
                    onClick={() => {
                      onSelectConversation(item.id);
                      setHistoryOpen(false);
                    }}
                    type="button"
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {item.session === undefined ? 'Not sent yet' : 'Saved conversation'}
                      <time dateTime={item.updatedAt}>
                        {formatConversationTimestamp(item.updatedAt)}
                      </time>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
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
                    <strong>
                      {isResuming ? 'Restoring this conversation…' : 'Start with a question'}
                    </strong>
                    <span>
                      {isResuming
                        ? 'Eve is replaying the durable session.'
                        : 'Eve automatically receives the context from this page.'}
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
                        part.type !== 'text' ? null : item.role === 'assistant' ? (
                          <ChatMarkdown key={index}>{part.text}</ChatMarkdown>
                        ) : (
                          <p key={index}>{part.text}</p>
                        ),
                      )}
                    </article>
                  ))
                )}
                {isBusy ? (
                  <output className={styles.processingStatus}>
                    <span aria-hidden="true" />
                    {agent.status === 'submitted'
                      ? 'Connecting to the analyst…'
                      : 'Analyzing league data…'}
                  </output>
                ) : null}
              </div>

              {chatFailure ? (
                <section className={styles.chatError} role="alert">
                  <div>
                    <strong>{chatFailure.title}</strong>
                    <span>{chatFailure.detail}</span>
                  </div>
                  {lastRequest === null ? null : (
                    <button
                      disabled={isBusy || isResuming}
                      onClick={retryLastRequest}
                      type="button"
                    >
                      Retry last message
                    </button>
                  )}
                </section>
              ) : null}

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
            </>
          )}
        </aside>
      </div>
    </EveChatContext.Provider>
  );
}
