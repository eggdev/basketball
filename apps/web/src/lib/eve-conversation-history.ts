import type { ClientSessionState, MessageStreamEvent } from 'eve/client';

export interface EveConversation {
  readonly createdAt: string;
  readonly events: readonly MessageStreamEvent[];
  readonly id: string;
  readonly session?: ClientSessionState;
  readonly title: string;
  readonly updatedAt: string;
}

export interface EveConversationHistory {
  readonly activeConversationId: string;
  readonly conversations: readonly EveConversation[];
  readonly version: 1;
}

type ConversationStorage = Pick<Storage, 'getItem' | 'setItem'>;

const historyVersion = 1;
const maximumConversationCount = 30;
const untitledConversation = 'New conversation';

const createConversationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `eve-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getEveConversationStorageKey = (viewerId: string | undefined): string =>
  `fantasy-basketball:eve-conversations:v1:${viewerId ?? 'local-development'}`;

export const createEveConversation = (
  now = new Date().toISOString(),
  id = createConversationId(),
): EveConversation => ({
  createdAt: now,
  events: [],
  id,
  title: untitledConversation,
  updatedAt: now,
});

export const createEveConversationHistory = (
  now = new Date().toISOString(),
  id = createConversationId(),
): EveConversationHistory => {
  const conversation = createEveConversation(now, id);
  return {
    activeConversationId: conversation.id,
    conversations: [conversation],
    version: historyVersion,
  };
};

const isSession = (value: unknown): value is ClientSessionState => {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.sessionId === 'string' &&
    Number.isInteger(session.streamIndex) &&
    Number(session.streamIndex) >= 0
  );
};

const isEvent = (value: unknown): value is MessageStreamEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.type !== 'string' || typeof event.meta !== 'object' || event.meta === null) {
    return false;
  }
  return typeof (event.meta as Record<string, unknown>).id === 'string';
};

const parseConversation = (value: unknown): EveConversation | null => {
  if (typeof value !== 'object' || value === null) return null;
  const conversation = value as Record<string, unknown>;
  if (
    typeof conversation.id !== 'string' ||
    typeof conversation.title !== 'string' ||
    typeof conversation.createdAt !== 'string' ||
    typeof conversation.updatedAt !== 'string' ||
    !Array.isArray(conversation.events) ||
    !conversation.events.every(isEvent) ||
    (conversation.session !== undefined && !isSession(conversation.session))
  ) {
    return null;
  }

  return {
    createdAt: conversation.createdAt,
    events: conversation.events,
    id: conversation.id,
    ...(conversation.session === undefined ? {} : { session: conversation.session }),
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  };
};

export const loadEveConversationHistory = (
  storage: ConversationStorage,
  storageKey: string,
  now = new Date().toISOString(),
): EveConversationHistory => {
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) return createEveConversationHistory(now);

    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null) return createEveConversationHistory(now);
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== historyVersion || !Array.isArray(candidate.conversations)) {
      return createEveConversationHistory(now);
    }

    const conversations = candidate.conversations
      .map(parseConversation)
      .filter((conversation): conversation is EveConversation => conversation !== null)
      .slice(0, maximumConversationCount);
    if (conversations.length === 0) return createEveConversationHistory(now);

    const activeConversationId =
      typeof candidate.activeConversationId === 'string' &&
      conversations.some((conversation) => conversation.id === candidate.activeConversationId)
        ? candidate.activeConversationId
        : conversations[0].id;

    return { activeConversationId, conversations, version: historyVersion };
  } catch {
    return createEveConversationHistory(now);
  }
};

export const saveEveConversationHistory = (
  storage: ConversationStorage,
  storageKey: string,
  history: EveConversationHistory,
): void => {
  try {
    storage.setItem(storageKey, JSON.stringify(history));
  } catch {
    // A browser may deny storage or exhaust its quota. Eve remains usable for
    // the active tab even when history cannot be persisted.
  }
};

export const startNewEveConversation = (
  history: EveConversationHistory,
  now = new Date().toISOString(),
  id = createConversationId(),
): EveConversationHistory => {
  const conversation = createEveConversation(now, id);
  const retained = history.conversations.filter(
    (item) => item.session !== undefined || item.events.length > 0,
  );
  return {
    activeConversationId: conversation.id,
    conversations: [conversation, ...retained].slice(0, maximumConversationCount),
    version: historyVersion,
  };
};

export const selectEveConversation = (
  history: EveConversationHistory,
  conversationId: string,
): EveConversationHistory =>
  history.conversations.some((conversation) => conversation.id === conversationId)
    ? { ...history, activeConversationId: conversationId }
    : history;

export const titleEveConversation = (
  history: EveConversationHistory,
  conversationId: string,
  message: string,
  now = new Date().toISOString(),
): EveConversationHistory =>
  updateEveConversation(history, conversationId, (conversation) => ({
    ...conversation,
    title:
      conversation.title === untitledConversation
        ? `${message.replaceAll(/\s+/g, ' ').trim().slice(0, 56)}${message.trim().length > 56 ? '…' : ''}`
        : conversation.title,
    updatedAt: now,
  }));

export const saveEveConversationSession = (
  history: EveConversationHistory,
  conversationId: string,
  session: ClientSessionState | undefined,
  now = new Date().toISOString(),
): EveConversationHistory => {
  if (session === undefined) return history;

  return updateEveConversation(history, conversationId, (conversation) => {
    if (conversation.session?.sessionId === session.sessionId) return conversation;
    return {
      ...conversation,
      // Starting at zero is safe if a refresh happens before the final event
      // snapshot is stored; Eve will replay and deduplicate the durable stream.
      session: { sessionId: session.sessionId, streamIndex: 0 },
      updatedAt: now,
    };
  });
};

export const saveEveConversationSnapshot = (
  history: EveConversationHistory,
  conversationId: string,
  snapshot: {
    readonly events: readonly MessageStreamEvent[];
    readonly session: ClientSessionState | undefined;
  },
  now = new Date().toISOString(),
): EveConversationHistory =>
  updateEveConversation(history, conversationId, (conversation) => ({
    ...conversation,
    events: snapshot.events,
    ...(snapshot.session === undefined ? {} : { session: snapshot.session }),
    updatedAt: now,
  }));

const updateEveConversation = (
  history: EveConversationHistory,
  conversationId: string,
  update: (conversation: EveConversation) => EveConversation,
): EveConversationHistory => {
  let changed = false;
  const conversations = history.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    const next = update(conversation);
    changed ||= next !== conversation;
    return next;
  });

  return changed ? { ...history, conversations } : history;
};
