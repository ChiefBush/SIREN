# Troubleshooting Guide

## "Database error saving new user"

If you're still getting this error after running the schema, follow these steps:

### Step 1: Check Browser Console

1. Open your browser's Developer Tools (Press F12)
2. Go to the **Console** tab
3. Try signing up again
4. Look for error messages - they will show the exact problem

### Step 2: Verify Database Setup

Run these commands in Supabase SQL Editor to check if everything is set up correctly:

```sql
-- 1. Check if users table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'users';

-- 2. Check if INSERT policy exists
SELECT * 
FROM pg_policies 
WHERE tablename = 'users' AND policyname = 'Users can insert own record';

-- 3. Check if trigger exists
SELECT * 
FROM pg_trigger 
WHERE tgname = 'auto_generate_employee_id';

-- 4. Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';
```

### Step 3: Common Issues and Fixes

#### Issue 1: "permission denied" or "new row violates row-level security"

**Problem**: The INSERT policy is missing or not working.

**Fix**: 
1. Go to Supabase SQL Editor
2. Run this command to add the policy:
```sql
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
```

#### Issue 2: "relation 'users' does not exist"

**Problem**: The users table hasn't been created.

**Fix**: 
1. Run the complete `docs/SUPABASE_SCHEMA.sql` file in Supabase SQL Editor
2. Make sure you run the ENTIRE file, not just parts of it

#### Issue 3: "check constraint violation" for role

**Problem**: The role value doesn't match the database constraint.

**Fix**: The role must be exactly one of: `miner`, `supervisor`, or `admin` (all lowercase). The form should handle this, but if you see this error, check that the role dropdown is working correctly.

#### Issue 4: "duplicate key value" for email

**Problem**: You're trying to sign up with an email that already exists.

**Fix**: Use a different email address, or try logging in instead.

#### Issue 5: Trigger not generating employee_id

**Problem**: The trigger function isn't working.

**Fix**: 
1. Check if the trigger exists (use the SQL query in Step 2)
2. If it doesn't exist, run this in Supabase SQL Editor:
```sql
-- First create the function
CREATE OR REPLACE FUNCTION generate_employee_id()
RETURNS TRIGGER AS $$
DECLARE
  role_prefix TEXT;
  role_count INTEGER;
  new_employee_id TEXT;
BEGIN
  CASE NEW.role
    WHEN 'miner' THEN role_prefix := 'MIN';
    WHEN 'supervisor' THEN role_prefix := 'SUP';
    WHEN 'admin' THEN role_prefix := 'ADM';
    ELSE role_prefix := 'USR';
  END CASE;

  SELECT COUNT(*) INTO role_count
  FROM users
  WHERE role = NEW.role;

  new_employee_id := role_prefix || '-' || LPAD((role_count + 1)::TEXT, 4, '0');

  WHILE EXISTS (SELECT 1 FROM users WHERE employee_id = new_employee_id) LOOP
    role_count := role_count + 1;
    new_employee_id := role_prefix || '-' || LPAD((role_count + 1)::TEXT, 4, '0');
  END LOOP;

  NEW.employee_id := new_employee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Then create the trigger
CREATE TRIGGER auto_generate_employee_id
  BEFORE INSERT ON users
  FOR EACH ROW
  WHEN (NEW.employee_id IS NULL)
  EXECUTE FUNCTION generate_employee_id();
```

### Step 4: Complete Reset (If Nothing Works)

If you're still having issues, you can completely reset the database:

1. **WARNING**: This will delete ALL data!

2. In Supabase SQL Editor, run:
```sql
-- Drop everything
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS health_safety_logs CASCADE;
DROP TABLE IF EXISTS salary_calculations CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS sensor_alerts CASCADE;
DROP TABLE IF EXISTS sensor_data CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TRIGGER IF EXISTS auto_generate_employee_id ON users;
DROP FUNCTION IF EXISTS generate_employee_id();
```

3. Then run the complete `docs/SUPABASE_SCHEMA.sql` file again

### Step 5: Check Supabase Project Status

1. Go to your Supabase dashboard
2. Make sure your project is **Active** (not paused)
3. Check if you have any billing issues
4. Verify your API keys are correct in Settings → API

### Getting Help

If you're still stuck:
1. Check the browser console (F12) for the exact error message
2. Check Supabase logs: Dashboard → Logs → Postgres Logs
3. Share the exact error message from the console

The error messages in the app should now be more specific and tell you exactly what's wrong!

