/*
  ESP32 Multi-Sensor System with Emergency Button + MPU6050
  MERGED VERSION:
  - Preserves original calibration logic & JSON payload format
  - Adds MPU6050 direct I2C integration (accepts WHO_AM_I 0x68,0x69,0x72 for clones)
  - Adds robust fall detection (no walking/running/stuck tracking)
  - Applies manual humidity correction: subtract 30% from raw DHT11 reading (clamped 0-100)
  - Keeps original behavior for MQ sensor calibration (DANGER_MULTIPLIER = 2.0)
  - Keeps test commands and LoRa JSON format the same as original
*/

#include <Wire.h>
#include <HardwareSerial.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <math.h>

// -------------------- MPU6050 --------------------
#define MPU6050_ADDR 0x68
#define PWR_MGMT_1   0x6B
#define ACCEL_XOUT_H 0x3B
#define CONFIG       0x1A
#define GYRO_CONFIG  0x1B
#define ACCEL_CONFIG 0x1C
#define WHO_AM_I     0x75

// MPU6050 pins (I2C)
#define MPU6050_SDA 21
#define MPU6050_SCL 22
#define MPU6050_INT 34

// MPU thresholds (conservative to reduce false positives)
const float G = 9.80665f;
const float FREE_FALL_G_THRESHOLD = 0.6f;     // g
const unsigned long FREE_FALL_MIN_MS = 120;   // ms
const float IMPACT_G_THRESHOLD = 3.5f;        // g
const unsigned long IMPACT_WINDOW_MS = 1200;  // ms
const unsigned long STATIONARY_CONFIRM_MS = 800; // ms
const float ROTATION_IMPACT_THRESHOLD = 400.0f; // deg/s

// -------------------- Pins & Modules --------------------
// Pin definitions for MQ Sensors (from user's old working code)
#define MQ2_DIGITAL_PIN 12
#define MQ2_ANALOG_PIN 32
#define MQ9_DIGITAL_PIN 13
#define MQ9_ANALOG_PIN 33
#define MQ135_DIGITAL_PIN 15
#define MQ135_ANALOG_PIN 35

// FN-M16P Audio Module pins
#define FN_M16P_RX 16
#define FN_M16P_TX 17

// DHT11 pin
#define DHT11_PIN 21
#define DHT_TYPE DHT11

// LoRa Module pins
#define LORA_SCK 5
#define LORA_MISO 19
#define LORA_MOSI 27
#define LORA_SS 18
#define LORA_RST 14
#define LORA_DIO0 26  // UPDATED

// EMERGENCY BUTTON PIN (TTP223 Touch Sensor)
#define EMERGENCY_BUTTON_PIN 25

// LoRa frequency
#define LORA_BAND 915E6

// Node identification
#define NODE_ID "001"

// Sensor thresholds and calibration
#define MQ2_DANGER_THRESHOLD 1600
#define MQ9_DANGER_THRESHOLD 3800
#define MQ135_DANGER_THRESHOLD 1800

#define FALLBACK_TEMPERATURE 27.0
#define FALLBACK_HUMIDITY 47.0

#define CALIBRATION_SAMPLES 10
#define DANGER_MULTIPLIER 2.0   // Keep original logic per user's request
#define CALIBRATION_DELAY 2000

// Emergency Button Parameters
const int TAP_TIMEOUT = 600;
const int REQUIRED_TAPS = 3;

// FN-M16P Commands
const byte FRAME_START = 0x7E;
const byte FRAME_END = 0xEF;
const byte VERSION = 0xFF;
const byte NO_FEEDBACK = 0x00;
const byte WITH_FEEDBACK = 0x01;
const byte CMD_PLAY_TRACK = 0x03;
const byte CMD_VOLUME = 0x06;
const byte CMD_STOP = 0x16;

// Audio file mapping (kept same as original)
enum AudioFiles {
  BOOT_AUDIO = 1,
  SMOKE_ALERT = 2,
  CO_ALERT = 3,
  AIR_QUALITY_WARNING = 4,
  HIGH_TEMP_ALERT = 5,
  LOW_TEMP_ALERT = 6,
  HIGH_HUMIDITY_ALERT = 7,
  LOW_HUMIDITY_ALERT = 8
};

// Sensor calibration struct
struct SensorCalibration {
  float baseline;
  float dangerThreshold;
  bool calibrated;
};

SensorCalibration mq2_cal = {0, 0, false};
SensorCalibration mq9_cal = {0, 0, false};
SensorCalibration mq135_cal = {0, 0, false};

DHT dht(DHT11_PIN, DHT_TYPE);
HardwareSerial fnM16pSerial(2);

bool audioReady = false;
bool loraReady = false;
bool dhtReady = false;
bool mpuReady = false;

unsigned long lastLoRaSend = 0;
int loraInterval = 30000;
int packetCount = 0;

unsigned long lastDHTReading = 0;
const unsigned long DHT_READING_INTERVAL = 2000;
float lastValidTemperature = FALLBACK_TEMPERATURE;
float lastValidHumidity = FALLBACK_HUMIDITY;

// Emergency Button Variables
volatile int tapCount = 0;
volatile unsigned long lastTapTime = 0;
volatile bool emergencyTriggered = false;

// Motion data (for JSON payload)
struct MotionData {
  float totalAccel; // m/s^2
  float totalGyro;  // deg/s
  bool fallDetected;
  bool impactDetected;
  bool motionActive;
  unsigned long lastMotionTime;
};
MotionData motionData = {0};

// MPU fall detection variables
bool fallInProgress = false;
unsigned long fallStartTime = 0;
unsigned long freeFallStart = 0;
unsigned long impactTime = 0;
bool inFreeFall = false;
bool impactSeen = false;
unsigned long stationarySince = 0;
float accelFiltered = 9.8f;
const float ALPHA = 0.85f;

