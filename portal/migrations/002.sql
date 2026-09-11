CREATE TABLE usage_reservations(job_id TEXT PRIMARY KEY REFERENCES jobs(id),org_id TEXT NOT NULL REFERENCES companies(id),category TEXT NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX usage_org_day ON usage_reservations(org_id,category,day);
CREATE UNIQUE INDEX jobs_content_active ON jobs(org_id,json_extract(payload,'$.contentId')) WHERE kind IN ('image','video','publish') AND state IN ('queued','working','waiting_provider','uncertain');
CREATE UNIQUE INDEX jobs_message_active ON jobs(org_id,json_extract(payload,'$.messageId')) WHERE kind='send' AND state IN ('queued','working','waiting_provider','uncertain');
CREATE UNIQUE INDEX jobs_campaign_active ON jobs(org_id,json_extract(payload,'$.campaignId')) WHERE kind='metaCampaign' AND state IN ('queued','working','waiting_provider','uncertain');
