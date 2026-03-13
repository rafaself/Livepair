import { randomUUID } from 'node:crypto';
import {
  toChatRecord,
  toChatMessageRecord,
  toDurableChatSummaryRecord,
  toLiveSessionRecord,
} from './rowMappers';
import { normalizeTitle, normalizeContentText } from './chatMemoryNormalization';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  ChatRow,
  ChatSummaryRow,
  LiveSessionRow,
  MessageRow,
} from './rowMappers';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  DurableChatSummaryRecord,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';

export interface ChatMemoryRepository {
  createChat: (request?: CreateChatRequest) => ChatRecord;
  getChat: (chatId: ChatId) => ChatRecord | null;
  getOrCreateCurrentChat: () => ChatRecord;
  listChats: () => ChatRecord[];
  listMessages: (chatId: ChatId) => ChatMessageRecord[];
  getChatSummary: (chatId: ChatId) => DurableChatSummaryRecord | null;
  appendMessage: (request: AppendChatMessageRequest) => ChatMessageRecord;
  createLiveSession: (request: CreateLiveSessionRequest) => LiveSessionRecord;
  listLiveSessions: (chatId: ChatId) => LiveSessionRecord[];
  upsertChatSummary: (summary: DurableChatSummaryRecord) => DurableChatSummaryRecord;
  updateLiveSession: (request: UpdateLiveSessionRequest) => LiveSessionRecord;
  endLiveSession: (request: EndLiveSessionRequest) => LiveSessionRecord;
}

export class SqliteChatMemoryRepository implements ChatMemoryRepository {
  private readonly selectChatByIdStatement;
  private readonly selectCurrentChatStatement;
  private readonly listAllChatsStatement;
  private readonly listMessagesByChatIdStatement;
  private readonly demoteCurrentChatsStatement;
  private readonly insertChatStatement;
  private readonly updateChatTimestampStatement;
  private readonly nextSequenceStatement;
  private readonly insertMessageStatement;
  private readonly selectChatSummaryByChatIdStatement;
  private readonly upsertChatSummaryStatement;
  private readonly listLiveSessionsByChatIdStatement;
  private readonly insertLiveSessionStatement;
  private readonly selectLiveSessionByIdStatement;
  private readonly updateLiveSessionRestoreMetadataStatement;
  private readonly updateLiveSessionEndStateStatement;

