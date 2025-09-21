/*
  ESP32 LoRa Central Node - Supabase Gateway
  - Receives LoRa packets from sensor nodes
  - Adds NTP timestamps
  - Uploads to Supabase PostgreSQL database
  - WiFi connectivity with auto-reconnect
  - Enhanced JSON packet processing
*/

#include <WiFi.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

// WiFi Credentials
#define WIFI_SSID "419"
#define WIFI_PASSWORD "xyz@1234"

// Supabase Configuration - YOUR ACTUAL VALUES
#define SUPABASE_URL "https://kfwngukvlsjjhwslktbn.supabase.co"
#define SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmd25ndWt2bHNqamh3c2xrdGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzYwMzksImV4cCI6MjA3Mzk1MjAzOX0.qY_JlPE6g5ewfBodJZYDS6ABFySvEMLgqOhCeQg8U8I"

// NTP Configuration
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 19800;  // GMT+5:30 India
const int daylightOffset_sec = 0;

// LoRa Module pins
#define LORA_SCK 5     
#define LORA_MISO 19    
#define LORA_MOSI 27   
#define LORA_SS 18     
#define LORA_RST 14    
#define LORA_DIO0 2    

// LoRa frequency
#define LORA_BAND 915E6

// Central node identification
#define CENTRAL_NODE_ID "CENTRAL_GATEWAY_001"

// Status flags
bool wifiConnected = false;
bool supabaseReady = false;
bool ntpSynced = false;
bool loraReady = false;

// Statistics
unsigned long packetsReceived = 0;
unsigned long packetsUploaded = 0;
unsigned long packetsCorrupted = 0;
unsigned long lastStatsDisplay = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastNTPSync = 0;

// HTTP client for Supabase API calls
HTTPClient http;
WiFiClientSecure client;

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("=====================================");
  Serial.println("ESP32 LoRa Central Node - Supabase Gateway");
  Serial.println("Real-time sensor data to PostgreSQL");
  Serial.println("=====================================");
  
  // Initialize LoRa first
  initializeLoRa();
  
  // Initialize WiFi
  initializeWiFi();
  
  // Initialize NTP
  if (wifiConnected) {
    initializeNTP();
  }
  
  // Initialize Supabase
  if (wifiConnected) {
    initializeSupabase();
  }
  
  Serial.println("Central Node ready to receive LoRa packets!");
  Serial.println("Listening for sensor data...");
  Serial.println();
}

void loop() {
  // Check WiFi connection every 30 seconds
  if (millis() - lastWiFiCheck > 30000) {
    checkWiFiConnection();
    lastWiFiCheck = millis();
  }
  
  // Try NTP sync every 5 minutes if not synced
  if (!ntpSynced && wifiConnected && (millis() - lastNTPSync > 300000)) {
    initializeNTP();
    lastNTPSync = millis();
  }
  
  // Check for LoRa packets
  if (loraReady) {
    handleLoRaPackets();
  }
  
  // Display statistics every 60 seconds
  if (millis() - lastStatsDisplay > 60000) {
    displayStatistics();
    lastStatsDisplay = millis();
  }
  
  delay(50);
}

void initializeLoRa() {
  Serial.println("Initializing LoRa receiver...");
  
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("LoRa initialization failed. Check wiring.");
    loraReady = false;
    return;
  }
  
  // LoRa configuration
  LoRa.setTxPower(20);
  LoRa.setSpreadingFactor(12);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(8);
  LoRa.setPreambleLength(8);
  LoRa.setSyncWord(0x34);
  
  Serial.println("LoRa initialized successfully!");
  Serial.println("Frequency: " + String(LORA_BAND/1E6) + " MHz");
  Serial.println("Spreading Factor: 12");
  Serial.println("Sync Word: 0x34");
  loraReady = true;
}

void initializeWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("WiFi connected successfully!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    wifiConnected = false;
    Serial.println();
    Serial.println("WiFi connection failed!");
    Serial.println("Operating in offline mode");
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED && wifiConnected) {
    Serial.println("WiFi connection lost. Attempting to reconnect...");
    wifiConnected = false;
    supabaseReady = false;
    initializeWiFi();
    
    if (wifiConnected && !supabaseReady) {
      initializeSupabase();
    }
  }
}

void initializeNTP() {
  if (!wifiConnected) return;
  
  Serial.println("Synchronizing time with NTP server...");
  
  const char* ntpServers[] = {
    "pool.ntp.org",
    "time.nist.gov", 
    "in.pool.ntp.org",
    "0.in.pool.ntp.org"
  };
  
  for (int server = 0; server < 4 && !ntpSynced; server++) {
    Serial.print("Trying NTP server: ");
    Serial.println(ntpServers[server]);
    
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServers[server]);
    
    struct tm timeinfo;
    for (int attempts = 0; attempts < 10 && !ntpSynced; attempts++) {
      delay(1000);
      Serial.print(".");
      if (getLocalTime(&timeinfo)) {
        ntpSynced = true;
        Serial.println();
        Serial.println("NTP time synchronized successfully!");
        Serial.printf("Current time: %s", asctime(&timeinfo));
        return;
      }
    }
    Serial.println();
  }
  
  if (!ntpSynced) {
    Serial.println("Failed to sync with any NTP server! Will retry later...");
  }
}

void initializeSupabase() {
  if (!wifiConnected) return;
  
  Serial.println("Initializing Supabase connection...");
  
  // Configure SSL client (Supabase uses HTTPS)
  client.setInsecure(); // For development - in production, use proper certificates
  
  // Test Supabase connection
  String testUrl = String(SUPABASE_URL) + "/rest/v1/";
  http.begin(client, testUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    Serial.println("Supabase connection successful!");
    Serial.println("Response code: " + String(httpResponseCode));
    supabaseReady = true;
    
    // Create initial status record
    uploadGatewayStatus("online");
    
  } else {
    Serial.println("Supabase connection failed!");
    Serial.println("Error code: " + String(httpResponseCode));
    Serial.println("Check your SUPABASE_URL and SUPABASE_ANON_KEY");
    supabaseReady = false;
  }
  
  http.end();
}

void uploadGatewayStatus(String status) {
  if (!supabaseReady) return;
  
  DynamicJsonDocument statusDoc(512);
  statusDoc["central_node_id"] = CENTRAL_NODE_ID;
  statusDoc["status"] = status;
  statusDoc["startup_time"] = getCurrentDateTime();
  statusDoc["ip_address"] = WiFi.localIP().toString();
  statusDoc["rssi"] = WiFi.RSSI();
  statusDoc["free_heap"] = ESP.getFreeHeap();
  
  String jsonString;
  serializeJson(statusDoc, jsonString);
  
  String url = String(SUPABASE_URL) + "/rest/v1/gateway_status";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  http.addHeader("Prefer", "return=minimal");
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    Serial.println("Gateway status uploaded to Supabase");
  } else {
    Serial.println("Failed to upload gateway status: " + String(httpResponseCode));
  }
  
  http.end();
}

void handleLoRaPackets() {
  int packetSize = LoRa.parsePacket();
  if (packetSize == 0) return;
  
  // Read packet
  String receivedPacket = "";
  while (LoRa.available()) {
    char c = (char)LoRa.read();
    if (c >= 20 && c <= 126) {
      receivedPacket += c;
    }
  }
  
  if (receivedPacket.length() < 5) {
    Serial.println("Packet too short - discarded");
    return;
  }
  
  int rssi = LoRa.packetRssi();
  float snr = LoRa.packetSnr();
  
  packetsReceived++;
  
  Serial.println("========================");
  Serial.println("LoRa Packet Received #" + String(packetsReceived));
  Serial.println("RSSI: " + String(rssi) + " dBm");
  Serial.println("SNR: " + String(snr) + " dB");
  Serial.println("Size: " + String(packetSize) + " bytes");
  Serial.println("Clean Size: " + String(receivedPacket.length()) + " bytes");
  Serial.println("Raw Data: " + receivedPacket);
  
  // Clean and process packet
  String cleanedPacket = cleanJsonPacket(receivedPacket);
  if (cleanedPacket.length() > 0) {
    processAndUploadPacket(cleanedPacket, rssi, snr);
  } else {
    packetsCorrupted++;
    Serial.println("Packet could not be cleaned");
  }
  
  Serial.println("========================");
}