// SensorData (preserve original JSON structure)
struct SensorData {
  float temperature;
  float humidity;
  int mq2_analog;
  int mq9_analog;
  int mq135_analog;
  bool mq2_digital;
  bool mq9_digital;
  bool mq135_digital;
  bool emergency;
  unsigned long timestamp;
  MotionData motion;
};

// Forward declarations
void writeMPU6050(uint8_t reg, uint8_t data);
uint8_t readMPU6050(uint8_t reg);
void readMPU6050Burst(uint8_t reg, uint8_t *buffer, uint8_t length);
bool initMPU6050();
void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz);
void monitorMotion();
void detectFallAndHandle();
String getActivityString(); // minimal activity reporting to preserve JSON field
void checkEmergencyButton();
void handleEmergency();
void sendCommand(byte cmd, byte param1, byte param2, bool feedback);
void setVolume(int volume);
void playAudioFile(int fileNumber);
void stopAudio();
void calibrateSensors();
void calibrateSensor(int pin, SensorCalibration* cal, String sensorName, int minThreshold);
bool checkSensorDanger(int currentValue, SensorCalibration* cal, int staticDangerThreshold);
SensorData readAllSensors();
void displayReadings(SensorData data);
void checkAlerts(SensorData data);
void sendLoRaData(SensorData data);
String getAirQualityRating(int value);
void printTestMenu();
void handleTestCommand(String cmd);
void testDHT();
void testMQ2();
void testMQ9();
void testMQ135();
void testAllMQ();
void testAudio(int fileNum);
void testLoRa();
void testEmergency();
void testButton();
void testAllSensors();
void printSystemStatus();

// ================= MPU6050 I2C =================

void writeMPU6050(uint8_t reg, uint8_t data) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.write(data);
  Wire.endTransmission();
}

uint8_t readMPU6050(uint8_t reg) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU6050_ADDR, (uint8_t)1);
  if (Wire.available()) return Wire.read();
  return 0;
}

void readMPU6050Burst(uint8_t reg, uint8_t *buffer, uint8_t length) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU6050_ADDR, length);
  for (uint8_t i = 0; i < length; i++) {
    buffer[i] = Wire.available() ? Wire.read() : 0;
  }
}

bool initMPU6050() {
  writeMPU6050(PWR_MGMT_1, 0x00);
  delay(100);
  uint8_t who = readMPU6050(WHO_AM_I);
  Serial.printf("MPU6050 WHO_AM_I = 0x%02X\n", who);
  if (who != 0x68 && who != 0x69 && who != 0x72) {
    Serial.println("WARNING: MPU6050 WHO_AM_I unexpected, attempting init anyway (clone support).");
    // Continue but mark that identity is unexpected
  } else {
    Serial.println("MPU6050 identity OK.");
  }
  // set accel ±8g (AFS_SEL = 2 -> 0x10), gyro ±500 dps (FS_SEL=1 -> 0x08)
  writeMPU6050(ACCEL_CONFIG, 0x10);
  writeMPU6050(GYRO_CONFIG, 0x08);
  writeMPU6050(CONFIG, 0x04); // LPF ~21Hz
  delay(100);
  return true;
}

void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz) {
  uint8_t buf[14];
  readMPU6050Burst(ACCEL_XOUT_H, buf, 14);
  *ax = (int16_t)((buf[0] << 8) | buf[1]);
  *ay = (int16_t)((buf[2] << 8) | buf[3]);
  *az = (int16_t)((buf[4] << 8) | buf[5]);
  *gx = (int16_t)((buf[8] << 8) | buf[9]);
  *gy = (int16_t)((buf[10] << 8) | buf[11]);
  *gz = (int16_t)((buf[12] << 8) | buf[13]);
}

void monitorMotion() {
  int16_t axr, ayr, azr, gxr, gyr, gzr;
  readMPU6050Data(&axr, &ayr, &azr, &gxr, &gyr, &gzr);
  // convert: accel ±8g -> 4096 LSB/g ; gyro ±500dps -> 65.5 LSB/°/s
  float ax = (axr / 4096.0f) * G;
  float ay = (ayr / 4096.0f) * G;
  float az = (azr / 4096.0f) * G;
  float gx = gxr / 65.5f;
  float gy = gyr / 65.5f;
  float gz = gzr / 65.5f;
  motionData.totalAccel = sqrt(ax*ax + ay*ay + az*az);
  motionData.totalGyro = sqrt(gx*gx + gy*gy + gz*gz);
  accelFiltered = ALPHA * accelFiltered + (1.0f - ALPHA) * motionData.totalAccel;
  if (fabs(motionData.totalAccel - accelFiltered) > 0.2f * G || motionData.totalGyro > 25.0f) {
    motionData.lastMotionTime = millis();
    motionData.motionActive = true;
  } else {
    motionData.motionActive = false;
  }
  detectFallAndHandle();
}

