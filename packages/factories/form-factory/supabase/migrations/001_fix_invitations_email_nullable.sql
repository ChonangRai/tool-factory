-- Fix invitations table to allow nullable email for generic invite links
ALTER TABLE invitations ALTER COLUMN email DROP NOT NULL;
