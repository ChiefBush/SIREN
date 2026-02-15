-- =====================================================
-- RESTRICT PROFILE UPDATES
-- =====================================================

-- 1. Add is_profile_completed column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN DEFAULT FALSE;

-- 2. Update RLS Policy for users to update their own profile
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Create new policy: Users can only update if is_profile_completed is FALSE
-- OR if they are an admin (though admins usually use the Admin policy)
-- We'll rely on a separate Admin policy for admin overrides.
-- This policy STRICTLY controls the user's ability to self-update.

CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (
  auth.uid() = id 
  AND (
    is_profile_completed = FALSE 
    OR 
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
)
WITH CHECK (
  auth.uid() = id
  AND (
    is_profile_completed = FALSE 
    OR 
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
);

-- 3. Ensure "Users can read own data" allows reading the new column
-- (Already covered by "Users can read own data" policy typically selecting all columns or implicitly allowing)

-- 4. Let's explicitly double check the Admin policy to ensure they can update ANY profile regardless of flag
-- Drop existing Admin update policy to be safe and recreate it
DROP POLICY IF EXISTS "Admins can update users" ON users;

CREATE POLICY "Admins can update users"
ON users FOR UPDATE
USING (
  public.user_has_role(auth.uid(), ARRAY['admin'])
);

-- 5. Grant permissions just in case (usually not needed for Postgres RLS if table perms are set, but good practice)
GRANT UPDATE (is_profile_completed) ON users TO authenticated;

-- Force a schema cache reload usually happens automatically in Supabase but harmless to mention
NOTIFY pgrst, 'reload schema';
