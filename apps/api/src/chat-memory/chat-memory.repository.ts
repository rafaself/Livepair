import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  CreateLiveSessionRequest,
  DurableChatSummaryRecord,
  EndLiveSessionRequest,
  LiveSessionRecord,
  RehydrationPacketContextState,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { parsePersistedContextStateSnapshot } from './chat-memory.context-state';
import {
  ChatMemoryNotFoundError,
} from './chat-memory.errors';
import {
  buildEndedLiveSessionRecord,
  buildUpdatedLiveSessionRecord,
} from './chat-memory.live-session-state';
import {
  normalizeContentText,
  normalizeTitle,
} from './chat-memory.normalization';

const PG_UNIQUE_VIOLATION = '23505';
const CURRENT_CHAT_CONSTRAINT = 'idx_chats_current';

type TimestampValue = Date | string;

type ChatRow = {
  id: string;
  title: string | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
  is_current: boolean;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessageRecord['role'];
  content_text: string;
  created_at: TimestampValue;
  sequence: number;
};

type LiveSessionRow = {
  id: string;
  chat_id: string;
  started_at: TimestampValue;
  ended_at: TimestampValue | null;
  status: LiveSessionRecord['status'];
  ended_reason: string | null;
  resumption_handle: string | null;
  last_resumption_update_at: TimestampValue | null;
  restorable: boolean;
  invalidated_at: TimestampValue | null;
  invalidation_reason: string | null;
  summary_snapshot: string | null;
  context_state_snapshot: unknown;
};

type ChatSummaryRow = {
  chat_id: string;
  schema_version: number;
  source: string;
  summary_text: string;
  covered_through_message_sequence: number;
  updated_at: TimestampValue;
};

type SequenceAllocationRow = {
  sequence: number;
};

type PgErrorLike = {
  code?: string;
  constraint?: string;
};

export type ChatMemoryRepository = {
  withTransaction<TResult>(
    operation: (repository: ChatMemoryRepository) => Promise<TResult>,
  ): Promise<TResult>;
  createChat(request?: CreateChatRequest): Promise<ChatRecord>;
  getChat(chatId: ChatId): Promise<ChatRecord | null>;
  getOrCreateCurrentChat(): Promise<ChatRecord>;
  listChats(): Promise<ChatRecord[]>;
  listMessages(chatId: ChatId): Promise<ChatMessageRecord[]>;
  getChatSummary(chatId: ChatId): Promise<DurableChatSummaryRecord | null>;
  appendMessage(request: AppendChatMessageRequest): Promise<ChatMessageRecord>;
  createLiveSession(request: CreateLiveSessionRequest): Promise<LiveSessionRecord>;
  listLiveSessions(chatId: ChatId): Promise<LiveSessionRecord[]>;
  upsertChatSummary(summary: DurableChatSummaryRecord): Promise<DurableChatSummaryRecord>;
  updateLiveSession(request: UpdateLiveSessionRequest): Promise<LiveSessionRecord>;
  endLiveSession(request: EndLiveSessionRequest): Promise<LiveSessionRecord>;
};

function isConstraintViolation(
  error: unknown,
  constraint: string,
): error is PgErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const pgError = error as PgErrorLike;
  return pgError.code === PG_UNIQUE_VIOLATION && pgError.constraint === constraint;
}

function toIsoString(value: TimestampValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIsoString(value: TimestampValue | null): string | null {
  return value === null ? null : toIsoString(value);
}

function toChatRecord(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    isCurrent: row.is_current,
  };
}

function toChatMessageRecord(row: MessageRow): ChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    contentText: row.content_text,
    createdAt: toIsoString(row.created_at),
    sequence: row.sequence,
  };
}

function toDurableChatSummaryRecord(row: ChatSummaryRow): DurableChatSummaryRecord {
  return {
    chatId: row.chat_id,
    schemaVersion: row.schema_version,
    source: row.source,
    summaryText: row.summary_text,
    coveredThroughSequence: row.covered_through_message_sequence,
    updatedAt: toIsoString(row.updated_at),
  };
}

function toContextStateSnapshot(
  value: unknown,
): RehydrationPacketContextState | null | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parsePersistedContextStateSnapshot(value);
}

function toLiveSessionRecord(row: LiveSessionRow): LiveSessionRecord {
  const record: LiveSessionRecord = {
    id: row.id,
    chatId: row.chat_id,
    startedAt: toIsoString(row.started_at),
    endedAt: toOptionalIsoString(row.ended_at),
    status: row.status,
    endedReason: row.ended_reason,
    resumptionHandle: row.resumption_handle,
    lastResumptionUpdateAt: toOptionalIsoString(row.last_resumption_update_at),
    restorable: row.restorable,
    invalidatedAt: toOptionalIsoString(row.invalidated_at),
    invalidationReason: row.invalidation_reason,
  };

  if (row.summary_snapshot !== null) {
    record.summarySnapshot = row.summary_snapshot;
  }

  const contextStateSnapshot = toContextStateSnapshot(row.context_state_snapshot);
  if (contextStateSnapshot !== undefined && contextStateSnapshot !== null) {
    record.contextStateSnapshot = contextStateSnapshot;
  }

  return record;
}

