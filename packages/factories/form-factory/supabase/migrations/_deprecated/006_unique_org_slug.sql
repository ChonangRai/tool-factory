-- Add unique constraint to organization slug
-- This prevents two organizations from having the same slug

ALTER TABLE organizations
ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);

-- Also add index for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
