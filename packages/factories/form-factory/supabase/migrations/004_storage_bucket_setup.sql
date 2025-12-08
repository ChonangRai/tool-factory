-- Create storage bucket and policies for form submissions

-- Note: Create the bucket via Supabase Dashboard first:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Click "New bucket"
-- 3. Name: "submissions"
-- 4. Enable "Public bucket" option
-- 5. Click "Create bucket"

-- Then run these policies:

-- Allow anyone to upload files (for form submissions)
CREATE POLICY "Anyone can upload submission files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
);

-- Allow workspace members to view their organization's files
CREATE POLICY "Workspace members can view files"
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
CREATE POLICY "Workspace members can delete files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'submissions'
  AND auth.uid() IN (
    SELECT user_id FROM user_organization_roles
  )
);
