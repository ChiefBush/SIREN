/*
  ESP32 Multi-Sensor System - Local Operation Only
  - MQ2, MQ9, MQ135 Gas Sensors
  - HTU21D Temperature & Humidity
  - FN-M16P Audio Module with PAM8403 Amplifier
  - LoRa Communication with Real Sensor Data
  - Serial Output Only (No WiFi/Firebase/NTP)
*/

#include <Wire.h>
#include <HardwareSerial.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>

// HTU21D Library (install "Adafruit HTU21DF Library" from Library Manager)
#include <Adafruit_HTU21DF.h>

// Pin definitions for MQ Sensors (NO CONFLICTS!)
#define MQ2_DIGITAL_PIN 12   // GPIO12 - Available
#define MQ2_ANALOG_PIN 32    // GPIO32 - ADC1_CH4
#define MQ9_DIGITAL_PIN 13   // GPIO13 - Available  
#define MQ9_ANALOG_PIN 33    // GPIO33 - ADC1_CH5
#define MQ135_DIGITAL_PIN 15 // GPIO15 - Available
#define MQ135_ANALOG_PIN 35  // GPIO35 - ADC1_CH7

// FN-M16P Audio Module pins (SIMPLIFIED - Only UART)
#define FN_M16P_RX 16  // ESP32 GPIO16 → FN-M16P TX (pin 3)
#define FN_M16P_TX 17  // ESP32 GPIO17 → FN-M16P RX (pin 2)
// BUSY, I/O1, I/O2 not used as per your requirement

// HTU21D I2C pins (NO CONFLICTS!)
#define HTU21D_SDA 21  // GPIO21 - Available (was conflicting with BUSY)
#define HTU21D_SCL 22  // GPIO22 - Available (was conflicting with MQ2)

// LoRa Module pins (BOOT-SAFE VERSION - GPIO 34)
#define LORA_SCK 5     // GPIO5  -- SX1278's SCK
#define LORA_MISO 19   // GPIO19 -- SX1278's MISO  
#define LORA_MOSI 27   // GPIO27 -- SX1278's MOSI
#define LORA_SS 18     // GPIO18 -- SX1278's CS (Your working config)
#define LORA_RST 14    // GPIO14 -- SX1278's RESET (Your working config)
#define LORA_DIO0 34   // GPIO34 -- SX1278's IRQ (INPUT-ONLY, PERFECT FOR INTERRUPT)

// LoRa frequency
#define LORA_BAND 915E6  // Use 868E6 for Europe, 915E6 for North America

// Node identification
#define NODE_ID "SENSOR_NODE_001"

// Thresholds - now dynamic based on calibration
#define MQ2_THRESHOLD 2000  // Fallback static threshold
#define MQ9_THRESHOLD 1800  // Fallback static threshold
#define MQ135_THRESHOLD 1000 // Fallback static threshold

// Calibration variables
struct SensorCalibration {
  float baseline;
  float threshold;
  bool calibrated;
};

SensorCalibration mq2_cal = {0, 0, false};
SensorCalibration mq9_cal = {0, 0, false};
SensorCalibration mq135_cal = {0, 0, false};

// HTU21D fallback values
#define FALLBACK_TEMPERATURE 27.0  // 27°C
#define FALLBACK_HUMIDITY 47.0     // 47% RH

// Calibration parameters
#define CALIBRATION_SAMPLES 5      // Number of samples for baseline
#define STRICT_FACTOR 0.35         // 35% deviation threshold
#define CALIBRATION_DELAY 2000     // 2 seconds between samples

// FN-M16P Command Structure
const byte FRAME_START = 0x7E;
const byte FRAME_END = 0xEF;
const byte VERSION = 0xFF;
const byte NO_FEEDBACK = 0x00;
const byte WITH_FEEDBACK = 0x01;

// FN-M16P Commands
const byte CMD_PLAY_TRACK = 0x03;
const byte CMD_VOLUME = 0x06;
const byte CMD_STOP = 0x16;

// Audio file mapping - RESTORED to original 1:1 correspondence
enum AudioFiles {
  BOOT_AUDIO = 1,         // 0001.mp3 - System startup
  SMOKE_ALERT = 2,        // 0002.mp3 - Smoke/Gas alert
  CO_ALERT = 3,           // 0003.mp3 - Carbon monoxide alert
  AIR_QUALITY_WARNING = 4, // 0004.mp3 - Air quality warning
  HIGH_TEMP_ALERT = 5,    // 0005.mp3 - High temperature
  LOW_TEMP_ALERT = 6,     // 0006.mp3 - Low temperature
  HIGH_HUMIDITY_ALERT = 7, // 0007.mp3 - High humidity
  LOW_HUMIDITY_ALERT = 8  // 0008.mp3 - Low humidity
};