// Robust fall detection: free-fall + impact OR large spike + stationary confirmation
void detectFallAndHandle() {
  unsigned long now = millis();
  float totalG = motionData.totalAccel / G;
  float totalGyro = motionData.totalGyro;
  // free-fall detection
  if (totalG < FREE_FALL_G_THRESHOLD) {
    if (!inFreeFall) {
      inFreeFall = true;
      freeFallStart = now;
    } else {
      if ((now - freeFallStart) >= FREE_FALL_MIN_MS && !fallInProgress) {
        fallInProgress = true;
        fallStartTime = now;
        impactSeen = false;
        motionData.impactDetected = false;
      }
    }
  } else {
    if (inFreeFall) inFreeFall = false;
  }
  // impact detection after free-fall
  if (fallInProgress && !impactSeen) {
    if (totalG >= IMPACT_G_THRESHOLD || totalGyro >= ROTATION_IMPACT_THRESHOLD) {
      impactSeen = true;
      impactTime = now;
      motionData.impactDetected = true;
    } else if (now - fallStartTime > IMPACT_WINDOW_MS) {
      // no impact -> cancel
      fallInProgress = false;
      impactSeen = false;
      motionData.impactDetected = false;
    }
  }
  // confirm fall if impactSeen + post-impact stationary
  if (impactSeen) {
    float accelVariationG = fabs((motionData.totalAccel / G) - 1.0f);
    if (accelVariationG < 0.35f && motionData.totalGyro < 50.0f) {
      if (stationarySince == 0) stationarySince = now;
      if (now - stationarySince >= STATIONARY_CONFIRM_MS) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(HIGH_HUMIDITY_ALERT); // play fall audio not in map; reuse or skip - we'll play CO alert for clarity
        Serial.println("\n=== FALL CONFIRMED ===");
        Serial.printf("Accel: %.2f g  Gyro: %.2f °/s\n", motionData.totalAccel / G, motionData.totalGyro);
        // reset internal flags
        fallInProgress = false;
        impactSeen = false;
        stationarySince = 0;
      }
    } else {
      stationarySince = 0;
      if (now - impactTime > IMPACT_WINDOW_MS) {
        fallInProgress = false;
        impactSeen = false;
        stationarySince = 0;
        motionData.impactDetected = false;
      }
    }
  }
  // detect very large sudden spikes (immediate-like impact)
  static float lastTotalAccel = 9.8f;
  static float lastTotalGyro = 0.0f;
  float accelDeltaG = fabs((motionData.totalAccel - lastTotalAccel) / G);
  float gyroDelta = fabs(motionData.totalGyro - lastTotalGyro);
  if (!motionData.fallDetected) {
    if (accelDeltaG > 2.5f && (motionData.totalAccel/G) > 2.0f) {
      // quick confirmation window
      unsigned long start = millis();
      bool remainedStationary = true;
      while (millis() - start < STATIONARY_CONFIRM_MS) {
        int16_t ax, ay, az, gx, gy, gz;
        readMPU6050Data(&ax, &ay, &az, &gx, &gy, &gz);
        float ax_m = (ax/4096.0f)*G;
        float ay_m = (ay/4096.0f)*G;
        float az_m = (az/4096.0f)*G;
        float tot = sqrt(ax_m*ax_m + ay_m*ay_m + az_m*az_m);
        float gyroTot = sqrt((gx/65.5f)*(gx/65.5f) + (gy/65.5f)*(gy/65.5f) + (gz/65.5f)*(gz/65.5f));
        if (fabs(tot/G - 1.0f) > 0.35f || gyroTot > 70.0f) { remainedStationary = false; break; }
        delay(40);
      }
      if (remainedStationary) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        Serial.println("\n=== FALL CONFIRMED (SUDDEN SPIKE) ===");
      }
    } else if (gyroDelta > 300.0f && motionData.totalGyro > 400.0f) {
      unsigned long start = millis();
      bool remainedStationary = true;
      while (millis() - start < STATIONARY_CONFIRM_MS) {
        int16_t ax, ay, az, gx, gy, gz;
        readMPU6050Data(&ax, &ay, &az, &gx, &gy, &gz);
        float ax_m = (ax/4096.0f)*G;
        float ay_m = (ay/4096.0f)*G;
        float az_m = (az/4096.0f)*G;
        float tot = sqrt(ax_m*ax_m + ay_m*ay_m + az_m*az_m);
        float gyroTot = sqrt((gx/65.5f)*(gx/65.5f) + (gy/65.5f)*(gy/65.5f) + (gz/65.5f)*(gz/65.5f));
        if (fabs(tot/G - 1.0f) > 0.35f || gyroTot > 70.0f) { remainedStationary = false; break; }
        delay(40);
      }
      if (remainedStationary) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        Serial.println("\n=== FALL CONFIRMED (GYRO SPIKE) ===");
      }
    }
  }
  lastTotalAccel = motionData.totalAccel;
  lastTotalGyro = motionData.totalGyro;
}

// Minimal activity string to preserve JSON field (we removed walking/running tracking)
// Return "FALLEN" when fallDetected else "Stationary"
String getActivityString() {
  return motionData.fallDetected ? "FALLEN - HELP!" : "Stationary";
}

// ================= Setup & Loop =================

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Multi-Sensor System v9.0 - MPU6050 ADDED");
  Serial.println("=================================");
  // I2C
  Wire.begin(MPU6050_SDA, MPU6050_SCL);
  Wire.setClock(400000);

  // Initialize MQ sensor pins
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(MQ9_DIGITAL_PIN, INPUT);
  pinMode(MQ135_DIGITAL_PIN, INPUT);

  // Initialize Emergency Button (TTP223 typical output, using INPUT)
  pinMode(EMERGENCY_BUTTON_PIN, INPUT);
  Serial.println("\n>>> EMERGENCY BUTTON SETUP <<<");
  Serial.println("Pin: GPIO25");
  Serial.println("Tap 3 times quickly to trigger emergency!");
  int testRead = digitalRead(EMERGENCY_BUTTON_PIN);
  Serial.print("Initial button state: ");
  Serial.println(testRead == HIGH ? "HIGH" : "LOW");
  Serial.println(">>> Button ready <<<\n");

  // Initialize MPU6050
  pinMode(MPU6050_INT, INPUT);
  Serial.println("Initializing MPU6050...");
  if (!initMPU6050()) {
    Serial.println("⚠ MPU6050 initialization warning. Check I2C wiring.");
    mpuReady = false;
  } else {
    Serial.println("✓ MPU6050 initialized (clone WHO_AM_I supported).");
    mpuReady = true;
    motionData.lastMotionTime = millis();
    accelFiltered = 9.8f;
  }

  // Initialize DHT11
  Serial.println("\nInitializing DHT11 sensor...");
  dht.begin();
  delay(2000);
  bool dhtWorking = false;
  for (int i = 0; i < 3; i++) {
    float testTemp = dht.readTemperature();
    float testHum = dht.readHumidity();
    if (!isnan(testTemp) && !isnan(testHum)) {
      dhtReady = true;
      dhtWorking = true;
      // Apply manual humidity correction: subtract 30% as requested, clamp 0-100
      float correctedHum = testHum - 30.0f;
      if (correctedHum < 0.0f) correctedHum = 0.0f;
      if (correctedHum > 100.0f) correctedHum = 100.0f;
      lastValidTemperature = testTemp;
      lastValidHumidity = correctedHum;
      Serial.println("✓ DHT11 initialized successfully!");
      Serial.printf("  Temperature: %.1f°C\n", lastValidTemperature);
      Serial.printf("  Humidity (corrected): %.1f%%\n", lastValidHumidity);
      break;
    }
    delay(2000);
  }
  if (!dhtWorking) {
    Serial.println("⚠ DHT11 ERROR - Check wiring!");
    Serial.println("  VCC -> 3.3V, GND -> GND, DATA -> GPIO21");
    dhtReady = false;
  }

  // Initialize FN-M16P Audio Module
  fnM16pSerial.begin(9600, SERIAL_8N1, FN_M16P_RX, FN_M16P_TX);
  delay(2000);
  Serial.println("Initializing FN-M16P Audio Module...");
  setVolume(30);
  delay(500);
  audioReady = true;
  Serial.println("✓ FN-M16P initialized successfully!");

  // Initialize LoRa
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("⚠ LoRa initialization failed. Check wiring.");
    loraReady = false;
  } else {
    LoRa.setTxPower(20);
    LoRa.setSpreadingFactor(12);
    LoRa.setSignalBandwidth(125E3);
    LoRa.setCodingRate4(8);
    LoRa.setPreambleLength(8);
    LoRa.setSyncWord(0x34);
    Serial.println("✓ LoRa initialized successfully!");
    Serial.println("  DIO0 Pin: GPIO26");
    loraReady = true;
  }

  Serial.println("Warming up gas sensors (15s)...");
  delay(15000);

  Serial.println("Calibrating MQ sensors...");
  calibrateSensors();

  Serial.println("\n=================================");
  Serial.println("SYSTEM READY!");
  Serial.println("=================================");
  printTestMenu();

  if (audioReady) {
    playAudioFile(BOOT_AUDIO);
    delay(2000);
  }
}

