-- Invoke the existing Operating Kernel through one durable platform trigger.
-- Keep it inactive until the deployment, its credentials and worker are verified.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE FUNCTION helpu.invoke_cloud_worker() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE worker_secret text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO worker_secret FROM vault.decrypted_secrets
 WHERE name='helpu_worker_secret';
 IF worker_secret IS NULL OR length(worker_secret)<32 THEN
  RAISE EXCEPTION 'Helpu worker credential is not configured';
 END IF;
 SELECT net.http_post(
  url:='https://helpu-seven.vercel.app/api/worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
  body:='{}'::jsonb,
  timeout_milliseconds:=290000
 ) INTO request_id;
 RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION helpu.invoke_cloud_worker() FROM PUBLIC,anon,authenticated,helpu_runtime;

DO $schedule$
DECLARE scheduled_job bigint;
BEGIN
 SELECT cron.schedule('helpu-operating-kernel','* * * * *','SELECT helpu.invoke_cloud_worker();') INTO scheduled_job;
 PERFORM cron.alter_job(scheduled_job,active:=false);
END;
$schedule$;
