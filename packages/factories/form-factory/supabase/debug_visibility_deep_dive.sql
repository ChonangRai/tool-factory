-- DEEP DIVE VISIBILITY DEBUG
-- Run this in Supabase SQL Editor.

-- 1. Check if you are accidentally in multiple organizations
-- Replace 'YOUR_EMAIL_HERE' with the email of the user you are testing with
SELECT 
    au.email,
    o.name as org_name, 
    uor.role 
FROM user_organization_roles uor
JOIN organizations o ON o.id = uor.organization_id
JOIN auth.users au ON au.id = uor.user_id
ORDER BY au.email;

-- 2. Check for "Orphaned" Forms (NULL Organization)
-- These might be visible if the migration didn't fully take effect or if there's a loophole
SELECT count(*) as orphaned_forms_count FROM forms WHERE organization_id IS NULL;

-- 3. Verify the RLS Policy is actually active
-- This checks the internal Postgres catalog to see the actual policy definition
SELECT 
    tablename, 
    policyname, 
    cmd, 
    qual, -- The "USING" clause
    with_check -- The "WITH CHECK" clause
FROM pg_policies 
WHERE tablename = 'forms';

-- 4. Check for Global Admins
SELECT 
    au.email, 
    ur.role 
FROM user_roles ur
JOIN auth.users au ON au.id = ur.user_id;
