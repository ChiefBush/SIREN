# Database Setup Guide

## Problem: "Database error saving new user"

This error occurs when:
1. The database schema hasn't been run in Supabase
2. The `users` table doesn't exist
3. Row Level Security (RLS) policies are blocking inserts

## Solution: Run the Database Schema

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on **SQL Editor** in the left sidebar
4. Click **New query**

### Step 2: Run the Schema File

1. Open the file `docs/SUPABASE_SCHEMA.sql` in your project
2. Copy the **entire contents** of the file
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

### Step 3: Verify the Setup

After running the schema, you should see:
- ✅ All tables created successfully
- ✅ Triggers created (for auto-generating employee IDs)
- ✅ RLS policies enabled

You can verify by:
1. Go to **Table Editor** in Supabase
2. You should see the `users` table listed
3. Check that RLS is enabled (there should be a lock icon)

### Step 4: Create Storage Bucket
1. Open the file `docs/CREATE_STORAGE_BUCKET.sql` in your project
2. Copy the **entire contents** of the file
3. Paste it into the Supabase SQL Editor
4. Click **Run**

This will:
- ✅ Create the `avatars` bucket
- ✅ Set it to public visibility
- ✅ Configure Row Level Security (RLS) policies for secure uploads

### Step 5: Test Signup & Profile Photo
1. Go back to your application
2. Try signing up or editing your profile to upload a photo
3. It should work now!

## What the Schema Does

The `SUPABASE_SCHEMA.sql` file:
- ✅ Creates all required tables (`users`, `sensor_data`, `attendance`, etc.)
- ✅ Sets up auto-generation of employee IDs (MIN-0001, SUP-0001, etc.)
- ✅ Configures Row Level Security (RLS) policies
- ✅ Allows users to insert their own record during signup
- ✅ Sets up proper indexes for performance

## Important Notes

⚠️ **The schema file includes `DROP TABLE` commands** - This means if you run it again, it will delete all existing data and recreate the tables. This is useful during development but be careful in production!

⚠️ **RLS Policies**: The schema enables Row Level Security on all tables. This is important for data security but requires proper policies (which are included in the schema).

## Troubleshooting

### Error: "relation 'users' does not exist"
- **Solution**: Run the `SUPABASE_SCHEMA.sql` file in Supabase SQL Editor

### Error: "permission denied for table users"
- **Solution**: Make sure you ran the complete schema file, including the RLS policies. The schema includes a policy that allows users to insert their own record.

### Error: "duplicate key value violates unique constraint"
- **Solution**: This might happen if you're trying to sign up with an email that already exists. Try a different email.

### Employee ID not generating
- **Solution**: Make sure the trigger `auto_generate_employee_id` was created. Check in Supabase SQL Editor by running:
  ```sql
  SELECT * FROM pg_trigger WHERE tgname = 'auto_generate_employee_id';
  ```

## Quick Check Commands

Run these in Supabase SQL Editor to verify setup:

```sql
-- Check if users table exists
SELECT * FROM users LIMIT 1;

-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'auto_generate_employee_id';

-- Check RLS policies on users table
SELECT * FROM pg_policies WHERE tablename = 'users';
```

If any of these return empty results, you need to run the schema file again.

