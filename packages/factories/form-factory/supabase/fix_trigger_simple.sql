-- SIMPLE FIX: Recreate the signup trigger
-- Copy and paste this entire script into Supabase SQL Editor and run it

-- Drop the existing trigger (if it exists)
DROP TRIGGER IF EXISTS on_user_created ON auth.users;

-- Recreate the trigger
CREATE TRIGGER on_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Verify the trigger is active
SELECT 
    tgname AS trigger_name,
    CASE tgenabled
        WHEN 'O' THEN 'enabled'
        WHEN 'D' THEN 'disabled'
        WHEN 'R' THEN 'replica'
        WHEN 'A' THEN 'always'
        ELSE 'unknown'
    END AS status
FROM pg_trigger t
WHERE tgname = 'on_user_created'
  AND tgrelid = 'auth.users'::regclass;
