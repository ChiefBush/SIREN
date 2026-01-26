-- =====================================================
-- SIREN Application - Complete Supabase Database Schema
-- =====================================================
-- Run this entire file in Supabase SQL Editor
-- This will DROP existing tables and recreate everything
-- WARNING: This will delete all existing data!
-- =====================================================

-- =====================================================
-- DROP EXISTING TABLES (in dependency order)
-- =====================================================
-- Drop tables that have foreign keys first, then parent tables

-- Drop triggers first (must drop before functions they depend on)
DROP TRIGGER IF EXISTS auto_generate_employee_id ON users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop functions (after triggers are dropped)
DROP FUNCTION IF EXISTS generate_employee_id();
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Drop tables (child tables first, then parent tables)
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS health_safety_logs CASCADE;
DROP TABLE IF EXISTS salary_calculations CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS sensor_alerts CASCADE;
DROP TABLE IF EXISTS sensor_data CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 1. USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  employee_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'miner' CHECK (role IN ('miner', 'supervisor', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

-- =====================================================
-- 2. SENSOR_DATA TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS sensor_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mq2 NUMERIC,
  mq9 NUMERIC,
  mq135 NUMERIC,
  dht11_temp NUMERIC,
  dht11_humidity NUMERIC,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  device_id TEXT,
  location TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for sensor_data table
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_device ON sensor_data(device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_user ON sensor_data(user_id);

-- =====================================================
-- 3. SENSOR_ALERTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS sensor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'warning' CHECK (status IN ('warning', 'critical', 'acknowledged', 'resolved')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for sensor_alerts table
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_status ON sensor_alerts(status);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_created ON sensor_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_user ON sensor_alerts(user_id);

-- =====================================================
-- 4. ATTENDANCE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  entry_time TIME,
  exit_time TIME,
  hours_worked NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'early_leave')),
  marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Indexes for attendance table
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON attendance(marked_by);

-- =====================================================
-- 5. SALARY_CALCULATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS salary_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hours_worked NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for salary_calculations table
CREATE INDEX IF NOT EXISTS idx_salary_user ON salary_calculations(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_period ON salary_calculations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_salary_status ON salary_calculations(status);

-- =====================================================
-- 6. HEALTH_SAFETY_LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS health_safety_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  fatigue_level TEXT CHECK (fatigue_level IN ('low', 'moderate', 'high', 'severe')),
  symptoms TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for health_safety_logs table
CREATE INDEX IF NOT EXISTS idx_health_user ON health_safety_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_health_date ON health_safety_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_health_fatigue ON health_safety_logs(fatigue_level);

-- =====================================================
-- 7. SHIFTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for shifts table
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_assigned_by ON shifts(assigned_by);

-- =====================================================
-- 8. INCIDENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('accident', 'hazard', 'near_miss', 'equipment_failure', 'environmental', 'other')),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'reported' CHECK (status IN ('reported', 'in_progress', 'resolved', 'closed')),
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for incidents table
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);

-- =====================================================
-- 9. EMPLOYEE ID AUTO-GENERATION TRIGGER
-- =====================================================

-- Function to generate employee ID
CREATE OR REPLACE FUNCTION generate_employee_id()
RETURNS TRIGGER AS $$
DECLARE
  role_prefix TEXT;
  role_count INTEGER;
  new_employee_id TEXT;
BEGIN
  -- Determine prefix based on role
  CASE NEW.role
    WHEN 'miner' THEN role_prefix := 'MIN';
    WHEN 'supervisor' THEN role_prefix := 'SUP';
    WHEN 'admin' THEN role_prefix := 'ADM';
    ELSE role_prefix := 'USR';
  END CASE;

  -- Count existing users with the same role
  SELECT COUNT(*) INTO role_count
  FROM users
  WHERE role = NEW.role;

  -- Generate employee ID: PREFIX-XXXX format (4-digit number)
  new_employee_id := role_prefix || '-' || LPAD((role_count + 1)::TEXT, 4, '0');

  -- Ensure uniqueness (in case of race conditions)
  WHILE EXISTS (SELECT 1 FROM users WHERE employee_id = new_employee_id) LOOP
    role_count := role_count + 1;
    new_employee_id := role_prefix || '-' || LPAD((role_count + 1)::TEXT, 4, '0');
  END LOOP;

  NEW.employee_id := new_employee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires before insert
CREATE TRIGGER auto_generate_employee_id
  BEFORE INSERT ON users
  FOR EACH ROW
  WHEN (NEW.employee_id IS NULL)
  EXECUTE FUNCTION generate_employee_id();

-- =====================================================
-- 11. AUTO-CREATE USER RECORD ON AUTH SIGNUP
-- =====================================================
-- This trigger automatically creates a user record in public.users
-- when a new user signs up via Supabase Auth
-- Note: This requires the role to be passed via user_metadata during signup

-- Function to handle new auth user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  role_prefix TEXT;
  role_count INTEGER;
  new_employee_id TEXT;
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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth signup
    RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions to the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role;

-- Important: The function runs with SECURITY DEFINER, so it bypasses RLS
-- However, we need to make sure the function owner has proper permissions
-- The function will run as the postgres role, which has full access

-- Create trigger on auth.users
-- This trigger fires AFTER a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 9. HELPER FUNCTIONS FOR RLS (Prevent Infinite Recursion)
-- =====================================================
-- These functions bypass RLS to check user roles without causing infinite recursion

-- Function to get user role (bypasses RLS)
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated, anon;

-- Function to check if user has specific role(s)
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

-- =====================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_safety_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USERS TABLE POLICIES
-- =====================================================

-- Users can insert their own record (for signup)
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users can read their own record
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Admins can read all users (uses helper function to avoid recursion)
CREATE POLICY "Admins can read all users" ON users
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- Supervisors can read miners (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can read miners" ON users
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
    AND role = 'miner'
  );

-- Admins can update user roles (uses helper function to avoid recursion)
CREATE POLICY "Admins can update users" ON users
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- Admins can delete users (except themselves) (uses helper function to avoid recursion)
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
    AND auth.uid() != id
  );

