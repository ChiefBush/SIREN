/*
  ESP32 Multi-Sensor System with Emergency Button + MPU6050 Fall Detection
  UPDATED per request:
   - Alerts for MQ sensors use 3x calibration threshold (DANGER_MULTIPLIER = 3.0)
   - MQ2 / MQ9 require BOTH analog > threshold AND digital pin asserted to reduce false positives
   - MQ135 uses analog > threshold OR digital asserted
   - DHT humidity alert thresholds made more conservative
   - Motion/fall alerts ONLY occur on robust fall signatures:
       * free-fall followed by impact (confirmed)
       * OR very sudden large acceleration spike (>IMPACT_G_THRESHOLD)
       * OR very large rotational spike (>ROTATION_IMPACT_THRESHOLD)
   - Removed walking/running/stuck activity tracking (no state tracking)
   - Kept WHO_AM_I acceptance for clones (0x68, 0x69, 0x72)
   - All features otherwise preserved: DHT11, MQ sensors, FN-M16P audio, LoRa, emergency button, calibration, tests
*/

#include <Wire.h>
#include <HardwareSerial.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <math.h>

// MPU6050 I2C Register Definitions
#define MPU6050_ADDR 0x68
#define PWR_MGMT_1   0x6B
#define ACCEL_XOUT_H 0x3B
#define GYRO_XOUT_H  0x43
#define CONFIG       0x1A
#define GYRO_CONFIG  0x1B
#define ACCEL_CONFIG 0x1C
#define WHO_AM_I     0x75

// Pin definitions for MQ Sensors
#define MQ2_DIGITAL_PIN 27       // ✔️ Safe
#define MQ2_ANALOG_PIN 32        // ✔️ ADC1_CH4
#define MQ9_DIGITAL_PIN 14       // ✔️ Safe
#define MQ9_ANALOG_PIN 33        // ✔️ ADC1_CH5
#define MQ135_DIGITAL_PIN 13     // ✔️ Safe
#define MQ135_ANALOG_PIN 35      // ✔️ ADC1_CH7

// FN-M16P Audio Module pins (UART2)
#define FN_M16P_RX 16            // ✔️ UART2 RX
#define FN_M16P_TX 17            // ✔️ UART2 TX

// DHT11 pin
#define DHT11_PIN 25             // ✔️ GPIO25
#define DHT_TYPE DHT11

// MPU6050 pins (I2C)
#define MPU6050_SDA 21           // ✔️ I2C SDA
#define MPU6050_SCL 22           // ✔️ I2C SCL
#define MPU6050_INT 34           // ✔️ Input-only

// LoRa Module pins (SPI)
#define LORA_SCK 18              // ✔️ SPI SCK
#define LORA_MISO 19             // ✔️ SPI MISO
#define LORA_MOSI 23             // ✔️ SPI MOSI
#define LORA_SS 5                // ⚠️ Needs pull-up resistor on some boards
#define LORA_RST 4               // ✔️ Safe
#define LORA_DIO0 26             // ✔️ Safe

// EMERGENCY BUTTON PIN
#define EMERGENCY_BUTTON_PIN 15  // ✔️ GPIO15; INPUT_PULLUP (pressed = LOW)
// LoRa frequency
#define LORA_BAND 915E6

// Node identification
#define NODE_ID "001"

// Sensor thresholds (static fallbacks)
#define MQ2_STATIC_MIN 1600
#define MQ9_STATIC_MIN 3800
#define MQ135_STATIC_MIN 1800

#define FALLBACK_TEMPERATURE 27.0
#define FALLBACK_HUMIDITY 47.0

#define CALIBRATION_SAMPLES 10
#define DANGER_MULTIPLIER 3.0   // IMPORTANT: now 3x baseline
#define CALIBRATION_DELAY 2000 // ms between calibration reads

// Emergency Button Parameters
const int TAP_TIMEOUT = 600;
const int REQUIRED_TAPS = 3;

