-- Enforce single super_manager per organization and fix FK constraints for user deletion

-- 1. Create trigger to auto-demote when promoting to super_manager
CREATE OR REPLACE FUNCTION enforce_single_super_manager()
RETURNS TRIGGER AS $$
BEGIN
  -- If promoting to super_manager
  IF NEW.role = 'super_manager' AND (OLD.role IS NULL OR OLD.role != 'super_manager') THEN
    -- Demote existing super_manager to manager
    UPDATE user_organization_roles
    SET role = 'manager'
    WHERE organization_id = NEW.organization_id
      AND role = 'super_manager'
      AND user_id != NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_super_manager ON user_organization_roles;
CREATE TRIGGER trigger_single_super_manager
BEFORE INSERT OR UPDATE ON user_organization_roles
FOR EACH ROW
EXECUTE FUNCTION enforce_single_super_manager();

-- 2. Update delete_user_completely to handle FK constraints
CREATE OR REPLACE FUNCTION delete_user_completely(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Permission check
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

  -- Reassign forms to current super_manager before deleting
  UPDATE forms
  SET created_by = auth.uid()
  WHERE created_by = p_user_id;

  -- Set audit log references to NULL
  UPDATE audit_logs
  SET admin_id = NULL
  WHERE admin_id = p_user_id;

  -- Delete from auth.users (cascades to profiles and user_organization_roles)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_completely(UUID) TO authenticated;
