-- Create storage bucket for receipts
-- We insert directly into storage.buckets if it doesn't exist

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (It is enabled by default, so we skip this to avoid permission errors)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policies for storage.objects

-- 1. Public can upload files (for public form submissions)
DROP POLICY IF EXISTS "Public can upload receipts" ON storage.objects;
CREATE POLICY "Public can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts');

-- 2. Public can view files (needed for OCR processing on client side immediately after upload, or just general access)
-- In a stricter system, we might restrict this, but for now public access is required for the public form
DROP POLICY IF EXISTS "Public can view receipts" ON storage.objects;
CREATE POLICY "Public can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

-- 3. Admins/Managers can do everything
DROP POLICY IF EXISTS "Admins can manage receipts" ON storage.objects;
CREATE POLICY "Admins can manage receipts"
ON storage.objects FOR ALL
USING (
  bucket_id = 'receipts' 
  AND (
    auth.role() = 'service_role' 
    OR 
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM user_organization_roles
      WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
    )
  )
);