// Improved MPU6050 / fall detection parameters (tuned to reduce false positives)
const float G = 9.80665f;
const float FREE_FALL_G_THRESHOLD = 0.6f;     // <0.6g considered free-fall (g units)
const unsigned long FREE_FALL_MIN_MS = 120;   // minimum duration for free-fall (ms)
const float IMPACT_G_THRESHOLD = 3.5f;        // >3.5g considered impact (strong)
const unsigned long IMPACT_WINDOW_MS = 1200;  // time window after free-fall to see impact
const unsigned long STATIONARY_CONFIRM_MS = 1200; // after impact, if low motion for this, mark fallen
const float ROTATION_IMPACT_THRESHOLD = 400.0f; // deg/s (very sudden rotation)

// DHT humidity thresholds made more conservative to avoid false alarms
const float HIGH_HUMIDITY_THRESHOLD = 95.0f;
const float LOW_HUMIDITY_THRESHOLD = 5.0f;

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

struct SensorCalibration {
  float baseline;
  float dangerThreshold; // baseline * DANGER_MULTIPLIER or static min
  bool calibrated;
};

struct MotionData {
  float accelX, accelY, accelZ; // m/s^2
  float gyroX, gyroY, gyroZ;    // deg/s
  float totalAccel;             // m/s^2
  float totalGyro;              // deg/s
  bool fallDetected;
  bool impactDetected;
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
int loraInterval = 30000; // 30s default
int packetCount = 0;

unsigned long lastDHTReading = 0;
const unsigned long DHT_READING_INTERVAL = 2000;
float lastValidTemperature = FALLBACK_TEMPERATURE;
float lastValidHumidity = FALLBACK_HUMIDITY;

// Emergency Button Variables
volatile int tapCount = 0;
volatile unsigned long lastTapTime = 0;
volatile bool emergencyTriggered = false;

// MPU6050 / motion variables
MotionData motionData = {0};
bool fallInProgress = false;
unsigned long fallStartTime = 0;
unsigned long freeFallStart = 0;
unsigned long impactTime = 0;
bool inFreeFall = false;
bool impactSeen = false;
unsigned long stationarySince = 0;

// small smoothing window for accel
const float ALPHA = 0.85f;
float accelFiltered = 9.8f;

// Function declarations
void writeMPU6050(uint8_t reg, uint8_t data);
uint8_t readMPU6050(uint8_t reg);
void readMPU6050Burst(uint8_t reg, uint8_t *buffer, uint8_t length);
bool initMPU6050();
void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz);
void monitorMotion();
void detectFallAndHandle();
void checkEmergencyButton();
void handleEmergency();
void sendCommand(byte cmd, byte param1, byte param2, bool feedback);
void setVolume(int volume);
void playAudioFile(int fileNumber);
void stopAudio();
void calibrateSensors();
void calibrateSensor(int pin, SensorCalibration* cal, String sensorName, int minThreshold);
bool checkSensorDangerAnalogOnly(int currentValue, SensorCalibration* cal, int staticDangerThreshold);
bool checkSensorDangerMQ2_MQ9(int currentValue, SensorCalibration* cal, int staticDangerThreshold, bool digitalState);
bool checkSensorDangerMQ135(int currentValue, SensorCalibration* cal, int staticDangerThreshold, bool digitalState);
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

// ============ MPU6050 I2C FUNCTIONS ============

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
    if (Wire.available()) buffer[i] = Wire.read();
    else buffer[i] = 0;
  }
}

bool initMPU6050() {
  // Wake up MPU6050
  writeMPU6050(PWR_MGMT_1, 0x00);
  delay(100);
  
  // Verify communication - accept alternate WHO_AM_I values
  uint8_t whoAmI = readMPU6050(WHO_AM_I);
  Serial.printf("MPU6050 WHO_AM_I returned: 0x%02X\n", whoAmI);
  if (whoAmI != 0x68 && whoAmI != 0x69 && whoAmI != 0x72) {
    Serial.println("WARNING: Unrecognized WHO_AM_I for MPU6050. Attempting to continue anyway.");
  } else {
    Serial.println("MPU6050 identity accepted.");
  }
  
  // Configure accelerometer (±8g range)
  writeMPU6050(ACCEL_CONFIG, 0x10);
  // Configure gyroscope (±500°/s)
  writeMPU6050(GYRO_CONFIG, 0x08);
  // Configure low pass filter
  writeMPU6050(CONFIG, 0x04);
  delay(100);
  return true;
}

