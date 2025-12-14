-- =====================================================
-- Check User Roles in Database
-- =====================================================
-- Run this in Supabase SQL Editor to verify user roles
-- =====================================================

-- Check all users and their roles
SELECT 
  id,
  email,
  full_name,
  role,
  employee_id,
  created_at
FROM users
ORDER BY created_at DESC;

-- Check specific user by email
-- Replace 'user@example.com' with the email you want to check
SELECT 
  id,
  email,
  full_name,
  role,
  employee_id
FROM users
WHERE email = 'user@example.com';

-- Check if roles are correct (should be lowercase: miner, supervisor, admin)
SELECT 
  role,
  COUNT(*) as count
FROM users
GROUP BY role
ORDER BY role;

-- Update a user's role if needed (DEVELOPMENT ONLY)
-- Replace 'user@example.com' and 'admin' with appropriate values
/*
UPDATE users
SET role = 'admin'
WHERE email = 'user@example.com';
*/

-- Verify role values are correct
SELECT 
  email,
  role,
  CASE 
    WHEN role IN ('miner', 'supervisor', 'admin') THEN '✅ Valid'
    ELSE '❌ Invalid'
  END as status
FROM users;