-- =====================================================
-- SENSOR_DATA TABLE POLICIES
-- =====================================================

-- All authenticated users can read sensor data
CREATE POLICY "Authenticated users can read sensor data" ON sensor_data
  FOR SELECT USING (auth.role() = 'authenticated');

-- System/service accounts can insert sensor data
-- Note: Adjust this based on your authentication setup
CREATE POLICY "Service can insert sensor data" ON sensor_data
  FOR INSERT WITH CHECK (true); -- Adjust based on your service account setup

-- =====================================================
-- SENSOR_ALERTS TABLE POLICIES
-- =====================================================

-- All authenticated users can read alerts
CREATE POLICY "Authenticated users can read alerts" ON sensor_alerts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admins and supervisors can acknowledge alerts (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can acknowledge alerts" ON sensor_alerts
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- System can create alerts
CREATE POLICY "System can create alerts" ON sensor_alerts
  FOR INSERT WITH CHECK (true); -- Adjust based on your service account setup

-- =====================================================
-- ATTENDANCE TABLE POLICIES
-- =====================================================

-- Users can read their own attendance
CREATE POLICY "Users can read own attendance" ON attendance
  FOR SELECT USING (auth.uid() = user_id);

-- Supervisors and admins can read all attendance (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can read all attendance" ON attendance
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Supervisors and admins can insert attendance (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can insert attendance" ON attendance
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Supervisors and admins can update attendance (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can update attendance" ON attendance
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- =====================================================
-- SALARY_CALCULATIONS TABLE POLICIES
-- =====================================================

-- Users can read their own salary records
CREATE POLICY "Users can read own salary" ON salary_calculations
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all salary records (uses helper function to avoid recursion)
CREATE POLICY "Admins can read all salary" ON salary_calculations
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- Admins can create salary records (uses helper function to avoid recursion)
CREATE POLICY "Admins can create salary" ON salary_calculations
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- Admins can update salary records (uses helper function to avoid recursion)
CREATE POLICY "Admins can update salary" ON salary_calculations
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- =====================================================
-- HEALTH_SAFETY_LOGS TABLE POLICIES
-- =====================================================

-- Users can read and create their own logs
CREATE POLICY "Users can read own health logs" ON health_safety_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own health logs
CREATE POLICY "Users can create own health logs" ON health_safety_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Supervisors and admins can read all health logs (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can read all health logs" ON health_safety_logs
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- =====================================================
-- SHIFTS TABLE POLICIES
-- =====================================================

-- Users can read their own shifts
CREATE POLICY "Users can read own shifts" ON shifts
  FOR SELECT USING (auth.uid() = user_id);

-- Supervisors and admins can read all shifts (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can read all shifts" ON shifts
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Supervisors and admins can create shifts (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can create shifts" ON shifts
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Supervisors and admins can update shifts (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can update shifts" ON shifts
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Supervisors and admins can delete shifts (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can delete shifts" ON shifts
  FOR DELETE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- =====================================================
-- INCIDENTS TABLE POLICIES
-- =====================================================

-- Users can read and create incidents
CREATE POLICY "Users can read incidents" ON incidents
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can create incidents
CREATE POLICY "Users can create incidents" ON incidents
  FOR INSERT WITH CHECK (auth.uid() = reported_by);

-- Supervisors and admins can update all incidents (uses helper function to avoid recursion)
CREATE POLICY "Supervisors can update incidents" ON incidents
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Admins can delete incidents (uses helper function to avoid recursion)
CREATE POLICY "Admins can delete incidents" ON incidents
  FOR DELETE USING (
    public.user_has_role(auth.uid(), ARRAY['admin'])
  );

-- =====================================================
-- 11. ENABLE REAL-TIME (Optional but Recommended)
-- =====================================================
-- Note: Enable replication in Supabase Dashboard → Database → Replication
-- for the following tables:
-- - sensor_data
-- - sensor_alerts
-- - incidents
-- - attendance (optional)

-- =====================================================
-- SCHEMA COMPLETE
-- =====================================================
-- All tables, indexes, triggers, and RLS policies have been created.
-- 
-- IMPORTANT NOTES:
-- 1. This script DROPS all existing tables and recreates them
-- 2. All existing data will be deleted when you run this script
-- 3. Use this for development/testing or when you want to reset the database
-- 
-- Next steps:
-- 1. Enable real-time replication in Supabase Dashboard → Database → Replication
--    Enable for: sensor_data, sensor_alerts, incidents
-- 2. Test the employee ID auto-generation by creating a user
-- 3. Verify RLS policies are working correctly
-- 4. Create your first admin user through the signup form
-- =====================================================

