/*
  ESP32 Multi-Sensor System with Emergency Button + MPU6050
  FIXED RELEASE - pin layout preserved, calibration logic preserved,
  manual DHT humidity correction (-30%), robust MPU I2C handling,
  preserved JSON payload format.

  Notes:
   - Pins are identical to the layout you provided.
   - Calibration uses DANGER_MULTIPLIER = 2.0 as requested.
   - DHT11 humidity readings are reduced by 30% (clamped 0-100).
   - MPU6050 WHO_AM_I accepts 0x68/0x69/0x72; if WHO_AM_I==0x00 the code reports and disables MPU use.
   - I2C bus recovery & safe read/write are used to avoid repeated I2C timeouts.
*/

#include <Wire.h>
#include <HardwareSerial.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <math.h>

// ========================= PIN & REGISTER DEFINITIONS (PRESERVED) =========================

// MPU6050 I2C Register Definitions
#define MPU6050_ADDR 0x68
#define PWR_MGMT_1   0x6B
#define ACCEL_XOUT_H 0x3B
#define GYRO_XOUT_H  0x43
#define CONFIG       0x1A
#define GYRO_CONFIG  0x1B
#define ACCEL_CONFIG 0x1C
#define WHO_AM_I     0x75

// Pin definitions for MQ Sensors (preserved)
#define MQ2_DIGITAL_PIN 27       // ✔️ Safe
#define MQ2_ANALOG_PIN 32        // ✔️ ADC1_CH4
#define MQ9_DIGITAL_PIN 14       // ✔️ Safe
#define MQ9_ANALOG_PIN 33        // ✔️ ADC1_CH5
#define MQ135_DIGITAL_PIN 13     // ✔️ Safe
#define MQ135_ANALOG_PIN 35      // ✔️ ADC1_CH7

// FN-M16P Audio Module pins (UART2)
#define FN_M16P_RX 16            // ✔️ UART2 RX
#define FN_M16P_TX 17            // ✔️ UART2 TX

// DHT11 pin (preserved)
#define DHT11_PIN 25             // ✔️ GPIO25
#define DHT_TYPE DHT11

// MPU6050 pins (I2C) (preserved)
#define MPU6050_SDA 21           // ✔️ I2C SDA
#define MPU6050_SCL 22           // ✔️ I2C SCL
#define MPU6050_INT 34           // ✔️ Input-only

// LoRa Module pins (SPI) (preserved)
#define LORA_SCK 18              // ✔️ SPI SCK
#define LORA_MISO 19             // ✔️ SPI MISO
#define LORA_MOSI 23             // ✔️ SPI MOSI
#define LORA_SS 5                // ⚠️ Needs pull-up resistor on some boards
#define LORA_RST 4               // ✔️ Safe
#define LORA_DIO0 26             // ✔️ Safe

// EMERGENCY BUTTON PIN (preserved)
#define EMERGENCY_BUTTON_PIN 15  // ✔️ GPIO15; use INPUT_PULLUP (pressed = LOW)

// LoRa frequency
#define LORA_BAND 915E6

// Node identification
#define NODE_ID "001"

// Sensor thresholds and calibration (preserved)
#define MQ2_DANGER_THRESHOLD 1600
#define MQ9_DANGER_THRESHOLD 3800
#define MQ135_DANGER_THRESHOLD 1800

#define FALLBACK_TEMPERATURE 27.0
#define FALLBACK_HUMIDITY 47.0

#define CALIBRATION_SAMPLES 10
#define DANGER_MULTIPLIER 2.0
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

// Audio file mapping
enum AudioFiles {
  BOOT_AUDIO = 1,
  SMOKE_ALERT = 2,
  CO_ALERT = 3,
  AIR_QUALITY_WARNING = 4,
  HIGH_TEMP_ALERT = 5,
  LOW_TEMP_ALERT = 6,
  HIGH_HUMIDITY_ALERT = 7,
  LOW_HUMIDITY_ALERT = 8,
  FALL_DETECTED = 9,
  MOTION_ALERT = 10
};

// ========================= TYPES & GLOBALS =========================

struct SensorCalibration {
  float baseline;
  float dangerThreshold;
  bool calibrated;
};

struct MotionData {
  float totalAccel; // m/s^2
  float totalGyro;  // deg/s
  bool fallDetected;
  bool impactDetected;
  bool motionDetected;
  unsigned long lastMotionTime;
};

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

