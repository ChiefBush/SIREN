/*
  Complete ESP32 Multi-Sensor System with Firebase
  - MQ2, MQ9, MQ135 Gas Sensors
  - HTU21D Temperature & Humidity
  - DFPlayer Mini Audio
  - LoRa Communication Module
  - WiFi & Firebase Integration
  - NTP Time Synchronization
*/

#include <Wire.h>
#include <SoftwareSerial.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <time.h>

// Firebase helper
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// HTU21D Library (install "Adafruit HTU21DF Library" from Library Manager)
#include <Adafruit_HTU21DF.h>

// DFPlayer Library (install "DFRobotDFPlayerMini" from Library Manager)
#include <DFRobotDFPlayerMini.h>

// WiFi Credentials
#define WIFI_SSID "419"
#define WIFI_PASSWORD "xyz@1234"

// Firebase Configuration
#define API_KEY "AIzaSyDy49OYNumyIrIBrPTOP8dvkeYZGkXn4ac"
#define DATABASE_URL "https://siren-4951f-default-rtdb.asia-southeast1.firebasedatabase.app/"

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// NTP Configuration
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 19800;  // GMT+5:30 India
const int daylightOffset_sec = 0;

// Pin definitions for MQ Sensors
#define MQ2_DIGITAL_PIN 18
#define MQ2_ANALOG_PIN 32
#define MQ9_DIGITAL_PIN 19
#define MQ9_ANALOG_PIN 33
#define MQ135_DIGITAL_PIN 21
#define MQ135_ANALOG_PIN 35

// Pin definitions for other modules
#define DFPLAYER_RX 16
#define DFPLAYER_TX 17

// LoRa Module (SPI)
#define LORA_SCK 14
#define LORA_MISO 12
#define LORA_MOSI 13
#define LORA_SS 15
#define LORA_RST 2
#define LORA_DIO0 4

// Thresholds
#define MQ2_THRESHOLD 2000
#define MQ9_THRESHOLD 1800
#define MQ135_THRESHOLD 1000

// Initialize modules
Adafruit_HTU21DF htu = Adafruit_HTU21DF();
SoftwareSerial dfPlayerSerial(DFPLAYER_TX, DFPLAYER_RX);
DFRobotDFPlayerMini dfPlayer;

// Status flags
bool wifiConnected = false;
bool firebaseReady = false;
bool ntpSynced = false;

// Data structure for sensor readings
struct SensorData {
  float temperature;
  float humidity;
  int mq2_analog;
  int mq9_analog;
  int mq135_analog;
  bool mq2_digital;
  bool mq9_digital;
  bool mq135_digital;
  unsigned long timestamp;
  String dateTime;
};

void setup() {
  Serial.begin(115200);
  Serial.println("=================================");
  Serial.println("ESP32 Complete Sensor System v2.0");
  Serial.println("With WiFi & Firebase Integration");
  Serial.println("=================================");
  
  // Initialize WiFi
  initializeWiFi();
  
  // Initialize NTP
  if (wifiConnected) {
    initializeNTP();
  }
  
  // Initialize Firebase
  if (wifiConnected) {
    initializeFirebase();
  }
  
  // Initialize MQ sensor pins
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(MQ9_DIGITAL_PIN, INPUT);
  pinMode(MQ135_DIGITAL_PIN, INPUT);
  
  // Initialize I2C for HTU21D on custom pins
  Wire.begin(26, 25);  // SDA=26, SCL=25
    if (!htu.begin()) {
      Serial.println("HTU21D not detected. Check wiring.");
    } else {
      Serial.println("HTU21D initialized successfully!");
  }

  
  // Initialize DFPlayer Mini
  dfPlayerSerial.begin(9600);
  if (!dfPlayer.begin(dfPlayerSerial)) {
    Serial.println("DFPlayer Mini not detected. Check wiring.");
  } else {
    Serial.println("DFPlayer Mini initialized successfully!");
    dfPlayer.volume(15); // Set volume (0-30)
  }
  
  // Initialize LoRa
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(433E6)) { // 433MHz frequency
    Serial.println("LoRa initialization failed. Check wiring.");
  } else {
    Serial.println("LoRa initialized successfully!");
    LoRa.setTxPower(20); // Set transmission power
  }
  
  Serial.println("Warming up gas sensors...");
  delay(10000); // 10 second warm-up
  Serial.println("System ready!");
  Serial.println();
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED && wifiConnected) {
    Serial.println("WiFi disconnected. Reconnecting...");
    initializeWiFi();
  }
  
  // Read all sensors
  SensorData data = readAllSensors();
  
  // Display readings
  displayReadings(data);
  
  // Check for alerts
  checkAlerts(data);
  
  // Send data to Firebase
  if (firebaseReady) {
    sendToFirebase(data);
  }
  
  // Send LoRa data
  sendLoRaData(data);
  
  Serial.println("------------------------");
  delay(10000); // Read every 10 seconds for Firebase
}

void initializeWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    wifiConnected = false;
    Serial.println();
    Serial.println("WiFi connection failed!");
  }
}

void initializeNTP() {
  Serial.println("Synchronizing time with NTP server...");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 10) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (getLocalTime(&timeinfo)) {
    ntpSynced = true;
    Serial.println();
    Serial.println("NTP time synchronized!");
    Serial.printf("Current time: %s", asctime(&timeinfo));
  } else {
    ntpSynced = false;
    Serial.println();
    Serial.println("Failed to sync NTP time!");
  }
}

void initializeFirebase() {
  Serial.println("Initializing Firebase...");
  
  // Configure Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  
  // Anonymous authentication
  Serial.println("Signing up for anonymous authentication...");
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase authentication successful!");
    firebaseReady = true;
  } else {
    Serial.printf("Firebase authentication failed: %s\n", config.signer.signupError.message.c_str());
    firebaseReady = false;
  }
  
  // Assign callback function for token generation
  config.token_status_callback = tokenStatusCallback;
  
  // Initialize Firebase
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  Serial.println("Firebase initialized!");
}

SensorData readAllSensors() {
  SensorData data;
  data.timestamp = millis();
  data.dateTime = getCurrentDateTime();
  
  // Read HTU21D
  data.temperature = htu.readTemperature();
  data.humidity = htu.readHumidity();

  
  // Handle sensor read errors
  if (isnan(data.temperature)) data.temperature = -999;
  if (isnan(data.humidity)) data.humidity = -999;
  
  // Read MQ sensors
  data.mq2_analog = analogRead(MQ2_ANALOG_PIN);
  data.mq9_analog = analogRead(MQ9_ANALOG_PIN);
  data.mq135_analog = analogRead(MQ135_ANALOG_PIN);
  
  data.mq2_digital = digitalRead(MQ2_DIGITAL_PIN) == LOW;
  data.mq9_digital = digitalRead(MQ9_DIGITAL_PIN) == LOW;
  data.mq135_digital = digitalRead(MQ135_DIGITAL_PIN) == LOW;
  
  return data;
}

String getCurrentDateTime() {
  if (!ntpSynced) return "Time not synced";
  
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "Failed to get time";
  }
  
  char timeString[64];
  strftime(timeString, sizeof(timeString), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(timeString);
}

void displayReadings(SensorData data) {
  Serial.println("=== SENSOR READINGS ===");
  Serial.println("Time: " + data.dateTime);
  Serial.println("WiFi: " + String(wifiConnected ? "Connected" : "Disconnected"));
  Serial.println("Firebase: " + String(firebaseReady ? "Ready" : "Not Ready"));
  Serial.println();
  
  // Environmental data
  Serial.println("HTU21D (Temperature & Humidity):");
  if (data.temperature != -999 && data.humidity != -999) {
    Serial.printf("  Temperature: %.2f°C\n", data.temperature);
    Serial.printf("  Humidity: %.2f%%\n", data.humidity);
  } else {
    Serial.println("  HTU21D reading error!");
  }
  Serial.println();
  
  // Gas sensors
  Serial.println("MQ2 (Smoke/LPG/Gas):");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq2_digital ? "GAS DETECTED" : "No Gas", data.mq2_analog);
  Serial.println(data.mq2_analog > MQ2_THRESHOLD ? " - HIGH!" : " - Normal");
  
  Serial.println("MQ9 (Carbon Monoxide):");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq9_digital ? "CO DETECTED" : "No CO", data.mq9_analog);
  Serial.println(data.mq9_analog > MQ9_THRESHOLD ? " - HIGH!" : " - Normal");
  
  Serial.println("MQ135 (Air Quality/CO2):");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq135_digital ? "POOR AIR" : "Good Air", data.mq135_analog);
  Serial.println(data.mq135_analog > MQ135_THRESHOLD ? " - POOR!" : " - Good");
}