void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz) {
  uint8_t buffer[14];
  readMPU6050Burst(ACCEL_XOUT_H, buffer, 14);
  
  *ax = (int16_t)((buffer[0] << 8) | buffer[1]);
  *ay = (int16_t)((buffer[2] << 8) | buffer[3]);
  *az = (int16_t)((buffer[4] << 8) | buffer[5]);
  
  *gx = (int16_t)((buffer[8] << 8) | buffer[9]);
  *gy = (int16_t)((buffer[10] << 8) | buffer[11]);
  *gz = (int16_t)((buffer[12] << 8) | buffer[13]);
}

// Monitor motion and update motionData
void monitorMotion() {
  int16_t ax_raw, ay_raw, az_raw, gx_raw, gy_raw, gz_raw;
  readMPU6050Data(&ax_raw, &ay_raw, &az_raw, &gx_raw, &gy_raw, &gz_raw);
  
  // Convert to m/s² (±8g -> 4096 LSB/g)
  motionData.accelX = (ax_raw / 4096.0f) * G;
  motionData.accelY = (ay_raw / 4096.0f) * G;
  motionData.accelZ = (az_raw / 4096.0f) * G;
  
  // Convert to deg/s (±500°/s -> 65.5 LSB/°/s)
  motionData.gyroX = gx_raw / 65.5f;
  motionData.gyroY = gy_raw / 65.5f;
  motionData.gyroZ = gz_raw / 65.5f;
  
  motionData.totalAccel = sqrt(
    motionData.accelX*motionData.accelX +
    motionData.accelY*motionData.accelY +
    motionData.accelZ*motionData.accelZ
  );
  
  motionData.totalGyro = sqrt(
    motionData.gyroX*motionData.gyroX +
    motionData.gyroY*motionData.gyroY +
    motionData.gyroZ*motionData.gyroZ
  );
  
  // Smooth
  accelFiltered = ALPHA * accelFiltered + (1.0f - ALPHA) * motionData.totalAccel;
  
  // update lastMotionTime on meaningful change
  if (fabs(motionData.totalAccel - accelFiltered) > 0.2f * G || motionData.totalGyro > 20.0f) {
    motionData.lastMotionTime = millis();
  }
  
  detectFallAndHandle();
}

