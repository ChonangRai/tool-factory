-- Repair administrative/security audit logging.
--
-- Diagnosis: audit_logs had RLS enabled and *zero* policies, so the only two
-- writers (direct browser inserts in Admin.tsx / Dashboard.tsx) were rejected
-- 42501 on every call and the errors were discarded unchecked. Nothing has ever
-- been logged, nothing could be read, and the table had no tenant column, so it
-- could not have been scoped even if the writes had worked.
--
-- This migration keeps the table submission-compatible while making it
-- tenant-scoped and server-authoritative. Actor and organization are never
-- taken from the client: every write goes through log_audit_event(), which
-- reads the actor from auth.uid() and takes the organization from the row being
-- audited. Clients get no INSERT path at all.
--
-- Scope is deliberately administrative: form/org/role/invitation mutations and
-- submission status changes. Anonymous submission, upload tickets and Turnstile
-- are business and abuse-control flows, not admin actions, and stay unlogged.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS resource_type   TEXT,
  ADD COLUMN IF NOT EXISTS resource_id     UUID,
  -- Snapshot of who acted. admin_id alone is not enough: the referenced
  -- auth.users row disappears when that user is deleted, and an audit trail
  -- that forgets its actor is not an audit trail.
  ADD COLUMN IF NOT EXISTS actor_email     TEXT,
  -- Same reasoning for the tenant. organization_id goes NULL when the
  -- organization is deleted, so the name is snapshotted at write time to keep
  -- the row interpretable afterwards. Name only -- nothing else about the
  -- organization is duplicated here.
  ADD COLUMN IF NOT EXISTS organization_name TEXT;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_organization_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Legacy rows: the only historical shape was a submission status change.
UPDATE public.audit_logs a
SET organization_id = s.organization_id,
    resource_type   = COALESCE(a.resource_type, 'submission'),
    resource_id     = COALESCE(a.resource_id, a.submission_id)
FROM public.submissions s
WHERE a.submission_id = s.id
  AND a.organization_id IS NULL;

UPDATE public.audit_logs a
SET organization_name = o.name
FROM public.organizations o
WHERE a.organization_id = o.id
  AND a.organization_name IS NULL;

