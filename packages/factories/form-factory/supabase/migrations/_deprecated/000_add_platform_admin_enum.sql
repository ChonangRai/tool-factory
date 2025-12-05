-- 000_create_app_role_enum_and_add_platform_admin.sql

-- Step 1: Create the enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('admin', 'platform_admin', 'super_manager', 'manager', 'staff', 'guest');  -- default roles
    END IF;
END$$;

-- Step 2: Add the new value to the enum
DO $$
BEGIN
    -- Only add 'platform_admin' if it does not exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'app_role' AND e.enumlabel = 'platform_admin'
    ) THEN
        ALTER TYPE app_role ADD VALUE 'platform_admin';
    END IF;
END$$;
