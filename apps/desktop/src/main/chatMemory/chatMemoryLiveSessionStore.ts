import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  ChatId,
  ChatRecord,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import {
  buildEndedLiveSessionRow,
  buildUpdatedLiveSessionRow,
} from './chatMemoryLiveSessionState';
import type { ChatMemoryRepositoryStatements } from './chatMemoryRepositoryStatements';
import { toLiveSessionRecord } from './rowMappers';
import type { LiveSessionRow } from './rowMappers';

type ChatLookup = (chatId: ChatId) => ChatRecord | null;

function toInsertLiveSessionParameters(row: LiveSessionRow) {
  return {
    id: row.id,
    chatId: row.chat_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    endedReason: row.ended_reason,
    resumptionHandle: row.resumption_handle,
    lastResumptionUpdateAt: row.last_resumption_update_at,
    restorable: row.restorable,
    invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
    summarySnapshot: row.summary_snapshot,
    contextStateSnapshot: row.context_state_snapshot,
  };
}

function toRestoreMetadataParameters(row: LiveSessionRow) {
  return {
    id: row.id,
    resumptionHandle: row.resumption_handle,
    lastResumptionUpdateAt: row.last_resumption_update_at,
    restorable: row.restorable,
    invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
    summarySnapshot: row.summary_snapshot,
    contextStateSnapshot: row.context_state_snapshot,
  };
}

function toEndedStateParameters(row: LiveSessionRow) {
  return {
    id: row.id,
    endedAt: row.ended_at,
    status: row.status,
    endedReason: row.ended_reason,
    lastResumptionUpdateAt: row.last_resumption_update_at,
    invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
  };
}

export type ChatMemoryLiveSessionStore = {
  createLiveSession: (request: CreateLiveSessionRequest) => LiveSessionRecord;
  listLiveSessions: (chatId: ChatId) => LiveSessionRecord[];
  updateLiveSession: (request: UpdateLiveSessionRequest) => LiveSessionRecord;
  endLiveSession: (request: EndLiveSessionRequest) => LiveSessionRecord;
};

export function createChatMemoryLiveSessionStore({
  database,
  statements,
  getChat,
}: {
  database: SqliteDatabase;
  statements: ChatMemoryRepositoryStatements;
  getChat: ChatLookup;
}): ChatMemoryLiveSessionStore {
  const getExistingLiveSessionRow = (liveSessionId: string): LiveSessionRow => {
    const existingRow = statements.selectLiveSessionById.get(liveSessionId) as
      | LiveSessionRow
      | undefined;

    if (!existingRow) {
      throw new Error(`Live session not found: ${liveSessionId}`);
    }

    return existingRow;
  };

  const createLiveSession = database.transaction((input: CreateLiveSessionRequest) => {
    const chat = getChat(input.chatId);

    if (!chat) {
      throw new Error(`Chat not found: ${input.chatId}`);
    }

    const liveSessionRow: LiveSessionRow = {
      id: randomUUID(),
      chat_id: input.chatId,
      started_at: input.startedAt ?? new Date().toISOString(),
      ended_at: null,
      status: 'active',
      ended_reason: null,
      resumption_handle: null,
      last_resumption_update_at: null,
      restorable: 0,
      invalidated_at: null,
      invalidation_reason: null,
      summary_snapshot: null,
      context_state_snapshot: null,
    };

    statements.insertLiveSession.run(toInsertLiveSessionParameters(liveSessionRow));

    return toLiveSessionRecord(liveSessionRow);
  });

  const listLiveSessions = (chatId: ChatId): LiveSessionRecord[] => {
    return (
      statements.listLiveSessionsByChatId.all(chatId) as LiveSessionRow[]
    ).map((row) => toLiveSessionRecord(row));
  };

  const updateLiveSession = database.transaction((input: UpdateLiveSessionRequest) => {
    const nextRow = buildUpdatedLiveSessionRow(getExistingLiveSessionRow(input.id), input);

    statements.updateLiveSessionRestoreMetadata.run(toRestoreMetadataParameters(nextRow));

    return toLiveSessionRecord(nextRow);
  });

  const endLiveSession = database.transaction((input: EndLiveSessionRequest) => {
    const nextRow = buildEndedLiveSessionRow(getExistingLiveSessionRow(input.id), input);

    statements.updateLiveSessionEndState.run(toEndedStateParameters(nextRow));

    return toLiveSessionRecord(nextRow);
  });

  return {
    createLiveSession,
    listLiveSessions,
    updateLiveSession,
    endLiveSession,
  };
}
