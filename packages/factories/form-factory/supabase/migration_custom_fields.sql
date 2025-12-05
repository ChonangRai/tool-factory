-- Add custom_data column to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;

-- Create storage bucket for receipts if it doesn't exist (from previous step)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to receipts bucket (needed for Edge Function to work smoothly with RLS sometimes, or just good practice)
-- Note: The Edge Function uses service role, so this is technically optional for the function itself, 
-- but good for debugging or if we switch to client-side upload later.
CREATE POLICY "Admins can view receipts"
ON storage.objects FOR SELECT
USING ( bucket_id = 'receipts' AND auth.role() = 'authenticated' );
