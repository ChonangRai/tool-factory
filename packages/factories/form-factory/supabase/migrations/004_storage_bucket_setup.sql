-- Create storage bucket via SQL (instead of manual Dashboard creation)

-- Insert the bucket into the storage.buckets table
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submissions',
  'submissions',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the submissions bucket

-- Allow anyone to upload files (for form submissions)
CREATE POLICY IF NOT EXISTS "Anyone can upload submission files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
);

-- Allow workspace members to view their organization's files
CREATE POLICY IF NOT EXISTS "Workspace members can view files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'submissions' 
  AND (
    auth.uid() IN (
      SELECT user_id FROM user_organization_roles
    )
    OR auth.uid() IS NULL -- Allow public access for submission form
  )
);

-- Allow workspace members to delete their organization's files
CREATE POLICY IF NOT EXISTS "Workspace members can delete files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'submissions'
  AND auth.uid() IN (
    SELECT user_id FROM user_organization_roles
  )
);
