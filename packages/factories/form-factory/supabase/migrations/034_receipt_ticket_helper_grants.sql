-- Staging deployment review: 033's claim_receipt_ticket / mark_receipt_ticket_sent
-- / mark_receipt_ticket_failed were only explicitly REVOKEd FROM PUBLIC, not
-- from anon/authenticated directly. Confirmed live on staging: this
-- project's Supabase instance grants EXECUTE on newly created public-schema
-- functions to anon as a direct ACL entry, not merely inherited via PUBLIC
-- (the same platform behavior already worked around for update_user_role /
-- delete_user_completely in 028) -- REVOKE FROM PUBLIC alone left anon and
-- authenticated able to call all three functions directly, bypassing the
-- intended "only the submit-receipt Edge Function's service-role client
-- may claim/resolve a receipt ticket" boundary. Practical impact was bounded
-- (a caller would need a real ticket_id to do anything, and the only effect
-- is consuming/burning that one ticket without ever sending its email --
-- not a data-confidentiality issue) but the trust boundary itself was wrong
-- and is closed here.
--
-- Forward-only; does not edit 033.

REVOKE EXECUTE ON FUNCTION claim_receipt_ticket(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_receipt_ticket_sent(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_receipt_ticket_failed(UUID) FROM anon, authenticated;