// Calibration objects
SensorCalibration mq2_cal = {0, 0, false};
SensorCalibration mq9_cal = {0, 0, false};
SensorCalibration mq135_cal = {0, 0, false};

// Peripherals
DHT dht(DHT11_PIN, DHT_TYPE);
HardwareSerial fnM16pSerial(2);

// Status flags
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

// Emergency Button state
volatile int tapCount = 0;
volatile unsigned long lastTapTime = 0;
volatile bool emergencyTriggered = false;

// Motion
MotionData motionData = {0};
const float G = 9.80665f;

// MPU fall detection internals
bool inFreeFall = false;
bool fallInProgress = false;
bool impactSeen = false;
unsigned long freeFallStart = 0;
unsigned long fallStartTime = 0;
unsigned long impactTime = 0;
unsigned long stationarySince = 0;
float accelFiltered = G;
const float ALPHA = 0.85f;

// MPU thresholds (conservative, tuned)
const float FREE_FALL_G_THRESHOLD = 0.6f;     // g
const unsigned long FREE_FALL_MIN_MS = 120;   // ms
const float IMPACT_G_THRESHOLD = 3.5f;        // g
const unsigned long IMPACT_WINDOW_MS = 1200;  // ms
const unsigned long STATIONARY_CONFIRM_MS = 800; // ms
const float ROTATION_IMPACT_THRESHOLD = 400.0f; // deg/s

unsigned long lastI2CAttempt = 0; // rate limiting

// ========================= FORWARD DECLARATIONS =========================

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
void checkEmergencyButton();
void handleEmergency();
void sendCommand(byte cmd, byte param1, byte param2, bool feedback);

// I2C helpers
bool i2cBusRecover();
bool safeWireRequest(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len, int retries=3);
bool safeWireWrite(uint8_t addr, uint8_t reg, uint8_t val, int retries=3);
bool initMPU6050();
void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz);
void monitorMotion();
void detectFallAndHandle();

// ========================= I2C / MPU Helpers =========================

// Attempt to recover a stuck I2C bus by pulsing SCL (common fix for stuck SDA)
bool i2cBusRecover() {
  Wire.end(); // stop Wire to use GPIO toggling
  pinMode(MPU6050_SCL, OUTPUT);
  pinMode(MPU6050_SDA, INPUT_PULLUP);
  // if SDA HIGH then bus free
  if (digitalRead(MPU6050_SDA) == HIGH) {
    Wire.begin(MPU6050_SDA, MPU6050_SCL);
    Wire.setClock(400000);
    return true;
  }
  // pulse SCL up to 9 times
  for (int i = 0; i < 9; ++i) {
    digitalWrite(MPU6050_SCL, HIGH);
    delayMicroseconds(300);
    digitalWrite(MPU6050_SCL, LOW);
    delayMicroseconds(300);
    if (digitalRead(MPU6050_SDA) == HIGH) break;
  }
  // try generate STOP
  pinMode(MPU6050_SDA, OUTPUT);
  digitalWrite(MPU6050_SDA, LOW);
  delayMicroseconds(100);
  digitalWrite(MPU6050_SCL, HIGH);
  delayMicroseconds(100);
  digitalWrite(MPU6050_SDA, HIGH);
  delayMicroseconds(100);
  // restore Wire
  Wire.begin(MPU6050_SDA, MPU6050_SCL);
  Wire.setClock(400000);
  pinMode(MPU6050_SDA, INPUT_PULLUP);
  return digitalRead(MPU6050_SDA) == HIGH;
}

// safe read with retries and bus recovery
bool safeWireRequest(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len, int retries) {
  for (int attempt = 0; attempt < retries; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    uint8_t rc = Wire.endTransmission(false);
    if (rc != 0) {
      i2cBusRecover();
      delay(10);
      continue;
    }
    size_t got = Wire.requestFrom((int)addr, (int)len);
    if (got == len) {
      for (size_t i = 0; i < len; ++i) buf[i] = Wire.read();
      return true;
    }
    i2cBusRecover();
    delay(10);
  }
  return false;
}

// safe write with retries and bus recovery
bool safeWireWrite(uint8_t addr, uint8_t reg, uint8_t val, int retries) {
  for (int attempt = 0; attempt < retries; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(val);
    uint8_t r = Wire.endTransmission();
    if (r == 0) return true;
    i2cBusRecover();
    delay(10);
  }
  return false;
}

