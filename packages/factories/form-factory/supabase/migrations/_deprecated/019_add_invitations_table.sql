-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT, -- Optional: restrict to specific email
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('super_manager', 'manager', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- View: Org members can view invites for their org
CREATE POLICY "org_members_view_invitations"
ON invitations FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

-- Create: Managers/Super Managers can create invites
CREATE POLICY "managers_create_invitations"
ON invitations FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
  )
);

-- Delete: Managers/Super Managers can delete (revoke) invites
CREATE POLICY "managers_delete_invitations"
ON invitations FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
  )
);