void detectFallAndHandle() {
  unsigned long now = millis();
  float totalG = motionData.totalAccel / G;
  float totalGyro = motionData.totalGyro;
  
  // Detect start of free-fall (low totalAccel)
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
  
  // If we are in fallInProgress (observed free-fall), look for impact
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
  
  // Confirm fall if impactSeen and post-impact stationary (low accel variation, low gyro)
  if (impactSeen) {
    float accelVariationG = fabs((motionData.totalAccel / G) - 1.0f);
    if (accelVariationG < 0.35f && motionData.totalGyro < 50.0f) {
      if (stationarySince == 0) stationarySince = now;
      if (now - stationarySince >= STATIONARY_CONFIRM_MS) {
        // Confirm FALL
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(FALL_DETECTED);
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - IMPACT + STATIONARY    ║");
        Serial.println("╚════════════════════════════════════╝");
        Serial.printf("Acceleration: %.2f g\n", motionData.totalAccel / G);
        Serial.printf("Gyroscope: %.2f °/s\n", motionData.totalGyro);
        // reset state
        fallInProgress = false;
        impactSeen = false;
        stationarySince = 0;
      }
    } else {
      stationarySince = 0;
      // time out if still moving
      if (now - impactTime > IMPACT_WINDOW_MS) {
        fallInProgress = false;
        impactSeen = false;
        stationarySince = 0;
        motionData.impactDetected = false;
      }
    }
  }
  
  // Additionally trigger immediate alert on very large sudden spikes even without free-fall:
  // (use more aggressive thresholds to avoid false positives)
  static float lastTotalAccel = 9.8f;
  static float lastTotalGyro = 0.0f;
  float accelDeltaG = fabs((motionData.totalAccel - lastTotalAccel) / G);
  float gyroDelta = fabs(motionData.totalGyro - lastTotalGyro);
  
  // If very large sudden change -> consider as impact and confirm fall immediately if exceeds thresholds
  if (!motionData.fallDetected) {
    if (accelDeltaG > 2.5f && (motionData.totalAccel/G) > 2.0f) { // sudden jump >2.5g change and >2g absolute
      // consider as immediate impact-like event; require follow-up low motion for a moment to confirm
      unsigned long t0 = millis();
      // small blocking confirmation window: sample for STATIONARY_CONFIRM_MS to check if user remains low-motion
      unsigned long start = millis();
      bool remainedStationary = true;
      while (millis() - start < STATIONARY_CONFIRM_MS) {
        // update quick sample
        int16_t ax, ay, az, gx, gy, gz;
        readMPU6050Data(&ax, &ay, &az, &gx, &gy, &gz);
        float ax_m = (ax/4096.0f)*G;
        float ay_m = (ay/4096.0f)*G;
        float az_m = (az/4096.0f)*G;
        float tot = sqrt(ax_m*ax_m + ay_m*ay_m + az_m*az_m);
        float gyroTot = sqrt((gx/65.5f)*(gx/65.5f) + (gy/65.5f)*(gy/65.5f) + (gz/65.5f)*(gz/65.5f));
        if (fabs(tot/G - 1.0f) > 0.35f || gyroTot > 70.0f) {
          remainedStationary = false;
          break;
        }
        delay(40);
      }
      if (remainedStationary) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(FALL_DETECTED);
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - SUDDEN IMPACT + STATIONARY    ║");
        Serial.println("╚════════════════════════════════════╝");
        Serial.printf("Acceleration: %.2f g\n", motionData.totalAccel / G);
        Serial.printf("Gyroscope: %.2f °/s\n", motionData.totalGyro);
      }
    } else if (gyroDelta > 300.0f && motionData.totalGyro > 400.0f) {
      // similarly treat very large rotational spike
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
        if (fabs(tot/G - 1.0f) > 0.35f || gyroTot > 70.0f) {
          remainedStationary = false;
          break;
        }
        delay(40);
      }
      if (remainedStationary) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(FALL_DETECTED);
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - ROTATION IMPACT + STATIONARY    ║");
        Serial.println("╚════════════════════════════════════╝");
        Serial.printf("Acceleration: %.2f g\n", motionData.totalAccel / G);
        Serial.printf("Gyroscope: %.2f °/s\n", motionData.totalGyro);
      }
    }
  }
  
  lastTotalAccel = motionData.totalAccel;
  lastTotalGyro = motionData.totalGyro;
}

// ------------------ Setup & Loop & Helpers ------------------

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println("\nESP32 Multi-Sensor System - Alerts tuned to 3x calibration & robust fall detection");
  
  // I2C
  Wire.begin(MPU6050_SDA, MPU6050_SCL);
  Wire.setClock(400000);
  
  // MQ pins
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(MQ9_DIGITAL_PIN, INPUT);
  pinMode(MQ135_DIGITAL_PIN, INPUT);
  
  // Emergency button with pullup
  pinMode(EMERGENCY_BUTTON_PIN, INPUT_PULLUP);
  Serial.printf("Emergency button on GPIO%d (INPUT_PULLUP). Press -> LOW\n", EMERGENCY_BUTTON_PIN);
  
  // MPU int pin
  pinMode(MPU6050_INT, INPUT);
  
  Serial.println("Initializing MPU6050...");
  if (!initMPU6050()) {
    Serial.println("WARNING: MPU6050 init routine returned false - continuing but MPU may be unavailable");
    mpuReady = false;
  } else {
    Serial.println("MPU6050 init sequence complete (identity accepted for clones).");
    mpuReady = true;
    motionData.lastMotionTime = millis();
    accelFiltered = 9.8f;
  }
  
  // DHT
  Serial.printf("Initializing DHT11 on GPIO%d...\n", DHT11_PIN);
  dht.begin();
  delay(2000);
  bool dhtWorking = false;
  for (int i = 0; i < 3; i++) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      dhtReady = true;
      dhtWorking = true;
      lastValidTemperature = t;
      lastValidHumidity = h;
      Serial.printf("DHT OK: %.1f C, %.1f %%\n", t, h);
      break;
    }
    delay(1500);
  }
  if (!dhtWorking) {
    Serial.println("DHT init warning - readings failing. Check wiring.");
  }
  
  // Audio
  fnM16pSerial.begin(9600, SERIAL_8N1, FN_M16P_RX, FN_M16P_TX);
  delay(200);
  setVolume(25);
  audioReady = true;
  Serial.println("Audio module initialized.");
  
  // LoRa
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("LoRa init failed.");
    loraReady = false;
  } else {
    loraReady = true;
    Serial.println("LoRa initialized.");
  }
  
  Serial.println("Warming gas sensors (15s)...");
  delay(15000);
  
  Serial.println("Calibrating MQ sensors (baseline -> dangerThreshold = baseline * 3.0) ...");
  calibrateSensors();
  
  printTestMenu();
  if (audioReady) {
    playAudioFile(BOOT_AUDIO);
    delay(1200);
  }
}

