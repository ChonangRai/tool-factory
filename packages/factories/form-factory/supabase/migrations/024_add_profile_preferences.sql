-- Add preferences column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Comment on column
COMMENT ON COLUMN profiles.preferences IS 'User preferences for UI, notifications, etc.';
