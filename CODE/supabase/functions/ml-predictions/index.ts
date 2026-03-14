import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validate that it's a POST request
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse the incoming JSON body from the ML Model
    const reqData = await req.json()
    const { prediction_type, risk_score, risk_level, miner_id, details } = reqData

    // 3. Basic validation
    if (!prediction_type || risk_score === undefined || !risk_level) {
      return new Response(JSON.stringify({ error: 'Missing required fields: prediction_type, risk_score, risk_level' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Initialize Supabase client using Service Role Key to bypass RLS
    // These environment variables are automatically injected by Supabase Edge Functions
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 5. Build the data object
    const insertData = {
      prediction_type,
      risk_score,
      risk_level,
    }

    if (miner_id) insertData.miner_id = miner_id
    if (details) insertData.details = details

    // 6. Insert into the ml_predictions table
    const { data, error } = await supabaseClient
      .from('ml_predictions')
      .insert(insertData)
      .select()

    if (error) {
      console.error('Error inserting prediction:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 7. Return success response
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
