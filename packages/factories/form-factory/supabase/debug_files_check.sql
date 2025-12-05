-- DEBUG: Check if files are being linked to submissions
-- Run this in Supabase SQL Editor

SELECT 
  s.id as submission_id,
  s.created_at,
  s.status,
  f.name as form_name,
  count(fi.id) as file_count
FROM submissions s
LEFT JOIN forms f ON f.id = s.form_id
LEFT JOIN files fi ON fi.submission_id = s.id
GROUP BY s.id, s.created_at, s.status, f.name
ORDER BY s.created_at DESC
LIMIT 10;
