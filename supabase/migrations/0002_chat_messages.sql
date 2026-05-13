-- Migration: Create chat_messages table for SIREN miner-supervisor communication
-- Created: 2026-05-14

-- Create the chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('miner', 'supervisor', 'admin')),
    message_text TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed')),
    api_success BOOLEAN,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_timestamp ON chat_messages(user_id, timestamp);

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for access control

-- Allow admins to see all messages
CREATE POLICY "admin_full_access_chat_messages"
    ON chat_messages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Allow supervisors to see messages for miners they supervise
-- (For simplicity, supervisors can see all miner messages - adjust if needed)
CREATE POLICY "supervisor_read_chat_messages"
    ON chat_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('supervisor', 'admin')
        )
    );

CREATE POLICY "supervisor_insert_chat_messages"
    ON chat_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('supervisor', 'admin')
        )
    );

CREATE POLICY "supervisor_update_chat_messages"
    ON chat_messages
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('supervisor', 'admin')
        )
    );

-- Allow miners to see their own messages only
CREATE POLICY "miner_own_messages"
    ON chat_messages
    FOR SELECT
    USING (user_id = auth.uid());

-- Allow miners to send messages
CREATE POLICY "miner_insert_messages"
    ON chat_messages
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Allow miners to update their own messages (for delivery_status updates)
CREATE POLICY "miner_update_own_messages"
    ON chat_messages
    FOR UPDATE
    USING (user_id = auth.uid());

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
