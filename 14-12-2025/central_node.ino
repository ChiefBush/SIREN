/*
  ESP32 LoRa Central Node - Supabase Gateway + Email Alerts
  FIXED: Enhanced SMTP error logging and connection handling
*/

#include <WiFi.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

#define WIFI_SSID "iPhone"
#define WIFI_PASSWORD "12345678"

#define SUPABASE_URL "https://kfwngukvlsjjhwslktbn.supabase.co"
#define SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmd25ndWt2bHNqamh3c2xrdGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzYwMzksImV4cCI6MjA3Mzk1MjAzOX0.qY_JlPE6g5ewfBodJZYDS6ABFySvEMLgqOhCeQg8U8I"

#define SMTP_SERVER "smtp.gmail.com"
#define SMTP_PORT 465
#define SENDER_EMAIL "caneriesiren@gmail.com"
#define SENDER_PASSWORD "jczhurwioeagagiw"  // App password without spaces
#define SUPERVISOR_EMAIL "caneriesiren@gmail.com"

#define DEBUG_MODE true

// Multiple NTP servers for better reliability
const char* ntpServers[] = {
  "pool.ntp.org",
  "time.nist.gov",
  "time.google.com",
  "time.cloudflare.com",
  "time.windows.com"
};
const int ntpServerCount = 5;
const long gmtOffset_sec = 19800;
const int daylightOffset_sec = 0;

#define LORA_SCK 5     
#define LORA_MISO 19    
#define LORA_MOSI 27   
#define LORA_SS 18     
#define LORA_RST 14    
#define LORA_DIO0 2    
#define LORA_BAND 915E6
#define CENTRAL_NODE_ID "CENTRAL_GATEWAY_001"

#define EMAIL_SEND_TIMEOUT 300000
#define EMAIL_BUFFER_SIZE 10

#define MESSAGE_TEST_INTERVAL 300000

// Structure to track packet counts per node
struct NodePacketTracker {
  String nodeId;
  unsigned long packetCount;
  unsigned long lastSeenTime;
};

#define MAX_TRACKED_NODES 10
NodePacketTracker nodeTrackers[MAX_TRACKED_NODES];
int trackedNodesCount = 0;

bool wifiConnected = false;
bool supabaseReady = false;
bool ntpSynced = false;
bool loraReady = false;

unsigned long packetsReceived = 0;
unsigned long packetsUploaded = 0;
unsigned long packetsCorrupted = 0;
unsigned long emergenciesDetected = 0;
unsigned long emailsSent = 0;
unsigned long lastStatsDisplay = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastNTPSync = 0;

unsigned long messagesSentToEdge = 0;
unsigned long lastTestMessage = 0;

unsigned long getNodePacketCount(String nodeId);
String determineAirQuality(int mq2, int mq9, int mq135, bool mq2Digital, bool mq9Digital, bool mq135Digital);

struct EmergencyRecord {
  String nodeId;
  unsigned long lastAlertTime;
};

EmergencyRecord emergencyBuffer[EMAIL_BUFFER_SIZE];
int emergencyBufferIndex = 0;

HTTPClient http;
WiFiClientSecure client;

void displayStatistics();
String getCurrentDateTime();
bool canSendEmergencyEmail(String nodeId);
void recordEmergency(String nodeId);
void sendEmergencyEmail(JsonDocument& sensorData, int rssi, float snr);
bool sendSMTPEmail(String subject, String body);
String base64Encode(String input);
String readSMTPResponse(WiFiClient& client, int timeout = 5000);

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n=====================================");
  Serial.println("ESP32 LoRa Central Node v2.1");
  Serial.println("Email Debug Enhanced");
  Serial.println("=====================================\n");
  
  for (int i = 0; i < EMAIL_BUFFER_SIZE; i++) {
    emergencyBuffer[i].nodeId = "";
    emergencyBuffer[i].lastAlertTime = 0;
  }
  
  initializeLoRa();
  initializeWiFi();
  
  if (wifiConnected) {
    initializeNTP();
    initializeSupabase();
  }

  Serial.println("\n╔════════════════════════════════════════════╗");
  Serial.println("║     MESSAGE RELAY SYSTEM ENABLED           ║");
  Serial.println("╠════════════════════════════════════════════╣");
  Serial.println("║ Commands:                                  ║");
  Serial.println("║   msg <text>  - Send message to wristband  ║");
  Serial.println("║   testmsg     - Send test message           ║");
  Serial.println("║   msgstats    - Show statistics             ║");
  Serial.println("║   help        - Show command list           ║");
  Serial.println("╚════════════════════════════════════════════╝\n");
  // ========== END OF NEW LINES ==========
  Serial.println("Central Node ready!\n");
}