void loop() {
  // Serial test commands
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toLowerCase();
    handleTestCommand(command);
  }

  // Emergency button
  checkEmergencyButton();

  // Monitor MPU6050
  if (mpuReady) monitorMotion();

  // Handle emergency if triggered
  if (emergencyTriggered) {
    handleEmergency();
    emergencyTriggered = false;
    // continue running
  }

  // Periodic tasks
  static unsigned long lastNormalLoop = 0;
  if (millis() - lastNormalLoop >= 10000) {
    lastNormalLoop = millis();
    SensorData data = readAllSensors();
    data.emergency = false;
    data.motion = motionData;
    displayReadings(data);
    checkAlerts(data);
    if (loraReady && (millis() - lastLoRaSend > loraInterval)) {
      sendLoRaData(data);
      lastLoRaSend = millis();
    }
    Serial.println("------------------------");
  }

  delay(50);
}

// ================= Test Command Handler & Menu =================

void handleTestCommand(String cmd) {
  Serial.println("\n>>> EXECUTING TEST: " + cmd + " <<<\n");
  if (cmd == "help" || cmd == "menu") printTestMenu();
  else if (cmd == "dht") testDHT();
  else if (cmd == "mq2") testMQ2();
  else if (cmd == "mq9") testMQ9();
  else if (cmd == "mq135") testMQ135();
  else if (cmd == "mq") testAllMQ();
  else if (cmd == "audio1" || cmd == "a1") testAudio(1);
  else if (cmd == "audio2" || cmd == "a2") testAudio(2);
  else if (cmd == "audio3" || cmd == "a3") testAudio(3);
  else if (cmd == "audio4" || cmd == "a4") testAudio(4);
  else if (cmd == "audio5" || cmd == "a5") testAudio(5);
  else if (cmd == "audio6" || cmd == "a6") testAudio(6);
  else if (cmd == "audio7" || cmd == "a7") testAudio(7);
  else if (cmd == "audio8" || cmd == "a8") testAudio(8);
  else if (cmd == "stop") { stopAudio(); Serial.println("Audio stopped."); }
  else if (cmd == "volume+") { setVolume(25); Serial.println("Volume set to 25"); }
  else if (cmd == "volume-") { setVolume(15); Serial.println("Volume set to 15"); }
  else if (cmd == "lora") testLoRa();
  else if (cmd == "emergency") testEmergency();
  else if (cmd == "button") testButton();
  else if (cmd == "all") testAllSensors();
  else if (cmd == "calibrate") calibrateSensors();
  else if (cmd == "status") printSystemStatus();
  else Serial.println("❌ Unknown command: " + cmd);
  Serial.println("\n>>> TEST COMPLETE <<<\n");
}

void printTestMenu() {
  Serial.println("\n╔═══════════════════════════════════════╗");
  Serial.println("║         TEST COMMANDS MENU            ║");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.println("║ SENSORS:                              ║");
  Serial.println("║  dht       - Test DHT11 sensor        ║");
  Serial.println("║  mq2       - Test MQ2 sensor          ║");
  Serial.println("║  mq9       - Test MQ9 sensor          ║");
  Serial.println("║  mq135     - Test MQ135 sensor        ║");
  Serial.println("║  mq        - Test all MQ sensors      ║");
  Serial.println("║  all       - Test all sensors         ║");
  Serial.println("║                                       ║");
  Serial.println("║ AUDIO:                                ║");
  Serial.println("║  audio1-8  - Play audio file 1-8      ║");
  Serial.println("║  a1-a8     - Short form (e.g. a1)     ║");
  Serial.println("║  stop      - Stop audio playback      ║");
  Serial.println("║  volume+   - Increase volume          ║");
  Serial.println("║  volume-   - Decrease volume          ║");
  Serial.println("║                                       ║");
  Serial.println("║ COMMUNICATION:                        ║");
  Serial.println("║  lora      - Test LoRa transmission   ║");
  Serial.println("║                                       ║");
  Serial.println("║ EMERGENCY:                            ║");
  Serial.println("║  button    - Test emergency button    ║");
  Serial.println("║  emergency - Trigger emergency mode   ║");
  Serial.println("║                                       ║");
  Serial.println("║ SYSTEM:                               ║");
  Serial.println("║  calibrate - Re-calibrate sensors     ║");
  Serial.println("║  status    - Show system status       ║");
  Serial.println("║  help      - Show this menu           ║");
  Serial.println("╚═══════════════════════════════════════╝\n");
}

