<?php
// File: CTRL1/ingest.php  (example)
require_once __DIR__ . '/supabase_client.php';

$body = file_get_contents('php://input');
$data = json_decode($body, true) ?: [];

$payload = [
  "device_id" => $data["device_id"] ?? "EDGE-001",
  "ts"        => date('c'), // keep your NTP ts in data if you have it
  "gas_ppm"   => $data["gas_ppm"] ?? null,
  "danger"    => $data["danger"] ?? false,
  "meta"      => $data
];

echo supabase_insert_telemetry($payload); 