-- =====================================================
-- Leave Applications Table Schema Update
-- =====================================================
-- This migration adds the leave_type column to the leave_applications table
-- and creates the table if it doesn't exist yet
-- =====================================================

-- Create leave_applications table if it doesn't exist
CREATE TABLE IF NOT EXISTS leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  leave_type TEXT DEFAULT 'sick' CHECK (leave_type IN ('sick', 'casual', 'annual', 'emergency')),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add leave_type column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leave_applications' 
    AND column_name = 'leave_type'
  ) THEN
    ALTER TABLE leave_applications 
    ADD COLUMN leave_type TEXT DEFAULT 'sick' CHECK (leave_type IN ('sick', 'casual', 'annual', 'emergency'));
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leave_applications_user ON leave_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_applications(status);
CREATE INDEX IF NOT EXISTS idx_leave_applications_dates ON leave_applications(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_applications_created ON leave_applications(created_at DESC);

-- Enable RLS on leave_applications table
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own leave applications" ON leave_applications;
DROP POLICY IF EXISTS "Users can create own leave applications" ON leave_applications;
DROP POLICY IF EXISTS "Supervisors can read all leave applications" ON leave_applications;
DROP POLICY IF EXISTS "Supervisors can update leave applications" ON leave_applications;

-- RLS Policies for leave_applications

-- Users can read their own leave applications
CREATE POLICY "Users can read own leave applications" ON leave_applications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own leave applications
CREATE POLICY "Users can create own leave applications" ON leave_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Supervisors and admins can read all leave applications
CREATE POLICY "Supervisors can read all leave applications" ON leave_applications
  FOR SELECT USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- Supervisors and admins can update leave application status
CREATE POLICY "Supervisors can update leave applications" ON leave_applications
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), ARRAY['supervisor', 'admin'])
  );

-- =====================================================
-- Migration Complete
-- =====================================================
-- The leave_applications table is now ready with:
-- - leave_type field for categorizing leave types
-- - Proper RLS policies for miners and supervisors
-- - Indexes for optimal query performance
-- =====================================================