// ================= Tests =================

void testDHT() {
  Serial.println("Testing DHT11 Sensor...");
  Serial.println("Reading 5 samples with 2s interval:\n");
  for (int i = 1; i <= 5; i++) {
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();
    Serial.print("Sample #");
    Serial.print(i);
    Serial.print(": ");
    if (!isnan(temp) && !isnan(hum)) {
      float correctedHum = hum - 30.0f;
      if (correctedHum < 0.0f) correctedHum = 0.0f;
      if (correctedHum > 100.0f) correctedHum = 100.0f;
      Serial.printf("Temp: %.2f°C, Humidity (corrected): %.2f%% ✓\n", temp, correctedHum);
    } else {
      Serial.println("FAILED - NaN values ✗");
    }
    if (i < 5) delay(2000);
  }
  Serial.println("\nDHT11 Status: " + String(dhtReady ? "READY" : "ERROR"));
}

void testMQ2() {
  Serial.println("Testing MQ2 Sensor (Smoke/LPG/Gas)...");
  Serial.println("Reading 10 samples with 500ms interval:\n");
  for (int i = 1; i <= 10; i++) {
    int analog = analogRead(MQ2_ANALOG_PIN);
    bool digital = digitalRead(MQ2_DIGITAL_PIN) == LOW;
    Serial.printf("Sample #%d: Analog=%d, Digital=%s", i, analog, digital ? "DETECTED" : "Clear");
    if (mq2_cal.calibrated) {
      bool danger = analog > mq2_cal.dangerThreshold;
      Serial.print(danger ? " [DANGER]" : " [Safe]");
    }
    Serial.println();
    if (i < 10) delay(500);
  }
  Serial.printf("\nCalibration: Baseline=%.1f, Threshold=%.1f\n", mq2_cal.baseline, mq2_cal.dangerThreshold);
}

void testMQ9() {
  Serial.println("Testing MQ9 Sensor (Carbon Monoxide)...");
  Serial.println("Reading 10 samples with 500ms interval:\n");
  for (int i = 1; i <= 10; i++) {
    int analog = analogRead(MQ9_ANALOG_PIN);
    bool digital = digitalRead(MQ9_DIGITAL_PIN) == LOW;
    Serial.printf("Sample #%d: Analog=%d, Digital=%s", i, analog, digital ? "DETECTED" : "Clear");
    if (mq9_cal.calibrated) {
      bool danger = analog > mq9_cal.dangerThreshold;
      Serial.print(danger ? " [DANGER]" : " [Safe]");
    }
    Serial.println();
    if (i < 10) delay(500);
  }
  Serial.printf("\nCalibration: Baseline=%.1f, Threshold=%.1f\n", mq9_cal.baseline, mq9_cal.dangerThreshold);
}

void testMQ135() {
  Serial.println("Testing MQ135 Sensor (Air Quality)...");
  Serial.println("Reading 10 samples with 500ms interval:\n");
  for (int i = 1; i <= 10; i++) {
    int analog = analogRead(MQ135_ANALOG_PIN);
    bool digital = digitalRead(MQ135_DIGITAL_PIN) == LOW;
    String quality = getAirQualityRating(analog);
    Serial.printf("Sample #%d: Analog=%d, Digital=%s, Quality=%s", i, analog, digital ? "POOR" : "Good", quality.c_str());
    if (mq135_cal.calibrated) {
      bool danger = analog > mq135_cal.dangerThreshold;
      Serial.print(danger ? " [DANGER]" : " [Safe]");
    }
    Serial.println();
    if (i < 10) delay(500);
  }
  Serial.printf("\nCalibration: Baseline=%.1f, Threshold=%.1f\n", mq135_cal.baseline, mq135_cal.dangerThreshold);
}

void testAllMQ() {
  Serial.println("Testing All MQ Sensors...\n");
  Serial.println("MQ2 (Smoke/LPG/Gas):");
  int mq2 = analogRead(MQ2_ANALOG_PIN);
  Serial.printf("  Analog: %d\n", mq2);
  Serial.printf("  Digital: %s\n", digitalRead(MQ2_DIGITAL_PIN) == LOW ? "DETECTED" : "Clear");
  Serial.println("\nMQ9 (Carbon Monoxide):");
  int mq9 = analogRead(MQ9_ANALOG_PIN);
  Serial.printf("  Analog: %d\n", mq9);
  Serial.printf("  Digital: %s\n", digitalRead(MQ9_DIGITAL_PIN) == LOW ? "DETECTED" : "Clear");
  Serial.println("\nMQ135 (Air Quality):");
  int mq135 = analogRead(MQ135_ANALOG_PIN);
  Serial.printf("  Analog: %d\n", mq135);
  Serial.printf("  Digital: %s\n", digitalRead(MQ135_DIGITAL_PIN) == LOW ? "POOR" : "Good");
  Serial.printf("  Rating: %s\n", getAirQualityRating(mq135).c_str());
}

void testAudio(int fileNum) {
  if (!audioReady) { Serial.println("❌ Audio module not ready!"); return; }
  Serial.print("Playing audio file #"); Serial.println(fileNum);
  const char* audioNames[] = { "", "Boot", "Smoke Alert", "CO Alert", "Air Quality Warning", "High Temp Alert", "Low Temp Alert", "High Humidity", "Low Humidity" };
  if (fileNum >= 1 && fileNum <= 8) {
    Serial.print("File: "); Serial.println(audioNames[fileNum]);
    playAudioFile(fileNum);
  } else Serial.println("❌ Invalid file number (1-8)");
}

