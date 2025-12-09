-- Create admin function to completely delete a user from the system

CREATE OR REPLACE FUNCTION delete_user_completely(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function can only be called by super_managers
  -- Check if current user is a super_manager in any organization where the target user exists
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

  -- Delete from auth.users (cascades to profiles and user_organization_roles)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Grant execute to authenticated users (function checks permissions internally)
GRANT EXECUTE ON FUNCTION delete_user_completely(UUID) TO authenticated;

-- Update profiles migration to better handle names
UPDATE profiles p
SET name = COALESCE(
  NULLIF(p.name, ''),  -- Keep existing name if not empty
  (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = p.id),
  (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = p.id),
  split_part(p.email, '@', 1)  -- Fallback to email username
)
WHERE name IS NULL OR name = '' OR name = 'Unknown';

-- Also update email to ensure it matches auth.users
UPDATE profiles p
SET email = (SELECT email FROM auth.users WHERE id = p.id)
WHERE email IS NULL OR email = '' OR email = 'Unknown';
