-- Up Migration

ALTER TABLE messages
ADD COLUMN answer_metadata jsonb;

-- Down Migration

ALTER TABLE messages
DROP COLUMN answer_metadata;
