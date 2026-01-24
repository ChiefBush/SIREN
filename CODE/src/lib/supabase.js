import { createClient } from '@supabase/supabase-js'

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Validate environment variables
let configValid = true

if (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE_URL' || !supabaseUrl.startsWith('http')) {
  console.error('❌ ERROR: REACT_APP_SUPABASE_URL is not set or invalid.')
  console.error('The URL should start with https:// and look like: https://xxxxx.supabase.co')
  configValid = false
}

if (!supabaseAnonKey || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY' || supabaseAnonKey.length < 50) {
  console.error('❌ ERROR: REACT_APP_SUPABASE_ANON_KEY is not set or invalid.')
  console.error('The key should be a long string (usually 100+ characters)')
  console.error('Make sure you copied the ENTIRE key from Supabase dashboard')
  configValid = false
}

if (!configValid) {
  console.error('')
  console.error('📝 To fix this:')
  console.error('1. Go to your Supabase project dashboard')
  console.error('2. Click on Settings (gear icon) → API')
  console.error('3. Copy the "Project URL" (starts with https://)')
  console.error('4. Copy the "anon public" key (the long string under "Project API keys")')
  console.error('5. Create a .env file in the root directory with:')
  console.error('   REACT_APP_SUPABASE_URL=https://your-project.supabase.co')
  console.error('   REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
  console.error('6. Restart the development server (npm start)')
  console.error('')
}

// Only create client if we have valid credentials
let supabase
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http') && supabaseAnonKey.length > 50) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    console.log('✅ Supabase client initialized successfully')
  } catch (error) {
    console.error('❌ Error creating Supabase client:', error)
    // Fallback to placeholder to prevent app crash
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
  }
} else {
  // Create a dummy client to prevent crashes, but it won't work
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
  console.warn('⚠️ Supabase client initialized with placeholder values.')
  console.warn('⚠️ Please configure your .env file with valid Supabase credentials.')
}

export { supabase }
