-- Create incidents table
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
  resolved_by UUID REFERENCES users(id)
);

-- Enable RLS
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date DESC);

-- RLS Policies

-- 1. All authenticated users can INSERT incidents
DROP POLICY IF EXISTS "Users can report incidents" ON incidents;
CREATE POLICY "Users can report incidents" ON incidents
  FOR INSERT WITH CHECK (auth.uid() = reported_by);

-- 2. Users can VIEW their own incidents
DROP POLICY IF EXISTS "Users can view their own incidents" ON incidents;
CREATE POLICY "Users can view their own incidents" ON incidents
  FOR SELECT USING (auth.uid() = reported_by);

-- 3. Supervisors and Admins can VIEW ALL incidents
-- Note: This requires the user metadata or a separate query to check role. 
-- For simplicity in this RLS, we often use a lookup or just allow if the user exists in the users table with specific roles.
-- However, Supabase auth.jwt() -> user_metadata is efficient. 
-- Alternatively, we can use an EXISTS clause.

DROP POLICY IF EXISTS "Supervisors and Admins can view all incidents" ON incidents;
CREATE POLICY "Supervisors and Admins can view all incidents" ON incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (role = 'supervisor' OR role = 'admin')
    )
  );

-- 4. Supervisors and Admins can UPDATE incidents (e.g., to change status)
DROP POLICY IF EXISTS "Supervisors and Admins can update incidents" ON incidents;
CREATE POLICY "Supervisors and Admins can update incidents" ON incidents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (role = 'supervisor' OR role = 'admin')
    )
  );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
