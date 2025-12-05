-- Add RLS policies for folders table
-- These were missing, causing 403 errors on folder creation

-- Enable RLS
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- View folders: users can see folders in their organization
DROP POLICY IF EXISTS "view_folders" ON folders;
CREATE POLICY "view_folders" ON folders 
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
);

-- Create folders: managers and super managers can create folders
DROP POLICY IF EXISTS "create_folders" ON folders;
CREATE POLICY "create_folders" ON folders 
FOR INSERT WITH CHECK (
  organization_id IN (
    SELECT uor.organization_id 
    FROM user_organization_roles uor
    WHERE uor.user_id = auth.uid() 
    AND uor.role IN ('super_manager', 'manager')
  )
);

-- Update folders: managers and super managers can update folders
DROP POLICY IF EXISTS "update_folders" ON folders;
CREATE POLICY "update_folders" ON folders 
FOR UPDATE USING (
  organization_id IN (
    SELECT uor.organization_id 
    FROM user_organization_roles uor
    WHERE uor.user_id = auth.uid() 
    AND uor.role IN ('super_manager', 'manager')
  )
);

-- Delete folders: only super managers can delete folders  
DROP POLICY IF EXISTS "delete_folders" ON folders;
CREATE POLICY "delete_folders" ON folders 
FOR DELETE USING (
  organization_id IN (
    SELECT uor.organization_id 
    FROM user_organization_roles uor
    WHERE uor.user_id = auth.uid() 
    AND uor.role = 'super_manager'
  )
);