  constructor(private readonly database: SqliteDatabase) {
    this.selectChatByIdStatement = database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats WHERE id = ?',
    );
    this.selectCurrentChatStatement = database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats WHERE is_current = 1 LIMIT 1',
    );
    this.listAllChatsStatement = database.prepare(
      'SELECT id, title, created_at, updated_at, is_current FROM chats ORDER BY updated_at DESC, id DESC',
    );
    this.listMessagesByChatIdStatement = database.prepare(
      'SELECT id, chat_id, role, content_text, created_at, sequence FROM messages WHERE chat_id = ? ORDER BY sequence ASC, id ASC',
    );
    this.demoteCurrentChatsStatement = database.prepare(
      'UPDATE chats SET is_current = 0 WHERE is_current = 1',
    );
    this.insertChatStatement = database.prepare(`
      INSERT INTO chats (id, created_at, updated_at, title, is_current)
      VALUES (@id, @createdAt, @updatedAt, @title, @isCurrent)
    `);
    this.updateChatTimestampStatement = database.prepare(
      'UPDATE chats SET updated_at = ? WHERE id = ?',
    );
    this.nextSequenceStatement = database.prepare(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM messages WHERE chat_id = ?',
    );
    this.insertMessageStatement = database.prepare(`
      INSERT INTO messages (id, chat_id, role, content_text, created_at, sequence)
      VALUES (@id, @chatId, @role, @contentText, @createdAt, @sequence)
    `);
    this.selectChatSummaryByChatIdStatement = database.prepare(
      `SELECT
         chat_id,
         schema_version,
         source,
         summary_text,
         covered_through_message_sequence,
         updated_at
       FROM chat_summaries
       WHERE chat_id = ?`,
    );
    this.upsertChatSummaryStatement = database.prepare(`
      INSERT INTO chat_summaries (
        chat_id,
        schema_version,
        source,
        summary_text,
        covered_through_message_sequence,
        updated_at
      ) VALUES (
        @chatId,
        @schemaVersion,
        @source,
        @summaryText,
        @coveredThroughSequence,
        @updatedAt
      )
      ON CONFLICT(chat_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        source = excluded.source,
        summary_text = excluded.summary_text,
        covered_through_message_sequence = excluded.covered_through_message_sequence,
        updated_at = excluded.updated_at
    `);
    this.listLiveSessionsByChatIdStatement = database.prepare(
      `SELECT
         id,
         chat_id,
         started_at,
         ended_at,
         status,
         ended_reason,
         resumption_handle,
         last_resumption_update_at,
         restorable,
         invalidated_at,
         invalidation_reason,
         summary_snapshot,
         context_state_snapshot
       FROM live_sessions
       WHERE chat_id = ?
       ORDER BY started_at DESC, id DESC`,
    );
    this.insertLiveSessionStatement = database.prepare(`
      INSERT INTO live_sessions (
        id,
        chat_id,
        started_at,
        ended_at,
        status,
        ended_reason,
        resumption_handle,
        last_resumption_update_at,
        restorable,
        invalidated_at,
        invalidation_reason,
        summary_snapshot,
        context_state_snapshot
      ) VALUES (
        @id,
        @chatId,
        @startedAt,
        @endedAt,
        @status,
        @endedReason,
        @resumptionHandle,
        @lastResumptionUpdateAt,
        @restorable,
        @invalidatedAt,
        @invalidationReason,
        @summarySnapshot,
        @contextStateSnapshot
      )
    `);
    this.selectLiveSessionByIdStatement = database.prepare(
      `SELECT
         id,
         chat_id,
         started_at,
         ended_at,
         status,
         ended_reason,
         resumption_handle,
         last_resumption_update_at,
         restorable,
         invalidated_at,
         invalidation_reason,
         summary_snapshot,
         context_state_snapshot
       FROM live_sessions
       WHERE id = ?`,
    );
    this.updateLiveSessionRestoreMetadataStatement = database.prepare(`
      UPDATE live_sessions
      SET resumption_handle = @resumptionHandle,
          last_resumption_update_at = @lastResumptionUpdateAt,
          restorable = @restorable,
          invalidated_at = @invalidatedAt,
          invalidation_reason = @invalidationReason,
          summary_snapshot = @summarySnapshot,
          context_state_snapshot = @contextStateSnapshot
      WHERE id = @id
    `);
    this.updateLiveSessionEndStateStatement = database.prepare(`
      UPDATE live_sessions
      SET ended_at = @endedAt,
          status = @status,
          ended_reason = @endedReason,
          resumption_handle = NULL,
          last_resumption_update_at = @lastResumptionUpdateAt,
          restorable = 0,
          invalidated_at = @invalidatedAt,
          invalidation_reason = @invalidationReason
      WHERE id = @id
    `);
  }

  createChat(request?: CreateChatRequest): ChatRecord {
    const createChat = this.database.transaction((input?: CreateChatRequest) => {
      const timestamp = new Date().toISOString();
      const chatRow: ChatRow = {
        id: randomUUID(),
        title: normalizeTitle(input?.title),
        created_at: timestamp,
        updated_at: timestamp,
        is_current: 1,
      };

      this.demoteCurrentChatsStatement.run();
      this.insertChatStatement.run({
        id: chatRow.id,
        createdAt: chatRow.created_at,
        updatedAt: chatRow.updated_at,
        title: chatRow.title,
        isCurrent: chatRow.is_current,
      });

      return toChatRecord(chatRow);
    });

    return createChat(request);
  }

  getChat(chatId: ChatId): ChatRecord | null {
    const row = this.selectChatByIdStatement.get(chatId) as ChatRow | undefined;
    return row ? toChatRecord(row) : null;
  }

  getOrCreateCurrentChat(): ChatRecord {
    const ensureCurrentChat = this.database.transaction(() => {
      const existingRow = this.selectCurrentChatStatement.get() as ChatRow | undefined;

      if (existingRow) {
        return toChatRecord(existingRow);
      }

      return this.createChat();
    });

    return ensureCurrentChat();
  }

  listChats(): ChatRecord[] {
    return (this.listAllChatsStatement.all() as ChatRow[]).map((row) => toChatRecord(row));
  }

  listMessages(chatId: ChatId): ChatMessageRecord[] {
    return (
      this.listMessagesByChatIdStatement.all(chatId) as MessageRow[]
    ).map((row) => toChatMessageRecord(row));
  }

  getChatSummary(chatId: ChatId): DurableChatSummaryRecord | null {
    const row = this.selectChatSummaryByChatIdStatement.get(chatId) as ChatSummaryRow | undefined;
    return row ? toDurableChatSummaryRecord(row) : null;
  }

  appendMessage(request: AppendChatMessageRequest): ChatMessageRecord {
    const appendMessage = this.database.transaction((input: AppendChatMessageRequest) => {
      const chat = this.getChat(input.chatId);

      if (!chat) {
        throw new Error(`Chat not found: ${input.chatId}`);
      }

      const createdAt = new Date().toISOString();
      const nextSequenceRow = this.nextSequenceStatement.get(input.chatId) as {
        nextSequence: number;
      };
      const messageRow: MessageRow = {
        id: randomUUID(),
        chat_id: input.chatId,
        role: input.role,
        content_text: normalizeContentText(input.contentText),
        created_at: createdAt,
        sequence: nextSequenceRow.nextSequence,
      };

      this.insertMessageStatement.run({
        id: messageRow.id,
        chatId: messageRow.chat_id,
        role: messageRow.role,
        contentText: messageRow.content_text,
        createdAt: messageRow.created_at,
        sequence: messageRow.sequence,
      });
      this.updateChatTimestampStatement.run(createdAt, input.chatId);

      return toChatMessageRecord(messageRow);
    });

    return appendMessage(request);
  }

  createLiveSession(request: CreateLiveSessionRequest): LiveSessionRecord {
    const createLiveSession = this.database.transaction((input: CreateLiveSessionRequest) => {
      const chat = this.getChat(input.chatId);

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

      this.insertLiveSessionStatement.run({
        id: liveSessionRow.id,
        chatId: liveSessionRow.chat_id,
        startedAt: liveSessionRow.started_at,
        endedAt: liveSessionRow.ended_at,
        status: liveSessionRow.status,
        endedReason: liveSessionRow.ended_reason,
        resumptionHandle: liveSessionRow.resumption_handle,
        lastResumptionUpdateAt: liveSessionRow.last_resumption_update_at,
        restorable: liveSessionRow.restorable,
        invalidatedAt: liveSessionRow.invalidated_at,
        invalidationReason: liveSessionRow.invalidation_reason,
        summarySnapshot: liveSessionRow.summary_snapshot,
        contextStateSnapshot: liveSessionRow.context_state_snapshot,
      });

      return toLiveSessionRecord(liveSessionRow);
    });

    return createLiveSession(request);
  }

  listLiveSessions(chatId: ChatId): LiveSessionRecord[] {
    return (
      this.listLiveSessionsByChatIdStatement.all(chatId) as LiveSessionRow[]
    ).map((row) => toLiveSessionRecord(row));
  }

  upsertChatSummary(summary: DurableChatSummaryRecord): DurableChatSummaryRecord {
    const existingChat = this.getChat(summary.chatId);

    if (!existingChat) {
      throw new Error(`Chat not found: ${summary.chatId}`);
    }

    this.upsertChatSummaryStatement.run(summary);
    return summary;
  }

  updateLiveSession(request: UpdateLiveSessionRequest): LiveSessionRecord {
    const updateLiveSession = this.database.transaction((input: UpdateLiveSessionRequest) => {
      const existingRow = this.selectLiveSessionByIdStatement.get(input.id) as
        | LiveSessionRow
        | undefined;

      if (!existingRow) {
        throw new Error(`Live session not found: ${input.id}`);
      }

      const didReceiveResumptionMetadata =
        typeof input.resumptionHandle !== 'undefined'
        || typeof input.restorable !== 'undefined'
        || typeof input.invalidatedAt !== 'undefined'
        || typeof input.invalidationReason !== 'undefined';
      const requestedRestorable =
        typeof input.restorable === 'undefined'
          ? existingRow.restorable === 1
          : input.restorable;
      const resumptionHandle =
        requestedRestorable
          ? (
            typeof input.resumptionHandle === 'undefined'
              ? existingRow.resumption_handle
              : input.resumptionHandle
          )
          : null;
      const lastResumptionUpdateAt =
        typeof input.lastResumptionUpdateAt === 'undefined'
          ? didReceiveResumptionMetadata
            ? new Date().toISOString()
            : existingRow.last_resumption_update_at
          : input.lastResumptionUpdateAt;
      const invalidatedAt =
        requestedRestorable
          ? null
          : typeof input.invalidatedAt === 'undefined'
            ? existingRow.invalidated_at ?? (didReceiveResumptionMetadata ? lastResumptionUpdateAt : null)
            : input.invalidatedAt;
      const invalidationReason =
        requestedRestorable
          ? null
          : typeof input.invalidationReason === 'undefined'
            ? existingRow.invalidation_reason
            : input.invalidationReason;
      const summarySnapshot =
        typeof input.summarySnapshot === 'undefined'
          ? existingRow.summary_snapshot
          : input.summarySnapshot;
      const contextStateSnapshot =
        typeof input.contextStateSnapshot === 'undefined'
          ? existingRow.context_state_snapshot
          : input.contextStateSnapshot === null
            ? null
            : JSON.stringify(input.contextStateSnapshot);

      this.updateLiveSessionRestoreMetadataStatement.run({
        id: input.id,
        resumptionHandle,
        lastResumptionUpdateAt,
        restorable: requestedRestorable ? 1 : 0,
        invalidatedAt,
        invalidationReason,
        summarySnapshot,
        contextStateSnapshot,
      });

      return toLiveSessionRecord({
        ...existingRow,
        resumption_handle: resumptionHandle,
        last_resumption_update_at: lastResumptionUpdateAt,
        restorable: requestedRestorable ? 1 : 0,
        invalidated_at: invalidatedAt,
        invalidation_reason: invalidationReason,
        summary_snapshot: summarySnapshot,
        context_state_snapshot: contextStateSnapshot,
      });
    });

    return updateLiveSession(request);
  }

  endLiveSession(request: EndLiveSessionRequest): LiveSessionRecord {
    const endLiveSession = this.database.transaction((input: EndLiveSessionRequest) => {
      const existingRow = this.selectLiveSessionByIdStatement.get(input.id) as
        | LiveSessionRow
        | undefined;

      if (!existingRow) {
        throw new Error(`Live session not found: ${input.id}`);
      }

      const endedAt = input.endedAt ?? new Date().toISOString();
      const endedReason = input.endedReason ?? null;
      const invalidationReason = endedReason ?? existingRow.invalidation_reason;

      this.updateLiveSessionEndStateStatement.run({
        id: input.id,
        endedAt,
        status: input.status,
        endedReason,
        lastResumptionUpdateAt: endedAt,
        invalidatedAt: endedAt,
        invalidationReason,
      });

      return toLiveSessionRecord({
        ...existingRow,
        ended_at: endedAt,
        status: input.status,
        ended_reason: endedReason,
        resumption_handle: null,
        last_resumption_update_at: endedAt,
        restorable: 0,
        invalidated_at: endedAt,
        invalidation_reason: invalidationReason,
      });
    });

    return endLiveSession(request);
  }
}
