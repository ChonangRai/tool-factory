-- Create notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('submission_new', 'form_created', 'role_changed', 'user_added', 'user_removed')),
  title TEXT NOT NULL,
  message TEXT,
  data JSONB, -- Additional context (form_id, submission_id, etc.)
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
DROP POLICY IF EXISTS "users_view_own_notifications" ON notifications;
CREATE POLICY "users_view_own_notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Policy: Users can mark their notifications as read
DROP POLICY IF EXISTS "users_update_own_notifications" ON notifications;
CREATE POLICY "users_update_own_notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Function to create notification for new submission
CREATE OR REPLACE FUNCTION notify_new_submission()
RETURNS TRIGGER AS $$
DECLARE
  form_name TEXT;
  org_users UUID[];
BEGIN
  -- Get form name
  SELECT name INTO form_name FROM forms WHERE id = NEW.form_id;
  
  -- Get all users in the organization (excluding the submitter if they're a member)
  SELECT ARRAY_AGG(DISTINCT user_id) INTO org_users
  FROM user_organization_roles
  WHERE organization_id = NEW.organization_id;
  
  -- Create notifications for all org members
  INSERT INTO notifications (user_id, organization_id, type, title, message, data)
  SELECT 
    unnest(org_users),
    NEW.organization_id,
    'submission_new',
    'New Submission Received',
    'New submission for form: ' || COALESCE(form_name, 'Unknown Form'),
    jsonb_build_object(
      'form_id', NEW.form_id,
      'submission_id', NEW.id,
      'submitter_name', NEW.name
    );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new submissions
DROP TRIGGER IF EXISTS on_new_submission ON submissions;
CREATE TRIGGER on_new_submission
  AFTER INSERT ON submissions
  FOR EACH ROW
  WHEN (NEW.organization_id IS NOT NULL)
  EXECUTE FUNCTION notify_new_submission();
