/*
This is the controller for the SIREN gas detection system.
It is used to store and retrieve data from the Supabase database.
It is also used to analyze the gas readings and determine the danger level.
Created by: Shishir Dwivedi
Created on: 17/08/2025
Version: 1.0

LOL won't work ;/

*/


<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// Supabase configuration - UPDATE THESE WITH YOUR ACTUAL VALUES
define('SUPABASE_URL', 'https://jdhysidbbagxzqwebdqr.supabase.co');
define('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkaHlzaWRiYmFneHpxd2ViZHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNzMxNDUsImV4cCI6MjA3MDk0OTE0NX0.NhvuwcbLZP0bxBqy3e5GZFhi2qbp7pU_sOMMvVe6Otk');
define('SUPABASE_API_URL', SUPABASE_URL . '/rest/v1/gas_sensor_data');

class SirenGasSensorController {
    
    private function makeSupabaseRequest($data, $method = 'POST') {
        $headers = [
            'Content-Type: application/json',
            'apikey: ' . SUPABASE_ANON_KEY,
            'Authorization: Bearer ' . SUPABASE_ANON_KEY,
            'Prefer: return=representation'
        ];
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, SUPABASE_API_URL);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        return [
            'response' => $response,
            'http_code' => $httpCode,
            'error' => $error
        ];
    }
    
    private function validateSensorData($data) {
        $required = ['mq9_v', 'mq135_d'];
        
        foreach ($required as $field) {
            if (!isset($data[$field])) {
                return "Missing required field: $field";
            }
        }
        
        // Validate data types
        if (!is_numeric($data['mq9_v'])) {
            return "mq9_v must be numeric (voltage value)";
        }
        
        if (!is_bool($data['mq135_d']) && !in_array($data['mq135_d'], [0, 1, '0', '1', 'true', 'false'])) {
            return "mq135_d must be boolean (true/false)";
        }
        
        // Validate GPS coordinates if provided
        if (isset($data['lat']) && (!is_numeric($data['lat']) || $data['lat'] < -90 || $data['lat'] > 90)) {
            return "lat must be numeric between -90 and 90";
        }
        
        if (isset($data['long']) && (!is_numeric($data['long']) || $data['long'] < -180 || $data['long'] > 180)) {
            return "long must be numeric between -180 and 180";
        }
        
        return null;
    }
    
    private function analyzeGasReadings($mq9_voltage, $mq135_digital) {
        $mq9_analysis = "Normal - No dangerous gases detected";
        $mq135_analysis = "Good - Air quality acceptable";
        $danger_level = "LOW";
        
        // MQ-9 Gas Analysis (CO, LPG, Methane detection)
        if ($mq9_voltage > 2.5) {
            $mq9_analysis = "CRITICAL - Very high gas concentration! Evacuate immediately!";
            $danger_level = "CRITICAL";
        } elseif ($mq9_voltage > 2.0) {
            $mq9_analysis = "HIGH DANGER - Dangerous levels of CO/LPG/Methane detected";
            $danger_level = "HIGH";
        } elseif ($mq9_voltage > 1.5) {
            $mq9_analysis = "MODERATE - Elevated gas levels detected";
            $danger_level = ($danger_level === "LOW") ? "MODERATE" : $danger_level;
        } elseif ($mq9_voltage > 1.0) {
            $mq9_analysis = "LOW - Trace amounts of gases detected";
            $danger_level = ($danger_level === "LOW") ? "LOW-MODERATE" : $danger_level;
        }
        
        // MQ-135 Digital Analysis (Air quality/pollution)
        if ($mq135_digital === false || $mq135_digital === 0 || $mq135_digital === '0') {
            $mq135_analysis = "ALERT - Air pollution detected! Poor air quality";
            if ($danger_level === "LOW") {
                $danger_level = "MODERATE";
            }
        }
        
        return [
            'mq9_gas_analysis' => $mq9_analysis,
            'mq135_air_quality' => $mq135_analysis,
            'overall_danger_level' => $danger_level
        ];
    }
    
    public function storeSensorData() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode([
                'success' => false,
                'error' => 'Method not allowed. Use POST request.',
                'endpoint' => 'SIREN.great-site.net/controller-1.php?action=store'
            ]);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid JSON data or empty request body'
            ]);
            return;
        }
        
        // Validate required fields
        $validation_error = $this->validateSensorData($input);
        if ($validation_error) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => $validation_error,
                'received_data' => $input
            ]);
            return;
        }
        
        // Analyze gas readings
        $analysis = $this->analyzeGasReadings($input['mq9_v'], $input['mq135_d']);
        
        // Prepare data according to your database structure
        $sensor_data = [
            'timestamp' => date('Y-m-d\TH:i:s.u\Z'), // ISO 8601 format with timezone
            'lat' => isset($input['lat']) ? (float)$input['lat'] : null,
            'long' => isset($input['long']) ? (float)$input['long'] : null,
            'mq9_v' => (float)$input['mq9_v'],
            'mq9_g' => $analysis['mq9_gas_analysis'],
            'mq135_d' => ($input['mq135_d'] === true || $input['mq135_d'] === 1 || $input['mq135_d'] === '1') ? true : false,
            'mq135_a' => $analysis['mq135_air_quality']
        ];
        
        // Store in Supabase
        $result = $this->makeSupabaseRequest($sensor_data);
        
        if ($result['http_code'] === 201) {
            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Gas sensor data stored successfully in SIREN database',
                'data' => $sensor_data,
                'analysis' => $analysis,
                'timestamp' => $sensor_data['timestamp'],
                'location' => [
                    'latitude' => $sensor_data['lat'],
                    'longitude' => $sensor_data['long']
                ]
            ]);
        } else {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Failed to store data in Supabase',
                'details' => $result['response'],
                'curl_error' => $result['error'],
                'http_code' => $result['http_code']
            ]);
        }
    }
    
    public function getRecentData() {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed. Use GET request.']);
            return;
        }
        
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $danger_filter = $_GET['danger_level'] ?? null;
        
        $url = SUPABASE_API_URL . '?order=timestamp.desc&limit=' . $limit;
        
        // Filter by danger level if specified
        if ($danger_filter) {
            $url .= '&mq9_g=ilike.*' . urlencode($danger_filter) . '*';
        }
        
        $headers = [
            'apikey: ' . SUPABASE_ANON_KEY,
            'Authorization: Bearer ' . SUPABASE_ANON_KEY
        ];
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200) {
            $data = json_decode($response, true);
            echo json_encode([
                'success' => true,
                'count' => count($data),
                'data' => $data,
                'endpoint' => 'SIREN.great-site.net/php/controller-1.php?action=get'
            ]);
        } else {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Failed to fetch data from Supabase',
                'http_code' => $httpCode
            ]);
        }
    }
    
    public function getSystemStatus() {
        echo json_encode([
            'system' => 'SIREN Gas Detection System',
            'status' => 'ONLINE',
            'version' => '1.0',
            'endpoint' => 'SIREN.great-site.net/php/controller-1.php',
            'supported_actions' => [
                'store' => 'POST - Store sensor data',
                'get' => 'GET - Retrieve recent data',
                'status' => 'GET - System status'
            ],
            'database_structure' => [
                'id' => 'int8 (auto)',
                'timestamp' => 'timestamptz',
                'lat' => 'numeric (GPS latitude)',
                'long' => 'numeric (GPS longitude)', 
                'mq9_v' => 'numeric (voltage)',
                'mq9_g' => 'varchar (gas analysis)',
                'mq135_d' => 'bool (digital alert)',
                'mq135_a' => 'varchar (air quality)'
            ],
            'server_time' => date('Y-m-d H:i:s T'),
            'timezone' => date_default_timezone_get()
        ]);
    }
}

// Handle requests
$controller = new SirenGasSensorController();
$action = $_GET['action'] ?? 'status';

switch ($action) {
    case 'store':
        $controller->storeSensorData();
        break;
    case 'get':
        $controller->getRecentData();
        break;
    case 'status':
        $controller->getSystemStatus();
        break;
    default:
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid action. Supported: store, get, status',
            'usage' => [
                'store' => 'POST /controller-1.php?action=store',
                'get' => 'GET /controller-1.php?action=get',
                'status' => 'GET /controller-1.php?action=status'
            ]
        ]);
}
?>
