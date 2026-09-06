-- Anonymous abuse controls.
--
-- Two changes, both narrow:
--
-- 1. create_upload_ticket now refuses to mint more than
--    MAX_OUTSTANDING_TICKETS tickets that are simultaneously unconsumed and
--    unexpired for a single form. Consumed and expired tickets do not count,
--    so the ceiling self-heals as submissions complete or the 30 minute TTL
--    elapses. This bounds storage cost without needing any client identity --
--    we established that no trustworthy client IP is reachable from the RPC
--    context, so a per-IP counter would be spoofable.
--
-- 2. Anonymous callers lose EXECUTE on the two resource-creating public RPCs.
--    They are now reachable only through the `public-anon-gate` Edge Function,
--    which verifies a Cloudflare Turnstile token first and then calls these
--    same functions with the service role. The database keeps all tenant and
--    storage authority: the Edge Function re-implements none of it.

-- ---------------------------------------------------------------------------
-- 1. Outstanding-ticket ceiling
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_upload_ticket(p_form_id UUID)
RETURNS TABLE(ticket_id UUID, path TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id UUID;
  v_path TEXT;
  v_expires TIMESTAMPTZ;
  v_outstanding INT;
  -- A submitter holds one ticket per file only for as long as that upload
  -- takes, so ten concurrent tickets is generous for a legitimate form while
  -- capping an abuser at ten in-flight objects per 30 minute window.
  c_max_outstanding CONSTANT INT := 10;
BEGIN
  IF NOT form_accepts_uploads(p_form_id::text) THEN
    RAISE EXCEPTION 'Form not found or not accepting uploads';
  END IF;

  -- Serialise issuance per form for the remainder of the transaction so two
  -- concurrent callers cannot both read a count of 9 and both insert.
  PERFORM pg_advisory_xact_lock(hashtext('upload_ticket:' || p_form_id::text));

  -- Alias the table: this function's OUT parameters share names with these
  -- columns, so unqualified references would be ambiguous.
  SELECT count(*) INTO v_outstanding
  FROM upload_tickets t
  WHERE t.form_id = p_form_id
    AND t.consumed_at IS NULL
    AND t.expires_at > now();

  IF v_outstanding >= c_max_outstanding THEN
    RAISE EXCEPTION 'Too many uploads in progress for this form. Please finish or retry in a few minutes.'
      USING ERRCODE = '53400';
  END IF;

  v_ticket_id := gen_random_uuid();
  v_path := p_form_id::text || '/' || gen_random_uuid()::text;
  v_expires := now() + interval '30 minutes';

  INSERT INTO upload_tickets (id, form_id, path, expires_at)
  VALUES (v_ticket_id, p_form_id, v_path, v_expires);

  RETURN QUERY SELECT v_ticket_id, v_path, v_expires;
END;
$$;

-- Supports the ceiling count and the cleanup sweep.
CREATE INDEX IF NOT EXISTS idx_upload_tickets_outstanding
  ON upload_tickets (form_id, expires_at)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Close the direct anonymous path
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.create_upload_ticket(UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_form(UUID, JSONB, JSONB) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_upload_ticket(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_form(UUID, JSONB, JSONB) TO service_role;

COMMENT ON FUNCTION public.create_upload_ticket(UUID) IS
  'Mints a single-use upload ticket. service_role only: anonymous callers reach it through the public-anon-gate Edge Function, which enforces Turnstile first.';
COMMENT ON FUNCTION public.submit_form(UUID, JSONB, JSONB) IS
  'Creates a submission and links ticketed files. service_role only: anonymous callers reach it through the public-anon-gate Edge Function, which enforces Turnstile first.';

-- ---------------------------------------------------------------------------
-- 3. Orphan sweep support
-- ---------------------------------------------------------------------------

-- Returns the storage paths that the cleanup function may delete: the ticket
-- was never consumed, expired more than 24 hours ago, and no committed file
-- row points at the object. Selecting the candidates in SQL keeps the
-- eligibility rule beside the data rather than in JavaScript.
CREATE OR REPLACE FUNCTION public.list_orphan_upload_paths(p_limit INT DEFAULT 500)
RETURNS TABLE(ticket_id UUID, path TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.path
  FROM upload_tickets t
  WHERE t.consumed_at IS NULL
    AND t.expires_at < now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM files f WHERE f.path = t.path)
  ORDER BY t.expires_at
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;

REVOKE EXECUTE ON FUNCTION public.list_orphan_upload_paths(INT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_orphan_upload_paths(INT) TO service_role;

-- Removes a ticket row only after its blob is confirmed gone. Guards against
-- deleting a ticket whose object was committed in the meantime.
CREATE OR REPLACE FUNCTION public.forget_orphan_ticket(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM upload_tickets t
  WHERE t.id = p_ticket_id
    AND t.consumed_at IS NULL
    AND t.expires_at < now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM files f WHERE f.path = t.path);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.forget_orphan_ticket(UUID) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.forget_orphan_ticket(UUID) TO service_role;
