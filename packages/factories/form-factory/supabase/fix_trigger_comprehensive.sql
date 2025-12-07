-- COMPREHENSIVE FIX: Recreate trigger function with proper RLS bypass
-- This script recreates the function, adds necessary RLS policies, and recreates the trigger

-- Step 1: Add bypass policy for debug_logs (allow trigger to insert)
DROP POLICY IF EXISTS "allow_trigger_insert_debug_logs" ON debug_logs;
CREATE POLICY "allow_trigger_insert_debug_logs" 
ON debug_logs 
FOR INSERT 
WITH CHECK (true);

-- Step 2: Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_user_created ON auth.users;

-- Step 3: Recreate the trigger function with SECURITY DEFINER
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
BEGIN
  -- Log start
  INSERT INTO public.debug_logs(step, details) 
  VALUES ('trigger_start', jsonb_build_object('user_id', NEW.id)::text);

  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');
  
  INSERT INTO public.debug_logs(step, details) 
  VALUES ('profile_created', jsonb_build_object('user_id', NEW.id)::text);

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
    org_name := NEW.raw_user_meta_data->>'organization_name';
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('org_name_extracted', jsonb_build_object('org_name', org_name)::text);

    IF org_name IS NULL OR org_name = '' THEN
      org_name := split_part(NEW.email, '@', 1) || '''s Organization';
    END IF;

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
    -- Log any errors
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('trigger_error', SQLERRM);
    RAISE;
END;
$func$ LANGUAGE plpgsql;

-- Step 4: Recreate the trigger
CREATE TRIGGER on_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Step 5: Verify everything
SELECT 'Trigger Status:' as info;
SELECT 
    tgname AS trigger_name,
    CASE tgenabled
        WHEN 'O' THEN 'enabled'
        WHEN 'D' THEN 'disabled'
        ELSE 'other'
    END AS status,
    proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'on_user_created'
  AND tgrelid = 'auth.users'::regclass;

SELECT 'Debug Logs Policy:' as info;
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'debug_logs';
