-- SMTP delivery for several unanswered members can exceed ten seconds.
-- Keep the scheduled HTTP request open long enough to receive the result.
select cron.schedule('sdbp-governance-deadline-notifications', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sdbp_governance_project_url') || '/functions/v1/governance-deadlines',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sdbp-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sdbp_governance_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