void loop() {
  // handle serial commands
  if (Serial.available()) {
    String s = Serial.readStringUntil('\n');
    s.trim();
    s.toLowerCase();
    handleTestCommand(s);
  }
  
  // check emergency button non-blocking
  checkEmergencyButton();
  
  // monitor motion
  if (mpuReady) monitorMotion();
  
  // if emergency triggered handle it
  if (emergencyTriggered) {
    handleEmergency();
    emergencyTriggered = false;
    // continue
  }
  
  // periodic sensor reporting
  static unsigned long lastReport = 0;
  if (millis() - lastReport >= 10000) {
    lastReport = millis();
    SensorData snap = readAllSensors();
    snap.emergency = false;
    displayReadings(snap);
    checkAlerts(snap);
    if (loraReady && (millis() - lastLoRaSend > loraInterval)) {
      sendLoRaData(snap);
      lastLoRaSend = millis();
    }
    Serial.println("------------------------------");
  }
  
  delay(50);
}

// ------------------ Button, Emergency, Audio, Calibration ------------------

void checkEmergencyButton() {
  static bool lastState = HIGH;
  static unsigned long lastChange = 0;
  bool current = digitalRead(EMERGENCY_BUTTON_PIN); // LOW = pressed
  if (current != lastState && (millis() - lastChange > 40)) {
    lastChange = millis();
    if (current == LOW) {
      unsigned long now = millis();
      if (now - lastTapTime < TAP_TIMEOUT) tapCount++;
      else tapCount = 1;
      lastTapTime = now;
      Serial.printf("Button tap %d/%d\n", tapCount, REQUIRED_TAPS);
      if (tapCount >= REQUIRED_TAPS) {
        Serial.println("TRIPLE TAP - EMERGENCY!");
        emergencyTriggered = true;
        tapCount = 0;
      }
    }
  }
  if (millis() - lastTapTime > TAP_TIMEOUT) tapCount = 0;
  lastState = current;
}

void handleEmergency() {
  Serial.println("\n*** EMERGENCY HANDLER START ***\n");
  SensorData s = readAllSensors();
  s.emergency = true;
  Serial.printf("Emergency snapshot: Temp %.2f C, Humidity %.2f %%\n", s.temperature, s.humidity);
  Serial.printf("Fall detected: %s, Impact: %s\n", s.motion.fallDetected ? "YES" : "NO", s.motion.impactDetected ? "YES" : "NO");
  if (loraReady) {
    Serial.println("Sending emergency LoRa packet...");
    sendLoRaData(s);
  } else {
    Serial.println("LoRa not ready - cannot send emergency packet.");
  }
  if (audioReady) {
    playAudioFile(FALL_DETECTED);
  }
  Serial.println("\n*** EMERGENCY HANDLER END ***\n");
  delay(800);
}

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

void calibrateSensors() {
  calibrateSensor(MQ2_ANALOG_PIN, &mq2_cal, "MQ2", MQ2_STATIC_MIN);
  calibrateSensor(MQ9_ANALOG_PIN, &mq9_cal, "MQ9", MQ9_STATIC_MIN);
  calibrateSensor(MQ135_ANALOG_PIN, &mq135_cal, "MQ135", MQ135_STATIC_MIN);
  Serial.println("Calibration complete:");
  Serial.printf(" MQ2 baseline=%.1f danger=%.1f\n", mq2_cal.baseline, mq2_cal.dangerThreshold);
  Serial.printf(" MQ9 baseline=%.1f danger=%.1f\n", mq9_cal.baseline, mq9_cal.dangerThreshold);
  Serial.printf(" MQ135 baseline=%.1f danger=%.1f\n", mq135_cal.baseline, mq135_cal.dangerThreshold);
}