// Initialize modules
Adafruit_HTU21DF htu = Adafruit_HTU21DF();
HardwareSerial fnM16pSerial(2);  // Use UART2

// Status flags
bool audioReady = false;
bool loraReady = false;

// LoRa transmission variables
unsigned long lastLoRaSend = 0;
int loraInterval = 30000; // Send every 30 seconds
int packetCount = 0;

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
};

void setup() {
  Serial.begin(115200);
  Serial.println("=================================");
  Serial.println("ESP32 Multi-Sensor System v5.1");
  Serial.println("Local Operation Only");
  Serial.println("=================================");
  
  // Initialize MQ sensor pins
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(MQ9_DIGITAL_PIN, INPUT);
  pinMode(MQ135_DIGITAL_PIN, INPUT);
  
  // Initialize I2C for HTU21D
  Wire.begin(HTU21D_SDA, HTU21D_SCL);
  if (!htu.begin()) {
    Serial.println("HTU21D not detected. Check wiring.");
  } else {
    Serial.println("HTU21D initialized successfully!");
  }

  // Initialize FN-M16P Audio Module
  fnM16pSerial.begin(9600, SERIAL_8N1, FN_M16P_RX, FN_M16P_TX);
  // BUSY, I/O1, I/O2 pins not used as per requirements
  
  delay(2000); // Give FN-M16P time to initialize
  
  Serial.println("Initializing FN-M16P Audio Module...");
  setVolume(20); // Set volume (0-30)
  delay(500);
  
  audioReady = true;
  Serial.println("FN-M16P initialized successfully!");
  Serial.println("Audio files: 0001.mp3, 0002.mp3, etc. in SD root directory");
  
  // Initialize LoRa
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("LoRa initialization failed. Check wiring.");
    loraReady = false;
  } else {
    // Set LoRa parameters for maximum reliability
    LoRa.setTxPower(20);          // Max TX power
    LoRa.setSpreadingFactor(12);  // Max range
    LoRa.setSignalBandwidth(125E3);
    LoRa.setCodingRate4(8);       // Max error correction
    LoRa.setPreambleLength(8);
    LoRa.setSyncWord(0x34);
    
    Serial.println("LoRa initialized successfully!");
    Serial.println("Frequency: " + String(LORA_BAND/1E6) + " MHz");
    Serial.println("Node ID: " + String(NODE_ID));
    loraReady = true;
  }
  
  Serial.println("Warming up gas sensors...");
  delay(10000); // 10 second warm-up
  
  // Calibrate MQ sensors after warm-up
  Serial.println("Calibrating MQ sensors...");
  calibrateSensors();
  
  Serial.println("System ready!");
  Serial.println();
  
  // Remove the test code and restore normal boot audio
  Serial.println("System ready!");
  Serial.println();
  
  // Play startup sound (now correctly mapped)
  if (audioReady) {
    playAudioFile(BOOT_AUDIO);  // This will now play 0001.mp3 correctly
    delay(2000);
  }
}

void loop() {
  // Read all sensors
  SensorData data = readAllSensors();
  
  // Display readings
  displayReadings(data);
  
  // Check for alerts
  checkAlerts(data);
  
  // Send LoRa data (every 30 seconds)
  if (loraReady && (millis() - lastLoRaSend > loraInterval)) {
    sendLoRaData(data);
    lastLoRaSend = millis();
  }
  
  Serial.println("------------------------");
  delay(10000); // Main loop every 10 seconds
}

// FN-M16P Functions
void sendCommand(byte cmd, byte param1, byte param2, bool feedback) {
  byte packet[10];
  
  packet[0] = FRAME_START;
  packet[1] = VERSION;
  packet[2] = 0x06;
  packet[3] = cmd;
  packet[4] = feedback ? WITH_FEEDBACK : NO_FEEDBACK;
  packet[5] = param1;
  packet[6] = param2;
  
  uint16_t sum = packet[1] + packet[2] + packet[3] + packet[4] + packet[5] + packet[6];
  uint16_t checksum = 0xFFFF - sum + 1;
  
  packet[7] = (checksum >> 8) & 0xFF;
  packet[8] = checksum & 0xFF;
  packet[9] = FRAME_END;
  
  // DEBUG: Print the exact bytes being sent
  Serial.print("Sending to FN-M16P: ");
  for(int i = 0; i < 10; i++) {
    Serial.print("0x");
    if(packet[i] < 16) Serial.print("0");
    Serial.print(packet[i], HEX);
    Serial.print(" ");
  }
  Serial.println();
  
  fnM16pSerial.write(packet, 10);
}

