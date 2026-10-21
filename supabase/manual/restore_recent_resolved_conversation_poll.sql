-- One-off recovery for an accidentally resolved conversation tension.
--
-- This deliberately refuses to change anything unless there is exactly ONE tension
-- resolved in the last 6 hours that still has an availability poll.
-- The poll itself is not recreated: it should still exist and will become visible
-- again when the tension returns to needs_sync.

DO $$
DECLARE
  v_count integer;
  v_tension_id uuid;
  v_original_need_note text;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM public.tensions t
  WHERE t.status = 'resolved'
    AND t.resolved_at >= now() - interval '6 hours'
    AND EXISTS (
      SELECT 1
      FROM public.tension_polls p
      WHERE p.tension_id = t.id
    );

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No tension resolved in the last 6 hours with an existing poll was found. Nothing changed.';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'More than one recently resolved tension with a poll was found. Nothing changed; identify the tension explicitly before restoring it.';
  END IF;

  SELECT t.id
    INTO v_tension_id
  FROM public.tensions t
  WHERE t.status = 'resolved'
    AND t.resolved_at >= now() - interval '6 hours'
    AND EXISTS (
      SELECT 1
      FROM public.tension_polls p
      WHERE p.tension_id = t.id
    )
  ORDER BY t.resolved_at DESC
  LIMIT 1;

  SELECT s.message
    INTO v_original_need_note
  FROM public.attention_signals s
  WHERE s.tension_id = v_tension_id
    AND s.signal_type = 'tension_need'
  ORDER BY s.created_at DESC
  LIMIT 1;

  UPDATE public.tensions
  SET status = 'needs_sync',
      resolved_at = NULL,
      resolution_proposed_by = NULL,
      latest_note = coalesce(v_original_need_note, latest_note)
  WHERE id = v_tension_id;

  RAISE NOTICE 'Restored tension % to needs_sync. Existing poll retained.', v_tension_id;
END
$$;