void loop() {
  // Check WiFi connection (existing code - no changes)
  if (millis() - lastWiFiCheck > 30000) {
    checkWiFiConnection();
    lastWiFiCheck = millis();
  }
  
  // Check NTP sync (existing code - no changes)
  if (!ntpSynced && wifiConnected && (millis() - lastNTPSync > 300000)) {
    initializeNTP();
    lastNTPSync = millis();
  }
  
  // ========== ADD THIS BLOCK HERE ==========
  // NEW: Handle message commands from Serial Monitor
  handleMessageCommands();
  
  // NEW: Optional - Send automatic test messages (comment out if not needed)
  // Uncomment the block below to send test messages every 5 minutes
  /*
  if (millis() - lastTestMessage > MESSAGE_TEST_INTERVAL) {
    sendMessageToWristband("Automatic test message at " + getCurrentDateTime());
    lastTestMessage = millis();
  }
  */
  // ========== END OF NEW BLOCK ==========
  
  // Handle LoRa packets (existing code - no changes)
  if (loraReady) {
    handleLoRaPackets();
  }
  
  // Display statistics (existing code - no changes)
  if (millis() - lastStatsDisplay > 60000) {
    displayStatistics();
    lastStatsDisplay = millis();
  }
  
  delay(50);
}
void initializeLoRa() {
  Serial.println("Initializing LoRa...");
  
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("ERROR: LoRa failed!");
    loraReady = false;
    return;
  }
  
  LoRa.setTxPower(20);
  LoRa.setSpreadingFactor(12);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(8);
  LoRa.setPreambleLength(8);
  LoRa.setSyncWord(0x34);
  
  Serial.println("LoRa OK\n");
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
    Serial.println("\nWiFi OK");
    Serial.println("IP: " + WiFi.localIP().toString() + "\n");
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi FAILED\n");
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED && wifiConnected) {
    Serial.println("WiFi lost. Reconnecting...");
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
  
  Serial.println("Syncing NTP with multiple servers...");
  
  struct tm timeinfo;
  bool syncSuccess = false;
  
  // Try each NTP server until one works
  for (int serverIndex = 0; serverIndex < ntpServerCount && !syncSuccess; serverIndex++) {
    Serial.print("  Trying ");
    Serial.print(ntpServers[serverIndex]);
    Serial.print("... ");
    
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServers[serverIndex]);
    
    int attempts = 0;
    while (!getLocalTime(&timeinfo) && attempts < 10) {
      delay(500);
      attempts++;
    }
    
    if (attempts < 10) {
      syncSuccess = true;
      ntpSynced = true;
      Serial.println("✓ Success!");
      Serial.print("  Current time: ");
      Serial.println(getCurrentDateTime());
      break;
    } else {
      Serial.println("✗ Failed");
    }
  }
  
  if (!syncSuccess) {
    Serial.println("❌ All NTP servers failed");
    ntpSynced = false;
  } else {
    Serial.println("NTP sync complete\n");
  }
}

void initializeSupabase() {
  if (!wifiConnected) return;
  
  Serial.println("Testing Supabase connection...");
  client.setInsecure();
  
  String testUrl = String(SUPABASE_URL) + "/rest/v1/";
  http.begin(client, testUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    Serial.println("Supabase OK\n");
    supabaseReady = true;
  } else {
    Serial.println("Supabase FAILED\n");
    supabaseReady = false;
  }
  
  http.end();
}

void handleLoRaPackets() {
  int packetSize = LoRa.parsePacket();
  if (packetSize == 0) return;
  
  String receivedPacket = "";
  while (LoRa.available()) {
    char c = (char)LoRa.read();
    if (c >= 20 && c <= 126) {
      receivedPacket += c;
    }
  }
  
  if (receivedPacket.length() < 5) return;
  
  int rssi = LoRa.packetRssi();
  float snr = LoRa.packetSnr();
  
  packetsReceived++;
  
  Serial.println("========================");
  Serial.println("LoRa Packet #" + String(packetsReceived));
  Serial.println("RSSI: " + String(rssi) + " | SNR: " + String(snr, 1));
  Serial.println("Size: " + String(receivedPacket.length()) + " bytes");
  
  String cleanedPacket = cleanJsonPacket(receivedPacket);
  if (cleanedPacket.length() > 0) {
    processAndUploadPacket(cleanedPacket, rssi, snr);
  } else {
    packetsCorrupted++;
    Serial.println("ERROR: Packet cleanup failed");
  }
  Serial.println("========================\n");
}

String cleanJsonPacket(String rawPacket) {
  DynamicJsonDocument testDoc(512);
  if (deserializeJson(testDoc, rawPacket) == DeserializationError::Ok) {
    return rawPacket;
  }
  
  String cleaned = rawPacket;
  
  if (cleaned.endsWith(",p")) {
    cleaned = cleaned.substring(0, cleaned.length() - 2) + "od\"}";
  } else if (cleaned.endsWith("Go,p")) {
    cleaned = cleaned.substring(0, cleaned.length() - 4) + "Good\"}";
  }
  
  int openBraces = 0, closeBraces = 0;
  for (char c : cleaned) {
    if (c == '{') openBraces++;
    if (c == '}') closeBraces++;
  }
  
  while (closeBraces < openBraces) {
    cleaned += "}";
    closeBraces++;
  }
  
  int quotes = 0;
  for (char c : cleaned) {
    if (c == '"') quotes++;
  }
  
  if (quotes % 2 != 0) cleaned += "\"";
  
  return cleaned;
}

