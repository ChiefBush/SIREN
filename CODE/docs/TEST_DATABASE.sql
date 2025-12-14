-- =====================================================
-- Database Setup Verification Script
-- =====================================================
-- Run this in Supabase SQL Editor to verify your setup
-- This will help identify what's missing
-- =====================================================

-- 1. Check if users table exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
    THEN '✅ users table exists'
    ELSE '❌ users table DOES NOT exist - Run SUPABASE_SCHEMA.sql'
  END as table_check;

-- 2. Check table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Check if RLS is enabled
SELECT 
  CASE 
    WHEN rowsecurity = true
    THEN '✅ RLS is enabled'
    ELSE '❌ RLS is NOT enabled'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'users';

-- 4. Check INSERT policies
SELECT 
  policyname,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT';

-- Expected result: Should see "Users can insert own record" policy

-- 5. Check if trigger exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auto_generate_employee_id')
    THEN '✅ Trigger exists'
    ELSE '❌ Trigger DOES NOT exist - Run SUPABASE_SCHEMA.sql'
  END as trigger_check;

-- 6. Check trigger function
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_employee_id')
    THEN '✅ Trigger function exists'
    ELSE '❌ Trigger function DOES NOT exist - Run SUPABASE_SCHEMA.sql'
  END as function_check;

-- 7. Test INSERT policy (this will show if policy allows inserts)
-- Note: This won't actually insert, just check the policy
SELECT 
  'To test INSERT policy, try signing up in the app. If it fails, check the policy above.' as note;

-- =====================================================
-- If INSERT policy is missing, run this:
-- =====================================================
/*
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
*/

-- =====================================================
-- If trigger is missing, check SUPABASE_SCHEMA.sql
-- for the complete trigger setup
-- =====================================================

