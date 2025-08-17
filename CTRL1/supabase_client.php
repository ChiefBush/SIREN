<?php
// File: CTRL1/supabase_client.php
function supabase_insert_telemetry($payload) {
  $supabase_url = getenv('SUPABASE_URL');
  $service_key  = getenv('SUPABASE_SERVICE_ROLE_KEY'); // store in server env, NOT in code

  $ch = curl_init("$supabase_url/rest/v1/telemetry");
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
      "apikey: $service_key",
      "Authorization: Bearer $service_key",
      "Content-Type: application/json",
      "Prefer: return=representation"
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
  ]);
  $out = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($code >= 200 && $code < 300) return $out;
  http_response_code($code);
  echo $out;
  exit;
} 