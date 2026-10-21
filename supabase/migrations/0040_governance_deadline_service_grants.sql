-- The scheduled mail sender uses the service role. RLS bypass does not grant
-- table privileges, and ordinary board clients retain their existing access.
grant select on table public.people, public.governance_proposals,
  public.governance_consent_rounds, public.governance_consent_responses
  to service_role;
grant select, insert on table public.governance_consent_deadline_notifications
  to service_role;