void setVolume(int volume) {
  if (volume < 0) volume = 0;
  if (volume > 30) volume = 30;
  sendCommand(CMD_VOLUME, 0x00, volume, false);
  Serial.println("FN-M16P: Volume set to " + String(volume));
}

void playAudioFile(int fileNumber) {
  if (fileNumber < 1 || fileNumber > 8) return;
  
  Serial.println("*** AUDIO TRIGGERED at " + String(millis()) + "ms ***");
  
  // Standard 1:1 file mapping - Command matches file number
  String fileName = "";
  if(fileNumber < 10) fileName = "000" + String(fileNumber);
  else fileName = "00" + String(fileNumber);
  
  Serial.println("Playing: " + getAudioDescription(fileNumber) + " (" + fileName + ".mp3)");
  sendCommand(CMD_PLAY_TRACK, 0x00, fileNumber, false);
  delay(100);
}

String getAudioDescription(int fileNumber) {
  switch(fileNumber) {
    case 1: return "System Boot";
    case 2: return "Smoke/Gas Alert";
    case 3: return "CO Alert"; 
    case 4: return "Air Quality Warning";
    case 5: return "High Temperature";
    case 6: return "Low Temperature";
    case 7: return "High Humidity";
    case 8: return "Low Humidity";
    default: return "Unknown";
  }
}

void stopAudio() {
  sendCommand(CMD_STOP, 0x00, 0x00, false);
}

// Sensor calibration function
void calibrateSensors() {
  Serial.println("Starting sensor calibration...");
  Serial.println("Ensure sensors are in clean air environment");
  delay(3000);
  
  // Calibrate MQ2
  Serial.print("Calibrating MQ2... ");
  calibrateSensor(MQ2_ANALOG_PIN, &mq2_cal, "MQ2");
  
  // Calibrate MQ9
  Serial.print("Calibrating MQ9... ");
  calibrateSensor(MQ9_ANALOG_PIN, &mq9_cal, "MQ9");
  
  // Calibrate MQ135
  Serial.print("Calibrating MQ135... ");
  calibrateSensor(MQ135_ANALOG_PIN, &mq135_cal, "MQ135");
  
  Serial.println("Sensor calibration completed!");
  Serial.println("Baselines established:");
  Serial.printf("  MQ2: %.1f (threshold: %.1f)\n", mq2_cal.baseline, mq2_cal.threshold);
  Serial.printf("  MQ9: %.1f (threshold: %.1f)\n", mq9_cal.baseline, mq9_cal.threshold);
  Serial.printf("  MQ135: %.1f (threshold: %.1f)\n", mq135_cal.baseline, mq135_cal.threshold);
}

void calibrateSensor(int pin, SensorCalibration* cal, String sensorName) {
  float sum = 0;
  
  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    int reading = analogRead(pin);
    sum += reading;
    Serial.print(".");
    delay(CALIBRATION_DELAY);
  }
  
  cal->baseline = sum / CALIBRATION_SAMPLES;
  cal->threshold = cal->baseline * STRICT_FACTOR;
  cal->calibrated = true;
  
  Serial.println(" Done");
}

// Enhanced sensor checking with dynamic thresholds
bool checkSensorAlert(int currentValue, SensorCalibration* cal, int staticThreshold) {
  if (!cal->calibrated) {
    // Fall back to static threshold if not calibrated
    return currentValue > staticThreshold;
  }
  
  float deviation = abs(currentValue - cal->baseline);
  return deviation > cal->threshold;
}

void logSensorStatus(String sensorName, int currentValue, SensorCalibration* cal, bool isAlert) {
  if (cal->calibrated) {
    float deviation = currentValue - cal->baseline;
    Serial.printf("  %s: %d (baseline: %.1f, deviation: %.1f) - %s\n", 
                  sensorName.c_str(), currentValue, cal->baseline, deviation, 
                  isAlert ? "ALERT!" : "Normal");
  } else {
    Serial.printf("  %s: %d (uncalibrated) - %s\n", 
                  sensorName.c_str(), currentValue, isAlert ? "ALERT!" : "Normal");
  }
}

