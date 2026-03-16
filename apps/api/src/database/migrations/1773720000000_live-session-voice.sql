-- Up Migration

ALTER TABLE live_sessions
ADD COLUMN voice text;

ALTER TABLE live_sessions
ADD CONSTRAINT live_sessions_voice_check CHECK (
  voice IS NULL OR voice IN ('Puck', 'Kore', 'Aoede')
);

-- Down Migration

ALTER TABLE live_sessions
DROP CONSTRAINT live_sessions_voice_check;

ALTER TABLE live_sessions
DROP COLUMN voice;