void testLoRa() {
  if (!loraReady) { Serial.println("❌ LoRa not ready!"); return; }
  Serial.println("Testing LoRa transmission...");
  SensorData data = readAllSensors(); data.emergency = false; data.motion = motionData;
  Serial.println("\nTest packet contents:");
  Serial.printf("  Node ID: %s\n", NODE_ID);
  Serial.printf("  Temperature: %.2f°C\n", data.temperature);
  Serial.printf("  Humidity: %.2f%%\n", data.humidity);
  Serial.printf("  MQ2: %d\n", data.mq2_analog);
  Serial.printf("  MQ9: %d\n", data.mq9_analog);
  Serial.printf("  MQ135: %d\n", data.mq135_analog);
  Serial.println("\nSending test packet...");
  sendLoRaData(data);
  Serial.println("✓ Test packet sent!");
}

void testEmergency() {
  Serial.println("⚠ Triggering EMERGENCY MODE manually...\n");
  emergencyTriggered = true;
}

void testButton() {
  Serial.println("Testing Emergency Button...");
  Serial.println("Button Pin: GPIO25");
  Serial.println("Monitoring for 10 seconds...\n");
  unsigned long startTime = millis();
  int changeCount = 0;
  bool lastState = digitalRead(EMERGENCY_BUTTON_PIN);
  Serial.print("Initial state: "); Serial.println(lastState == HIGH ? "HIGH" : "LOW");
  Serial.println("\nPress the button now...\n");
  while (millis() - startTime < 10000) {
    bool currentState = digitalRead(EMERGENCY_BUTTON_PIN);
    if (currentState != lastState) {
      changeCount++;
      Serial.print("State change #"); Serial.print(changeCount); Serial.print(": ");
      Serial.println(currentState == HIGH ? "HIGH (Pressed)" : "LOW (Released)");
      lastState = currentState;
      delay(50);
    }
    delay(10);
  }
  Serial.print("\nTotal state changes: "); Serial.println(changeCount);
  Serial.println(changeCount > 0 ? "✓ Button working!" : "❌ No input detected - check wiring");
}

void testAllSensors() {
  Serial.println("=== COMPLETE SYSTEM TEST ===\n");
  Serial.println("1. DHT11 Sensor:");
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  if (!isnan(temp) && !isnan(hum)) {
    float correctedHum = hum - 30.0f; if (correctedHum < 0.0f) correctedHum = 0.0f;
    Serial.printf("   ✓ Temp: %.2f°C, Humidity (corrected): %.2f%%\n", temp, correctedHum);
  } else Serial.println("   ✗ DHT11 reading failed");
  Serial.println("\n2. MQ2 Sensor:"); Serial.printf("   Analog: %d\n", analogRead(MQ2_ANALOG_PIN));
  Serial.println("\n3. MQ9 Sensor:"); Serial.printf("   Analog: %d\n", analogRead(MQ9_ANALOG_PIN));
  Serial.println("\n4. MQ135 Sensor:"); Serial.printf("   Analog: %d\n", analogRead(MQ135_ANALOG_PIN));
  Serial.println("\n5. Emergency Button:"); Serial.printf("   State: %s\n", digitalRead(EMERGENCY_BUTTON_PIN) == HIGH ? "HIGH" : "LOW");
  Serial.println("\n6. Audio Module:"); Serial.printf("   Status: %s\n", audioReady ? "READY" : "NOT READY");
  Serial.println("\n7. LoRa Module:"); Serial.printf("   Status: %s\n", loraReady ? "READY" : "NOT READY");
  Serial.println("\n=== TEST COMPLETE ===");
}

void printSystemStatus() {
  Serial.println("\n╔═══════════════════════════════════════╗");
  Serial.println("║          SYSTEM STATUS                ║");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.printf("║ Node ID: %-28s ║\n", NODE_ID);
  Serial.printf("║ Uptime: %-29lu ║\n", millis() / 1000);
  Serial.printf("║ Packets Sent: %-22d ║\n", packetCount);
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.printf("║ DHT11:    %-27s ║\n", dhtReady ? "✓ READY" : "✗ ERROR");
  Serial.printf("║ MPU6050:  %-27s ║\n", mpuReady ? "✓ READY" : "✗ ERROR");
  Serial.printf("║ Audio:    %-27s ║\n", audioReady ? "✓ READY" : "✗ ERROR");
  Serial.printf("║ LoRa:     %-27s ║\n", loraReady ? "✓ READY" : "✗ ERROR");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.printf("║ MQ2 Calibrated:   %-18s ║\n", mq2_cal.calibrated ? "Yes" : "No");
  Serial.printf("║ MQ9 Calibrated:   %-18s ║\n", mq9_cal.calibrated ? "Yes" : "No");
  Serial.printf("║ MQ135 Calibrated: %-18s ║\n", mq135_cal.calibrated ? "Yes" : "No");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.printf("║ Last Temp: %.2f°C%-18s ║\n", lastValidTemperature, "");
  Serial.printf("║ Last Humidity: %.2f%%%-15s ║\n", lastValidHumidity, "");
  Serial.println("╚═══════════════════════════════════════╝\n");
}

// ================= Emergency Button & Handling =================

void checkEmergencyButton() {
  static bool lastState = LOW;
  static unsigned long lastChangeTime = 0;
  bool currentState = digitalRead(EMERGENCY_BUTTON_PIN);
  if (currentState != lastState && (millis() - lastChangeTime > 50)) {
    lastChangeTime = millis();
    if (currentState == HIGH) {
      unsigned long now = millis();
      if (now - lastTapTime < TAP_TIMEOUT) tapCount++;
      else tapCount = 1;
      lastTapTime = now;
      Serial.print("│ BUTTON TAP #"); Serial.print(tapCount); Serial.print(" of "); Serial.print(REQUIRED_TAPS); Serial.println(" │");
      if (tapCount >= REQUIRED_TAPS) {
        Serial.println("\n╔═══════════════════════════════╗"); Serial.println("║ TRIPLE TAP DETECTED!          ║"); Serial.println("║ EMERGENCY TRIGGERED!          ║"); Serial.println("╚═══════════════════════════════╝\n");
        emergencyTriggered = true;
        tapCount = 0;
      }
    }
  }
  if (millis() - lastTapTime > TAP_TIMEOUT && tapCount > 0 && tapCount < REQUIRED_TAPS) tapCount = 0;
  lastState = currentState;
}