String cleanJsonPacket(String rawPacket) {
  // First, try the original packet as-is
  DynamicJsonDocument testDoc(512);
  if (deserializeJson(testDoc, rawPacket) == DeserializationError::Ok) {
    return rawPacket;
  }
  
  // Perform minimal cleaning
  String cleaned = rawPacket;
  
  // Fix truncated packets
  if (cleaned.endsWith(",p")) {
    cleaned = cleaned.substring(0, cleaned.length() - 2) + "od\"}";
  } else if (cleaned.endsWith("Go,p")) {
    cleaned = cleaned.substring(0, cleaned.length() - 4) + "Good\"}";
  }
  
  // Fix incomplete JSON - add missing closing brace
  int openBraces = 0;
  int closeBraces = 0;
  for (char c : cleaned) {
    if (c == '{') openBraces++;
    if (c == '}') closeBraces++;
  }
  
  while (closeBraces < openBraces) {
    cleaned += "}";
    closeBraces++;
  }
  
  // Fix incomplete strings - add missing quotes
  int quotes = 0;
  for (char c : cleaned) {
    if (c == '"') quotes++;
  }
  
  if (quotes % 2 != 0) {
    cleaned += "\"";
  }
  
  return cleaned;
}

void processAndUploadPacket(String cleanedPacket, int rssi, float snr) {
  DynamicJsonDocument receivedDoc(512);
  DeserializationError error = deserializeJson(receivedDoc, cleanedPacket);
  
  if (error) {
    Serial.println("JSON parsing failed: " + String(error.c_str()));
    Serial.println("Cleaned packet was: " + cleanedPacket);
    packetsCorrupted++;
    return;
  }
  
  Serial.println("JSON parsed successfully!");
  
  // Create enhanced JSON for Supabase
  DynamicJsonDocument enhancedDoc(1024);
  
  // Sensor data
  enhancedDoc["sensor_node_id"] = receivedDoc["nodeId"] | "UNKNOWN";
  enhancedDoc["sensor_packet_count"] = receivedDoc["packetCount"] | 0;
  enhancedDoc["sensor_timestamp"] = receivedDoc["timestamp"] | 0;
  enhancedDoc["temperature"] = receivedDoc["temperature"] | -999;
  enhancedDoc["humidity"] = receivedDoc["humidity"] | -999;
  enhancedDoc["mq2_analog"] = receivedDoc["mq2_analog"] | 0;
  enhancedDoc["mq9_analog"] = receivedDoc["mq9_analog"] | 0;
  enhancedDoc["mq135_analog"] = receivedDoc["mq135_analog"] | 0;
  enhancedDoc["mq2_digital"] = receivedDoc["mq2_digital"] | false;
  enhancedDoc["mq9_digital"] = receivedDoc["mq9_digital"] | false;
  enhancedDoc["mq135_digital"] = receivedDoc["mq135_digital"] | false;
  enhancedDoc["air_quality"] = receivedDoc["air_quality"] | "Unknown";
  
  // Gateway info
  enhancedDoc["central_node_id"] = CENTRAL_NODE_ID;
  enhancedDoc["received_time"] = getCurrentDateTime();
  enhancedDoc["received_timestamp"] = millis();
  enhancedDoc["rssi"] = rssi;
  enhancedDoc["snr"] = snr;
  enhancedDoc["gateway_packet_count"] = packetsReceived;
  
  String enhancedJsonString;
  serializeJson(enhancedDoc, enhancedJsonString);
  Serial.println("Enhanced JSON: " + enhancedJsonString);
  
  // Upload to Supabase
  if (supabaseReady) {
    uploadToSupabase(enhancedJsonString);
  } else {
    Serial.println("Supabase not available - logged locally only");
  }
}