// Get or create packet count for a node
unsigned long getNodePacketCount(String nodeId) {
  // Find existing node
  for (int i = 0; i < trackedNodesCount; i++) {
    if (nodeTrackers[i].nodeId == nodeId) {
      nodeTrackers[i].packetCount++;
      nodeTrackers[i].lastSeenTime = millis();
      return nodeTrackers[i].packetCount;
    }
  }
  
  // Node not found, add new one
  if (trackedNodesCount < MAX_TRACKED_NODES) {
    nodeTrackers[trackedNodesCount].nodeId = nodeId;
    nodeTrackers[trackedNodesCount].packetCount = 1;
    nodeTrackers[trackedNodesCount].lastSeenTime = millis();
    trackedNodesCount++;
    return 1;
  }
  
  // Buffer full, replace oldest entry
  int oldestIndex = 0;
  unsigned long oldestTime = nodeTrackers[0].lastSeenTime;
  for (int i = 1; i < MAX_TRACKED_NODES; i++) {
    if (nodeTrackers[i].lastSeenTime < oldestTime) {
      oldestTime = nodeTrackers[i].lastSeenTime;
      oldestIndex = i;
    }
  }
  
  nodeTrackers[oldestIndex].nodeId = nodeId;
  nodeTrackers[oldestIndex].packetCount = 1;
  nodeTrackers[oldestIndex].lastSeenTime = millis();
  return 1;
}

// Determine air quality based on comprehensive sensor analysis
String determineAirQuality(int mq2, int mq9, int mq135, bool mq2Digital, bool mq9Digital, bool mq135Digital) {
  /*
   * COMPREHENSIVE AIR QUALITY ANALYSIS
   * 
   * MQ2:  Detects smoke, LPG, propane, methane, hydrogen
   *       Analog: 0-1023 (higher = more gas)
   *       Digital: true = gas detected above threshold
   * 
   * MQ9:  Detects carbon monoxide (CO) and combustible gases
   *       Analog: 0-1023 (higher = more CO)
   *       Digital: true = dangerous CO levels
   * 
   * MQ135: General air quality - NH3, NOx, alcohol, benzene, smoke, CO2
   *       Analog: 0-1023 (higher = worse air quality)
   *       Digital: true = poor air quality detected
   * 
   * THRESHOLDS (calibrated for mining environments):
   * - Safe:     < 300 analog, no digital triggers
   * - Fair:     300-400 analog, no digital triggers
   * - Moderate: 400-500 analog, or 1 digital trigger
   * - Bad:      500-650 analog, or 2 digital triggers
   * - Danger:   > 650 analog, or all 3 digital triggers
   */
  
  // Count digital triggers (immediate danger indicators)
  int digitalAlerts = 0;
  if (mq2Digital) digitalAlerts++;
  if (mq9Digital) digitalAlerts++;
  if (mq135Digital) digitalAlerts++;
  
  // CRITICAL: If all 3 digital sensors triggered = IMMEDIATE DANGER
  if (digitalAlerts >= 3) {
    return "DANGER";
  }
  
  // Analyze analog readings with weighted scoring
  int dangerScore = 0;
  int badScore = 0;
  int moderateScore = 0;
  int fairScore = 0;
  
  // MQ2 Analysis (Smoke/Flammable Gas) - HIGHEST PRIORITY in mines
  if (mq2 > 700 || mq2Digital) {
    dangerScore += 3;  // Critical: explosion risk
  } else if (mq2 > 550) {
    badScore += 2;
  } else if (mq2 > 320) {
    moderateScore += 2;
  } else if (mq2 > 100) {
    fairScore += 1;
  }
  
  // MQ9 Analysis (Carbon Monoxide) - HIGH PRIORITY (silent killer)
  if (mq9 > 4000 || mq9Digital) {
    dangerScore += 3;  // Critical: CO poisoning risk
  } else if (mq9 > 3200) {
    badScore += 2;
  } else if (mq9 > 2400) {
    moderateScore += 2;
  } else if (mq9 > 1600) {
    fairScore += 1;
  }
  
  // MQ135 Analysis (General Air Quality) - MEDIUM PRIORITY
  if (mq135 > 2200 || mq135Digital) {
    dangerScore += 2;  // Critical: toxic air
  } else if (mq135 > 1800) {
    badScore += 2;
  } else if (mq135 > 1400) {
    moderateScore += 1;
  } else if (mq135 > 1000) {
    fairScore += 1;
  }
  
  // Additional checks for digital alerts
  if (digitalAlerts >= 2) {
    dangerScore += 2;  // Two sensors in digital alert = very dangerous
  } else if (digitalAlerts == 1) {
    badScore += 1;
  }
  
  // DECISION LOGIC (prioritize worst conditions)
  if (dangerScore >= 4) {
    return "DANGER";
  } else if (dangerScore >= 2 || badScore >= 4) {
    return "BAD";
  } else if (dangerScore >= 1 || badScore >= 2 || moderateScore >= 3) {
    return "MODERATE";
  } else if (moderateScore >= 1 || fairScore >= 2) {
    return "FAIR";
  } else {
    return "GOOD";
  }
}

