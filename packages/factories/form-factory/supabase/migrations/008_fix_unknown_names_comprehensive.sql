-- Comprehensive fix for Unknown names in User Management
-- This updates existing profiles AND fixes the signup trigger

-- 1. Update all existing profiles with missing or Unknown names/emails
UPDATE profiles p
SET 
  name = COALESCE(
    NULLIF(TRIM(p.name), ''),  -- Keep existing non-empty name
    NULLIF(TRIM(p.name), 'Unknown'),  -- Replace "Unknown"
    (SELECT TRIM(raw_user_meta_data->>'name') FROM auth.users WHERE id = p.id),
    (SELECT TRIM(raw_user_meta_data->>'full_name') FROM auth.users WHERE id = p.id),
    (SELECT TRIM(raw_user_meta_data->>'display_name') FROM auth.users WHERE id = p.id),
    split_part(p.email, '@', 1)  -- Fallback to email username
  ),
  email = COALESCE(
    NULLIF(TRIM(p.email), ''),
    NULLIF(TRIM(p.email), 'Unknown'),
    (SELECT email FROM auth.users WHERE id = p.id)
  )
WHERE 
  (name IS NULL OR name = '' OR name = 'Unknown') 
  OR (email IS NULL OR email = '' OR email = 'Unknown');

-- 2. Fix the signup trigger to use email as fallback for invited users
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
    split_part(NEW.email, '@', 1)  -- Fallback to email username
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
    -- Determine organization name and slug
    org_name := COALESCE(
      NEW.raw_user_meta_data->>'organization_name',
      (SELECT (window AS WINDOW_VAR).signupOrgName FROM DUAL WHERE false),  -- Can't access window in PG
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

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
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
$func$;
