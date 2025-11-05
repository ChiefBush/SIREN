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

const char* ntpServer = "pool.ntp.org";
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
  
  Serial.println("Central Node ready!\n");
}

void loop() {
  if (millis() - lastWiFiCheck > 30000) {
    checkWiFiConnection();
    lastWiFiCheck = millis();
  }
  
  if (!ntpSynced && wifiConnected && (millis() - lastNTPSync > 300000)) {
    initializeNTP();
    lastNTPSync = millis();
  }
  
  if (loraReady) {
    handleLoRaPackets();
  }
  
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
  
  Serial.println("Syncing NTP...");
  configTime(gmtOffset_sec, daylightOffset_sec, "pool.ntp.org");
  
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 20) {
    delay(500);
    attempts++;
  }
  
  if (attempts < 20) {
    ntpSynced = true;
    Serial.println("NTP OK\n");
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

void processAndUploadPacket(String cleanedPacket, int rssi, float snr) {
  DynamicJsonDocument receivedDoc(512);
  if (deserializeJson(receivedDoc, cleanedPacket)) {
    packetsCorrupted++;
    Serial.println("ERROR: JSON parse failed");
    return;
  }
  
  bool isEmergency = receivedDoc["emergency"] | false;
  String nodeId = receivedDoc["nodeId"] | "UNKNOWN";
  
  if (isEmergency) {
    emergenciesDetected++;
    Serial.println("\n╔════════════════════════════════════╗");
    Serial.println("║  EMERGENCY SIGNAL RECEIVED!        ║");
    Serial.println("╚════════════════════════════════════╝\n");
    
    if (canSendEmergencyEmail(nodeId)) {
      sendEmergencyEmail(receivedDoc, rssi, snr);
      recordEmergency(nodeId);
    } else {
      Serial.println("Rate limit active - email skipped\n");
    }
  }
  
  DynamicJsonDocument uploadDoc(1024);
  uploadDoc["sensor_node_id"] = nodeId;
  uploadDoc["sensor_packet_count"] = receivedDoc["packetCount"] | 0;
  uploadDoc["sensor_timestamp"] = receivedDoc["timestamp"] | 0;
  uploadDoc["temperature"] = receivedDoc["temperature"];
  uploadDoc["humidity"] = receivedDoc["humidity"] | 0;
  uploadDoc["mq2_analog"] = receivedDoc["mq2_analog"] | 0;
  uploadDoc["mq9_analog"] = receivedDoc["mq9_analog"] | 0;
  uploadDoc["mq135_analog"] = receivedDoc["mq135_analog"] | 0;
  uploadDoc["mq2_digital"] = receivedDoc["mq2_digital"] | false;
  uploadDoc["mq9_digital"] = receivedDoc["mq9_digital"] | false;
  uploadDoc["mq135_digital"] = receivedDoc["mq135_digital"] | false;
  uploadDoc["air_quality"] = receivedDoc["air_quality"] | "Unknown";
  uploadDoc["central_node_id"] = CENTRAL_NODE_ID;
  uploadDoc["received_time"] = getCurrentDateTime();
  uploadDoc["received_timestamp"] = millis();
  uploadDoc["rssi"] = rssi;
  uploadDoc["snr"] = snr;
  uploadDoc["gateway_packet_count"] = packetsReceived;
  
  String jsonString;
  serializeJson(uploadDoc, jsonString);
  
  Serial.println("Payload: " + jsonString);
  
  if (supabaseReady) {
    uploadToSupabase(jsonString);
  } else {
    Serial.println("WARNING: Supabase not ready");
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

void sendEmergencyEmail(JsonDocument& sensorData, int rssi, float snr) {
  if (!wifiConnected) {
    Serial.println("ERROR: WiFi disconnected - cannot send email");
    return;
  }
  
  String nodeId = sensorData["nodeId"] | "UNKNOWN";
  float temperature = sensorData["temperature"] | 0;
  float humidity = sensorData["humidity"] | 0;
  int mq2 = sensorData["mq2_analog"] | 0;
  int mq9 = sensorData["mq9_analog"] | 0;
  int mq135 = sensorData["mq135_analog"] | 0;
  
  String subject = "URGENT: Mine Worker Emergency - Node " + nodeId;
  String emailBody = "EMERGENCY DISTRESS SIGNAL\n\n";
  emailBody += "Node: " + nodeId + "\n";
  emailBody += "Time: " + getCurrentDateTime() + "\n\n";
  emailBody += "Temperature: " + String(temperature, 1) + "C\n";
  emailBody += "Humidity: " + String(humidity, 1) + "%\n";
  emailBody += "MQ2: " + String(mq2) + "\n";
  emailBody += "MQ9: " + String(mq9) + "\n";
  emailBody += "MQ135: " + String(mq135) + "\n";
  emailBody += "RSSI: " + String(rssi) + " dBm\n\n";
  emailBody += "IMMEDIATE ACTION REQUIRED!\n";
  
  Serial.println(">>> Sending emergency email...");
  
  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.println("Attempt " + String(attempt) + "/3");
    if (sendSMTPEmail(subject, emailBody)) {
      emailsSent++;
      Serial.println(">>> Email sent successfully!\n");
      return;
    }
    if (attempt < 3) {
      Serial.println("Retrying in 5 seconds...");
      delay(5000);
    }
  }
  
  Serial.println(">>> Email send failed after 3 attempts\n");
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
  Serial.println("\n=== STATISTICS ===");
  Serial.println("WiFi: " + String(wifiConnected ? "✓" : "✗"));
  Serial.println("Supabase: " + String(supabaseReady ? "✓" : "✗"));
  Serial.println("NTP: " + String(ntpSynced ? "✓" : "✗"));
  Serial.println("RX: " + String(packetsReceived));
  Serial.println("TX: " + String(packetsUploaded));
  Serial.println("Emergencies: " + String(emergenciesDetected));
  Serial.println("Emails: " + String(emailsSent));
  Serial.println("==================\n");
}