void processAndUploadPacket(String cleanedPacket, int rssi, float snr) {
  DynamicJsonDocument receivedDoc(768);
  
  DeserializationError error = deserializeJson(receivedDoc, cleanedPacket);
  if (error) {
    packetsCorrupted++;
    Serial.println("ERROR: JSON parse failed: " + String(error.c_str()));
    Serial.println("Raw packet: " + cleanedPacket);
    return;
  }
  
  // DEBUG: Print entire received JSON
  if (DEBUG_MODE) {
    Serial.println("\n=== RECEIVED JSON DEBUG ===");
    serializeJsonPretty(receivedDoc, Serial);
    Serial.println("\n===========================");
  }
  
  // CRITICAL FIX: Check for emergency field more robustly
  bool isEmergency = false;
  
  // Method 1: Check if field exists and is true
  if (receivedDoc.containsKey("emergency")) {
    JsonVariant emergencyVar = receivedDoc["emergency"];
    
    if (emergencyVar.is<bool>()) {
      isEmergency = emergencyVar.as<bool>();
    } else if (emergencyVar.is<int>()) {
      isEmergency = (emergencyVar.as<int>() != 0);
    } else if (emergencyVar.is<const char*>()) {
      String emergencyStr = emergencyVar.as<String>();
      emergencyStr.toLowerCase();
      isEmergency = (emergencyStr == "true" || emergencyStr == "1");
    }
    
    Serial.println("Emergency field found: " + String(isEmergency ? "TRUE" : "FALSE"));
  } else {
    Serial.println("WARNING: No 'emergency' field in JSON");
  }
  
  String nodeId = receivedDoc["node"] | "UNKNOWN";
unsigned long sensorPacketCount = getNodePacketCount(nodeId);

// ⭐ ADD THESE 3 LINES HERE ⭐
bool mq2Digital = receivedDoc["mq2_digital"] | false;
bool mq9Digital = receivedDoc["mq9_digital"] | false;
bool mq135Digital = receivedDoc["mq135_digital"] | false;


  
  // Handle emergency
  if (isEmergency) {
    emergenciesDetected++;
    
    Serial.println("\n╔════════════════════════════════════════════╗");
    Serial.println("║  🚨 EMERGENCY SIGNAL RECEIVED! 🚨          ║");
    Serial.println("║  Node: " + nodeId + String(35 - nodeId.length(), ' ') + "║");
    Serial.println("║  Emergency Count: " + String(emergenciesDetected) + String(27 - String(emergenciesDetected).length(), ' ') + "║");
    Serial.println("╚════════════════════════════════════════════╝\n");
    
    if (canSendEmergencyEmail(nodeId)) {
      Serial.println(">>> SENDING EMERGENCY EMAIL <<<");
      sendEmergencyEmail(receivedDoc, rssi, snr);
      recordEmergency(nodeId);
    } else {
      unsigned long timeSinceLastEmail = 0;
      for (int i = 0; i < EMAIL_BUFFER_SIZE; i++) {
        if (emergencyBuffer[i].nodeId == nodeId) {
          timeSinceLastEmail = (millis() - emergencyBuffer[i].lastAlertTime) / 1000;
          break;
        }
      }
      Serial.println("⏱ Rate limit active for node " + nodeId);
      Serial.println("   Time since last email: " + String(timeSinceLastEmail) + "s");
      Serial.println("   Cooldown period: " + String(EMAIL_SEND_TIMEOUT/1000) + "s");
      Serial.println("   Email skipped\n");
    }
  } else {
    if (DEBUG_MODE) {
      Serial.println("📊 Normal packet (non-emergency) from node " + nodeId);
    }
  }
  
  // Build upload document
  DynamicJsonDocument uploadDoc(1536);
  uploadDoc["sensor_node_id"] = nodeId;
  uploadDoc["sensor_packet_count"] = sensorPacketCount;
  uploadDoc["sensor_timestamp"] = receivedDoc["timestamp"] | 0;
  uploadDoc["temperature"] = receivedDoc["temp"];
  uploadDoc["humidity"] = receivedDoc["hum"] | 0;
  uploadDoc["mq2_analog"] = receivedDoc["mq2"] | 0;
  uploadDoc["mq9_analog"] = receivedDoc["mq9"] | 0;
  uploadDoc["mq135_analog"] = receivedDoc["mq135"] | 0;
  uploadDoc["mq2_digital"] = mq2Digital;
uploadDoc["mq9_digital"] = mq9Digital;
uploadDoc["mq135_digital"] = mq135Digital;

// Calculate air quality with comprehensive logic
int mq2 = receivedDoc["mq2"] | 0;
int mq9 = receivedDoc["mq9"] | 0;
int mq135 = receivedDoc["mq135"] | 0;
String airQuality = determineAirQuality(mq2, mq9, mq135, mq2Digital, mq9Digital, mq135Digital);
uploadDoc["air_quality"] = airQuality;

// Log air quality warnings
if (airQuality == "DANGER") {
  Serial.println("🚨 CRITICAL AIR QUALITY: DANGER");
} else if (airQuality == "BAD") {
  Serial.println("⚠️  WARNING: BAD air quality detected");
} else if (airQuality == "MODERATE") {
  Serial.println("⚡ CAUTION: MODERATE air quality");
}
  // Use explicit float conversion
  float motionAccel = receivedDoc["motion_accel"].as<float>();
  float motionGyro = receivedDoc["motion_gyro"].as<float>();

  // Safety check
  if (isnan(motionAccel)) motionAccel = 0.0f;
  if (isnan(motionGyro)) motionGyro = 0.0f;

  uploadDoc["motion_accel"] = motionAccel;
  uploadDoc["motion_gyro"] = motionGyro;
  uploadDoc["bpm"] = receivedDoc["bpm"] | 0;
  uploadDoc["spo2"] = receivedDoc["spo2"] | 0;
  uploadDoc["wristband_connected"] = receivedDoc["wristband_connected"] | 0;
  uploadDoc["emergency"] = isEmergency;  // Add emergency field to database
  uploadDoc["central_node_id"] = CENTRAL_NODE_ID;
  uploadDoc["received_time"] = getCurrentDateTime();
  uploadDoc["received_timestamp"] = millis();
  uploadDoc["rssi"] = rssi;
  uploadDoc["snr"] = snr;
  uploadDoc["gateway_packet_count"] = packetsReceived;
  
  String jsonString;
  serializeJson(uploadDoc, jsonString);
  
  if (DEBUG_MODE || isEmergency) {
    Serial.println("Upload Payload: " + jsonString);
  }
  
  if (supabaseReady) {
    uploadToSupabase(jsonString);
  } else {
    Serial.println("WARNING: Supabase not ready - data not uploaded");
  }
}