@Injectable()
export class PostgresChatMemoryRepository implements ChatMemoryRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    @Optional()
    private readonly client: PoolClient | null = null,
  ) {}

  async withTransaction<TResult>(
    operation: (repository: ChatMemoryRepository) => Promise<TResult>,
  ): Promise<TResult> {
    if (this.client !== null) {
      return operation(this);
    }

    const client = await this.databaseService.connect();

    try {
      await client.query('BEGIN');
      const transactionalRepository = new PostgresChatMemoryRepository(
        this.databaseService,
        client,
      );
      const result = await operation(transactionalRepository);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createChat(request?: CreateChatRequest): Promise<ChatRecord> {
    if (this.client === null) {
      return this.withCurrentChatRetry(() =>
        this.withTransaction((repository) => repository.createChat(request)),
      );
    }

    const timestamp = new Date().toISOString();
    const insertedChat = await this.executeQuery<ChatRow>(
      `
        UPDATE chats
        SET is_current = false
        WHERE is_current
      `,
    ).then(async () =>
      this.executeQuery<ChatRow>(
        `
          INSERT INTO chats (id, title, created_at, updated_at, is_current)
          VALUES ($1, $2, $3, $4, true)
          RETURNING id, title, created_at, updated_at, is_current
        `,
        [randomUUID(), normalizeTitle(request?.title), timestamp, timestamp],
      ),
    );

    return toChatRecord(insertedChat.rows[0]!);
  }

  async getChat(chatId: ChatId): Promise<ChatRecord | null> {
    const queryResult = await this.executeQuery<ChatRow>(
      `
        SELECT id, title, created_at, updated_at, is_current
        FROM chats
        WHERE id = $1
      `,
      [chatId],
    );

    return queryResult.rowCount === 0 ? null : toChatRecord(queryResult.rows[0]!);
  }

  async getOrCreateCurrentChat(): Promise<ChatRecord> {
    if (this.client === null) {
      return this.withCurrentChatRetry(() =>
        this.withTransaction((repository) => repository.getOrCreateCurrentChat()),
      );
    }

    const existingCurrentChat = await this.executeQuery<ChatRow>(
      `
        SELECT id, title, created_at, updated_at, is_current
        FROM chats
        WHERE is_current
        LIMIT 1
      `,
    );

    if (existingCurrentChat.rowCount !== 0) {
      return toChatRecord(existingCurrentChat.rows[0]!);
    }

    return this.createChat();
  }

  async listChats(): Promise<ChatRecord[]> {
    const queryResult = await this.executeQuery<ChatRow>(
      `
        SELECT id, title, created_at, updated_at, is_current
        FROM chats
        ORDER BY updated_at DESC, id DESC
      `,
    );

    return queryResult.rows.map((row) => toChatRecord(row));
  }

  async listMessages(chatId: ChatId): Promise<ChatMessageRecord[]> {
    const queryResult = await this.executeQuery<MessageRow>(
      `
        SELECT id, chat_id, role, content_text, created_at, sequence
        FROM messages
        WHERE chat_id = $1
        ORDER BY sequence ASC, id ASC
      `,
      [chatId],
    );

    return queryResult.rows.map((row) => toChatMessageRecord(row));
  }

  async getChatSummary(chatId: ChatId): Promise<DurableChatSummaryRecord | null> {
    const queryResult = await this.executeQuery<ChatSummaryRow>(
      `
        SELECT
          chat_id,
          schema_version,
          source,
          summary_text,
          covered_through_message_sequence,
          updated_at
        FROM chat_summaries
        WHERE chat_id = $1
      `,
      [chatId],
    );

    return queryResult.rowCount === 0
      ? null
      : toDurableChatSummaryRecord(queryResult.rows[0]!);
  }

  async appendMessage(request: AppendChatMessageRequest): Promise<ChatMessageRecord> {
    if (this.client === null) {
      return this.withTransaction((repository) => repository.appendMessage(request));
    }

    const createdAt = new Date().toISOString();
    const normalizedContentText = normalizeContentText(request.contentText);
    const sequenceResult = await this.executeQuery<SequenceAllocationRow>(
      `
        UPDATE chats
        SET
          updated_at = $2,
          next_message_sequence = next_message_sequence + 1
        WHERE id = $1
        RETURNING next_message_sequence - 1 AS sequence
      `,
      [request.chatId, createdAt],
    );

    if (sequenceResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Chat', request.chatId);
    }

    const messageId = randomUUID();
    const insertResult = await this.executeQuery<MessageRow>(
      `
        INSERT INTO messages (id, chat_id, role, content_text, created_at, sequence)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, chat_id, role, content_text, created_at, sequence
      `,
      [
        messageId,
        request.chatId,
        request.role,
        normalizedContentText,
        createdAt,
        sequenceResult.rows[0]!.sequence,
      ],
    );

    return toChatMessageRecord(insertResult.rows[0]!);
  }

  async createLiveSession(request: CreateLiveSessionRequest): Promise<LiveSessionRecord> {
    const chat = await this.getChat(request.chatId);

    if (chat === null) {
      throw new ChatMemoryNotFoundError('Chat', request.chatId);
    }

    const insertResult = await this.executeQuery<LiveSessionRow>(
      `
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
        )
        VALUES ($1, $2, $3, NULL, 'active', NULL, NULL, NULL, false, NULL, NULL, NULL, NULL)
        RETURNING
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
      `,
      [randomUUID(), request.chatId, request.startedAt ?? new Date().toISOString()],
    );

    return toLiveSessionRecord(insertResult.rows[0]!);
  }

  async listLiveSessions(chatId: ChatId): Promise<LiveSessionRecord[]> {
    const queryResult = await this.executeQuery<LiveSessionRow>(
      `
        SELECT
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
        WHERE chat_id = $1
        ORDER BY started_at DESC, id DESC
      `,
      [chatId],
    );

    return queryResult.rows.map((row) => toLiveSessionRecord(row));
  }

  async upsertChatSummary(summary: DurableChatSummaryRecord): Promise<DurableChatSummaryRecord> {
    const chat = await this.getChat(summary.chatId);

    if (chat === null) {
      throw new ChatMemoryNotFoundError('Chat', summary.chatId);
    }

    await this.executeQuery(
      `
        INSERT INTO chat_summaries (
          chat_id,
          schema_version,
          source,
          summary_text,
          covered_through_message_sequence,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (chat_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          source = EXCLUDED.source,
          summary_text = EXCLUDED.summary_text,
          covered_through_message_sequence = EXCLUDED.covered_through_message_sequence,
          updated_at = EXCLUDED.updated_at
      `,
      [
        summary.chatId,
        summary.schemaVersion,
        summary.source,
        summary.summaryText,
        summary.coveredThroughSequence,
        summary.updatedAt,
      ],
    );

    return summary;
  }

  async updateLiveSession(request: UpdateLiveSessionRequest): Promise<LiveSessionRecord> {
    if (this.client === null) {
      return this.withTransaction((repository) => repository.updateLiveSession(request));
    }

    const existingLiveSession = await this.getLiveSessionForUpdate(request.id);
    const updatedLiveSession = buildUpdatedLiveSessionRecord(existingLiveSession, request);
    const updateResult = await this.executeQuery<LiveSessionRow>(
      `
        UPDATE live_sessions
        SET
          resumption_handle = $2,
          last_resumption_update_at = $3,
          restorable = $4,
          invalidated_at = $5,
          invalidation_reason = $6,
          summary_snapshot = $7,
          context_state_snapshot = $8
        WHERE id = $1
        RETURNING
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
      `,
      [
        updatedLiveSession.id,
        updatedLiveSession.resumptionHandle,
        updatedLiveSession.lastResumptionUpdateAt,
        updatedLiveSession.restorable,
        updatedLiveSession.invalidatedAt,
        updatedLiveSession.invalidationReason,
        updatedLiveSession.summarySnapshot ?? null,
        updatedLiveSession.contextStateSnapshot ?? null,
      ],
    );

    return toLiveSessionRecord(updateResult.rows[0]!);
  }

  async endLiveSession(request: EndLiveSessionRequest): Promise<LiveSessionRecord> {
    if (this.client === null) {
      return this.withTransaction((repository) => repository.endLiveSession(request));
    }

    const existingLiveSession = await this.getLiveSessionForUpdate(request.id);
    const endedLiveSession = buildEndedLiveSessionRecord(existingLiveSession, request);
    const updateResult = await this.executeQuery<LiveSessionRow>(
      `
        UPDATE live_sessions
        SET
          ended_at = $2,
          status = $3,
          ended_reason = $4,
          resumption_handle = NULL,
          last_resumption_update_at = $5,
          restorable = false,
          invalidated_at = $6,
          invalidation_reason = $7
        WHERE id = $1
        RETURNING
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
      `,
      [
        endedLiveSession.id,
        endedLiveSession.endedAt,
        endedLiveSession.status,
        endedLiveSession.endedReason,
        endedLiveSession.lastResumptionUpdateAt,
        endedLiveSession.invalidatedAt,
        endedLiveSession.invalidationReason,
      ],
    );

    return toLiveSessionRecord(updateResult.rows[0]!);
  }

  private async withCurrentChatRetry<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!isConstraintViolation(error, CURRENT_CHAT_CONSTRAINT) || attempt === 2) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async getLiveSessionForUpdate(id: string): Promise<LiveSessionRecord> {
    const queryResult = await this.executeQuery<LiveSessionRow>(
      `
        SELECT
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
        WHERE id = $1
        FOR UPDATE
      `,
      [id],
    );

    if (queryResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Live session', id);
    }

    return toLiveSessionRecord(queryResult.rows[0]!);
  }

  private async executeQuery<TResult extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TResult>> {
    if (this.client !== null) {
      return this.client.query<TResult>(text, values ? [...values] : undefined);
    }

    return this.databaseService.query<TResult>(text, values);
  }
}
