-- Security remediation batch 1: close cross-tenant access paths that relied on
-- is_admin() (a GLOBAL platform-admin flag) being wired into org-scoped tables,
-- close a role-escalation hole in invitations, and stop granting the global
-- admin flag to ordinary self-signup users.
--
-- Forward-only. Does not modify Storage. Does not touch historical/deprecated
-- migrations.

-- ============================================================
-- 1. INVITATIONS
-- Previous policy ("manage_invitations"/"view_own_org_invitations") allowed
-- is_admin() (global flag) to read/write ANY org's invitations, and placed no
-- constraint on which `role` a manager could write into a new invitation,
-- letting a manager mint a super_manager invite for their own org.
-- ============================================================

DROP POLICY IF EXISTS "manage_invitations" ON invitations;
DROP POLICY IF EXISTS "view_own_org_invitations" ON invitations;

-- SELECT: manager or super_manager of the invitation's own org only.
CREATE POLICY "invitations_select_org_managers" ON invitations
FOR SELECT
TO authenticated
USING (has_manager(organization_id));

-- INSERT: super_manager may create any role for their own org; a plain
-- manager may only create 'staff' invitations for their own org. Nobody may
-- write an invitation for an org they don't hold one of these roles in.
CREATE POLICY "invitations_insert_scoped" ON invitations
FOR INSERT
TO authenticated
WITH CHECK (
  has_super_manager(organization_id)
  OR (has_org_role(organization_id, 'manager') AND role = 'staff')
);

-- DELETE: manager or super_manager of the invitation's own org only.
CREATE POLICY "invitations_delete_org_managers" ON invitations
FOR DELETE
TO authenticated
USING (has_manager(organization_id));

-- No UPDATE policy: no application flow updates invitations in place
-- (create/list/delete only). With RLS enabled and no UPDATE policy, UPDATE
-- is denied by default, which also closes the possibility of silently
-- re-pointing an existing invitation to a different org/role after creation.

-- ============================================================
-- 2. ORGANIZATIONS
-- Previous policy exposed every tenant's name/slug/settings to any
-- authenticated user platform-wide.
-- ============================================================

DROP POLICY IF EXISTS "authenticated_users_view_orgs" ON organizations;