void uploadToSupabase(String jsonData) {
  if (!supabaseReady) {
    Serial.println("Supabase not ready");
    return;
  }
  
  Serial.println("Uploading to Supabase...");
  
  String url = String(SUPABASE_URL) + "/rest/v1/sensor_data";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  http.addHeader("Prefer", "return=minimal");
  
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode == 201 || httpResponseCode == 200) {
    packetsUploaded++;
    Serial.println("SUCCESS: Data uploaded to Supabase!");
    Serial.println("HTTP Code: " + String(httpResponseCode));
    
    // Also update latest reading table
    updateLatestReading(jsonData);
    
  } else {
    Serial.println("ERROR: Supabase upload failed");
    Serial.println("HTTP Code: " + String(httpResponseCode));
    String response = http.getString();
    Serial.println("Response: " + response);
    
    if (httpResponseCode == 401) {
      Serial.println("AUTHENTICATION ERROR - Check your API key");
    } else if (httpResponseCode == 403) {
      Serial.println("PERMISSION ERROR - Check RLS policies");
    } else if (httpResponseCode == 422) {
      Serial.println("VALIDATION ERROR - Check table schema");
    }
  }
  
  http.end();
}

void updateLatestReading(String jsonData) {
  String url = String(SUPABASE_URL) + "/rest/v1/latest_sensor_data?central_node_id=eq." + String(CENTRAL_NODE_ID);
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  http.addHeader("Prefer", "return=minimal");
  
  // First try to update existing record
  int httpResponseCode = http.PATCH(jsonData);
  
  if (httpResponseCode == 200 || httpResponseCode == 204) {
    Serial.println("Latest reading updated!");
  } else {
    // If update fails, try insert
    http.end();
    http.begin(client, String(SUPABASE_URL) + "/rest/v1/latest_sensor_data");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    http.addHeader("Prefer", "return=minimal");
    
    httpResponseCode = http.POST(jsonData);
    if (httpResponseCode == 201) {
      Serial.println("Latest reading inserted!");
    }
  }
  
  http.end();
}

String getCurrentDateTime() {
  if (!ntpSynced) {
    return "Uptime: " + String(millis() / 1000) + "s";
  }
  
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "Failed to get time";
  }
  
  char timeString[64];
  strftime(timeString, sizeof(timeString), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(timeString);
}

void displayStatistics() {
  Serial.println();
  Serial.println("=== CENTRAL NODE STATISTICS ===");
  Serial.println("Uptime: " + String(millis() / 1000) + " seconds");
  Serial.println("WiFi: " + String(wifiConnected ? "Connected" : "Disconnected"));
  if (wifiConnected) {
    Serial.println("Signal: " + String(WiFi.RSSI()) + " dBm");
  }
  Serial.println("Supabase: " + String(supabaseReady ? "Ready" : "Not Ready"));
  Serial.println("NTP: " + String(ntpSynced ? "Synced" : "Not Synced"));
  Serial.println("LoRa: " + String(loraReady ? "Ready" : "Not Ready"));
  Serial.println("Packets Received: " + String(packetsReceived));
  Serial.println("Packets Corrupted: " + String(packetsCorrupted));
  Serial.println("Packets Uploaded: " + String(packetsUploaded));
  
  if (packetsReceived > 0) {
    float successRate = (float)packetsUploaded / packetsReceived * 100;
    float corruptionRate = (float)packetsCorrupted / packetsReceived * 100;
    Serial.println("Upload Success Rate: " + String(successRate, 1) + "%");
    Serial.println("Corruption Rate: " + String(corruptionRate, 1) + "%");
  }
  
  Serial.println("Current Time: " + getCurrentDateTime());
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  Serial.println("================================");
  Serial.println();
}
