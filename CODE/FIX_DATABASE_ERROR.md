# Fix: "Database error saving new user"

## Quick Fix Steps

### Step 1: Verify Database Setup (2 minutes)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Run the Test Script**
   - Click **SQL Editor** → **New query**
   - Open `docs/TEST_DATABASE.sql` from your project
   - Copy the entire file and paste into SQL Editor
   - Click **Run**
   - Check the results - it will tell you what's missing

### Step 2: Run the Complete Schema (if needed)

If the test shows missing tables or policies:

1. **Open `docs/SUPABASE_SCHEMA.sql`** in your project
2. **Copy the ENTIRE file** (all 531 lines)
3. **Paste into Supabase SQL Editor**
4. **Click Run** (or press Ctrl+Enter)
5. **Wait for success message** - should say "Success. No rows returned"

### Step 3: Verify the INSERT Policy Exists

Run this in SQL Editor:

```sql
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'users' AND cmd = 'INSERT';
```

**Expected result**: Should show `Users can insert own record`

**If missing**, run this:

```sql
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
```

### Step 4: Test Signup Again

1. Go back to your app
2. Open browser console (F12 → Console tab)
3. Try signing up
4. Check the console for the exact error

## Common Issues

### Issue: "new row violates row-level security policy"

**Cause**: INSERT policy is missing or incorrect

**Fix**: 
1. Run the complete `docs/SUPABASE_SCHEMA.sql` file
2. OR manually add the policy (see Step 3 above)

### Issue: "relation 'users' does not exist"

**Cause**: Table hasn't been created

**Fix**: Run `docs/SUPABASE_SCHEMA.sql` in Supabase SQL Editor

### Issue: Still getting error after running schema

**Check these**:
1. Did you run the COMPLETE schema file? (all 531 lines)
2. Did you see a success message after running?
3. Check browser console (F12) for the exact error code
4. Try the test script (`docs/TEST_DATABASE.sql`) to see what's missing

## Still Not Working?

1. **Check Browser Console** (F12)
   - Look for the exact error message
   - Copy the error code (e.g., `42501`, `42P01`)

2. **Check Supabase Logs**
   - Dashboard → Logs → Postgres Logs
   - Look for errors around the time you tried to sign up

3. **Verify Your Setup**
   - Run `docs/TEST_DATABASE.sql` again
   - Make sure all checks show ✅

4. **Share the Error**
   - Copy the exact error message from browser console
   - Include the error code
   - This will help identify the specific issue

## Quick Verification Commands

Run these in Supabase SQL Editor to verify everything is set up:

```sql
-- 1. Table exists?
SELECT 'users table exists' FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'users';

-- 2. INSERT policy exists?
SELECT 'INSERT policy exists' FROM pg_policies 
WHERE tablename = 'users' AND cmd = 'INSERT';

-- 3. Trigger exists?
SELECT 'Trigger exists' FROM pg_trigger 
WHERE tgname = 'auto_generate_employee_id';
```

All three should return a row. If any are missing, run the complete schema file.