CREATE POLICY "org_members_view_orgs" ON organizations
FOR SELECT
TO authenticated
USING (
  id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

-- ============================================================
-- 3. FOLDERS
-- Previous policies used is_admin() (global flag) as an OR-bypass on top of
-- org-membership scoping. The application has never restricted folder
-- create/rename/delete to a specific role at the data layer (the "New
-- Folder" button is hidden from staff in the UI, but rename/delete controls
-- are not, and no prior migration ever narrowed this table's RLS by role) so
-- this preserves "any member of the org may manage its folders" while
-- removing the cross-tenant bypass.
-- ============================================================

DROP POLICY IF EXISTS "view_folders" ON folders;
DROP POLICY IF EXISTS "manage_folders" ON folders;

CREATE POLICY "folders_org_members_all" ON folders
FOR ALL
TO authenticated
USING (
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
)
WITH CHECK (
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

-- ============================================================
-- 4. DEBUG_LOGS
-- No frontend code reads this table. All writes come from
-- handle_new_user_signup(), which is SECURITY DEFINER and therefore
-- unaffected by RLS regardless of policy content (it runs as the function
-- owner). The only policy removed here is the SELECT policy that let any
-- globally-flagged "admin" (i.e. any ordinary self-signup user, see #7)
-- read this table -- which includes plaintext invite tokens logged during
-- signup. No replacement SELECT policy is added: nothing in the app needs
-- client-side read access, and this table has no trustworthy per-row
-- organization scoping to build one on. The INSERT policy that lets the
-- trigger log is left untouched.
-- ============================================================

DROP POLICY IF EXISTS "admin_view_debug_logs" ON debug_logs;

-- ============================================================
-- 5. FORMS -- drop superseded permissive policies from 003_staff_crud_soft_delete.sql
-- These predate the strict_forms_*_final policies (023/025) and were never
-- dropped when those were introduced. super_manager_delete_forms carried an
-- is_admin() bypass; workspace_create_forms/workspace_update_forms allowed
-- any org member (not just manager/super_manager) to create/update forms,
-- which strict_forms_insert_final/strict_forms_update_final already cover
-- for the intended manager+ workflow.
-- ============================================================

DROP POLICY IF EXISTS "workspace_create_forms" ON forms;
DROP POLICY IF EXISTS "workspace_update_forms" ON forms;
DROP POLICY IF EXISTS "super_manager_delete_forms" ON forms;

-- ============================================================
-- 6. PRIVILEGED RPC GRANTS
-- These functions were never explicitly granted to anon/authenticated; they
-- were reachable by everyone (including anon) only via Postgres's default
-- PUBLIC execute grant on newly created functions. Their internal auth.uid()
-- checks already reject unauthenticated/unauthorized callers, so this is
-- defense-in-depth, not a fix to a reachable exploit. Internal authorization
-- logic inside both functions is unchanged.
-- ============================================================

REVOKE EXECUTE ON FUNCTION update_user_role(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_user_completely(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION update_user_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_completely(uuid) TO authenticated;

-- ============================================================
-- 7. STOP GRANTING THE GLOBAL ADMIN FLAG ON ORDINARY SIGNUP
-- is_admin() reads user_roles for role IN ('admin','platform_admin') and is
-- meant to represent a platform-wide ToolFactory operator, not a workspace
-- owner. handle_new_user_signup() was granting 'admin' to every user who
-- signs up without an invite (i.e. every ordinary new-workspace owner),
-- which is what made the is_admin() bypasses above (and in earlier,
-- already-patched migrations) exploitable by anyone. The frontend's
-- workspace-owner UX does not depend on this: useAuth.tsx already sets
-- isAdmin=true for org role IN ('super_manager','manager') independently of
-- the global user_roles check, so ordinary users keep identical UI behavior.
-- No RLS/RPC in this schema requires an ordinary user to hold 'admin'.
-- is_admin()/platform_admin are intentionally left defined but otherwise
-- unused by any signup path -- true platform administration is out of scope
-- for this batch and must be provisioned manually if/when needed.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  invite_token TEXT;
  invite_record RECORD;
  user_name TEXT;
BEGIN
  INSERT INTO public.debug_logs(step, details)
  VALUES ('trigger_start', jsonb_build_object('user_id', NEW.id)::text);

  -- Extract name from metadata or fallback to email
  user_name := COALESCE(
    TRIM(NEW.raw_user_meta_data->>'name'),
    TRIM(NEW.raw_user_meta_data->>'full_name'),
    TRIM(NEW.raw_user_meta_data->>'display_name'),
    split_part(NEW.email, '@', 1)
  );

  -- 1. Create Profile with proper name
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, user_name);

  INSERT INTO public.debug_logs(step, details)
  VALUES ('profile_created', jsonb_build_object('user_id', NEW.id, 'name', user_name)::text);

  -- 2. Check for invitation token
  invite_token := NEW.raw_user_meta_data->>'invite_token';
  INSERT INTO public.debug_logs(step, details)
  VALUES ('invite_token_checked', jsonb_build_object('token', invite_token)::text);

  IF invite_token IS NOT NULL THEN
    SELECT * INTO invite_record
    FROM public.invitations
    WHERE token = invite_token
      AND expires_at > NOW();

    INSERT INTO public.debug_logs(step, details)
    VALUES ('invite_lookup', jsonb_build_object('found', FOUND)::text);

    IF FOUND THEN
      new_org_id := invite_record.organization_id;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invite_valid', jsonb_build_object('org_id', new_org_id, 'role', invite_record.role)::text);

      INSERT INTO public.user_organization_roles (user_id, organization_id, role)
      VALUES (NEW.id, new_org_id, invite_record.role);

      INSERT INTO public.debug_logs(step, details)
      VALUES ('role_assigned', jsonb_build_object('role', invite_record.role)::text);

      DELETE FROM public.invitations WHERE id = invite_record.id;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invitation_deleted', jsonb_build_object('inv_id', invite_record.id)::text);
    ELSE
      invite_token := NULL;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invite_invalid', '');
    END IF;
  END IF;

  -- 3. Standard Signup (Create New Org) if no valid invite found
  IF new_org_id IS NULL THEN
    org_name := COALESCE(
      NEW.raw_user_meta_data->>'organization_name',
      user_name || '''s Workspace'
    );

    INSERT INTO public.debug_logs(step, details)
    VALUES ('org_name_extracted', jsonb_build_object('org_name', org_name)::text);

    org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    org_slug := trim(both '-' FROM org_slug);
    org_slug := org_slug || '-' || extract(epoch FROM now())::bigint;

    INSERT INTO public.organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;

    INSERT INTO public.debug_logs(step, details)
    VALUES ('org_created', jsonb_build_object('org_id', new_org_id)::text);

    INSERT INTO public.user_organization_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'super_manager');

    INSERT INTO public.debug_logs(step, details)
    VALUES ('role_super_manager_assigned', jsonb_build_object('org_id', new_org_id)::text);

    -- Removed: automatic global `user_roles(role='admin')` grant. See header comment #7.
  END IF;

  -- 4. Update user's profile with current organization
  UPDATE public.profiles
  SET current_organization_id = new_org_id
  WHERE id = NEW.id;

  INSERT INTO public.debug_logs(step, details)
  VALUES ('profile_updated', jsonb_build_object('org_id', new_org_id)::text);

  INSERT INTO public.debug_logs(step, details)
  VALUES ('trigger_end', jsonb_build_object('user_id', NEW.id)::text);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.debug_logs(step, details)
    VALUES ('error', SQLERRM);
    RAISE;
END;
$func$ LANGUAGE plpgsql;