// Sensor reading functions with HTU21D fallback
SensorData readAllSensors() {
  SensorData data;
  data.timestamp = millis();
  
  // Read HTU21D with fallback
  float temp = htu.readTemperature();
  float hum = htu.readHumidity();
  
  // Check for HTU21D sensor errors and use fallback values
  if (isnan(temp) || temp < -50 || temp > 100) {
    data.temperature = FALLBACK_TEMPERATURE;
    Serial.println("HTU21D temperature error - using fallback: " + String(FALLBACK_TEMPERATURE) + "°C");
  } else {
    data.temperature = temp;
  }
  
  if (isnan(hum) || hum < 0 || hum > 100) {
    data.humidity = FALLBACK_HUMIDITY;
    Serial.println("HTU21D humidity error - using fallback: " + String(FALLBACK_HUMIDITY) + "%");
  } else {
    data.humidity = hum;
  }
  
  // Read MQ sensors
  data.mq2_analog = analogRead(MQ2_ANALOG_PIN);
  data.mq9_analog = analogRead(MQ9_ANALOG_PIN);
  data.mq135_analog = analogRead(MQ135_ANALOG_PIN);
  
  data.mq2_digital = digitalRead(MQ2_DIGITAL_PIN) == LOW;
  data.mq9_digital = digitalRead(MQ9_DIGITAL_PIN) == LOW;
  data.mq135_digital = digitalRead(MQ135_DIGITAL_PIN) == LOW;
  
  return data;
}

bool isPlaying() {
  // Since BUSY pin not used, assume not playing for safety
  return false;
}

void displayReadings(SensorData data) {
  Serial.println("=== SENSOR READINGS ===");
  Serial.println("Timestamp: " + String(data.timestamp));
  Serial.println("Audio: " + String(audioReady ? "Ready" : "Not Ready"));
  Serial.println("LoRa: " + String(loraReady ? "Ready" : "Not Ready"));
  Serial.println();
  
  // Environmental data
  Serial.println("HTU21D (Temperature & Humidity):");
  Serial.printf("  Temperature: %.2f°C\n", data.temperature);
  Serial.printf("  Humidity: %.2f%%\n", data.humidity);
  Serial.println();
  
  // Gas sensors with enhanced status display
  Serial.println("MQ2 (Smoke/LPG/Gas):");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq2_digital ? "GAS DETECTED" : "No Gas", data.mq2_analog);
  bool mq2_alert = checkSensorAlert(data.mq2_analog, &mq2_cal, MQ2_THRESHOLD);
  Serial.println(mq2_alert ? " - ALERT!" : " - Normal");
  logSensorStatus("MQ2", data.mq2_analog, &mq2_cal, mq2_alert);
  
  Serial.println("MQ9 (Carbon Monoxide):");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq9_digital ? "CO DETECTED" : "No CO", data.mq9_analog);
  bool mq9_alert = checkSensorAlert(data.mq9_analog, &mq9_cal, MQ9_THRESHOLD);
  Serial.println(mq9_alert ? " - ALERT!" : " - Normal");
  logSensorStatus("MQ9", data.mq9_analog, &mq9_cal, mq9_alert);
  
  Serial.println("MQ135 (Air Quality/CO2):");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq135_digital ? "POOR AIR" : "Good Air", data.mq135_analog);
  bool mq135_alert = checkSensorAlert(data.mq135_analog, &mq135_cal, MQ135_THRESHOLD);
  Serial.println(mq135_alert ? " - ALERT!" : " - Normal");
  logSensorStatus("MQ135", data.mq135_analog, &mq135_cal, mq135_alert);
  
  // Add debugging for digital pin raw values
  Serial.println();
  Serial.println("Debug - Digital Pin Raw Values:");
  Serial.printf("  MQ2 Digital Pin (GPIO%d): %d\n", MQ2_DIGITAL_PIN, digitalRead(MQ2_DIGITAL_PIN));
  Serial.printf("  MQ9 Digital Pin (GPIO%d): %d\n", MQ9_DIGITAL_PIN, digitalRead(MQ9_DIGITAL_PIN));
  Serial.printf("  MQ135 Digital Pin (GPIO%d): %d\n", MQ135_DIGITAL_PIN, digitalRead(MQ135_DIGITAL_PIN));
}

