-- Once per day, 07:00 UTC (09:00 summer / 08:00 winter in Slovenia).
-- Reuse the existing secured Vault cron token validated by the Edge Function.
select cron.schedule(
 'sdbp-daily-attention-digest',
 '0 7 * * *',
 $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='sdbp_governance_project_url') || '/functions/v1/daily-attention-digest',
   headers := jsonb_build_object('Content-Type','application/json',
      'x-sdbp-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='sdbp_governance_cron_token')),
   body := '{}'::jsonb,
   timeout_milliseconds := 120000
 );
 $job$
);