-- Audit history must not veto a legitimate deletion, and must not be silently
-- destroyed by one either. Both references become SET NULL; the readable
-- context survives in actor_email, resource_id and data.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_submission_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_submission_id_fkey
  FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_admin_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON public.audit_logs (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- 2. Trusted write path
-- ---------------------------------------------------------------------------

-- The only way a row reaches audit_logs. Deliberately NOT granted to anon or
-- authenticated: it is called from the triggers and RPCs below, which already
-- run inside an authorized mutation. That is what makes a forged actor or a
-- cross-tenant row impossible rather than merely discouraged.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_organization_id UUID,
  p_action          TEXT,
  p_resource_type   TEXT,
  p_resource_id     UUID,
  p_data            JSONB DEFAULT '{}'::jsonb,
  p_submission_id   UUID  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_email    TEXT;
  v_org_id   UUID;
  v_org_name TEXT;
  v_id       UUID;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'audit: organization_id is required';
  END IF;

  -- Deleting an organization cascades into forms, roles and invitations, and
  -- each of those child triggers would otherwise emit its own row. Those rows
  -- would be noise, and they would arrive after the parent row is already gone
  -- and so could not satisfy the FK. One 'organization.deleted' event, written
  -- by the BEFORE DELETE trigger below, is the useful record; the rest are
  -- suppressed for the remainder of that statement.
  IF current_setting('audit.org_deleting', true) = p_organization_id::text THEN
    RETURN NULL;
  END IF;

  -- v_actor is NULL only on trusted server paths that carry no JWT (the signup
  -- trigger). Those rows are still worth keeping: they record the event with an
  -- explicitly unknown actor rather than inventing one.
  IF v_actor IS NOT NULL THEN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_actor;
  END IF;

  -- The name is snapshotted now because organization_id is set to NULL when the
  -- organization is deleted. If the organization is already gone, the reference
  -- is dropped rather than the row: audit history outlives its tenant.
  SELECT o.id, o.name INTO v_org_id, v_org_name
  FROM organizations o WHERE o.id = p_organization_id;

  INSERT INTO audit_logs (organization_id, organization_name, admin_id, actor_email,
                          action, resource_type, resource_id, data, submission_id)
  VALUES (v_org_id, v_org_name, v_actor, v_email,
          p_action, p_resource_type, p_resource_id, COALESCE(p_data, '{}'::jsonb), p_submission_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, UUID, JSONB, UUID)
  FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Table privileges: reads only, and only through RLS
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.audit_logs FROM anon;
GRANT SELECT ON public.audit_logs TO authenticated;

-- Visibility follows the product's existing administrative boundary: user
-- management, role changes and invitations are manager/super_manager surfaces,
-- so the security log is one too. has_manager() is true for both roles.
-- Ordinary staff, and anonymous callers, see nothing.
DROP POLICY IF EXISTS audit_logs_select_managers ON public.audit_logs;
CREATE POLICY audit_logs_select_managers ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.has_manager(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Server-side event capture
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_forms_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(NEW.organization_id, 'form.created', 'form', NEW.id,
                            jsonb_build_object('name', NEW.name));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_event(OLD.organization_id, 'form.deleted', 'form', OLD.id,
                            jsonb_build_object('name', OLD.name));
    RETURN OLD;
  ELSE
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM log_audit_event(NEW.organization_id, 'form.deleted', 'form', NEW.id,
                              jsonb_build_object('name', NEW.name, 'soft', true));
    ELSIF OLD IS DISTINCT FROM NEW THEN
      PERFORM log_audit_event(NEW.organization_id, 'form.updated', 'form', NEW.id,
                              jsonb_build_object('name', NEW.name));
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_forms ON public.forms;
CREATE TRIGGER trg_audit_forms
  AFTER INSERT OR UPDATE OR DELETE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.audit_forms_change();

CREATE OR REPLACE FUNCTION public.audit_organizations_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD IS DISTINCT FROM NEW THEN
    PERFORM log_audit_event(NEW.id, 'organization.updated', 'organization', NEW.id,
                            jsonb_build_object('name', NEW.name));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_organizations ON public.organizations;
CREATE TRIGGER trg_audit_organizations
  AFTER UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_organizations_change();

-- BEFORE DELETE, so the row still exists: the event is written while the FK
-- can still be satisfied and the name can still be read. The FK then sets
-- organization_id to NULL as the delete completes, and organization_name is
-- what identifies the tenant from then on.
CREATE OR REPLACE FUNCTION public.audit_organization_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM log_audit_event(OLD.id, 'organization.deleted', 'organization', OLD.id,
                          jsonb_build_object('name', OLD.name, 'slug', OLD.slug));
  -- Suppress the cascade's child events for the rest of this transaction.
  PERFORM set_config('audit.org_deleting', OLD.id::text, true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_organization_delete ON public.organizations;
CREATE TRIGGER trg_audit_organization_delete
  BEFORE DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_organization_delete();

-- Covers update_user_role(), the UserManagement direct writes, invitation
-- redemption inside the signup trigger, and the cascade from user deletion --
-- one trigger instead of four call sites that could each drift.
CREATE OR REPLACE FUNCTION public.audit_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(NEW.organization_id, 'user_role.granted', 'user_role', NEW.user_id,
                            jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_event(OLD.organization_id, 'user_role.revoked', 'user_role', OLD.user_id,
                            jsonb_build_object('role', OLD.role));
    RETURN OLD;
  ELSIF OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM log_audit_event(NEW.organization_id, 'user_role.changed', 'user_role', NEW.user_id,
                            jsonb_build_object('from', OLD.role, 'to', NEW.role));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_organization_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_organization_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_role_change();

CREATE OR REPLACE FUNCTION public.audit_invitation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(NEW.organization_id, 'invitation.created', 'invitation', NEW.id,
                            jsonb_build_object('email', NEW.email, 'role', NEW.role));
    RETURN NEW;
  END IF;
  -- Migration 031 made the DELETE itself the redemption. An expired-but-unused
  -- invitation is removed by this same path, so the record says "consumed", not
  -- "accepted", and carries the expiry so the two can be told apart.
  PERFORM log_audit_event(OLD.organization_id, 'invitation.consumed', 'invitation', OLD.id,
                          jsonb_build_object('email', OLD.email, 'role', OLD.role,
                                             'expired', OLD.expires_at <= now()));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_invitations ON public.invitations;
CREATE TRIGGER trg_audit_invitations
  AFTER INSERT OR DELETE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_invitation_change();

-- ---------------------------------------------------------------------------
-- 5. Submission status change: mutation and audit in one authorized call
-- ---------------------------------------------------------------------------

-- Replaces the browser's "UPDATE submissions" + "INSERT audit_logs" pair. The
-- two are now one transaction, and the caller supplies neither actor nor org.
-- Authorization matches the reach the previous RLS path already allowed: any
-- member of the submission's organization may change its status.
CREATE OR REPLACE FUNCTION public.set_submission_status(
  p_submission_id UUID,
  p_status        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org    UUID;
  v_before TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_status IS NULL OR btrim(p_status) = '' THEN
    RAISE EXCEPTION 'Status is required';
  END IF;

  SELECT s.organization_id, s.status INTO v_org, v_before
  FROM submissions s WHERE s.id = p_submission_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_organization_roles uor
    WHERE uor.user_id = auth.uid() AND uor.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Permission denied for this submission';
  END IF;

  UPDATE submissions SET status = p_status WHERE id = p_submission_id;

  IF v_before IS DISTINCT FROM p_status THEN
    PERFORM log_audit_event(v_org, 'submission.status_changed', 'submission', p_submission_id,
                            jsonb_build_object('from', v_before, 'to', p_status),
                            p_submission_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_submission_status(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_submission_status(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Stop erasing actor context on user deletion
-- ---------------------------------------------------------------------------

-- Identical to the previous definition except that the
-- "UPDATE audit_logs SET admin_id = NULL" workaround is gone: the FK is now
-- ON DELETE SET NULL, and actor_email preserves who acted. The authorization
-- check is unchanged. search_path is restated because CREATE OR REPLACE drops
-- the setting migration 036 applied.
CREATE OR REPLACE FUNCTION public.delete_user_completely(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM user_organization_roles curr
    INNER JOIN user_organization_roles target
      ON curr.organization_id = target.organization_id
    WHERE curr.user_id = auth.uid()
      AND curr.role = 'super_manager'
      AND target.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Only super_managers can delete users';
  END IF;

  UPDATE forms
  SET created_by = auth.uid()
  WHERE created_by = p_user_id;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;
