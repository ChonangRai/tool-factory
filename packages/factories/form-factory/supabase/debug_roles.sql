-- DEBUG SCRIPT: Check User Roles and Access
-- Run this in Supabase SQL Editor to see why you can see other forms.

-- 1. Check your current user ID and roles
SELECT 
  auth.uid() as my_user_id,
  (SELECT email FROM auth.users WHERE id = auth.uid()) as my_email,
  
  -- Check if you have the GLOBAL admin role (This is the likely culprit)
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'platform_admin')
  ) as is_global_admin,
  
  -- Check your organization roles
  (
    SELECT string_agg(role || ' at ' || o.name, ', ')
    FROM user_organization_roles uor
    JOIN organizations o ON o.id = uor.organization_id
    WHERE uor.user_id = auth.uid()
  ) as my_org_roles;

-- 2. Check all users with GLOBAL admin role
-- If you see users here that shouldn't be global admins, that's the problem.
SELECT 
  ur.user_id, 
  au.email, 
  ur.role 
FROM user_roles ur
JOIN auth.users au ON au.id = ur.user_id;

-- 3. Check if you can see forms from other organizations
-- This simulates what the RLS allows you to see
SELECT 
  f.id as form_id, 
  f.name as form_name, 
  o.name as org_name,
  f.organization_id
FROM forms f
LEFT JOIN organizations o ON o.id = f.organization_id
LIMIT 10;