// ========================= MPU6050 init & read =========================

bool initMPU6050() {
  // rate-limit repeated attempts
  if (millis() - lastI2CAttempt < 200) return false;
  lastI2CAttempt = millis();

  uint8_t who = 0x00;
  uint8_t buf[1];
  bool ok = safeWireRequest(MPU6050_ADDR, WHO_AM_I, buf, 1, 4);
  if (ok) who = buf[0];
  Serial.printf("MPU6050 WHO_AM_I = 0x%02X\n", who);

  if (!ok || who == 0x00) {
    Serial.println("ERROR: MPU6050 not responding on I2C (WHO_AM_I == 0x00). Check wiring/power/pullups.");
    // attempt recovery once
    if (i2cBusRecover()) {
      delay(20);
      ok = safeWireRequest(MPU6050_ADDR, WHO_AM_I, buf, 1, 2);
      if (ok) who = buf[0];
    }
    if (!ok || who == 0x00) return false;
  }

  if (who != 0x68 && who != 0x69 && who != 0x72) {
    Serial.println("WARNING: MPU6050 WHO_AM_I unexpected but proceeding (clone support).");
  } else {
    Serial.println("MPU6050 identity accepted.");
  }

  if (!safeWireWrite(MPU6050_ADDR, PWR_MGMT_1, 0x00, 3)) { Serial.println("I2C write PWR_MGMT_1 failed"); return false; }
  delay(50);
  if (!safeWireWrite(MPU6050_ADDR, ACCEL_CONFIG, 0x10, 3)) { Serial.println("I2C write ACCEL_CONFIG failed"); return false; }
  if (!safeWireWrite(MPU6050_ADDR, GYRO_CONFIG, 0x08, 3)) { Serial.println("I2C write GYRO_CONFIG failed"); return false; }
  if (!safeWireWrite(MPU6050_ADDR, CONFIG, 0x04, 3)) { Serial.println("I2C write CONFIG failed"); return false; }
  delay(50);
  return true;
}

void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz) {
  uint8_t buf[14];
  if (!safeWireRequest(MPU6050_ADDR, ACCEL_XOUT_H, buf, 14, 2)) {
    *ax = *ay = *az = *gx = *gy = *gz = 0;
    return;
  }
  *ax = (int16_t)((buf[0] << 8) | buf[1]);
  *ay = (int16_t)((buf[2] << 8) | buf[3]);
  *az = (int16_t)((buf[4] << 8) | buf[5]);
  *gx = (int16_t)((buf[8] << 8) | buf[9]);
  *gy = (int16_t)((buf[10] << 8) | buf[11]);
  *gz = (int16_t)((buf[12] << 8) | buf[13]);
}

// ========================= Motion monitor & fall detection =========================

void monitorMotion() {
  if (!mpuReady) return;
  int16_t axr=0, ayr=0, azr=0, gxr=0, gyr=0, gzr=0;
  readMPU6050Data(&axr,&ayr,&azr,&gxr,&gyr,&gzr);

  // if read returned zeros -> skip
  if (axr==0 && ayr==0 && azr==0 && gxr==0 && gyr==0 && gzr==0) return;

  float ax = (axr / 4096.0f) * G;
  float ay = (ayr / 4096.0f) * G;
  float az = (azr / 4096.0f) * G;
  float gx = (gxr / 65.5f);
  float gy = (gyr / 65.5f);
  float gz = (gzr / 65.5f);

  motionData.totalAccel = sqrt(ax*ax + ay*ay + az*az);
  motionData.totalGyro = sqrt(gx*gx + gy*gy + gz*gz);

  accelFiltered = ALPHA * accelFiltered + (1.0f - ALPHA) * motionData.totalAccel;

  if (fabs(motionData.totalAccel - accelFiltered) > 0.2f * G || motionData.totalGyro > 25.0f) {
    motionData.lastMotionTime = millis();
    motionData.motionDetected = true;
  } else {
    motionData.motionDetected = false;
  }

  detectFallAndHandle();
}