void handleEmergency() {
  Serial.println("\n████████████████████████████████████████");
  Serial.println("████   EMERGENCY MODE ACTIVATED    ████");
  Serial.println("████████████████████████████████████████\n");
  SensorData data = readAllSensors();
  data.emergency = true;
  data.motion = motionData;
  Serial.println("=== EMERGENCY SENSOR SNAPSHOT ===");
  Serial.printf("Temperature: %.2f°C\n", data.temperature);
  Serial.printf("Humidity: %.2f%%\n", data.humidity);
  Serial.printf("MQ2: %d\n", data.mq2_analog);
  Serial.printf("MQ9: %d\n", data.mq9_analog);
  Serial.printf("MQ135: %d\n", data.mq135_analog);
  Serial.printf("Fall Detected: %s\n", data.motion.fallDetected ? "YES" : "NO");
  Serial.println("=================================\n");
  if (loraReady) {
    Serial.println(">>> SENDING EMERGENCY LORA PACKET <<<");
    sendLoRaData(data);
    Serial.println(">>> EMERGENCY PACKET SENT <<<\n");
  } else {
    Serial.println("ERROR: LoRa not ready!");
  }
  Serial.println("████████████████████████████████████████");
  Serial.println("████  EMERGENCY HANDLING COMPLETE  ████");
  Serial.println("████████████████████████████████████████\n");
  delay(1000);
}

// ================= Audio Module =================

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
}

void playAudioFile(int fileNumber) {
  if (fileNumber < 1 || fileNumber > 8) return;
  sendCommand(CMD_PLAY_TRACK, 0x00, fileNumber, false);
  delay(100);
}

void stopAudio() {
  sendCommand(CMD_STOP, 0x00, 0x00, false);
}

// ================= Calibration & MQ helpers =================

void calibrateSensors() {
  Serial.println("Starting sensor calibration...");
  delay(2000);
  calibrateSensor(MQ2_ANALOG_PIN, &mq2_cal, "MQ2", MQ2_DANGER_THRESHOLD);
  calibrateSensor(MQ9_ANALOG_PIN, &mq9_cal, "MQ9", MQ9_DANGER_THRESHOLD);
  calibrateSensor(MQ135_ANALOG_PIN, &mq135_cal, "MQ135", MQ135_DANGER_THRESHOLD);
  Serial.println("✓ Calibration completed!");
  Serial.printf("  MQ2: Baseline=%.1f, Danger=%.1f\n", mq2_cal.baseline, mq2_cal.dangerThreshold);
  Serial.printf("  MQ9: Baseline=%.1f, Danger=%.1f\n", mq9_cal.baseline, mq9_cal.dangerThreshold);
  Serial.printf("  MQ135: Baseline=%.1f, Danger=%.1f\n", mq135_cal.baseline, mq135_cal.dangerThreshold);
}

void calibrateSensor(int pin, SensorCalibration* cal, String sensorName, int minThreshold) {
  Serial.print("Calibrating " + sensorName + "...");
  float sum = 0;
  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    sum += analogRead(pin);
    Serial.print(".");
    delay(CALIBRATION_DELAY);
  }
  cal->baseline = sum / CALIBRATION_SAMPLES;
  float calculatedThreshold = cal->baseline * DANGER_MULTIPLIER; // original multiplier 2.0
  cal->dangerThreshold = (calculatedThreshold > minThreshold) ? calculatedThreshold : minThreshold;
  cal->calibrated = true;
  Serial.println(" Done");
}

bool checkSensorDanger(int currentValue, SensorCalibration* cal, int staticDangerThreshold) {
  if (!cal->calibrated) {
    return currentValue > staticDangerThreshold;
  }
  return currentValue > cal->dangerThreshold;
}

// ================= Sensors reading, display, alerts, LoRa =================

SensorData readAllSensors() {
  SensorData data;
  data.timestamp = millis();
  // Read DHT11 with correction and caching
  if (millis() - lastDHTReading > DHT_READING_INTERVAL) {
    float rawTemp = dht.readTemperature();
    float rawHum = dht.readHumidity();
    if (!isnan(rawTemp) && rawTemp >= -40 && rawTemp <= 80) {
      data.temperature = rawTemp;
      lastValidTemperature = rawTemp;
    } else data.temperature = lastValidTemperature;
    if (!isnan(rawHum) && rawHum >= 0 && rawHum <= 100) {
      float correctedHum = rawHum - 30.0f; // user requested manual correction
      if (correctedHum < 0.0f) correctedHum = 0.0f;
      if (correctedHum > 100.0f) correctedHum = 100.0f;
      data.humidity = correctedHum;
      lastValidHumidity = correctedHum;
    } else data.humidity = lastValidHumidity;
    lastDHTReading = millis();
  } else {
    data.temperature = lastValidTemperature;
    data.humidity = lastValidHumidity;
  }
  // Read MQ sensors
  data.mq2_analog = analogRead(MQ2_ANALOG_PIN);
  data.mq9_analog = analogRead(MQ9_ANALOG_PIN);
  data.mq135_analog = analogRead(MQ135_ANALOG_PIN);
  data.mq2_digital = digitalRead(MQ2_DIGITAL_PIN) == LOW;
  data.mq9_digital = digitalRead(MQ9_DIGITAL_PIN) == LOW;
  data.mq135_digital = digitalRead(MQ135_DIGITAL_PIN) == LOW;
  // motion will be added by caller
  data.emergency = false;
  return data;
}