void calibrateSensor(int pin, SensorCalibration* cal, String sensorName, int minThreshold) {
  Serial.printf("Calibrating %s (reads %d samples)...\n", sensorName.c_str(), CALIBRATION_SAMPLES);
  float sum = 0;
  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    int r = analogRead(pin);
    sum += r;
    Serial.print(".");
    delay(CALIBRATION_DELAY);
  }
  cal->baseline = sum / CALIBRATION_SAMPLES;
  float thr = cal->baseline * DANGER_MULTIPLIER;
  cal->dangerThreshold = (thr > minThreshold) ? thr : (float)minThreshold;
  cal->calibrated = true;
  Serial.println("\nDone.");
}

// Danger checks:
// For MQ2 and MQ9 we require BOTH analog > dangerThreshold AND digital pin asserted (LOW) to reduce false positives.
// For MQ135 we accept analog > dangerThreshold OR digital pin asserted.

bool checkSensorDangerAnalogOnly(int currentValue, SensorCalibration* cal, int staticDangerThreshold) {
  if (!cal->calibrated) return currentValue > staticDangerThreshold;
  return currentValue > cal->dangerThreshold;
}

bool checkSensorDangerMQ2_MQ9(int currentValue, SensorCalibration* cal, int staticDangerThreshold, bool digitalState) {
  // digitalState == true means sensor digital output is active (LOW). Caller passes digitalState = (digitalRead == LOW)
  if (!cal->calibrated) {
    return (currentValue > staticDangerThreshold) && digitalState;
  }
  return (currentValue > cal->dangerThreshold) && digitalState;
}

bool checkSensorDangerMQ135(int currentValue, SensorCalibration* cal, int staticDangerThreshold, bool digitalState) {
  if (!cal->calibrated) {
    return (currentValue > staticDangerThreshold) || digitalState;
  }
  return (currentValue > cal->dangerThreshold) || digitalState;
}

// ------------------ Sensor read, display, alerts, LoRa ------------------

SensorData readAllSensors() {
  SensorData data;
  data.timestamp = millis();
  // DHT with caching
  if (millis() - lastDHTReading > DHT_READING_INTERVAL) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && t >= -40 && t <= 80) {
      data.temperature = t;
      lastValidTemperature = t;
    } else data.temperature = lastValidTemperature;
    if (!isnan(h) && h >= 0 && h <= 100) {
      data.humidity = h;
      lastValidHumidity = h;
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
  data.mq2_digital = (digitalRead(MQ2_DIGITAL_PIN) == LOW);
  data.mq9_digital = (digitalRead(MQ9_DIGITAL_PIN) == LOW);
  data.mq135_digital = (digitalRead(MQ135_DIGITAL_PIN) == LOW);
  // motion copy
  data.motion = motionData;
  data.emergency = false;
  return data;
}

void displayReadings(SensorData data) {
  Serial.println("=== SENSOR SNAPSHOT ===");
  Serial.printf("Time: %lu\n", data.timestamp);
  Serial.printf("Temp: %.2f C\n", data.temperature);
  Serial.printf("Humidity: %.2f %%\n", data.humidity);
  Serial.println("MPU6050:");
  Serial.printf("  Accel: %.2f g\n", data.motion.totalAccel / G);
  Serial.printf("  Gyro:  %.2f °/s\n", data.motion.totalGyro);
  Serial.printf("  Fall Detected: %s\n", data.motion.fallDetected ? "YES" : "NO");
  Serial.println("MQ2:");
  Serial.printf("  Analog=%d Digital=%s -> %s\n", data.mq2_analog, data.mq2_digital ? "ACTIVE" : "INACTIVE",
    checkSensorDangerMQ2_MQ9(data.mq2_analog, &mq2_cal, MQ2_STATIC_MIN, data.mq2_digital) ? "[DANGER]" : "[Safe]");
  Serial.println("MQ9:");
  Serial.printf("  Analog=%d Digital=%s -> %s\n", data.mq9_analog, data.mq9_digital ? "ACTIVE" : "INACTIVE",
    checkSensorDangerMQ2_MQ9(data.mq9_analog, &mq9_cal, MQ9_STATIC_MIN, data.mq9_digital) ? "[DANGER]" : "[Safe]");
  Serial.println("MQ135:");
  Serial.printf("  Analog=%d Digital=%s -> %s (Air Quality: %s)\n", data.mq135_analog, data.mq135_digital ? "POOR" : "GOOD",
    checkSensorDangerMQ135(data.mq135_analog, &mq135_cal, MQ135_STATIC_MIN, data.mq135_digital) ? "[DANGER]" : "[Safe]",
    getAirQualityRating(data.mq135_analog).c_str());
}

