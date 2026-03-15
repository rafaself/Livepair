-- Up Migration

CREATE TABLE chats (
  id uuid PRIMARY KEY,
  title text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  next_message_sequence integer NOT NULL DEFAULT 1,
  CONSTRAINT chats_next_message_sequence_check CHECK (next_message_sequence >= 1)
);

CREATE UNIQUE INDEX idx_chats_current ON chats (is_current) WHERE is_current;
CREATE INDEX idx_chats_updated_at ON chats (updated_at DESC, id DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role text NOT NULL,
  content_text text NOT NULL,
  created_at timestamptz NOT NULL,
  sequence integer NOT NULL,
  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant')),
  CONSTRAINT messages_content_text_check CHECK (btrim(content_text) <> ''),
  CONSTRAINT messages_sequence_check CHECK (sequence > 0),
  CONSTRAINT messages_chat_id_sequence_key UNIQUE (chat_id, sequence)
);

CREATE INDEX idx_messages_chat_sequence ON messages (chat_id, sequence ASC);

CREATE TABLE live_sessions (
  id uuid PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL,
  ended_reason text,
  resumption_handle text,
  last_resumption_update_at timestamptz,
  restorable boolean NOT NULL DEFAULT false,
  invalidated_at timestamptz,
  invalidation_reason text,
  summary_snapshot text,
  context_state_snapshot jsonb,
  CONSTRAINT live_sessions_status_check CHECK (status IN ('active', 'ended', 'failed')),
  CONSTRAINT live_sessions_timing_check CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status IN ('ended', 'failed') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT live_sessions_restorable_invalidation_check CHECK (
    NOT restorable OR invalidated_at IS NULL
  )
);

CREATE INDEX idx_live_sessions_chat_started_at ON live_sessions (chat_id, started_at DESC, id DESC);

CREATE TABLE chat_summaries (
  chat_id uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  schema_version integer NOT NULL,
  source text NOT NULL,
  summary_text text NOT NULL,
  covered_through_message_sequence integer NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT chat_summaries_schema_version_check CHECK (schema_version > 0),
  CONSTRAINT chat_summaries_summary_text_check CHECK (btrim(summary_text) <> ''),
  CONSTRAINT chat_summaries_covered_through_sequence_check CHECK (covered_through_message_sequence > 0)
);

CREATE INDEX idx_chat_summaries_updated_at ON chat_summaries (updated_at DESC, chat_id DESC);

-- Down Migration

DROP TABLE chat_summaries;
DROP TABLE live_sessions;
DROP TABLE messages;
DROP TABLE chats;
