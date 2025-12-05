-- Migration 003: Data Migration
-- Migrate existing data to multi-tenant structure

-- Create default "System" organization for existing data
INSERT INTO organizations (id, name, slug, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'System Organization',
  'system',
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Assign all existing forms to default organization
UPDATE forms
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Assign all existing submissions to default organization
UPDATE submissions
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Assign all existing folders to default organization
UPDATE folders
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Convert all existing admin users to super_manager of default organization
INSERT INTO user_organization_roles (user_id, organization_id, role)
SELECT 
  ur.user_id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'super_manager'
FROM user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Set current_organization_id for all users
UPDATE profiles p
SET current_organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE current_organization_id IS NULL
AND EXISTS (
  SELECT 1 FROM user_organization_roles uor
  WHERE uor.user_id = p.id
);

-- Make organization_id NOT NULL after data migration
ALTER TABLE forms 
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE submissions
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE folders
ALTER COLUMN organization_id SET NOT NULL;

-- Convert existing forms.settings to include default fields
UPDATE forms
SET settings = jsonb_build_object(
  'fields', jsonb_build_array(
    jsonb_build_object(
      'id', 'name',
      'label', 'Name',
      'type', 'text',
      'required', true,
      'order', 1
    ),
    jsonb_build_object(
      'id', 'email',
      'label', 'Email',
      'type', 'email',
      'required', true,
      'order', 2
    ),
    jsonb_build_object(
      'id', 'contact_number',
      'label', 'Contact Number',
      'type', 'phone',
      'required', false,
      'order', 3
    ),
    jsonb_build_object(
      'id', 'description',
      'label', 'Description',
      'type', 'textarea',
      'required', false,
      'order', 4
    ),
    jsonb_build_object(
      'id', 'receipt',
      'label', 'Receipt',
      'type', 'file',
      'required', true,
      'order', 5
    )
  )
)
WHERE settings IS NULL OR settings->'fields' IS NULL;