bool canSendEmergencyEmail(String nodeId) {
  unsigned long now = millis();
  
  for (int i = 0; i < EMAIL_BUFFER_SIZE; i++) {
    if (emergencyBuffer[i].nodeId == nodeId) {
      if (now - emergencyBuffer[i].lastAlertTime >= EMAIL_SEND_TIMEOUT) {
        return true;
      } else {
        return false;
      }
    }
  }
  
  return true;
}

void recordEmergency(String nodeId) {
  unsigned long now = millis();
  
  for (int i = 0; i < EMAIL_BUFFER_SIZE; i++) {
    if (emergencyBuffer[i].nodeId == nodeId) {
      emergencyBuffer[i].lastAlertTime = now;
      return;
    }
  }
  
  if (emergencyBufferIndex >= EMAIL_BUFFER_SIZE) {
    emergencyBufferIndex = 0;
  }
  
  emergencyBuffer[emergencyBufferIndex].nodeId = nodeId;
  emergencyBuffer[emergencyBufferIndex].lastAlertTime = now;
  emergencyBufferIndex++;
}

//  * Send a text message to wristband via Edge Node relay
//  * Central → (LoRa) → Edge → (ESP-NOW) → Wristband
//  * 
//  * @param message The text message to send (max 120 characters recommended)
//  * @return true if LoRa transmission succeeded, false otherwise
//  */
bool sendMessageToWristband(String message) {
  if (!loraReady) {
    Serial.println("❌ ERROR: LoRa not ready - cannot send message");
    return false;
  }
  
  if (message.length() == 0) {
    Serial.println("❌ ERROR: Empty message - not sending");
    return false;
  }
  
  if (message.length() > 120) {
    Serial.println("⚠️  WARNING: Message too long, truncating to 120 chars");
    message = message.substring(0, 120);
  }

  // Create JSON packet with "message" field
  // Edge node's receiveLoRaMessages() already looks for this field
  DynamicJsonDocument doc(256);
  doc["message"] = message;
  doc["timestamp"] = millis();
  doc["from"] = "central_node";
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("\n╔════════════════════════════════════════════╗");
  Serial.println("║   SENDING MESSAGE TO WRISTBAND VIA EDGE    ║");
  Serial.println("╚════════════════════════════════════════════╝");
  Serial.println("Message: " + message);
  Serial.println("Payload: " + payload);
  Serial.println("Length: " + String(payload.length()) + " bytes");
  
  // Send via LoRa
  LoRa.beginPacket();
  LoRa.print(payload);
  LoRa.endPacket();
  
  messagesSentToEdge++;
  
  Serial.println("✓ Message transmitted via LoRa (#" + String(messagesSentToEdge) + ")");
  Serial.println("  → Edge node will forward to wristband via ESP-NOW");
  Serial.println("════════════════════════════════════════════\n");
  
  return true;
}