void checkAlerts(SensorData data) {
  static unsigned long lastAlert = 0;
  unsigned long now = millis();
  
  Serial.printf("checkAlerts() called at %lu ms (lastAlert: %lu ms)\n", now, lastAlert);
  
  // Avoid too frequent alerts (minimum 30 seconds between alerts)
  if (now - lastAlert < 30000) {
    Serial.println("*** ALERT COOLDOWN ACTIVE - No alerts will play ***");
    return;
  }
  
  // Check for dangerous conditions using ONLY analog thresholds
  // Digital pins removed from alert conditions to prevent false alarms
  bool mq2_alert = checkSensorAlert(data.mq2_analog, &mq2_cal, MQ2_THRESHOLD);
  bool mq9_alert = checkSensorAlert(data.mq9_analog, &mq9_cal, MQ9_THRESHOLD);
  bool mq135_alert = checkSensorAlert(data.mq135_analog, &mq135_cal, MQ135_THRESHOLD);
  
  // DEBUG: Print alert status
  Serial.println("DEBUG Alert Status:");
  Serial.printf("  MQ2 Alert: %s\n", mq2_alert ? "TRUE" : "FALSE");
  Serial.printf("  MQ9 Alert: %s\n", mq9_alert ? "TRUE" : "FALSE");
  Serial.printf("  MQ135 Alert: %s\n", mq135_alert ? "TRUE" : "FALSE");
  
  // ONLY use analog thresholds for audio alerts - NO digital pins
  if (mq2_alert) {
    Serial.println("*** MQ2 ALERT TRIGGERED - PLAYING SMOKE ALERT ***");
    Serial.println("ALERT: Smoke/Gas detected via analog threshold!");
    playAudioFile(SMOKE_ALERT);
    lastAlert = now;
  }
  else if (mq9_alert) {
    Serial.println("*** MQ9 ALERT TRIGGERED - PLAYING CO ALERT ***");
    Serial.println("ALERT: Carbon Monoxide detected via analog threshold!");
    playAudioFile(CO_ALERT);
    lastAlert = now;
  }
  else if (mq135_alert) {
    Serial.println("*** MQ135 ALERT TRIGGERED - PLAYING AIR QUALITY ALERT ***");
    Serial.println("WARNING: Poor air quality detected via analog threshold!");
    playAudioFile(AIR_QUALITY_WARNING);
    lastAlert = now;
  }
  else {
    Serial.println("*** NO GAS SENSOR ALERTS - CHECKING TEMPERATURE/HUMIDITY ***");
  }
  
  // Temperature alerts (no change needed - already using reasonable absolute values)
  if (data.temperature > 40.0) {
    Serial.println("*** HIGH TEMPERATURE ALERT TRIGGERED ***");
    Serial.println("ALERT: High temperature!");
    playAudioFile(HIGH_TEMP_ALERT);
    lastAlert = now;
  }
  else if (data.temperature < 5.0) {
    Serial.println("*** LOW TEMPERATURE ALERT TRIGGERED ***");
    Serial.println("ALERT: Low temperature!");
    playAudioFile(LOW_TEMP_ALERT);
    lastAlert = now;
  }
  
  // Humidity alerts (no change needed - already using reasonable absolute values)
  else if (data.humidity > 85.0) {
    Serial.println("*** HIGH HUMIDITY ALERT TRIGGERED ***");
    Serial.println("ALERT: High humidity!");
    playAudioFile(HIGH_HUMIDITY_ALERT);
    lastAlert = now;
  }
  else if (data.humidity < 20.0) {
    Serial.println("*** LOW HUMIDITY ALERT TRIGGERED ***");
    Serial.println("ALERT: Low humidity!");
    playAudioFile(LOW_HUMIDITY_ALERT);
    lastAlert = now;
  }
  else {
    Serial.println("*** NO ALERTS TRIGGERED - ALL VALUES NORMAL ***");
  }
}

void sendLoRaData(SensorData data) {
  packetCount++;
  
  // Create JSON packet with real sensor data (NO timestamp)
  StaticJsonDocument<280> doc;
  doc["nodeId"] = "001";  // Fixed node ID format
  doc["packetCount"] = packetCount;
  
  // Real sensor data
  doc["temperature"] = data.temperature;
  doc["humidity"] = data.humidity;
  doc["mq2_analog"] = data.mq2_analog;
  doc["mq9_analog"] = data.mq9_analog;
  doc["mq135_analog"] = data.mq135_analog;
  doc["mq2_digital"] = data.mq2_digital;
  doc["mq9_digital"] = data.mq9_digital;
  doc["mq135_digital"] = data.mq135_digital;
  doc["air_quality"] = getAirQualityRating(data.mq135_analog);
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.print("Sending LoRa packet #");
  Serial.print(packetCount);
  Serial.print(" from Node 001: ");
  Serial.println(jsonString);
  
  LoRa.beginPacket();
  LoRa.print(jsonString);
  LoRa.endPacket();
  
  Serial.println("LoRa packet sent!");
}

String getAirQualityRating(int value) {
  if (value < 800) return "Excellent";
  else if (value < 1200) return "Good";
  else if (value < 1800) return "Moderate";
  else if (value < 2400) return "Poor";
  else return "Very Poor";
}