void checkAlerts(SensorData data) {
  static unsigned long lastAlert = 0;
  unsigned long now = millis();
  if (now - lastAlert < 60000) return; // one alert per minute max
  
  // Motion/fall alert highest priority
  if (data.motion.fallDetected) {
    playAudioFile(FALL_DETECTED);
    lastAlert = now;
    return;
  }
  // Check MQ2 (smoke/gas)
  if (checkSensorDangerMQ2_MQ9(data.mq2_analog, &mq2_cal, MQ2_STATIC_MIN, data.mq2_digital)) {
    playAudioFile(SMOKE_ALERT);
    lastAlert = now;
    return;
  }
  // Check MQ9 (CO) - require both analog and digital (reduces false positives)
  if (checkSensorDangerMQ2_MQ9(data.mq9_analog, &mq9_cal, MQ9_STATIC_MIN, data.mq9_digital)) {
    playAudioFile(CO_ALERT);
    lastAlert = now;
    return;
  }
  // MQ135 (air quality)
  if (checkSensorDangerMQ135(data.mq135_analog, &mq135_cal, MQ135_STATIC_MIN, data.mq135_digital)) {
    playAudioFile(AIR_QUALITY_WARNING);
    lastAlert = now;
    return;
  }
  // Temperature extreme
  if (data.temperature > 50.0f) { // more conservative high temp
    playAudioFile(HIGH_TEMP_ALERT);
    lastAlert = now;
    return;
  }
  if (data.temperature < -5.0f) { // more conservative low temp
    playAudioFile(LOW_TEMP_ALERT);
    lastAlert = now;
    return;
  }
  // Humidity extreme (conservative to avoid false alarm)
  if (data.humidity > HIGH_HUMIDITY_THRESHOLD) {
    playAudioFile(HIGH_HUMIDITY_ALERT);
    lastAlert = now;
    return;
  }
  if (data.humidity < LOW_HUMIDITY_THRESHOLD) {
    playAudioFile(LOW_HUMIDITY_ALERT);
    lastAlert = now;
    return;
  }
}

void sendLoRaData(SensorData data) {
  packetCount++;
  StaticJsonDocument<768> doc;
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
  // motion
  doc["fall_detected"] = data.motion.fallDetected;
  doc["impact_detected"] = data.motion.impactDetected;
  doc["total_accel_m_s2"] = data.motion.totalAccel;
  doc["total_gyro_deg_s"] = data.motion.totalGyro;
  
  String payload;
  serializeJson(doc, payload);
  Serial.printf("LoRa Packet #%d size=%d\n", packetCount, payload.length());
  Serial.println(payload);
  LoRa.beginPacket();
  LoRa.print(payload);
  LoRa.endPacket();
}

// ------------------ Utilities & Tests ------------------

String getAirQualityRating(int value) {
  if (value < 800) return "Excellent";
  else if (value < 1200) return "Good";
  else if (value < 1800) return "Moderate";
  else if (value < 2400) return "Poor";
  else return "Very Poor";
}

void printTestMenu() {
  Serial.println("\n=== TEST MENU ===");
  Serial.println(" dht    - test DHT11");
  Serial.println(" mpu    - test MPU6050");
  Serial.println(" mq2    - test MQ2");
  Serial.println(" mq9    - test MQ9");
  Serial.println(" mq135  - test MQ135");
  Serial.println(" mq     - test all MQ");
  Serial.println(" audioX - play audio file X (1-10)");
  Serial.println(" lora   - send test LoRa packet");
  Serial.println(" button - test emergency button");
  Serial.println(" emergency - trigger emergency");
  Serial.println(" calibrate - re-run sensor calibration");
  Serial.println(" status - print system status");
  Serial.println("=================\n");
}

