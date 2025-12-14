-- =====================================================
-- Fix Trigger Error - Alternative Approach
-- =====================================================
-- If the trigger is causing issues, try this approach:
-- 1. Disable the trigger temporarily
-- 2. Use a simpler function
-- 3. Or create the user record manually after signup
-- =====================================================

-- Option 1: Drop and recreate the trigger with better error handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the function with explicit error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  role_prefix TEXT;
  role_count INTEGER;
  new_employee_id TEXT;
BEGIN
  BEGIN
    -- Get role from user_metadata, default to 'miner' if not provided
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'miner');
    
    -- Ensure role is valid
    IF user_role NOT IN ('miner', 'supervisor', 'admin') THEN
      user_role := 'miner';
    END IF;
    
    -- Determine prefix based on role
    CASE user_role
      WHEN 'miner' THEN role_prefix := 'MIN';
      WHEN 'supervisor' THEN role_prefix := 'SUP';
      WHEN 'admin' THEN role_prefix := 'ADM';
      ELSE role_prefix := 'USR';
    END CASE;

    -- Count existing users with the same role
    SELECT COUNT(*) INTO role_count
    FROM public.users
    WHERE role = user_role;

    -- Generate employee ID: PREFIX-XXXX format (4-digit number)
    new_employee_id := role_prefix || '-' || LPAD((role_count + 1)::TEXT, 4, '0');

    -- Ensure uniqueness (in case of race conditions)
    WHILE EXISTS (SELECT 1 FROM public.users WHERE employee_id = new_employee_id) LOOP
      role_count := role_count + 1;
      new_employee_id := role_prefix || '-' || LPAD((role_count + 1)::TEXT, 4, '0');
    END LOOP;

    -- Insert into public.users table
    -- Use ON CONFLICT to handle cases where record might already exist
    INSERT INTO public.users (id, email, full_name, role, employee_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      user_role,
      new_employee_id
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      employee_id = EXCLUDED.employee_id;

  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't fail the auth signup
      -- The user record can be created later on first login
      RAISE WARNING 'Error creating user record in handle_new_user: % - %', SQLSTATE, SQLERRM;
      -- Don't re-raise - allow auth signup to succeed
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Option 2: If trigger still fails, disable it and handle in frontend
-- =====================================================
/*
-- Disable the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Then the frontend will create the user record after signup
-- This is already handled in AuthPage.jsx with a fallback
*/

-- =====================================================
-- Option 3: Check if RLS is blocking the function
-- =====================================================
-- Temporarily disable RLS on users table for testing
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- (Don't leave this disabled in production!)

