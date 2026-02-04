-- Run this in Supabase SQL Editor to add profile fields to the users table
-- This will preserve existing data

ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT; -- Stores URL to image

-- Optional: Create storage bucket for profile photos if you want to support uploads
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
