-- =====================================================
-- FIX PROFILE UPDATE (Enable Users to Update Own Profile)
-- =====================================================

-- 1. Ensure all profile columns exist in the users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_2 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Add RLS Policy for users to update their own profile
-- First drop if exists to avoid errors
DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Ensure Admins can still update everything
-- (The existing "Admins can update users" policy should cover this, 
-- but we make sure they can read everything too)
DROP POLICY IF EXISTS "Admins can read all users" ON users;
CREATE POLICY "Admins can read all users"
ON users FOR SELECT
USING (public.user_has_role(auth.uid(), ARRAY['admin']));

-- =====================================================
-- Migration Complete
-- =====================================================
