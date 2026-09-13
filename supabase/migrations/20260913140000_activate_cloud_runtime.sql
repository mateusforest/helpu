-- Production runtime access. Existing tenant records and their IDs are preserved.
DO $role$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='helpu_runtime') THEN
    CREATE ROLE helpu_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $role$;
GRANT USAGE ON SCHEMA helpu TO helpu_runtime;

CREATE TABLE helpu.auth_attempts(key text PRIMARY KEY,count integer NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE helpu.worker_leases(id text PRIMARY KEY,owner text NOT NULL,expires_at bigint NOT NULL,last_started_at bigint NOT NULL,last_completed_at bigint,last_error text);
ALTER TABLE helpu.conversation_messages ADD COLUMN sequence_id bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE helpu.conversation_events ADD COLUMN sequence_id bigint GENERATED ALWAYS AS IDENTITY;

-- Compatibility functions for the existing parameterized operational queries.
CREATE FUNCTION helpu.json_extract(document text, json_path text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT CASE result WHEN 'true'::jsonb THEN '1' WHEN 'false'::jsonb THEN '0'
    ELSE result #>> '{}' END
  FROM (SELECT document::jsonb #> string_to_array(substr(json_path,3),'.') AS result) value;
$$;
CREATE FUNCTION helpu.json_each(document text, json_path text) RETURNS TABLE(value text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT item #>> '{}' FROM jsonb_array_elements(COALESCE(document::jsonb #> string_to_array(substr(json_path,3),'.'),'[]'::jsonb)) item;
$$;
CREATE FUNCTION helpu.json(document text) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT document::jsonb $$;
CREATE FUNCTION helpu.json_set(document text, json_path text, value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
 SELECT jsonb_set(document::jsonb,string_to_array(substr(json_path,3),'.'),to_jsonb(value),true)::text;
$$;
CREATE FUNCTION helpu.json_set(document text, json_path text, value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
 SELECT jsonb_set(document::jsonb,string_to_array(substr(json_path,3),'.'),value,true)::text;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA helpu FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA helpu TO helpu_runtime;

DO $security$
DECLARE item record;
BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='helpu' AND tablename<>'cloud_imports' LOOP
  EXECUTE format('ALTER TABLE helpu.%I ENABLE ROW LEVEL SECURITY',item.tablename);
  EXECUTE format('ALTER TABLE helpu.%I FORCE ROW LEVEL SECURITY',item.tablename);
  EXECUTE format('CREATE POLICY runtime_access ON helpu.%I TO helpu_runtime USING(true) WITH CHECK(true)',item.tablename);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON helpu.%I TO helpu_runtime',item.tablename);
 END LOOP;
END $security$;
REVOKE ALL ON ALL TABLES IN SCHEMA helpu FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA helpu TO helpu_runtime;
-- portal_migrations is read-only for the runtime. SQL migrations are applied by deployment tooling.
REVOKE INSERT,UPDATE,DELETE ON helpu.portal_migrations FROM helpu_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA helpu REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated;
