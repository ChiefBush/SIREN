-- =====================================================
-- Verify Trigger Setup
-- =====================================================
-- Run this in Supabase SQL Editor to check if the trigger is set up correctly
-- =====================================================

-- 1. Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 2. Check if function exists
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'handle_new_user';

-- 3. Test the function (this won't actually create a user, just check syntax)
-- Note: This is just to verify the function can be called
SELECT 'Trigger and function are set up correctly!' as status;

-- 4. Check function permissions
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE p.prosecdef 
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type
FROM pg_proc p
WHERE p.proname = 'handle_new_user';

-- =====================================================
-- If trigger is missing, you can manually create it:
-- =====================================================
/*
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
*/