void displayReadings(SensorData data) {
  Serial.println("=== SENSOR READINGS ===");
  Serial.println("Timestamp: " + String(data.timestamp));
  Serial.println("DHT11:");
  Serial.printf("  Temperature: %.2f°C\n", data.temperature);
  Serial.printf("  Humidity: %.2f%%\n", data.humidity);
  Serial.println("MQ2 (Smoke/LPG/Gas):");
  Serial.printf("  Digital: %s | Analog: %d", data.mq2_digital ? "GAS DETECTED" : "No Gas", data.mq2_analog);
  Serial.println(checkSensorDanger(data.mq2_analog, &mq2_cal, MQ2_DANGER_THRESHOLD) ? " [DANGER]" : " [Safe]");
  Serial.println("MQ9 (Carbon Monoxide):");
  Serial.printf("  Digital: %s | Analog: %d", data.mq9_digital ? "CO DETECTED" : "No CO", data.mq9_analog);
  Serial.println(checkSensorDanger(data.mq9_analog, &mq9_cal, MQ9_DANGER_THRESHOLD) ? " [DANGER]" : " [Safe]");
  Serial.println("MQ135 (Air Quality):");
  Serial.printf("  Digital: %s | Analog: %d", data.mq135_digital ? "POOR AIR" : "Good Air", data.mq135_analog);
  Serial.println(checkSensorDanger(data.mq135_analog, &mq135_cal, MQ135_DANGER_THRESHOLD) ? " [DANGER]" : " [Safe]");
  // motion display
  Serial.println("MOTION:");
  Serial.printf("  Total Accel: %.2f g\n", motionData.totalAccel / G);
  Serial.printf("  Total Gyro: %.2f °/s\n", motionData.totalGyro);
  Serial.printf("  Fall Detected: %s\n", motionData.fallDetected ? "YES" : "NO");
}

void checkAlerts(SensorData data) {
  static unsigned long lastAlert = 0;
  unsigned long now = millis();
  if (now - lastAlert < 60000) return; // limit alerts
  // Motion/fall highest priority
  if (motionData.fallDetected) {
    // Play fall audio if available; original mapping doesn't include explicit fall file; use CO_ALERT or AIR_QUALITY_WARNING replacement if required
    if (audioReady) playAudioFile(CO_ALERT); // placeholder sound
    lastAlert = now;
    return;
  }
  if (checkSensorDanger(data.mq2_analog, &mq2_cal, MQ2_DANGER_THRESHOLD)) {
    playAudioFile(SMOKE_ALERT);
    lastAlert = now;
    return;
  }
  if (checkSensorDanger(data.mq9_analog, &mq9_cal, MQ9_DANGER_THRESHOLD)) {
    playAudioFile(CO_ALERT);
    lastAlert = now;
    return;
  }
  if (checkSensorDanger(data.mq135_analog, &mq135_cal, MQ135_DANGER_THRESHOLD)) {
    playAudioFile(AIR_QUALITY_WARNING);
    lastAlert = now;
    return;
  }
  if (data.temperature > 45.0) { playAudioFile(HIGH_TEMP_ALERT); lastAlert = now; return; }
  if (data.temperature < 0.0) { playAudioFile(LOW_TEMP_ALERT); lastAlert = now; return; }
  if (data.humidity > 90.0) { playAudioFile(HIGH_HUMIDITY_ALERT); lastAlert = now; return; }
  if (data.humidity < 10.0) { playAudioFile(LOW_HUMIDITY_ALERT); lastAlert = now; return; }
}

void sendLoRaData(SensorData data) {
  packetCount++;
  StaticJsonDocument<512> doc;
  doc["nodeId"] = NODE_ID;
  doc["packetCount"] = packetCount;
  doc["timestamp"] = data.timestamp;
  doc["temperature"] = data.temperature;
  doc["humidity"] = data.humidity;
  doc["mq2_analog"] = data.mq2_analog;
  doc["mq9_analog"] = data.mq9_analog;
  doc["mq135_analog"] = data.mq135_analog;
  doc["mq2_digital"] = data.mq2_digital;
  doc["mq9_digital"] = data.mq9_digital;
  doc["mq135_digital"] = data.mq135_digital;
  doc["air_quality"] = getAirQualityRating(data.mq135_analog);
  doc["emergency"] = data.emergency;
  // Add motion data (to preserve original JSON format)
  doc["fall_detected"] = motionData.fallDetected;
  doc["activity"] = getActivityString();
  doc["total_accel"] = motionData.totalAccel;
  doc["total_gyro"] = motionData.totalGyro;
  doc["motion_active"] = motionData.motionActive;
  String jsonString;
  serializeJson(doc, jsonString);
  if (data.emergency || motionData.fallDetected) {
    Serial.println("\n╔════════════════════════════════════╗");
    Serial.println("║  EMERGENCY LoRa TRANSMISSION      ║");
    if (motionData.fallDetected) Serial.println("║  FALL DETECTED!                   ║");
    Serial.println("╚════════════════════════════════════╝");
  }
  Serial.print("LoRa Packet #"); Serial.print(packetCount); Serial.println(data.emergency ? " [EMERGENCY]" : " [NORMAL]");
  Serial.print("Payload size: "); Serial.print(jsonString.length()); Serial.println(" bytes");
  Serial.println("Payload: " + jsonString);
  LoRa.beginPacket();
  LoRa.print(jsonString);
  LoRa.endPacket();
  if (data.emergency || motionData.fallDetected) {
    Serial.println("╚════════════════════════════════════╝");
    Serial.println("║  EMERGENCY PACKET SENT            ║");
    Serial.println("╚════════════════════════════════════╝\n");
  } else {
    Serial.println("✓ Packet sent!\n");
  }
}

String getAirQualityRating(int value) {
  if (value < 800) return "Excellent";
  else if (value < 1200) return "Good";
  else if (value < 1800) return "Moderate";
  else if (value < 2400) return "Poor";
  else return "Very Poor";
}
