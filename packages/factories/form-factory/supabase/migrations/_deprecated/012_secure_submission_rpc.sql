-- Secure Submission RPC
-- Allows public users to submit forms and link files without needing read access to the submissions table.

CREATE OR REPLACE FUNCTION submit_form(
  p_form_id UUID,
  p_data JSONB,
  p_files JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_submission_id UUID;
  v_org_id UUID;
BEGIN
  -- 1. Get Organization ID from the form
  SELECT organization_id INTO v_org_id
  FROM forms
  WHERE id = p_form_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Form not found';
  END IF;

  -- 2. Insert Submission
  INSERT INTO submissions (
    form_id,
    organization_id,
    data,
    status,
    -- Extract common fields for easier querying
    name,
    email,
    contact_number,
    date,
    description,
    amount
  )
  VALUES (
    p_form_id,
    v_org_id,
    p_data,
    'new',
    p_data->>'name',
    p_data->>'email',
    p_data->>'contact_number',
    COALESCE((p_data->>'date')::date, CURRENT_DATE),
    p_data->>'description',
    COALESCE((p_data->>'amount')::decimal, 0)
  )
  RETURNING id INTO v_submission_id;

  -- 3. Insert Files (if any)
  -- p_files is expected to be an array of objects: { "path": "...", "filename": "...", "mime": "...", "size": ... }
  IF jsonb_array_length(p_files) > 0 THEN
    INSERT INTO files (submission_id, filename, path, mime, size, bucket)
    SELECT 
      v_submission_id,
      x->>'filename',
      x->>'path',
      x->>'mime',
      COALESCE((x->>'size')::int, 0),
      'receipts'
    FROM jsonb_array_elements(p_files) t(x);
  END IF;

  RETURN v_submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