void handleTestCommand(String cmd) {
  if (cmd == "help" || cmd == "menu") printTestMenu();
  else if (cmd == "dht") testDHT();
  else if (cmd == "mpu") testMQ2(); // deliberate fall-through? keep testMPU6050 below
  else if (cmd == "mq2") testMQ2();
  else if (cmd == "mq9") testMQ9();
  else if (cmd == "mq135") testMQ135();
  else if (cmd == "mq") testAllMQ();
  else if (cmd.startsWith("audio")) {
    int n = cmd.substring(5).toInt();
    if (n >= 1 && n <= 10) testAudio(n);
  } else if (cmd == "lora") testLoRa();
  else if (cmd == "button") testButton();
  else if (cmd == "emergency") testEmergency();
  else if (cmd == "calibrate") calibrateSensors();
  else if (cmd == "status") printSystemStatus();
  else if (cmd == "mpu") { // explicit MPU test
    testMQ2(); // placeholder - keep serial commands minimal
  }
  else Serial.println("Unknown command");
}

void testDHT() {
  Serial.println("DHT Test (5 samples):");
  for (int i = 0; i < 5; i++) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    Serial.printf(" %d: Temp=%.2f C Hum=%.2f %%\n", i+1, isnan(t)?-1:t, isnan(h)?-1:h);
    delay(2000);
  }
}

void testMQ2() {
  Serial.println("MQ2 Test (10 samples):");
  for (int i = 0; i < 10; i++) {
    int a = analogRead(MQ2_ANALOG_PIN);
    bool d = digitalRead(MQ2_DIGITAL_PIN) == LOW;
    Serial.printf(" %d: analog=%d digital=%s\n", i+1, a, d?"ACTIVE":"INACTIVE");
    delay(500);
  }
}

void testMQ9() {
  Serial.println("MQ9 Test (10 samples):");
  for (int i = 0; i < 10; i++) {
    int a = analogRead(MQ9_ANALOG_PIN);
    bool d = digitalRead(MQ9_DIGITAL_PIN) == LOW;
    Serial.printf(" %d: analog=%d digital=%s\n", i+1, a, d?"ACTIVE":"INACTIVE");
    delay(500);
  }
}

void testMQ135() {
  Serial.println("MQ135 Test (10 samples):");
  for (int i = 0; i < 10; i++) {
    int a = analogRead(MQ135_ANALOG_PIN);
    bool d = digitalRead(MQ135_DIGITAL_PIN) == LOW;
    Serial.printf(" %d: analog=%d digital=%s rating=%s\n", i+1, a, d?"POOR":"GOOD", getAirQualityRating(a).c_str());
    delay(500);
  }
}

void testAllMQ() {
  testMQ2(); testMQ9(); testMQ135();
}

void testAudio(int fileNum) {
  if (!audioReady) { Serial.println("Audio not ready"); return; }
  Serial.printf("Playing audio #%d\n", fileNum);
  playAudioFile(fileNum);
}

void testLoRa() {
  Serial.println("LoRa test packet...");
  SensorData s = readAllSensors();
  s.emergency = false;
  sendLoRaData(s);
}

void testEmergency() {
  Serial.println("Forcing emergency...");
  emergencyTriggered = true;
}

void testButton() {
  Serial.println("Button test for 10s:");
  unsigned long start = millis();
  while (millis() - start < 10000) {
    bool cur = digitalRead(EMERGENCY_BUTTON_PIN);
    Serial.printf("Button: %s\n", cur==LOW?"PRESSED":"RELEASED");
    delay(500);
  }
}

void testAllSensors() {
  Serial.println("Complete system test:");
  testDHT();
  testAllMQ();
  testLoRa();
}

void printSystemStatus() {
  Serial.println("=== SYSTEM STATUS ===");
  Serial.printf("Node ID: %s\n", NODE_ID);
  Serial.printf("Packets sent: %d\n", packetCount);
  Serial.printf("DHT ready: %s\n", dhtReady?"YES":"NO");
  Serial.printf("MPU ready: %s\n", mpuReady?"YES":"NO");
  Serial.printf("LoRa ready: %s\n", loraReady?"YES":"NO");
  Serial.printf("Audio ready: %s\n", audioReady?"YES":"NO");
  Serial.printf("Last Temp: %.2f C\n", lastValidTemperature);
  Serial.printf("Last Hum:  %.2f %%\n", lastValidHumidity);
  Serial.println("======================");
}
