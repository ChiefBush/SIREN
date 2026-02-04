import { createClient } from '@supabase/supabase-js'

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Get Sensor Database credentials
const sensorDbUrl = process.env.REACT_APP_SENSOR_DB_URL
const sensorDbAnonKey = process.env.REACT_APP_SENSOR_DB_ANON_KEY

// Validate primary credentials
let configValid = true

if (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE_URL' || !supabaseUrl.startsWith('http')) {
  console.error('❌ ERROR: REACT_APP_SUPABASE_URL is not set or invalid.')
  configValid = false
}

if (!supabaseAnonKey || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY' || supabaseAnonKey.length < 50) {
  console.error('❌ ERROR: REACT_APP_SUPABASE_ANON_KEY is not set or invalid.')
  configValid = false
}

// Initializing primary client
let supabase
if (configValid) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    console.log('✅ Primary Supabase client initialized')
  } catch (error) {
    console.error('❌ Error creating primary Supabase client:', error)
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
  }
} else {
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
}

// Initializing sensor database client
let sensorSupabase
if (sensorDbUrl && sensorDbAnonKey && sensorDbUrl.startsWith('http')) {
  try {
    sensorSupabase = createClient(sensorDbUrl, sensorDbAnonKey)
    console.log('✅ Sensor database client initialized')
  } catch (error) {
    console.error('❌ Error creating sensor database client:', error)
    sensorSupabase = supabase // Fallback to primary if fails
  }
} else {
  console.warn('⚠️ Sensor database credentials not found, falling back to primary client')
  sensorSupabase = supabase
}

export { supabase, sensorSupabase }
