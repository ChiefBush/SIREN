-- Add emergency_contact_2 column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_2 TEXT;

-- Ensure other fields exist (just in case)
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number TEXT;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users';
