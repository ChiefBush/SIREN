-- =====================================================
-- FIX: Infinite Recursion in RLS Policies
-- =====================================================
-- This script fixes the "infinite recursion detected in policy for relation 'users'" error
-- The issue is that RLS policies query the users table, which triggers RLS again, causing infinite recursion
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to check user roles
-- =====================================================

-- Step 1: Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can read all users" ON users;
DROP POLICY IF EXISTS "Supervisors can read miners" ON users;
DROP POLICY IF EXISTS "Admins can update users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Also drop policies on other tables that query users table
DROP POLICY IF EXISTS "Supervisors can acknowledge alerts" ON sensor_alerts;
DROP POLICY IF EXISTS "Supervisors can read all attendance" ON attendance;
DROP POLICY IF EXISTS "Supervisors can insert attendance" ON attendance;
DROP POLICY IF EXISTS "Supervisors can update attendance" ON attendance;
DROP POLICY IF EXISTS "Admins can read all salary" ON salary_calculations;
DROP POLICY IF EXISTS "Admins can create salary" ON salary_calculations;
DROP POLICY IF EXISTS "Admins can update salary" ON salary_calculations;
DROP POLICY IF EXISTS "Supervisors can read all shifts" ON shifts;
DROP POLICY IF EXISTS "Supervisors can update shifts" ON shifts;
DROP POLICY IF EXISTS "Supervisors can create shifts" ON shifts;
DROP POLICY IF EXISTS "Admins can read all incidents" ON incidents;
DROP POLICY IF EXISTS "Admins can update incidents" ON incidents;
DROP POLICY IF EXISTS "Supervisors can update incidents" ON incidents;

-- Step 2: Create a SECURITY DEFINER function to check user role
-- This function bypasses RLS because it runs with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Query users table directly (bypasses RLS due to SECURITY DEFINER)
  SELECT role INTO user_role
  FROM public.users
  WHERE id = user_id;
  
  RETURN COALESCE(user_role, 'miner');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated, anon;

-- Step 3: Create a helper function to check if user has specific role(s)
CREATE OR REPLACE FUNCTION public.user_has_role(user_id UUID, required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := public.get_user_role(user_id);
  RETURN user_role = ANY(required_roles);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.user_has_role(UUID, TEXT[]) TO authenticated, anon;

-- Step 4: Recreate RLS policies using the helper function (no recursion!)

-- Users table policies
CREATE POLICY "Admins can read all users" ON users
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

CREATE POLICY "Supervisors can read miners" ON users
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
    AND role = 'miner'
  );

CREATE POLICY "Admins can update users" ON users
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
    AND auth.uid() != id
  );

-- Sensor alerts policies
CREATE POLICY "Supervisors can acknowledge alerts" ON sensor_alerts
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Attendance policies
CREATE POLICY "Supervisors can read all attendance" ON attendance
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

CREATE POLICY "Supervisors can insert attendance" ON attendance
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

CREATE POLICY "Supervisors can update attendance" ON attendance
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Salary calculations policies
CREATE POLICY "Admins can read all salary" ON salary_calculations
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

CREATE POLICY "Admins can create salary" ON salary_calculations
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

CREATE POLICY "Admins can update salary" ON salary_calculations
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- Shifts policies (if they exist)
CREATE POLICY "Supervisors can read all shifts" ON shifts
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

CREATE POLICY "Supervisors can update shifts" ON shifts
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

CREATE POLICY "Supervisors can create shifts" ON shifts
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Incidents policies
CREATE POLICY "Admins can read all incidents" ON incidents
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

CREATE POLICY "Admins can update incidents" ON incidents
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

CREATE POLICY "Supervisors can update incidents" ON incidents
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- =====================================================
-- Verification
-- =====================================================
-- Test the function (should work without recursion)
-- SELECT public.get_user_role(auth.uid());
-- SELECT public.user_has_role(auth.uid(), ARRAY['admin']);

