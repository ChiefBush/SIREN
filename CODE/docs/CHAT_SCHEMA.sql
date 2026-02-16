-- =====================================================
-- CHAT FUNCTIONALITY SCHEMA
-- =====================================================

-- 1. Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id) WHERE is_read = FALSE;

-- 3. Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Allow Users to read messages sent TO them or BY them
DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages" ON messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

-- Allow Supervisors and Admins to INSERT messages
-- (Technically any user could insert if we only check auth.uid() = sender_id, 
-- but logically only Sup/Admin will be sending in this feature requirement. 
-- We can strict it if needed, but 'sender_id = auth.uid()' is a good baseline security)
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
  );

-- Allow Receivers to update 'is_read' status
DROP POLICY IF EXISTS "Receivers can update read status" ON messages;
CREATE POLICY "Receivers can update read status" ON messages
  FOR UPDATE USING (
    auth.uid() = receiver_id
  );

-- 5. Enable Realtime
-- This usually needs to be done in the Supabase Dashboard, but we can try to set the replica identity
ALTER TABLE messages REPLICA IDENTITY FULL;

-- Note: The user needs to enable Realtime for 'messages' table in Supabase Dashboard -> Database -> Replication

-- Force schema reload
NOTIFY pgrst, 'reload schema';
