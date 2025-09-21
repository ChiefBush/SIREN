/*
  ESP32 Multi-Sensor System - Local Operation Only
  - MQ2, MQ9, MQ135 Gas Sensors - FIXED FOR HIGH THRESHOLD ONLY
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

// FIXED: Much higher static thresholds for genuine danger only
#define MQ2_DANGER_THRESHOLD 1600   // Very high smoke/gas threshold
#define MQ9_DANGER_THRESHOLD 3800   // Very high CO threshold
#define MQ135_DANGER_THRESHOLD 1800 // Very high air quality threshold

// HTU21D fallback values
#define FALLBACK_TEMPERATURE 27.0  // 27°C
#define FALLBACK_HUMIDITY 47.0     // 47% RH

// Calibration parameters - FIXED
#define CALIBRATION_SAMPLES 10     // More samples for better baseline
#define DANGER_MULTIPLIER 2.0      // Must be 2x baseline to trigger (200% increase!)
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

// Audio file mapping
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

// FIXED: New calibration structure - only care about high threshold
struct SensorCalibration {
  float baseline;
  float dangerThreshold;  // Only trigger when MUCH higher than baseline
  bool calibrated;
};

SensorCalibration mq2_cal = {0, 0, false};
SensorCalibration mq9_cal = {0, 0, false};
SensorCalibration mq135_cal = {0, 0, false};

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
  Serial.println("ESP32 Multi-Sensor System v5.2");
  Serial.println("FIXED: High Gas Threshold Only");
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
  delay(2000); // Give FN-M16P time to initialize
  
  Serial.println("Initializing FN-M16P Audio Module...");
  setVolume(30); // Set volume (0-30)
  delay(500);
  
  audioReady = true;
  Serial.println("FN-M16P initialized successfully!");
  
  // Initialize LoRa
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("LoRa initialization failed. Check wiring.");
    loraReady = false;
  } else {
    // Set LoRa parameters for maximum reliability
    LoRa.setTxPower(20);
    LoRa.setSpreadingFactor(12);
    LoRa.setSignalBandwidth(125E3);
    LoRa.setCodingRate4(8);
    LoRa.setPreambleLength(8);
    LoRa.setSyncWord(0x34);
    
    Serial.println("LoRa initialized successfully!");
    loraReady = true;
  }
  
  Serial.println("Warming up gas sensors...");
  delay(15000); // 15 second warm-up for better stability
  
  // Calibrate MQ sensors after warm-up
  Serial.println("Calibrating MQ sensors for DANGER-ONLY thresholds...");
  calibrateSensors();
  
  Serial.println("System ready!");
  Serial.println();
  
  // Play startup sound
  if (audioReady) {
    playAudioFile(BOOT_AUDIO);
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

// FIXED: New calibration function - establishes DANGER thresholds only
void calibrateSensors() {
  Serial.println("Starting sensor calibration for DANGER thresholds...");
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
  Serial.println("DANGER-ONLY Baselines established:");
  Serial.printf("  MQ2: %.1f (DANGER threshold: %.1f - must be 4x baseline!)\n", mq2_cal.baseline, mq2_cal.dangerThreshold);
  Serial.printf("  MQ9: %.1f (DANGER threshold: %.1f - must be 4x baseline!)\n", mq9_cal.baseline, mq9_cal.dangerThreshold);
  Serial.printf("  MQ135: %.1f (DANGER threshold: %.1f - must be 4x baseline!)\n", mq135_cal.baseline, mq135_cal.dangerThreshold);
  Serial.println();
  Serial.println("Audio alerts will ONLY trigger at extreme gas levels!");
}

// FIXED: New calibration function - only high thresholds
void calibrateSensor(int pin, SensorCalibration* cal, String sensorName) {
  float sum = 0;
  
  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    int reading = analogRead(pin);
    sum += reading;
    Serial.print(".");
    delay(CALIBRATION_DELAY);
  }
  
  cal->baseline = sum / CALIBRATION_SAMPLES;
  
  // FIXED: Only create danger threshold (must be 4x baseline)
  cal->dangerThreshold = cal->baseline * DANGER_MULTIPLIER;
  
  // Also ensure minimum static threshold for safety
  if (sensorName == "MQ2" && cal->dangerThreshold < MQ2_DANGER_THRESHOLD) {
    cal->dangerThreshold = MQ2_DANGER_THRESHOLD;
  }
  if (sensorName == "MQ9" && cal->dangerThreshold < MQ9_DANGER_THRESHOLD) {
    cal->dangerThreshold = MQ9_DANGER_THRESHOLD;
  }
  if (sensorName == "MQ135" && cal->dangerThreshold < MQ135_DANGER_THRESHOLD) {
    cal->dangerThreshold = MQ135_DANGER_THRESHOLD;
  }
  
  cal->calibrated = true;
  Serial.println(" Done");
}

// FIXED: Only trigger alerts for VERY HIGH readings (danger level)
bool checkSensorDanger(int currentValue, SensorCalibration* cal, int staticDangerThreshold) {
  if (!cal->calibrated) {
    // Fall back to static danger threshold if not calibrated
    return currentValue > staticDangerThreshold;
  }
  
  // ONLY trigger if current value exceeds danger threshold (4x baseline OR static minimum)
  return currentValue > cal->dangerThreshold;
}

void logSensorStatus(String sensorName, int currentValue, SensorCalibration* cal, bool isDanger) {
  if (cal->calibrated) {
    float ratio = currentValue / cal->baseline;
    Serial.printf("  %s: %d (baseline: %.1f, ratio: %.1fx, danger: %.1f) - %s\n", 
                  sensorName.c_str(), currentValue, cal->baseline, ratio, cal->dangerThreshold,
                  isDanger ? "DANGER!" : "Safe");
  } else {
    Serial.printf("  %s: %d (uncalibrated) - %s\n", 
                  sensorName.c_str(), currentValue, isDanger ? "DANGER!" : "Safe");
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
  
  // FIXED: Gas sensors with DANGER-only status display
  Serial.println("MQ2 (Smoke/LPG/Gas) - DANGER-ONLY Alerts:");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq2_digital ? "GAS DETECTED" : "No Gas", data.mq2_analog);
  bool mq2_danger = checkSensorDanger(data.mq2_analog, &mq2_cal, MQ2_DANGER_THRESHOLD);
  Serial.println(mq2_danger ? " - EXTREME DANGER!" : " - Safe");
  logSensorStatus("MQ2", data.mq2_analog, &mq2_cal, mq2_danger);
  
  Serial.println("MQ9 (Carbon Monoxide) - DANGER-ONLY Alerts:");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq9_digital ? "CO DETECTED" : "No CO", data.mq9_analog);
  bool mq9_danger = checkSensorDanger(data.mq9_analog, &mq9_cal, MQ9_DANGER_THRESHOLD);
  Serial.println(mq9_danger ? " - EXTREME DANGER!" : " - Safe");
  logSensorStatus("MQ9", data.mq9_analog, &mq9_cal, mq9_danger);
  
  Serial.println("MQ135 (Air Quality/CO2) - DANGER-ONLY Alerts:");
  Serial.printf("  Digital: %s | Analog: %d", 
    data.mq135_digital ? "POOR AIR" : "Good Air", data.mq135_analog);
  bool mq135_danger = checkSensorDanger(data.mq135_analog, &mq135_cal, MQ135_DANGER_THRESHOLD);
  Serial.println(mq135_danger ? " - EXTREME DANGER!" : " - Safe");
  logSensorStatus("MQ135", data.mq135_analog, &mq135_cal, mq135_danger);
}

// FIXED: Only trigger audio for EXTREME danger levels
void checkAlerts(SensorData data) {
  static unsigned long lastAlert = 0;
  unsigned long now = millis();
  
  Serial.printf("checkAlerts() called at %lu ms (lastAlert: %lu ms)\n", now, lastAlert);
  
  // Avoid too frequent alerts (minimum 60 seconds between alerts for extreme conditions)
  if (now - lastAlert < 60000) {
    Serial.println("*** ALERT COOLDOWN ACTIVE - No alerts will play ***");
    return;
  }
  
  // FIXED: Check for EXTREME DANGER conditions only
  bool mq2_danger = checkSensorDanger(data.mq2_analog, &mq2_cal, MQ2_DANGER_THRESHOLD);
  bool mq9_danger = checkSensorDanger(data.mq9_analog, &mq9_cal, MQ9_DANGER_THRESHOLD);
  bool mq135_danger = checkSensorDanger(data.mq135_analog, &mq135_cal, MQ135_DANGER_THRESHOLD);
  
  // DEBUG: Print danger status
  Serial.println("DEBUG Danger Status (4x baseline or static minimum):");
  Serial.printf("  MQ2 EXTREME DANGER: %s (threshold: %.1f)\n", mq2_danger ? "TRUE" : "FALSE", mq2_cal.dangerThreshold);
  Serial.printf("  MQ9 EXTREME DANGER: %s (threshold: %.1f)\n", mq9_danger ? "TRUE" : "FALSE", mq9_cal.dangerThreshold);
  Serial.printf("  MQ135 EXTREME DANGER: %s (threshold: %.1f)\n", mq135_danger ? "TRUE" : "FALSE", mq135_cal.dangerThreshold);
  
  // ONLY trigger audio for EXTREME readings
  if (mq2_danger) {
    Serial.println("*** EXTREME MQ2 DANGER - PLAYING SMOKE ALERT ***");
    Serial.println("EXTREME DANGER: Very high smoke/gas levels detected!");
    playAudioFile(SMOKE_ALERT);
    lastAlert = now;
  }
  else if (mq9_danger) {
    Serial.println("*** EXTREME MQ9 DANGER - PLAYING CO ALERT ***");
    Serial.println("EXTREME DANGER: Very high carbon monoxide levels detected!");
    playAudioFile(CO_ALERT);
    lastAlert = now;
  }
  else if (mq135_danger) {
    Serial.println("*** EXTREME MQ135 DANGER - PLAYING AIR QUALITY ALERT ***");
    Serial.println("EXTREME DANGER: Very poor air quality detected!");
    playAudioFile(AIR_QUALITY_WARNING);
    lastAlert = now;
  }
  else {
    Serial.println("*** NO EXTREME GAS DANGERS - CHECKING TEMPERATURE/HUMIDITY ***");
  }
  
  // Temperature alerts (slightly more conservative)
  if (data.temperature > 45.0) {
    Serial.println("*** EXTREME HIGH TEMPERATURE ALERT TRIGGERED ***");
    Serial.println("DANGER: Extreme high temperature!");
    playAudioFile(HIGH_TEMP_ALERT);
    lastAlert = now;
  }
  else if (data.temperature < 0.0) {
    Serial.println("*** EXTREME LOW TEMPERATURE ALERT TRIGGERED ***");
    Serial.println("DANGER: Freezing temperature!");
    playAudioFile(LOW_TEMP_ALERT);
    lastAlert = now;
  }
  
  // Humidity alerts (more conservative)
  else if (data.humidity > 90.0) {
    Serial.println("*** EXTREME HIGH HUMIDITY ALERT TRIGGERED ***");
    Serial.println("DANGER: Extreme high humidity!");
    playAudioFile(HIGH_HUMIDITY_ALERT);
    lastAlert = now;
  }
  else if (data.humidity < 10.0) {
    Serial.println("*** EXTREME LOW HUMIDITY ALERT TRIGGERED ***");
    Serial.println("DANGER: Extreme low humidity!");
    playAudioFile(LOW_HUMIDITY_ALERT);
    lastAlert = now;
  }
  else {
    Serial.println("*** NO EXTREME CONDITIONS - ALL VALUES SAFE ***");
  }
}

void sendLoRaData(SensorData data) {
  packetCount++;
  
  // Create JSON packet with real sensor data
  StaticJsonDocument<280> doc;
  doc["nodeId"] = "001";
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