/**
 * Check for serial commands to send messages
 * Commands:
 *   msg <text>     - Send message to wristband
 *   testmsg        - Send a test message
 *   msgstats       - Show message statistics
 */
void handleMessageCommands() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command.length() == 0) return;
    
    // Convert to lowercase for comparison
    String cmdLower = command;
    cmdLower.toLowerCase();
    
    if (cmdLower.startsWith("msg ")) {
      // Extract message after "msg "
      String message = command.substring(4);
      message.trim();
      
      if (message.length() > 0) {
        Serial.println("\n>>> MANUAL MESSAGE COMMAND RECEIVED <<<");
        sendMessageToWristband(message);
      } else {
        Serial.println("ERROR: No message text provided");
        Serial.println("Usage: msg <your message here>");
      }
    }
    else if (cmdLower == "testmsg") {
      Serial.println("\n>>> TEST MESSAGE COMMAND <<<");
      sendMessageToWristband("This is a test message from central node");
    }
    else if (cmdLower == "msgstats") {
      Serial.println("\n╔════════════════════════════════════════════╗");
      Serial.println("║      MESSAGE RELAY STATISTICS              ║");
      Serial.println("╚════════════════════════════════════════════╝");
      Serial.println("Messages sent to edge node: " + String(messagesSentToEdge));
      Serial.println("LoRa status: " + String(loraReady ? "✓ Ready" : "✗ Not Ready"));
      Serial.println("════════════════════════════════════════════\n");
    }
    else if (cmdLower == "help" || cmdLower == "commands") {
      Serial.println("\n╔════════════════════════════════════════════╗");
      Serial.println("║         MESSAGE RELAY COMMANDS             ║");
      Serial.println("╠════════════════════════════════════════════╣");
      Serial.println("║ msg <text>   - Send message to wristband  ║");
      Serial.println("║ testmsg      - Send test message           ║");
      Serial.println("║ msgstats     - Show message statistics     ║");
      Serial.println("║ help         - Show this menu              ║");
      Serial.println("╚════════════════════════════════════════════╝\n");
    }
  }
}


void sendEmergencyEmail(JsonDocument& sensorData, int rssi, float snr) {
  if (!wifiConnected) {
    Serial.println("❌ ERROR: WiFi disconnected - cannot send email");
    return;
  }
  
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║   PREPARING EMERGENCY EMAIL          ║");
  Serial.println("╚══════════════════════════════════════╝\n");
  
  String nodeId = sensorData["node"] | "UNKNOWN";
  float temperature = sensorData["temp"] | 0;
  float humidity = sensorData["hum"] | 0;
  int mq2 = sensorData["mq2"] | 0;
  int mq9 = sensorData["mq9"] | 0;
  int mq135 = sensorData["mq135"] | 0;
  bool mq2Digital = sensorData["mq2_digital"] | false;  // ✅ CORRECT
  bool mq9Digital = sensorData["mq9_digital"] | false;  // ✅ CORRECT
  bool mq135Digital = sensorData["mq135_digital"] | false;  // ✅ CORRECT
  int bpm = sensorData["bpm"] | 0;
  int spo2 = sensorData["spo2"] | 0;
  bool wristbandConnected = sensorData["wristband_connected"] | 0;
  float motionAccel = sensorData["motion_accel"] | 0;
  float motionGyro = sensorData["motion_gyro"] | 0;
  
  String subject = "🚨 URGENT: Mine Worker Emergency - Node " + nodeId;
  
  String emailBody = "╔═══════════════════════════════════════════╗\n";
  emailBody += "║   EMERGENCY DISTRESS SIGNAL DETECTED      ║\n";
  emailBody += "╚═══════════════════════════════════════════╝\n\n";
  emailBody += "Node ID: " + nodeId + "\n";
  emailBody += "Timestamp: " + getCurrentDateTime() + "\n";
  emailBody += "Emergency Count: #" + String(emergenciesDetected) + "\n\n";
  emailBody += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  emailBody += "ENVIRONMENTAL CONDITIONS:\n";
  emailBody += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  emailBody += "Temperature:     " + String(temperature, 1) + "°C\n";
  emailBody += "Humidity:        " + String(humidity, 1) + "%\n";
  emailBody += "MQ2 (Smoke):     " + String(mq2) + "\n";
  emailBody += "MQ9 (CO):        " + String(mq9) + "\n";
  emailBody += "MQ135 (Quality): " + String(mq135) + "\n\n";
  emailBody += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  emailBody += "MOTION & VITALS:\n";
  emailBody += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  emailBody += "Acceleration:    " + String(motionAccel, 2) + " m/s²\n";
  emailBody += "Gyro Rotation:   " + String(motionGyro, 2) + " °/s\n";
  emailBody += "Heart Rate:      " + String(bpm) + " BPM\n";
  emailBody += "Blood Oxygen:    " + String(spo2) + "%\n";
  emailBody += "Wristband:       " + String(wristbandConnected ? "✓ Connected" : "✗ Disconnected") + "\n\n";
  emailBody += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  emailBody += "SIGNAL QUALITY:\n";
  emailBody += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  emailBody += "RSSI:            " + String(rssi) + " dBm\n";
  emailBody += "SNR:             " + String(snr) + " dB\n\n";
  emailBody += "⚠️  IMMEDIATE ACTION REQUIRED!\n";
  emailBody += "    Contact emergency response team.\n";
  
  Serial.println("Email Subject: " + subject);
  Serial.println("Email Length: " + String(emailBody.length()) + " characters");
  Serial.println();
  
  // Try to send email with retries
  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.println("📧 Email Send Attempt " + String(attempt) + "/3...");
    
    if (sendSMTPEmail(subject, emailBody)) {
      emailsSent++;
      Serial.println("\n✅ Email sent successfully!");
      Serial.println("   Total emails sent: " + String(emailsSent));
      Serial.println("╚══════════════════════════════════════╝\n");
      return;
    }
    
    if (attempt < 3) {
      Serial.println("❌ Attempt " + String(attempt) + " failed. Retrying in 5 seconds...\n");
      delay(5000);
    }
  }
  
  Serial.println("\n❌ ERROR: Email send failed after 3 attempts");
  Serial.println("   Check:");
  Serial.println("   1. WiFi connection");
  Serial.println("   2. SMTP credentials");
  Serial.println("   3. Gmail app password");
  Serial.println("   4. Internet connectivity");
  Serial.println("╚══════════════════════════════════════╝\n");
} 

