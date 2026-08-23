-- Pre-staging reliability fix: receipt_tickets (032) consumed the ticket
-- atomically *before* attempting the email send. Reviewed before staging:
-- a transient Resend 5xx, a network failure, a crashed Edge Function
-- invocation, or a temporarily-missing RESEND_API_KEY would all leave the
-- ticket permanently marked consumed with no email ever sent -- the
-- submitter's receipt becomes unsendable forever, with no user-facing way
-- to retry (there is no "resend receipt" UI, unlike invitations).
--
-- Replaces the boolean consumed_at gate with a small bounded state machine:
-- pending -> processing -> sent | failed, with failed/stale-processing
-- claims eligible for a bounded number of retries. Single-flight and
-- replay resistance are still enforced by one atomic UPDATE per claim
-- attempt -- this adds retry-on-failure, not unrestricted replay.
--
-- Forward-only; does not edit 027-032.

ALTER TABLE receipt_tickets
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- submit_form() needs no change: its INSERT into receipt_tickets only sets
-- (id, submission_id, expires_at) and picks up these new columns' defaults.

-- Claim helper used by submit-receipt. SECURITY DEFINER + row_security off
-- for the same reason as the other ticket helpers in this project: the
-- Edge Function calls this with the service role, which already bypasses
-- RLS, but keeping the same pattern here means the same function also
-- works correctly if this is ever called from a non-service-role context.
--
-- A claim succeeds if the ticket is pending, previously failed, or stuck
-- in "processing" for more than 2 minutes (recovers from a crashed
-- invocation), AND it has not already exhausted 3 attempts, AND it has not
-- expired. Exactly one caller can ever win a given claim: this is a single
-- atomic UPDATE, so a concurrent second attempt sees the row already
-- flipped to a fresh "processing" state (not stale) and matches nothing.
CREATE OR REPLACE FUNCTION claim_receipt_ticket(p_ticket_id UUID)
RETURNS TABLE(submission_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  UPDATE receipt_tickets
  SET status = 'processing',
      attempts = receipt_tickets.attempts + 1,
      claimed_at = now()
  WHERE id = p_ticket_id
    AND expires_at > now()
    AND attempts < 3
    AND (
      status IN ('pending', 'failed')
      OR (status = 'processing' AND claimed_at < now() - interval '2 minutes')
    )
  RETURNING receipt_tickets.submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_receipt_ticket_sent(p_ticket_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE receipt_tickets SET status = 'sent' WHERE id = p_ticket_id AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION mark_receipt_ticket_failed(p_ticket_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE receipt_tickets SET status = 'failed' WHERE id = p_ticket_id AND status = 'processing';
$$;

REVOKE EXECUTE ON FUNCTION claim_receipt_ticket(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_receipt_ticket_sent(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_receipt_ticket_failed(UUID) FROM PUBLIC;
-- Only the Edge Function (service role) calls these; no anon/authenticated
-- grant is needed or given.
GRANT EXECUTE ON FUNCTION claim_receipt_ticket(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_receipt_ticket_sent(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_receipt_ticket_failed(UUID) TO service_role;
