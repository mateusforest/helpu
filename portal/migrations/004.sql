-- Operating orders reuse records; attempts reuse jobs; events reuse conversation_events.
CREATE INDEX IF NOT EXISTS records_operation ON records(org_id,json_extract(data,'$.operationId'));
CREATE INDEX IF NOT EXISTS operations_thread ON records(org_id,json_extract(data,'$.threadId')) WHERE kind='operations';
CREATE INDEX IF NOT EXISTS jobs_operation ON jobs(org_id,json_extract(payload,'$.operationId'));
CREATE INDEX IF NOT EXISTS events_operation ON conversation_events(org_id,json_extract(detail,'$.operationId'),created_at);