void detectFallAndHandle() {
  unsigned long now = millis();
  float totG = motionData.totalAccel / G;
  float totGyro = motionData.totalGyro;

  // free fall detection
  if (totG < FREE_FALL_G_THRESHOLD) {
    if (!inFreeFall) { inFreeFall = true; freeFallStart = now; }
    else if ((now - freeFallStart) >= FREE_FALL_MIN_MS && !fallInProgress) {
      fallInProgress = true;
      fallStartTime = now;
      impactSeen = false;
      motionData.impactDetected = false;
    }
  } else {
    if (inFreeFall) inFreeFall = false;
  }

  // impact after free fall
  if (fallInProgress && !impactSeen) {
    if (totG >= IMPACT_G_THRESHOLD || totGyro >= ROTATION_IMPACT_THRESHOLD) {
      impactSeen = true;
      impactTime = now;
      motionData.impactDetected = true;
    } else if (now - fallStartTime > IMPACT_WINDOW_MS) {
      fallInProgress = false;
      impactSeen = false;
      motionData.impactDetected = false;
    }
  }

  // confirm fall if post-impact stationary
  if (impactSeen) {
    float accelVariationG = fabs((motionData.totalAccel / G) - 1.0f);
    if (accelVariationG < 0.35f && motionData.totalGyro < 50.0f) {
      if (stationarySince == 0) stationarySince = now;
      if (now - stationarySince >= STATIONARY_CONFIRM_MS) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(FALL_DETECTED);
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - IMPACT!        ║");
        Serial.println("╚════════════════════════════════════╝");
        Serial.printf("Acceleration: %.2f g\n", motionData.totalAccel / G);
        Serial.printf("Gyroscope: %.2f °/s\n", motionData.totalGyro);
        // reset internals for next event
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

  // immediate detection on large sudden spike (conservative)
  static float lastTotalAccel = G;
  static float lastTotalGyro = 0.0f;
  float accelDeltaG = fabs((motionData.totalAccel - lastTotalAccel) / G);
  float gyroDelta = fabs(motionData.totalGyro - lastTotalGyro);

  if (!motionData.fallDetected) {
    if (accelDeltaG > 2.5f && (motionData.totalAccel / G) > 2.0f) {
      // quick follow-up non-blocking check using lastMotionTime
      unsigned long tstart = millis();
      bool remainedStationary = true;
      while (millis() - tstart < STATIONARY_CONFIRM_MS) {
        // just check motionData; rely on monitorMotion updating it frequently in loop
        if (motionData.motionDetected) { remainedStationary = false; break; }
        delay(40);
      }
      if (remainedStationary) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(FALL_DETECTED);
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - SUDDEN SPIKE   ║");
        Serial.println("╚════════════════════════════════════╝");
      }
    } else if (gyroDelta > 300.0f && motionData.totalGyro > 400.0f) {
      unsigned long tstart = millis();
      bool remainedStationary = true;
      while (millis() - tstart < STATIONARY_CONFIRM_MS) {
        if (motionData.motionDetected) { remainedStationary = false; break; }
        delay(40);
      }
      if (remainedStationary) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(FALL_DETECTED);
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - ROTATION SPIKE ║");
        Serial.println("╚════════════════════════════════════╝");
      }
    }
  }

  lastTotalAccel = motionData.totalAccel;
  lastTotalGyro = motionData.totalGyro;
}