String readSMTPResponse(WiFiClient& client, int timeout) {
  unsigned long start = millis();
  String response = "";
  
  while (millis() - start < timeout) {
    if (client.available()) {
      char c = client.read();
      response += c;
      if (c == '\n') {
        Serial.print("SMTP: ");
        Serial.print(response);
        if (response.indexOf("250") >= 0 || response.indexOf("334") >= 0 || 
            response.indexOf("235") >= 0 || response.indexOf("220") >= 0 ||
            response.indexOf("354") >= 0) {
          return response;
        }
        if (response.indexOf("5") == 0) {  // Error codes start with 5
          Serial.println("SMTP ERROR: " + response);
          return response;
        }
        response = "";
      }
    }
    delay(10);
  }
  
  Serial.println("SMTP Timeout");
  return "";
}

bool sendSMTPEmail(String subject, String body) {
  // Use secure client from the start and connect to port 465 (SSL/TLS)
  // Gmail supports both 587 (STARTTLS) and 465 (direct SSL)
  // Port 465 is simpler as it's SSL from the start
  
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  
  Serial.println("Connecting to SMTP server (SSL)...");
  if (!secureClient.connect(SMTP_SERVER, 465)) {  // Use port 465 for direct SSL
    Serial.println("ERROR: Cannot connect to SMTP server");
    return false;
  }
  Serial.println("Connected to SMTP server via SSL");
  
  // Wait for greeting
  String response = readSMTPResponse(secureClient, 10000);
  if (response.indexOf("220") < 0) {
    Serial.println("ERROR: No greeting from server");
    secureClient.stop();
    return false;
  }
  
  // EHLO
  secureClient.println("EHLO ESP32");
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("250") < 0) {
    Serial.println("ERROR: EHLO failed");
    secureClient.stop();
    return false;
  }
  
  // Clear any remaining response lines
  delay(500);
  while (secureClient.available()) secureClient.read();
  
  // AUTH LOGIN
  secureClient.println("AUTH LOGIN");
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("334") < 0) {
    Serial.println("ERROR: AUTH LOGIN failed");
    secureClient.stop();
    return false;
  }
  
  // Username
  secureClient.println(base64Encode(SENDER_EMAIL));
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("334") < 0) {
    Serial.println("ERROR: Username rejected");
    secureClient.stop();
    return false;
  }
  
  // Password
  secureClient.println(base64Encode(SENDER_PASSWORD));
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("235") < 0) {
    Serial.println("ERROR: Authentication failed - Check app password");
    secureClient.stop();
    return false;
  }
  Serial.println("Authentication successful");
  
  // MAIL FROM
  secureClient.print("MAIL FROM:<");
  secureClient.print(SENDER_EMAIL);
  secureClient.println(">");
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("250") < 0) {
    Serial.println("ERROR: MAIL FROM rejected");
    secureClient.stop();
    return false;
  }
  
  // RCPT TO
  secureClient.print("RCPT TO:<");
  secureClient.print(SUPERVISOR_EMAIL);
  secureClient.println(">");
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("250") < 0) {
    Serial.println("ERROR: RCPT TO rejected");
    secureClient.stop();
    return false;
  }
  
  // DATA
  secureClient.println("DATA");
  response = readSMTPResponse(secureClient, 5000);
  if (response.indexOf("354") < 0) {
    Serial.println("ERROR: DATA command rejected");
    secureClient.stop();
    return false;
  }
  
  // Email headers and body
  secureClient.print("From: ");
  secureClient.println(SENDER_EMAIL);
  secureClient.print("To: ");
  secureClient.println(SUPERVISOR_EMAIL);
  secureClient.print("Subject: ");
  secureClient.println(subject);
  secureClient.println();
  secureClient.println(body);
  secureClient.println(".");
  
  response = readSMTPResponse(secureClient, 10000);
  if (response.indexOf("250") < 0) {
    Serial.println("ERROR: Message rejected");
    secureClient.stop();
    return false;
  }
  
  // QUIT
  secureClient.println("QUIT");
  secureClient.stop();
  
  Serial.println("Email sent successfully!");
  return true;
}

