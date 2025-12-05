# Database Migrations for Multi-Tenancy

This directory contains SQL migration scripts to transform the application into a multi-tenant system with role-based access control and custom form fields.

## Migration Files

### 000_add_platform_admin_enum.sql ⚠️ RUN FIRST
Adds `platform_admin` to the `app_role` enum.
**MUST be run separately first** due to PostgreSQL enum transaction requirements.

### 001_add_organizations.sql
Creates the core multi-tenancy tables:
- `organizations` - Business/company table
- `user_organization_roles` - Maps users to organizations with roles
- Updates `profiles` table with current_organization_id
- Implements RLS policies for organization access

### 002_update_existing_tables.sql
Updates existing tables for multi-tenancy:
- Adds `organization_id` to forms, submissions, folders
- Adds `created_by` to forms for ownership tracking
- Recreates RLS policies with organization isolation
- Creates indexes for performance

### 003_data_migration.sql
Migrates existing data:
- Creates default "System Organization"
- Assigns all existing data to default organization
- Converts existing admins to super_managers
- Converts forms to custom field format
- Sets NOT NULL constraints after migration

## Running Migrations

### Option 1: Supabase Dashboard (Recommended)
1. Log in to your Supabase dashboard
2. Go to SQL Editor
3. **First**, run `000_add_platform_admin_enum.sql` (MUST be separate)
4. **Wait for it to complete**
5. Then run migrations in order: 001, 002, 003

### Option 2: Supabase CLI
```bash
# Make sure you're in the project directory
cd d:\Portfolio\FormFiller

# Run migrations
supabase db push
```

### Option 3: Manual psql
```bash
# IMPORTANT: Run 000 first and separately!
psql -h <your-supabase-host> -U postgres -d postgres -f supabase/migrations/000_add_platform_admin_enum.sql

# Wait for completion, then run the rest
psql -h <your-supabase-host> -U postgres -d postgres -f supabase/migrations/001_add_organizations.sql
psql -h <your-supabase-host> -U postgres -d postgres -f supabase/migrations/002_update_existing_tables.sql
psql -h <your-supabase-host> -U postgres -d postgres -f supabase/migrations/003_data_migration.sql
```

## ⚠️ Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **Run in Order**: Migrations must be run in sequence (001, 002, 003)
3. **Test Environment**: Test in development/staging before production
4. **Downtime**: These migrations may require brief downtime

## Verification

After running migrations, verify:

```sql
-- Check organizations table
SELECT * FROM organizations;

-- Check user roles
SELECT * FROM user_organization_roles;

-- Verify forms have organization_id
SELECT id, name, organization_id FROM forms LIMIT 5;

-- Verify RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('organizations', 'forms', 'submissions');
```

## Rollback

If you need to rollback:

```sql
-- Drop new tables
DROP TABLE IF EXISTS user_organization_roles CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Remove added columns
ALTER TABLE forms DROP COLUMN IF EXISTS organization_id;
ALTER TABLE forms DROP COLUMN IF EXISTS created_by;
ALTER TABLE submissions DROP COLUMN IF EXISTS organization_id;
ALTER TABLE folders DROP COLUMN IF EXISTS organization_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS current_organization_id;
```

## Next Steps

After migrations:
1. Update Supabase TypeScript types: `npm run supabase:gen-types`
2. Update application code to use new schema
3. Implement organization signup flow
4. Test multi-tenant isolation