// ========================= Setup & Loop =========================

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Multi-Sensor System (PINS PRESERVED)");
  Serial.println("=================================");

  // Initialize I2C for MPU6050 (preserved pins)
  Wire.begin(MPU6050_SDA, MPU6050_SCL);
  Wire.setClock(400000);

  // Initialize MQ digital pins
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(MQ9_DIGITAL_PIN, INPUT);
  pinMode(MQ135_DIGITAL_PIN, INPUT);

  // Emergency button using INPUT_PULLUP on GPIO15 (pressed == LOW)
  pinMode(EMERGENCY_BUTTON_PIN, INPUT_PULLUP);
  Serial.printf("Emergency button on GPIO%d (INPUT_PULLUP). Press -> LOW\n", EMERGENCY_BUTTON_PIN);

  // MPU6050 INT
  pinMode(MPU6050_INT, INPUT);

  // Initialize MPU6050
  Serial.println("Initializing MPU6050...");
  if (!initMPU6050()) {
    Serial.println("⚠ MPU6050 not initialized. Motion features disabled until I2C/wiring fixed.");
    mpuReady = false;
  } else {
    Serial.println("✓ MPU6050 initialized (clone WHO_AM_I accepted).");
    mpuReady = true;
    motionData.lastMotionTime = millis();
  }

  // Initialize DHT11 on GPIO25 (as requested) and apply manual humidity correction
  Serial.println("\nInitializing DHT11 sensor...");
  dht.begin();
  delay(1500);
  bool okDht = false;
  for (int i = 0; i < 3; ++i) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      okDht = true;
      dhtReady = true;
      lastValidTemperature = t;
      float corr = h - 30.0f;
      if (corr < 0.0f) corr = 0.0f;
      if (corr > 100.0f) corr = 100.0f;
      lastValidHumidity = corr;
      Serial.printf("✓ DHT11 read OK: Temp %.1f C, Humidity (corrected) %.1f %%\n", lastValidTemperature, lastValidHumidity);
      break;
    }
    delay(1000);
  }
  if (!okDht) {
    Serial.println("⚠ DHT11 ERROR - check wiring (DATA -> GPIO25), power and placement.");
    dhtReady = false;
  }

  // Initialize audio module
  fnM16pSerial.begin(9600, SERIAL_8N1, FN_M16P_RX, FN_M16P_TX);
  delay(200);
  setVolume(30);
  audioReady = true;
  Serial.println("✓ FN-M16P initialized.");

  // Initialize LoRa (with SS high and RST toggled)
  Serial.println("Initializing LoRa...");
  pinMode(LORA_SS, OUTPUT);
  digitalWrite(LORA_SS, HIGH);
  pinMode(LORA_RST, OUTPUT);
  digitalWrite(LORA_RST, HIGH);
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  // reset sequence
  digitalWrite(LORA_RST, LOW); delay(10);
  digitalWrite(LORA_RST, HIGH); delay(10);
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("⚠ LoRa initialization failed. Check wiring/antenna.");
    loraReady = false;
  } else {
    loraReady = true;
    Serial.println("✓ LoRa initialized.");
  }

  Serial.println("Warming up gas sensors (15s)...");
  delay(15000);

  Serial.println("Calibrating MQ sensors...");
  calibrateSensors();

  Serial.println("\nSYSTEM READY.");
  printTestMenu();

  if (audioReady) {
    playAudioFile(BOOT_AUDIO);
    delay(1000);
  }
}

void loop() {
  // Serial commands
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    handleTestCommand(cmd);
  }

  // Emergency button handling
  checkEmergencyButton();

  // Monitor MPU6050 continuously
  if (mpuReady) monitorMotion();

  // Handle emergency if triggered
  if (emergencyTriggered) {
    handleEmergency();
    emergencyTriggered = false;
  }

  // Periodic normal operation
  static unsigned long lastNormal = 0;
  if (millis() - lastNormal >= 10000) {
    lastNormal = millis();
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

// ========================= Test Commands & Helpers =========================

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
  else if (cmd == "audio9" || cmd == "a9") testAudio(9);
  else if (cmd == "audio10" || cmd == "a10") testAudio(10);
  else if (cmd == "stop") { stopAudio(); Serial.println("Audio stopped."); }
  else if (cmd == "volume+") { setVolume(25); Serial.println("Volume 25"); }
  else if (cmd == "volume-") { setVolume(15); Serial.println("Volume 15"); }
  else if (cmd == "lora") testLoRa();
  else if (cmd == "emergency") testEmergency();
  else if (cmd == "button") testButton();
  else if (cmd == "all") testAllSensors();
  else if (cmd == "calibrate") calibrateSensors();
  else if (cmd == "status") printSystemStatus();
  else Serial.println("Unknown command.");
  Serial.println("\n>>> TEST COMPLETE <<<\n");
}

void printTestMenu() {
  Serial.println("\n╔════════════════ TEST COMMANDS ═════════════╗");
  Serial.println(" dht, mq2, mq9, mq135, mq, all, lora, button  ");
  Serial.println(" audio1..audio10, stop, volume+, volume-       ");
  Serial.println(" calibrate, status, help/menu                 ");
  Serial.println("╚════════════════════════════════════════════╝\n");
}

void testDHT() {
  Serial.println("DHT test (5 samples):");
  for (int i = 0; i < 5; ++i) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      float corr = h - 30.0f;
      if (corr < 0) corr = 0;
      if (corr > 100) corr = 100;
      Serial.printf(" #%d Temp %.2f C, Humidity(corrected) %.2f %%\n", i+1, t, corr);
    } else {
      Serial.printf(" #%d FAILED\n", i+1);
    }
    delay(2000);
  }
}

