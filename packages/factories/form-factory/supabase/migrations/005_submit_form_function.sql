-- Create submit_form RPC function for handling form submissions with files

CREATE OR REPLACE FUNCTION submit_form(
  p_form_id UUID,
  p_data JSONB,
  p_files JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission_id UUID;
  v_file JSONB;
  v_organization_id UUID;
BEGIN
  -- Get organization_id from the form
  SELECT organization_id INTO v_organization_id
  FROM forms
  WHERE id = p_form_id;

  -- Create the submission
  INSERT INTO submissions (
    form_id,
    organization_id,
    name,
    email,
    contact_number,
    date,
    amount,
    description,
    status
  )
  VALUES (
    p_form_id,
    v_organization_id,
    p_data->>'name',
    p_data->>'email',
    p_data->>'contact_number',
    COALESCE((p_data->>'date')::date, CURRENT_DATE),
    COALESCE((p_data->>'amount')::numeric, 0),
    p_data->>'description',
    'new'
  )
  RETURNING id INTO v_submission_id;

  -- Insert files if any
  IF jsonb_array_length(p_files) > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      INSERT INTO files (
        submission_id,
        filename,
        path,
        mime,
        size,
        bucket
      )
      VALUES (
        v_submission_id,
        v_file->>'filename',
        v_file->>'path',
        v_file->>'mime',
        COALESCE((v_file->>'size')::integer, 0),
        'submissions'
      );
    END LOOP;
  END IF;

  RETURN v_submission_id;
END;
$$;

-- Grant execute permission to anonymous users (for public form submissions)
GRANT EXECUTE ON FUNCTION submit_form(UUID, JSONB, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_form(UUID, JSONB, JSONB) TO authenticated;
