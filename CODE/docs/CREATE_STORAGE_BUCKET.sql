-- =====================================================
-- STORAGE BUCKET CREATION & POLICIES
-- =====================================================

-- 1. Create the 'avatars' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on objects (storage.objects)
-- (It's usually enabled by default, but good to ensure)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for the 'avatars' bucket

-- Allow public read access to avatars
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatar, or admins to upload any
-- (The implementation uses the user ID as the filename at the root level)
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] IS NULL AND
  (name = auth.uid()::text OR public.user_has_role(auth.uid(), ARRAY['admin']))
);

-- Allow authenticated users to update their own avatar, or admins to update any
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (name = auth.uid()::text OR public.user_has_role(auth.uid(), ARRAY['admin']))
);

-- Allow authenticated users to delete their own avatar, or admins to delete any
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (name = auth.uid()::text OR public.user_has_role(auth.uid(), ARRAY['admin']))
);

-- Note: The implementation in UserProfileModal.jsx uses just `${user.id}` 
-- as the filename (no extension) at the root level of the bucket.