void checkAlerts(SensorData data) {
  static unsigned long lastAlert = 0;
  unsigned long now = millis();
  
  // Avoid too frequent alerts (minimum 30 seconds between alerts)
  if (now - lastAlert < 30000) return;
  
  // Check for dangerous conditions
  if (data.mq2_analog > MQ2_THRESHOLD || data.mq2_digital) {
    Serial.println("🚨 ALERT: Smoke/Gas detected!");
    playAlert(1);
    sendAlert("SMOKE_GAS_ALERT", "Smoke or gas detected!", data);
    lastAlert = now;
  }
  else if (data.mq9_analog > MQ9_THRESHOLD || data.mq9_digital) {
    Serial.println("🚨 ALERT: Carbon Monoxide detected!");
    playAlert(2);
    sendAlert("CO_ALERT", "Carbon monoxide detected!", data);
    lastAlert = now;
  }
  else if (data.mq135_analog > MQ135_THRESHOLD || data.mq135_digital) {
    Serial.println("⚠️  WARNING: Poor air quality!");
    playAlert(3);
    sendAlert("AIR_QUALITY_WARNING", "Poor air quality detected!", data);
    lastAlert = now;
  }
  
  // Temperature alerts
  if (data.temperature > 40.0) {
    Serial.println("🌡️  ALERT: High temperature!");
    playAlert(4);
    sendAlert("HIGH_TEMP_ALERT", "High temperature detected!", data);
    lastAlert = now;
  }
  else if (data.temperature < 5.0) {
    Serial.println("❄️  ALERT: Low temperature!");
    playAlert(5);
    sendAlert("LOW_TEMP_ALERT", "Low temperature detected!", data);
    lastAlert = now;
  }
}

void sendToFirebase(SensorData data) {
  if (!Firebase.ready()) return;
  
  // Create JSON object for sensor data
  FirebaseJson json;
  json.set("timestamp", data.timestamp);
  json.set("dateTime", data.dateTime);
  json.set("temperature", data.temperature);
  json.set("humidity", data.humidity);
  json.set("mq2_analog", data.mq2_analog);
  json.set("mq9_analog", data.mq9_analog);
  json.set("mq135_analog", data.mq135_analog);
  json.set("mq2_digital", data.mq2_digital);
  json.set("mq9_digital", data.mq9_digital);
  json.set("mq135_digital", data.mq135_digital);
  json.set("air_quality", getAirQualityRating(data.mq135_analog));
  
  // Send to Firebase with timestamp as key
  String path = "/sensor_data/" + String(data.timestamp);
  
  if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json)) {
    Serial.println("✅ Data sent to Firebase successfully!");
  } else {
    Serial.println("❌ Firebase send failed: " + fbdo.errorReason());
  }
  
  // Also update latest readings
  if (Firebase.RTDB.setJSON(&fbdo, "/latest_reading", &json)) {
    Serial.println("✅ Latest reading updated!");
  }
}

void sendAlert(String alertType, String message, SensorData data) {
  if (!Firebase.ready()) return;
  
  FirebaseJson alertJson;
  alertJson.set("alertType", alertType);
  alertJson.set("message", message);
  alertJson.set("timestamp", data.timestamp);
  alertJson.set("dateTime", data.dateTime);
  alertJson.set("temperature", data.temperature);
  alertJson.set("humidity", data.humidity);
  alertJson.set("mq2_analog", data.mq2_analog);
  alertJson.set("mq9_analog", data.mq9_analog);
  alertJson.set("mq135_analog", data.mq135_analog);
  
  String alertPath = "/alerts/" + String(data.timestamp);
  
  if (Firebase.RTDB.setJSON(&fbdo, alertPath.c_str(), &alertJson)) {
    Serial.println("🚨 Alert sent to Firebase!");
  } else {
    Serial.println("❌ Alert send failed: " + fbdo.errorReason());
  }
}

void playAlert(int fileNumber) {
  if (dfPlayer.available()) {
    dfPlayer.play(fileNumber);
    delay(100);
  }
}

void sendLoRaData(SensorData data) {
  String packet = "SENSOR_DATA,";
  packet += String(data.timestamp) + ",";
  packet += String(data.temperature, 2) + ",";
  packet += String(data.humidity, 2) + ",";
  packet += String(data.mq2_analog) + ",";
  packet += String(data.mq9_analog) + ",";
  packet += String(data.mq135_analog);
  
  LoRa.beginPacket();
  LoRa.print(packet);
  LoRa.endPacket();
  
  Serial.println("📡 LoRa packet sent: " + packet);
}

String getAirQualityRating(int value) {
  if (value < 800) return "Excellent";
  else if (value < 1200) return "Good";
  else if (value < 1800) return "Moderate";
  else if (value < 2400) return "Poor";
  else return "Very Poor";
}