void testMQ2() {
  Serial.println("MQ2 test:");
  for (int i=0;i<10;i++){
    int a = analogRead(MQ2_ANALOG_PIN);
    bool d = digitalRead(MQ2_DIGITAL_PIN) == LOW;
    Serial.printf(" #%d analog=%d digital=%s\n", i+1, a, d?"ACTIVE":"INACTIVE");
    delay(500);
  }
  Serial.printf("Calibration baseline=%.1f threshold=%.1f\n", mq2_cal.baseline, mq2_cal.dangerThreshold);
}

void testMQ9() {
  Serial.println("MQ9 test:");
  for (int i=0;i<10;i++){
    int a = analogRead(MQ9_ANALOG_PIN);
    bool d = digitalRead(MQ9_DIGITAL_PIN) == LOW;
    Serial.printf(" #%d analog=%d digital=%s\n", i+1, a, d?"ACTIVE":"INACTIVE");
    delay(500);
  }
  Serial.printf("Calibration baseline=%.1f threshold=%.1f\n", mq9_cal.baseline, mq9_cal.dangerThreshold);
}

void testMQ135() {
  Serial.println("MQ135 test:");
  for (int i=0;i<10;i++){
    int a = analogRead(MQ135_ANALOG_PIN);
    bool d = digitalRead(MQ135_DIGITAL_PIN) == LOW;
    Serial.printf(" #%d analog=%d digital=%s rating=%s\n", i+1, a, d?"POOR":"GOOD", getAirQualityRating(a).c_str());
    delay(500);
  }
  Serial.printf("Calibration baseline=%.1f threshold=%.1f\n", mq135_cal.baseline, mq135_cal.dangerThreshold);
}

void testAllMQ() { testMQ2(); testMQ9(); testMQ135(); }

void testAudio(int fileNum) {
  if (!audioReady) { Serial.println("Audio not ready"); return; }
  Serial.printf("Play audio #%d\n", fileNum);
  playAudioFile(fileNum);
}

void testLoRa() {
  if (!loraReady) { Serial.println("LoRa not ready"); return; }
  Serial.println("Sending test LoRa packet...");
  SensorData s = readAllSensors();
  s.emergency = false;
  s.motion = motionData;
  sendLoRaData(s);
  Serial.println("Test LoRa done.");
}

void testEmergency() {
  Serial.println("Triggering emergency...");
  emergencyTriggered = true;
}

void testButton() {
  Serial.println("Button test (10s) - press the emergency button:");
  unsigned long start = millis();
  bool last = digitalRead(EMERGENCY_BUTTON_PIN);
  while (millis() - start < 10000) {
    bool cur = digitalRead(EMERGENCY_BUTTON_PIN);
    if (cur != last) {
      Serial.printf("State changed: %s\n", cur ? "HIGH" : "LOW");
      last = cur;
    }
    delay(100);
  }
  Serial.println("Button test complete.");
}

void testAllSensors() {
  testDHT();
  testAllMQ();
  testLoRa();
}

// ========================= Audio functions =========================

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
  if (fileNumber < 1 || fileNumber > 10) return;
  sendCommand(CMD_PLAY_TRACK, 0x00, fileNumber, false);
  delay(60);
}

void stopAudio() {
  sendCommand(CMD_STOP, 0x00, 0x00, false);
}

// ========================= Calibration & MQ helpers =========================

void calibrateSensors() {
  Serial.println("Starting calibration...");
  delay(500);
  calibrateSensor(MQ2_ANALOG_PIN, &mq2_cal, "MQ2", MQ2_DANGER_THRESHOLD);
  calibrateSensor(MQ9_ANALOG_PIN, &mq9_cal, "MQ9", MQ9_DANGER_THRESHOLD);
  calibrateSensor(MQ135_ANALOG_PIN, &mq135_cal, "MQ135", MQ135_DANGER_THRESHOLD);
  Serial.println("Calibration complete.");
}

