import { describe, expect, it } from 'vitest';

import {
  createEveConversationHistory,
  loadEveConversationHistory,
  saveEveConversationHistory,
  saveEveConversationSession,
  selectEveConversation,
  startNewEveConversation,
  titleEveConversation,
} from './eve-conversation-history';

const storageKey = 'eve-history-test';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe('Eve conversation history', () => {
  it('restores a saved Eve session after a refresh', () => {
    const storage = createStorage();
    const initial = createEveConversationHistory('2026-09-18T12:00:00.000Z', 'chat-1');
    const titled = titleEveConversation(
      initial,
      'chat-1',
      'Build a playoff-caliber auction plan',
      '2026-09-18T12:01:00.000Z',
    );
    const saved = saveEveConversationSession(
      titled,
      'chat-1',
      { sessionId: 'eve-session-1', streamIndex: 8 },
      '2026-09-18T12:02:00.000Z',
    );

    saveEveConversationHistory(storage, storageKey, saved);

    expect(loadEveConversationHistory(storage, storageKey)).toEqual({
      activeConversationId: 'chat-1',
      conversations: [
        {
          createdAt: '2026-09-18T12:00:00.000Z',
          events: [],
          id: 'chat-1',
          session: { sessionId: 'eve-session-1', streamIndex: 0 },
          title: 'Build a playoff-caliber auction plan',
          updatedAt: '2026-09-18T12:02:00.000Z',
        },
      ],
      version: 1,
    });
  });

  it('keeps an existing thread when starting and selecting another conversation', () => {
    const initial = saveEveConversationSession(
      createEveConversationHistory('2026-09-18T12:00:00.000Z', 'chat-1'),
      'chat-1',
      { sessionId: 'eve-session-1', streamIndex: 2 },
    );
    const next = startNewEveConversation(initial, '2026-09-18T13:00:00.000Z', 'chat-2');

    expect(next.activeConversationId).toBe('chat-2');
    expect(next.conversations.map((conversation) => conversation.id)).toEqual(['chat-2', 'chat-1']);
    expect(selectEveConversation(next, 'chat-1').activeConversationId).toBe('chat-1');
  });

  it('recovers safely from malformed browser storage', () => {
    const storage = createStorage();
    storage.setItem(storageKey, '{not-json');

    const history = loadEveConversationHistory(storage, storageKey, '2026-09-18T14:00:00.000Z');

    expect(history.conversations).toHaveLength(1);
    expect(history.conversations[0].title).toBe('New conversation');
  });
});