String base64Encode(String input) {
  const char base64_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String result = "";
  int val = 0, valb = 0;
  
  for (byte c : input) {
    val = (val << 8) + c;
    valb += 8;
    while (valb >= 6) {
      valb -= 6;
      result += base64_chars[(val >> valb) & 0x3F];
    }
  }
  
  if (valb > 0) result += base64_chars[(val << (6 - valb)) & 0x3F];
  while (result.length() % 4) result += "=";
  return result;
}

void uploadToSupabase(String jsonData) {
  if (!supabaseReady) return;
  
  String url = String(SUPABASE_URL) + "/rest/v1/sensor_data";
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode == 201 || httpResponseCode == 200) {
    packetsUploaded++;
    Serial.println("✓ Uploaded to Supabase\n");
  } else {
    Serial.println("✗ Upload failed: " + String(httpResponseCode));
    String response = http.getString();
    Serial.println("Response: " + response + "\n");
  }
  
  http.end();
}

String getCurrentDateTime() {
  if (!ntpSynced) {
    return String(millis()/1000) + "s";
  }
  
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "Error";
  }
  
  char timeString[64];
  strftime(timeString, sizeof(timeString), "%Y-%m-%dT%H:%M:%S+05:30", &timeinfo);
  return String(timeString);
}

void displayStatistics() {
  Serial.println("\n╔═══════════════════════════════════════╗");
  Serial.println("║         SYSTEM STATISTICS             ║");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.println("║ Component Status:                     ║");
  Serial.println("║   WiFi:      " + String(wifiConnected ? "✓ Connected  " : "✗ Disconnected") + "             ║");
  Serial.println("║   Supabase:  " + String(supabaseReady ? "✓ Ready      " : "✗ Not Ready  ") + "             ║");
  Serial.println("║   NTP:       " + String(ntpSynced ? "✓ Synced     " : "✗ Not Synced ") + "             ║");
  Serial.println("║   LoRa:      " + String(loraReady ? "✓ Active     " : "✗ Offline    ") + "             ║");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.println("║ Packet Statistics:                    ║");
  Serial.println("║   Received:    " + String(packetsReceived) + String(21 - String(packetsReceived).length(), ' ') + "║");
  Serial.println("║   Uploaded:    " + String(packetsUploaded) + String(21 - String(packetsUploaded).length(), ' ') + "║");
  Serial.println("║   Corrupted:   " + String(packetsCorrupted) + String(21 - String(packetsCorrupted).length(), ' ') + "║");
  
  // ========== ADD THESE LINES HERE ==========
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.println("║ Message Relay Statistics:             ║");
  Serial.println("║   Messages Sent: " + String(messagesSentToEdge) + String(17 - String(messagesSentToEdge).length(), ' ') + "║");
  // ========== END OF NEW LINES ==========
  
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.println("║ Emergency Statistics:                 ║");
  Serial.println("║   🚨 Emergencies: " + String(emergenciesDetected) + String(19 - String(emergenciesDetected).length(), ' ') + "║");
  Serial.println("║   📧 Emails Sent: " + String(emailsSent) + String(19 - String(emailsSent).length(), ' ') + "║");
Serial.println("╠═══════════════════════════════════════╣");
Serial.println("║ Active Nodes (Packet Counts):         ║");
if (trackedNodesCount == 0) {
  Serial.println("║   No nodes tracked yet                ║");
} else {
  for (int i = 0; i < trackedNodesCount; i++) {
    String nodeInfo = "║   " + nodeTrackers[i].nodeId + ": " + String(nodeTrackers[i].packetCount) + " pkts";
    int padding = 40 - nodeInfo.length();
    Serial.println(nodeInfo + String(padding, ' ') + "║");
  }
}
Serial.println("╚═══════════════════════════════════════╝\n"); 

  Serial.println("Current Time: " + getCurrentDateTime());
  Serial.println();
}