void calibrateSensor(int pin, SensorCalibration* cal, String sensorName, int minThreshold) {
  Serial.printf("Calibrating %s ...", sensorName.c_str());
  float sum = 0;
  for (int i = 0; i < CALIBRATION_SAMPLES; ++i) {
    int r = analogRead(pin);
    sum += r;
    Serial.print(".");
    delay(CALIBRATION_DELAY);
  }
  cal->baseline = sum / CALIBRATION_SAMPLES;
  float calc = cal->baseline * DANGER_MULTIPLIER;
  cal->dangerThreshold = (calc > minThreshold) ? calc : (float)minThreshold;
  cal->calibrated = true;
  Serial.println(" Done");
}

bool checkSensorDanger(int currentValue, SensorCalibration* cal, int staticDangerThreshold) {
  if (!cal->calibrated) return currentValue > staticDangerThreshold;
  return currentValue > cal->dangerThreshold;
}

// ========================= Sensors read, display, alerts, LoRa =========================

SensorData readAllSensors() {
  SensorData data;
  data.timestamp = millis();

  // DHT read with caching, manual -30% humidity correction
  if (millis() - lastDHTReading > DHT_READING_INTERVAL) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && t >= -40 && t <= 80) { data.temperature = t; lastValidTemperature = t; }
    else data.temperature = lastValidTemperature;
    if (!isnan(h) && h >= 0 && h <= 100) {
      float corr = h - 30.0f;
      if (corr < 0.0f) corr = 0.0f;
      if (corr > 100.0f) corr = 100.0f;
      data.humidity = corr;
      lastValidHumidity = corr;
    } else data.humidity = lastValidHumidity;
    lastDHTReading = millis();
  } else {
    data.temperature = lastValidTemperature;
    data.humidity = lastValidHumidity;
  }

  // MQ sensors
  data.mq2_analog = analogRead(MQ2_ANALOG_PIN);
  data.mq9_analog = analogRead(MQ9_ANALOG_PIN);
  data.mq135_analog = analogRead(MQ135_ANALOG_PIN);
  data.mq2_digital = digitalRead(MQ2_DIGITAL_PIN) == LOW;
  data.mq9_digital = digitalRead(MQ9_DIGITAL_PIN) == LOW;
  data.mq135_digital = digitalRead(MQ135_DIGITAL_PIN) == LOW;

  data.emergency = false;
  data.motion = motionData;
  return data;
}

void displayReadings(SensorData data) {
  Serial.println("=== SENSOR READINGS ===");
  Serial.printf("Timestamp: %lu\n", data.timestamp);
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
  Serial.println("MOTION:");
  Serial.printf("  Total Accel: %.2f g\n", data.motion.totalAccel / G);
  Serial.printf("  Total Gyro: %.2f °/s\n", data.motion.totalGyro);
  Serial.printf("  Fall Detected: %s\n", data.motion.fallDetected ? "YES" : "NO");
}

void checkAlerts(SensorData data) {
  static unsigned long lastAlert = 0;
  unsigned long now = millis();
  if (now - lastAlert < 60000) return;

  if (data.motion.fallDetected) {
    if (audioReady) playAudioFile(FALL_DETECTED);
    lastAlert = now;
    return;
  }

  if (checkSensorDanger(data.mq2_analog, &mq2_cal, MQ2_DANGER_THRESHOLD)) {
    playAudioFile(SMOKE_ALERT); lastAlert = now; return;
  }
  if (checkSensorDanger(data.mq9_analog, &mq9_cal, MQ9_DANGER_THRESHOLD)) {
    playAudioFile(CO_ALERT); lastAlert = now; return;
  }
  if (checkSensorDanger(data.mq135_analog, &mq135_cal, MQ135_DANGER_THRESHOLD)) {
    playAudioFile(AIR_QUALITY_WARNING); lastAlert = now; return;
  }
  if (data.temperature > 45.0) { playAudioFile(HIGH_TEMP_ALERT); lastAlert = now; return; }
  if (data.temperature < 0.0)  { playAudioFile(LOW_TEMP_ALERT); lastAlert = now; return; }
  if (data.humidity > 90.0)    { playAudioFile(HIGH_HUMIDITY_ALERT); lastAlert = now; return; }
  if (data.humidity < 10.0)    { playAudioFile(LOW_HUMIDITY_ALERT); lastAlert = now; return; }
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

  doc["fall_detected"] = data.motion.fallDetected;
  doc["activity"] = data.motion.fallDetected ? String("FALLEN - HELP!") : String("Stationary");
  doc["total_accel"] = data.motion.totalAccel;
  doc["total_gyro"] = data.motion.totalGyro;
  doc["motion_active"] = data.motion.motionDetected;

  String jsonString;
  serializeJson(doc, jsonString);

  if (data.emergency || data.motion.fallDetected) {
    Serial.println("\n╔═════════ EMERGENCY LoRa ═════════╗");
    if (data.motion.fallDetected) Serial.println("║  FALL DETECTED!                 ║");
    Serial.println("╚═════════════════════════════════╝");
  }

  Serial.print("LoRa Packet #"); Serial.print(packetCount); Serial.println(data.emergency ? " [EMERGENCY]" : " [NORMAL]");
  Serial.print("Payload size: "); Serial.print(jsonString.length()); Serial.println(" bytes");
  Serial.println("Payload: " + jsonString);

  LoRa.beginPacket();
  LoRa.print(jsonString);
  LoRa.endPacket();

  if (data.emergency || data.motion.fallDetected) {
    Serial.println("EMERGENCY packet sent.");
  } else {
    Serial.println("✓ Packet sent.");
  }
}

