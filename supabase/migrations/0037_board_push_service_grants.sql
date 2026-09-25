-- The push sender uses the service role, which bypasses RLS but still needs
-- explicit table privileges for the tables introduced in 0036.
grant select, delete on table public.board_push_subscriptions to service_role;
grant select, insert, delete on table public.board_push_claims to service_role;
