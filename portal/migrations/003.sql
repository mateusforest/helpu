CREATE TABLE conversations(id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES companies(id),title TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX conversations_org ON conversations(org_id,updated_at);
CREATE TABLE conversation_messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),org_id TEXT NOT NULL REFERENCES companies(id),role TEXT NOT NULL,text TEXT NOT NULL,attachments TEXT NOT NULL DEFAULT '[]',job_id TEXT,created_at INTEGER NOT NULL);
CREATE INDEX conversation_messages_thread ON conversation_messages(org_id,conversation_id,created_at);
CREATE TABLE conversation_events(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,conversation_id TEXT NOT NULL,job_id TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,detail TEXT,created_at INTEGER NOT NULL);
CREATE INDEX conversation_events_job ON conversation_events(org_id,job_id,created_at);
CREATE UNIQUE INDEX conversation_active ON jobs(org_id,json_extract(payload,'$.conversationId')) WHERE kind='conversation' AND state IN ('queued','working');
CREATE TABLE browser_profiles(org_id TEXT NOT NULL REFERENCES companies(id),channel TEXT NOT NULL,account_label TEXT NOT NULL DEFAULT '',confirmed_at INTEGER,automation_allowed INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(org_id,channel));

ALTER TABLE jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0;

ALTER TABLE browser_profiles ADD COLUMN uncertain_note TEXT;
ALTER TABLE browser_profiles ADD COLUMN pending_job_id TEXT;