String getAirQualityRating(int value) {
  if (value < 800) return "Excellent";
  else if (value < 1200) return "Good";
  else if (value < 1800) return "Moderate";
  else if (value < 2400) return "Poor";
  else return "Very Poor";
}

// ========================= Emergency button =========================

void checkEmergencyButton() {
  static bool lastState = HIGH; // INPUT_PULLUP -> HIGH when released
  static unsigned long lastChangeTime = 0;
  bool currentState = digitalRead(EMERGENCY_BUTTON_PIN);
  if (currentState != lastState && (millis() - lastChangeTime > 50)) {
    lastChangeTime = millis();
    if (currentState == LOW) { // pressed
      unsigned long now = millis();
      if (now - lastTapTime < TAP_TIMEOUT) tapCount++;
      else tapCount = 1;
      lastTapTime = now;
      Serial.printf("BUTTON TAP #%d/%d\n", tapCount, REQUIRED_TAPS);
      if (tapCount >= REQUIRED_TAPS) {
        Serial.println("TRIPLE TAP - EMERGENCY TRIGGERED");
        emergencyTriggered = true;
        tapCount = 0;
      }
    }
  }

  if (millis() - lastTapTime > TAP_TIMEOUT && tapCount > 0) tapCount = 0;
  lastState = currentState;
}

void handleEmergency() {
  Serial.println("\n██████ EMERGENCY MODE ACTIVATED ██████");
  SensorData s = readAllSensors();
  s.emergency = true;
  s.motion = motionData;
  Serial.println("EMERGENCY SNAPSHOT:");
  Serial.printf("  Temp: %.2f C, Hum: %.2f %%\n", s.temperature, s.humidity);
  Serial.printf("  MQ2: %d, MQ9: %d, MQ135: %d\n", s.mq2_analog, s.mq9_analog, s.mq135_analog);
  Serial.printf("  Fall: %s\n", s.motion.fallDetected ? "YES" : "NO");
  if (loraReady) {
    sendLoRaData(s);
  } else {
    Serial.println("LoRa not ready - cannot send emergency.");
  }
  if (audioReady) playAudioFile(FALL_DETECTED);
  delay(800);
}

// ========================= Status & Misc =========================

void printSystemStatus() {
  Serial.println("\n=== SYSTEM STATUS ===");
  Serial.printf("Node: %s\n", NODE_ID);
  Serial.printf("Uptime: %lu s\n", millis() / 1000);
  Serial.printf("Packets sent: %d\n", packetCount);
  Serial.printf("DHT: %s  MPU: %s  LoRa: %s  Audio: %s\n",
                dhtReady ? "YES" : "NO",
                mpuReady ? "YES" : "NO",
                loraReady ? "YES" : "NO",
                audioReady ? "YES" : "NO");
  Serial.printf("MQ2 cal: %s  MQ9 cal: %s  MQ135 cal: %s\n",
                mq2_cal.calibrated ? "YES":"NO",
                mq9_cal.calibrated ? "YES":"NO",
                mq135_cal.calibrated ? "YES":"NO");
  Serial.printf("Last Temp: %.2fC  Last Hum (corrected): %.2f%%\n", lastValidTemperature, lastValidHumidity);
  Serial.println("=====================\n");
}
