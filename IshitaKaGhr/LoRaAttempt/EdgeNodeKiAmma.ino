/*
  edge_node_espnow.ino
  Edge Node with ESP-NOW integration for wristband vitals & text relay.
  Full, self-contained sketch. Make sure to copy the entire file into Arduino IDE,
  no extra lines above the first #include.
*/

#include <Wire.h>
#include <HardwareSerial.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <math.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// ========================= MPU6050 I2C Register Definitions =========================
#define MPU6050_ADDR 0x68
#define PWR_MGMT_1   0x6B
#define ACCEL_XOUT_H 0x3B
#define GYRO_XOUT_H  0x43
#define CONFIG       0x1A
#define GYRO_CONFIG  0x1B
#define ACCEL_CONFIG 0x1C
#define WHO_AM_I     0x75

// ========================= Pin definitions (preserved) =========================
// MQ sensors
#define MQ2_DIGITAL_PIN 27
#define MQ2_ANALOG_PIN 32
#define MQ9_DIGITAL_PIN 14
#define MQ9_ANALOG_PIN 33
#define MQ135_DIGITAL_PIN 13
#define MQ135_ANALOG_PIN 35

// FN-M16P Audio Module pins (UART2)
#define FN_M16P_RX 16
#define FN_M16P_TX 17

// DHT11 pin
#define DHT11_PIN 25
#define DHT_TYPE DHT11

// MPU6050 pins (I2C)
#define MPU6050_SDA 21
#define MPU6050_SCL 22
#define MPU6050_INT 34

// LoRa Module pins (SPI)
#define LORA_SCK 18
#define LORA_MISO 19
#define LORA_MOSI 23
#define LORA_SS 5
#define LORA_RST 4
#define LORA_DIO0 26

// EMERGENCY BUTTON PIN
#define EMERGENCY_BUTTON_PIN 15

// LoRa frequency
#define LORA_BAND 433E6

// ========================= System constants =========================
#define NODE_ID "001"

#define MQ2_DANGER_THRESHOLD 1000
#define MQ9_DANGER_THRESHOLD 3800
#define MQ135_DANGER_THRESHOLD 1800

#define FALLBACK_TEMPERATURE 27.0
#define FALLBACK_HUMIDITY 47.0

#define CALIBRATION_SAMPLES 10
#define DANGER_MULTIPLIER 2.0
#define CALIBRATION_DELAY 2000

bool pendingEmergency = false;

const int TAP_TIMEOUT = 600;
const int REQUIRED_TAPS = 3;

const byte FRAME_START = 0x7E;
const byte FRAME_END = 0xEF;
const byte VERSION = 0xFF;
const byte NO_FEEDBACK = 0x00;
const byte WITH_FEEDBACK = 0x01;
const byte CMD_PLAY_TRACK = 0x03;
const byte CMD_VOLUME = 0x06;
const byte CMD_STOP = 0x16;

// Audio files mapping
enum AudioFiles {
  BOOT_AUDIO = 1,              // 0001.mp3 - System Boot
  SMOKE_ALERT = 2,             // 0002.mp3 - Smoke and Gas
  CO_ALERT = 3,                // 0003.mp3 - Carbon Monoxide
  AIR_QUALITY_WARNING = 4,     // 0004.mp3 - Air Quality Warning
  HIGH_TEMP_ALERT = 5,         // 0005.mp3 - High Temperature
  LOW_TEMP_ALERT = 6,          // 0006.mp3 - Low Temperature
  HIGH_HUMIDITY_ALERT = 7,     // 0007.mp3 - High Humidity
  LOW_HUMIDITY_ALERT = 8,      // 0008.mp3 - Low Humidity
  MESSAGE_RECEIVED = 9,        // 0009.mp3 - NEW: Message received on wristband
  EMERGENCY_TRIPLE_TAP = 10,   // 0010.mp3 - NEW: Triple tap emergency
  FALL_ALERT = 11              // 0011.mp3 - NEW: Fall detection alert
};

// ========================= ESP-NOW message types =========================
#define MSG_TYPE_VITALS 0x01
#define MSG_TYPE_TEXT   0x02
#define MSG_TYPE_ACK    0x03

#define MAX_TEXT_LEN 128

typedef struct __attribute__((packed)) {
  uint8_t msgType;
  uint8_t bpm;
  uint8_t spo2;
  uint8_t finger;
  int8_t temperature;   // body temp from wristband (°C)
  uint32_t timestamp;
} espnow_vitals_t;

typedef struct __attribute__((packed)) {
  uint8_t msgType;        // MSG_TYPE_TEXT
  uint32_t messageId;
  uint8_t length;
  char text[MAX_TEXT_LEN];
} espnow_text_t;

typedef struct __attribute__((packed)) {
  uint8_t msgType;        // MSG_TYPE_ACK
  uint32_t messageId;
  uint8_t success;        // 0/1
} espnow_ack_t;

// ========================= Types & Globals =========================
struct SensorCalibration {
  float baseline;
  float dangerThreshold;
  bool calibrated;
};

struct MotionData {
  float totalAccel;
  float totalGyro;
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

SensorCalibration mq2_cal = {0,0,false};
SensorCalibration mq9_cal = {0,0,false};
SensorCalibration mq135_cal = {0,0,false};

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

// Motion variables
MotionData motionData = {0};

// MPU internals
const float G = 9.80665f;
const float FREE_FALL_G_THRESHOLD = 0.6f;
const unsigned long FREE_FALL_MIN_MS = 120;
const float IMPACT_G_THRESHOLD = 3.5f;
const unsigned long IMPACT_WINDOW_MS = 1200;
const unsigned long STATIONARY_CONFIRM_MS = 800;
const float ROTATION_IMPACT_THRESHOLD = 400.0f;

bool inFreeFall = false;
bool fallInProgress = false;
bool impactSeen = false;
unsigned long freeFallStart = 0;
unsigned long fallStartTime = 0;
unsigned long impactTime = 0;
unsigned long stationarySince = 0;
float accelFiltered = G;
const float ALPHA = 0.85f;

unsigned long lastI2CAttempt = 0;

// ========================= ESP-NOW / Wristband status globals =========================
struct WristbandStatus {
  uint8_t bpm;
  uint8_t spo2;
  bool fingerDetected;
  float bodyTemp;
  unsigned long lastUpdate;
  bool connected;
  uint32_t lastMessageId;
  bool messageAcknowledged;
} wristbandStatus = {0, 0, false, 0.0f, 0, false, 0, false};

// Wristband MAC address (update if different)
uint8_t wristbandMac[6] = {0x0C, 0x4E, 0xA0, 0x66, 0xB2, 0x78}; 

bool espnowReady = false;
esp_err_t lastEspNowSendStatus = ESP_OK;
uint32_t outgoingMessageCounter = 1;

unsigned long messagesRelayedToWristband = 0; 

// ========================= Forward declarations =========================
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
void scanI2CDevices();
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

// I2C helpers & MPU
bool i2cBusRecover();
bool safeWireRequest(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len, int retries=3);
bool safeWireWrite(uint8_t addr, uint8_t reg, uint8_t val, int retries=3);
bool initMPU6050();
void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz);
void monitorMotion();
void detectFallAndHandle();

// ESP-NOW
void initESPNOW();
void onDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len);
void onDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status);
bool sendTextToWristband(const String &message);
void checkWristbandConnection();
void receiveLoRaMessages();

// -------------------------- Implementations --------------------------
// I2C recovery & safeWire
bool i2cBusRecover() {
  Wire.end();
  delay(10);
  pinMode(MPU6050_SCL, OUTPUT);
  pinMode(MPU6050_SDA, INPUT_PULLUP);
  if (digitalRead(MPU6050_SDA) == HIGH) {
    Wire.begin(MPU6050_SDA, MPU6050_SCL);
    Wire.setClock(100000);
    return true;
  }
  for (int i=0;i<9;i++) {
    digitalWrite(MPU6050_SCL, HIGH);
    delayMicroseconds(500);
    digitalWrite(MPU6050_SCL, LOW);
    delayMicroseconds(500);
    if (digitalRead(MPU6050_SDA) == HIGH) break;
  }
  pinMode(MPU6050_SDA, OUTPUT);
  digitalWrite(MPU6050_SDA, LOW);
  delayMicroseconds(200);
  digitalWrite(MPU6050_SCL, HIGH);
  delayMicroseconds(200);
  digitalWrite(MPU6050_SDA, HIGH);
  delayMicroseconds(200);
  Wire.begin(MPU6050_SDA, MPU6050_SCL);
  Wire.setClock(100000);
  pinMode(MPU6050_SDA, INPUT_PULLUP);
  pinMode(MPU6050_SCL, INPUT_PULLUP);
  return digitalRead(MPU6050_SDA) == HIGH;
}

bool safeWireRequest(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len, int retries) {
  for (int attempt=0; attempt<retries; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    uint8_t rc = Wire.endTransmission(false);
    if (rc != 0) {
      delay(20);
      if (attempt == retries - 1) i2cBusRecover();
      continue;
    }
    delay(5);
    uint8_t received = Wire.requestFrom((uint8_t)addr, (uint8_t)len, (uint8_t)true);
    if (received == len) {
      for (size_t i=0;i<len;i++) buf[i] = Wire.read();
      return true;
    }
    delay(20);
    if (attempt == retries - 1) i2cBusRecover();
  }
  return false;
}

bool safeWireWrite(uint8_t addr, uint8_t reg, uint8_t val, int retries) {
  for (int attempt=0; attempt<retries; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(val);
    uint8_t r = Wire.endTransmission(true);
    if (r == 0) {
      delay(10);
      return true;
    }
    delay(20);
    if (attempt == retries - 1) i2cBusRecover();
  }
  return false;
}

// MPU init
bool initMPU6050() {
  if (millis() - lastI2CAttempt < 500) return false;
  lastI2CAttempt = millis();
  Serial.println("Attempting MPU6050 initialization with clone-friendly settings...");
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(PWR_MGMT_1);
  Wire.write(0x00);
  Wire.endTransmission(true);
  delay(100);
  uint8_t who = 0x00;
  uint8_t buf[1];
  bool ok = false;
  for (int i = 0; i < 5; i++) {
    ok = safeWireRequest(MPU6050_ADDR, WHO_AM_I, buf, 1, 5);
    if (ok) {
      who = buf[0];
      if (who != 0x00) break;
    }
    delay(50 * (i + 1));
  }
  Serial.printf("MPU6050 WHO_AM_I = 0x%02X (after %d attempts)\n", who, ok ? 1 : 5);
  if (ok && who != 0x00) {
    if (who == 0x68 || who == 0x69) Serial.println("✓ MPU6050 genuine chip detected");
    else if (who == 0x72) Serial.println("✓ MPU6050 clone detected (0x72)");
    else Serial.printf("⚠ Unexpected WHO_AM_I (0x%02X) - attempting initialization anyway\n", who);
  } else {
    Serial.println("⚠ WHO_AM_I read failed - trying alternative initialization...");
    uint8_t accelBuf[6];
    bool accelOk = safeWireRequest(MPU6050_ADDR, ACCEL_XOUT_H, accelBuf, 6, 5);
    if (accelOk) {
      int16_t ax = (int16_t)((accelBuf[0]<<8) | accelBuf[1]);
      int16_t ay = (int16_t)((accelBuf[2]<<8) | accelBuf[3]);
      int16_t az = (int16_t)((accelBuf[4]<<8) | accelBuf[5]);
      if (!(ax==0 && ay==0 && az==0) && abs(ax) < 32000 && abs(ay) < 32000 && abs(az) < 32000) {
        Serial.println("✓ Accelerometer responding - proceeding despite WHO_AM_I failure");
      } else {
        Serial.println("✗ Device not responding properly - check wiring");
        return false;
      }
    } else {
      Serial.println("✗ Cannot communicate with device - check wiring and power");
      return false;
    }
  }
  Serial.println("Configuring MPU6050 with clone-friendly settings...");
  if (!safeWireWrite(MPU6050_ADDR, PWR_MGMT_1, 0x01, 5)) { Serial.println("✗ Failed to set power management"); return false; }
  delay(100);
  if (!safeWireWrite(MPU6050_ADDR, 0x19, 0x07, 5)) Serial.println("  ⚠ Failed to set sample rate (continuing anyway)");
  else Serial.println("  ✓ Sample rate configured");
  delay(50);
  if (!safeWireWrite(MPU6050_ADDR, CONFIG, 0x06, 5)) Serial.println("  ⚠ Failed to set DLPF (continuing anyway)");
  else Serial.println("  ✓ DLPF configured");
  delay(50);
  if (!safeWireWrite(MPU6050_ADDR, GYRO_CONFIG, 0x08, 5)) Serial.println("  ⚠ Failed to set gyro config (continuing anyway)");
  else Serial.println("  ✓ Gyroscope configured (±500°/s)");
  delay(50);
  if (!safeWireWrite(MPU6050_ADDR, ACCEL_CONFIG, 0x10, 5)) Serial.println("  ⚠ Failed to set accel config (continuing anyway)");
  else Serial.println("  ✓ Accelerometer configured (±8g)");
  delay(100);
  uint8_t testBuf[1];
  if (safeWireRequest(MPU6050_ADDR, PWR_MGMT_1, testBuf, 1, 3)) Serial.printf("  ✓ Verification: PWR_MGMT_1 = 0x%02X\n", testBuf[0]);
  Serial.println("✓ MPU6050 initialization complete!");
  return true;
}

void readMPU6050Data(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz) {
  uint8_t buf[14];
  if (!safeWireRequest(MPU6050_ADDR, ACCEL_XOUT_H, buf, 14, 2)) {
    *ax = *ay = *az = *gx = *gy = *gz = 0;
    return;
  }
  *ax = (int16_t)((buf[0]<<8) | buf[1]);
  *ay = (int16_t)((buf[2]<<8) | buf[3]);
  *az = (int16_t)((buf[4]<<8) | buf[5]);
  *gx = (int16_t)((buf[8]<<8) | buf[9]);
  *gy = (int16_t)((buf[10]<<8) | buf[11]);
  *gz = (int16_t)((buf[12]<<8) | buf[13]);
}

// Motion monitor & fall detection
void monitorMotion() {
  if (!mpuReady) return;
  int16_t axr=0, ayr=0, azr=0, gxr=0, gyr=0, gzr=0;
  readMPU6050Data(&axr,&ayr,&azr,&gxr,&gyr,&gzr);
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
  } else motionData.motionDetected = false;
  detectFallAndHandle();
}

void detectFallAndHandle() {
  unsigned long now = millis();
  float totG = motionData.totalAccel / G;
  float totGyro = motionData.totalGyro;
  if (totG < FREE_FALL_G_THRESHOLD) {
    if (!inFreeFall) { inFreeFall = true; freeFallStart = now; }
    else if ((now - freeFallStart) >= FREE_FALL_MIN_MS && !fallInProgress) {
      fallInProgress = true;
      fallStartTime = now;
      impactSeen = false;
      motionData.impactDetected = false;
    }
  } else { if (inFreeFall) inFreeFall = false; }
  if (fallInProgress && !impactSeen) {
    if (totG >= IMPACT_G_THRESHOLD || totGyro >= ROTATION_IMPACT_THRESHOLD) {
      impactSeen = true; impactTime = now; motionData.impactDetected = true;
    } else if (now - fallStartTime > IMPACT_WINDOW_MS) { fallInProgress = false; impactSeen = false; motionData.impactDetected = false; }
  }
  if (impactSeen) {
    float accelVariationG = fabs((motionData.totalAccel / G) - 1.0f);
    if (accelVariationG < 0.35f && motionData.totalGyro < 50.0f) {
      if (stationarySince == 0) stationarySince = now;
      if (now - stationarySince >= STATIONARY_CONFIRM_MS) {
        motionData.fallDetected = true;
        emergencyTriggered = true;
        if (audioReady) playAudioFile(EMERGENCY_TRIPLE_TAP);  
        Serial.println("\n╔════════════════════════════════════╗");
        Serial.println("║    FALL CONFIRMED - IMPACT + STATIONARY   ║");
        Serial.println("╚════════════════════════════════════╝");
        Serial.printf("Acceleration: %.2f g\n", motionData.totalAccel / G);
        Serial.printf("Gyroscope: %.2f °/s\n", motionData.totalGyro);
        fallInProgress = false; impactSeen = false; stationarySince = 0;
      }
    } else {
      stationarySince = 0;
      if (now - impactTime > IMPACT_WINDOW_MS) { fallInProgress = false; impactSeen = false; stationarySince = 0; motionData.impactDetected = false; }
    }
  }
}

// Air Quality Rating function
String getAirQualityRating(int value) {
  if (value < 800) return "Excellent";
  else if (value < 1200) return "Good";
  else if (value < 1800) return "Moderate";
  else if (value < 2400) return "Poor";
  else return "Very Poor";
}

// Emergency Button handler
void checkEmergencyButton() {
  static bool lastState = HIGH; // using INPUT_PULLUP -> HIGH when released
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

// Emergency Handler function
void handleEmergency() {
  Serial.println("\n████████ EMERGENCY MODE █████████");
  
  // Play emergency audio FIRST before doing anything else
  if (audioReady) {
    playAudioFile(EMERGENCY_TRIPLE_TAP);  // Play 0010.mp3 for triple tap emergency
    Serial.println("✓ Playing emergency triple-tap audio");
    delay(100);  // Small delay to ensure audio command is sent
  }
  
  // Set the pending emergency flag so the main loop will send it
  pendingEmergency = true;
  
  SensorData s = readAllSensors();
  s.emergency = true;
  s.motion = motionData;
  
  Serial.println("EMERGENCY SNAPSHOT:");
  Serial.printf(" Temp: %.2f C  Hum: %.2f %%\n", s.temperature, s.humidity);
  Serial.printf(" MQ2:%d MQ9:%d MQ135:%d\n", s.mq2_analog, s.mq9_analog, s.mq135_analog);
  Serial.printf(" Fall: %s\n", s.motion.fallDetected ? "YES":"NO");
  
  // Send emergency packet immediately
  if (loraReady) {
    sendLoRaData(s);
    Serial.println("✓ Emergency packet sent via LoRa");
  } else {
    Serial.println("⚠ LoRa not ready - emergency packet queued");
  }
  
  delay(500);  // Give some time for audio to play
}

// -------------------------- Setup & Loop --------------------------
/*
  COMPLETE SETUP AND LOOP FOR EDGE NODE
  Optimized boot sequence to prevent conflicts between:
  - LoRa (SPI)
  - ESP-NOW (WiFi)
  - MPU6050 (I2C)
  - All other peripherals
*/

// ==================== SETUP FUNCTION ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n");
  Serial.println("╔════════════════════════════════════════════════════╗");
  Serial.println("║   ESP32 Multi-Sensor Edge Node v3.0               ║");
  Serial.println("║   Optimized Boot Sequence                          ║");
  Serial.println("╚════════════════════════════════════════════════════╝\n");
  
  // ========================================
  // PHASE 1: GPIO INITIALIZATION (No conflicts)
  // ========================================
  Serial.println("PHASE 1: Initializing GPIO pins...");
  
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(MQ9_DIGITAL_PIN, INPUT);
  pinMode(MQ135_DIGITAL_PIN, INPUT);
  pinMode(EMERGENCY_BUTTON_PIN, INPUT_PULLUP);
  pinMode(MPU6050_INT, INPUT);
  
  Serial.println("✓ GPIO pins configured");
  delay(100);
  
  // ========================================
  // PHASE 2: I2C INITIALIZATION (MPU6050)
  // Do this BEFORE SPI to avoid bus conflicts
  // ========================================
  Serial.println("\nPHASE 2: Initializing I2C (MPU6050)...");
  
  Wire.begin(MPU6050_SDA, MPU6050_SCL);
  Wire.setClock(100000);  // 100kHz for compatibility
  pinMode(MPU6050_SDA, INPUT_PULLUP);
  pinMode(MPU6050_SCL, INPUT_PULLUP);
  delay(100);
  
  // Multiple attempts for MPU6050 (clones can be finicky)
  mpuReady = false;
  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.printf("  MPU6050 initialization attempt %d/3...\n", attempt);
    if (initMPU6050()) {
      mpuReady = true;
      Serial.println("✓ MPU6050 initialized successfully");
      motionData.lastMotionTime = millis();
      accelFiltered = G;
      break;
    }
    delay(500);
  }
  
  if (!mpuReady) {
    Serial.println("⚠ MPU6050 initialization failed - motion features disabled");
    Serial.println("  System will continue without motion detection");
  }
  delay(200);
  
  // ========================================
  // PHASE 3: SPI INITIALIZATION (LoRa)
  // Do this BEFORE WiFi to claim SPI bus
  // ========================================
  Serial.println("\nPHASE 3: Initializing SPI (LoRa)...");
  
  // Prepare LoRa pins
  pinMode(LORA_SS, OUTPUT);
  digitalWrite(LORA_SS, HIGH);
  pinMode(LORA_RST, OUTPUT);
  digitalWrite(LORA_RST, HIGH);
  
  // Initialize SPI bus
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  delay(50);
  
  // Set LoRa pins
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  // Hardware reset sequence
  digitalWrite(LORA_RST, LOW);
  delay(10);
  digitalWrite(LORA_RST, HIGH);
  delay(10);
  
  // Initialize LoRa
  loraReady = false;
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println("✗ LoRa initialization FAILED");
    Serial.println("  Check: Wiring, antenna, power supply");
  } else {
    // CRITICAL: Configure LoRa parameters to match central node
    LoRa.setTxPower(20);              // Maximum power
    LoRa.setSpreadingFactor(12);      // Maximum range
    LoRa.setSignalBandwidth(125E3);   // 125 kHz
    LoRa.setCodingRate4(8);           // Error correction
    LoRa.setPreambleLength(8);        // Standard preamble
    LoRa.setSyncWord(0x34);           // Must match central node
    LoRa.enableCrc();                 // Enable CRC checking
    LoRa.setOCP(240);                 // Over current protection (240mA max)  
    
    loraReady = true;
    Serial.println("✓ LoRa initialized successfully");
    Serial.println("  Configuration:");
    Serial.println("    - Frequency: 433 MHz");        // Changed from 915 MHz
    Serial.println("    - TX Power: 20 dBm");
    Serial.println("    - Spreading Factor: 12");
    Serial.println("    - Bandwidth: 125 kHz");
    Serial.println("    - Coding Rate: 4/8");
    Serial.println("    - Sync Word: 0x34");
  }
  delay(200);
  
  // ========================================
  // PHASE 4: WiFi INITIALIZATION (for ESP-NOW)
  // Do this AFTER LoRa to avoid interference
  // ========================================
  Serial.println("\nPHASE 4: Initializing WiFi (ESP-NOW)...");
  
  // Turn off WiFi completely first
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(100);
  
  // Now configure for ESP-NOW (Station mode only)
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false);  // Don't erase config
  delay(100);
  
  // Set WiFi to low power to minimize interference with LoRa
  esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
  
  // Set WiFi channel (same as wristband)
  int wifiChannel = 1;
  esp_wifi_set_promiscuous(true);
esp_err_t channelResult = esp_wifi_set_channel(wifiChannel, WIFI_SECOND_CHAN_NONE);
esp_wifi_set_promiscuous(false);
delay(100);
  if (channelResult == ESP_OK) {
    Serial.printf("✓ WiFi channel set to %d\n", wifiChannel);
  } else {
    Serial.printf("⚠ Failed to set WiFi channel (error: %d)\n", channelResult);
  }
  
  delay(200);
  
  // ========================================
  // PHASE 5: ESP-NOW INITIALIZATION
  // ========================================
  Serial.println("\nPHASE 5: Initializing ESP-NOW...");
  
  espnowReady = false;
  
  // Initialize ESP-NOW
  esp_err_t espnowResult = esp_now_init();
  if (espnowResult != ESP_OK) {
    Serial.printf("✗ ESP-NOW init failed (error: %d)\n", espnowResult);
    Serial.println("  Retrying once...");
    delay(500);
    espnowResult = esp_now_init();
  }
  
  if (espnowResult == ESP_OK) {
    espnowReady = true;
    Serial.println("✓ ESP-NOW initialized");
    
    // Register callbacks
    esp_now_register_send_cb(onDataSent);
    esp_now_register_recv_cb(onDataRecv);
    delay(100);
    
    // Add wristband as peer
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, wristbandMac, 6);
    peerInfo.channel = wifiChannel;
    peerInfo.encrypt = false;
    
    #if defined(ESP_IF_WIFI_STA)
      peerInfo.ifidx = ESP_IF_WIFI_STA;
    #elif defined(WIFI_IF_STA)
      peerInfo.ifidx = WIFI_IF_STA;
    #else
      peerInfo.ifidx = (wifi_interface_t)0;
    #endif
    
    if (!esp_now_is_peer_exist(wristbandMac)) {
      esp_err_t addPeerResult = esp_now_add_peer(&peerInfo);
      if (addPeerResult == ESP_OK) {
        Serial.println("✓ Wristband peer added");
        Serial.printf("  MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                      wristbandMac[0], wristbandMac[1], wristbandMac[2],
                      wristbandMac[3], wristbandMac[4], wristbandMac[5]);
      } else {
        Serial.printf("⚠ Failed to add wristband peer (error: %d)\n", addPeerResult);
      }
    } else {
      Serial.println("✓ Wristband peer already exists");
    }
  } else {
    Serial.println("✗ ESP-NOW initialization failed");
    Serial.println("  System will continue without wristband communication");
  }
  
  delay(200);
  
  // ========================================
  // PHASE 6: UART INITIALIZATION (Audio Module)
  // ========================================
  Serial.println("\nPHASE 6: Initializing UART (Audio)...");
  
  fnM16pSerial.begin(9600, SERIAL_8N1, FN_M16P_RX, FN_M16P_TX);
  delay(200);
  
  // Set initial volume
  setVolume(25);
  delay(100);
  
  audioReady = true;
  Serial.println("✓ Audio module initialized (volume: 25)");
  delay(200);
  
  // ========================================
  // PHASE 7: DHT11 INITIALIZATION
  // ========================================
  Serial.println("\nPHASE 7: Initializing DHT11...");
  
  dht.begin();
  delay(1500);  // DHT11 needs time to stabilize
  
  // Test DHT11 with multiple attempts
  dhtReady = false;
  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.printf("  DHT11 reading attempt %d/3...\n", attempt);
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    
    if (!isnan(t) && !isnan(h)) {
      dhtReady = true;
      lastValidTemperature = t;
      
      // Apply humidity correction
      float corrected = h - 30.0f;
      if (corrected < 0.0f) corrected = 0.0f;
      if (corrected > 100.0f) corrected = 100.0f;
      lastValidHumidity = corrected;
      
      Serial.printf("✓ DHT11 initialized: %.1f°C, %.1f%% (corrected)\n", 
                    lastValidTemperature, lastValidHumidity);
      break;
    }
    delay(1000);
  }
  
  if (!dhtReady) {
    Serial.println("⚠ DHT11 initialization failed");
    Serial.println("  Using fallback values: 27.0°C, 47.0%");
    Serial.println("  Check: DATA pin → GPIO25, VCC → 3.3V, GND");
  }
  
  delay(200);
  
  // ========================================
  // PHASE 8: GAS SENSOR WARMUP & CALIBRATION
  // ========================================
  Serial.println("\nPHASE 8: Gas sensor warmup...");
  Serial.println("  Please wait 15 seconds for sensors to stabilize");
  
  // Progress indicator
  for (int i = 0; i < 15; i++) {
    Serial.print(".");
    delay(1000);
  }
  Serial.println(" Done!");
  
  Serial.println("\nCalibrating MQ sensors...");
  calibrateSensors();
  
  delay(200);
  
  // ========================================
  // PHASE 9: SYSTEM READY
  // ========================================
  Serial.println("\n╔════════════════════════════════════════════════════╗");
  Serial.println("║              SYSTEM INITIALIZATION COMPLETE         ║");
  Serial.println("╚════════════════════════════════════════════════════╝\n");
  
  // Print status summary
  printBootSummary();
  
  // Play boot sound
  if (audioReady) {
    Serial.println("Playing boot audio...");
    playAudioFile(BOOT_AUDIO);
    delay(1500);
  }
  
  // Print menu
  printTestMenu();
  
  Serial.println("\n🚀 Edge node is now operational!");
  Serial.println("Listening for commands and monitoring sensors...\n");
}

// ==================== LOOP FUNCTION ====================
void loop() {
  static unsigned long lastNormalReading = 0;
  static unsigned long lastStatusPrint = 0;
  // ========================================
  // PRIORITY 0: LoRa RX check - MUST be first and most frequent
  // ========================================  
    if (loraReady) {
    receiveLoRaMessages();
  }
  
  // ========================================
  // PRIORITY 1: Check for serial commands
  // ========================================
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    if (cmd.length() > 0) {
      handleTestCommand(cmd);
    }
  }
  
  // ========================================
  // PRIORITY 2: Emergency button monitoring (high frequency)
  // ========================================
  checkEmergencyButton();
  
  // ========================================
  // PRIORITY 3: Motion detection (if available)
  // ========================================
  if (mpuReady) {
    monitorMotion();
  }
  
  // ========================================
  // PRIORITY 4: Handle emergency trigger
  // ========================================
  if (emergencyTriggered || pendingEmergency) {
  handleEmergency();
  emergencyTriggered = false;
  motionData.fallDetected = false;
  pendingEmergency = false;  // Clear the flag after handling
}
  
  // ========================================
  // PRIORITY 5: Check for incoming LoRa messages
  // ========================================
  if (loraReady) {
    receiveLoRaMessages();
  }
  
  // ========================================
  // PRIORITY 6: Wristband connection monitoring
  // ========================================
  if (espnowReady) {
    checkWristbandConnection();
  }
  
  // ========================================
  // PRIORITY 7: Normal sensor reading & transmission (10 second interval)
  // ========================================
  if (millis() - lastNormalReading >= 10000) {
    lastNormalReading = millis();
    
    // Read all sensors
    SensorData data = readAllSensors();
    data.emergency = false;  // Normal reading, not emergency
    data.motion = motionData;
    
    // Display readings
    displayReadings(data);
    
    // Check for alerts
    checkAlerts(data);
    
    // Send via LoRa if ready and interval passed
    // Check for incoming messages RIGHT BEFORE transmitting
    if (loraReady) receiveLoRaMessages();
    
    // Send via LoRa if ready and interval passed
    if (loraReady && (millis() - lastLoRaSend >= loraInterval)) {
      sendLoRaData(data);
      lastLoRaSend = millis();
    }
    
    // Check for incoming messages RIGHT AFTER transmitting
    delay(150);
    if (loraReady) receiveLoRaMessages();
    
    Serial.println("────────────────────────────────────");
  }
  
  // ========================================
  // PRIORITY 8: Periodic status update (60 second interval)
  // ========================================
  if (millis() - lastStatusPrint >= 60000) {
    lastStatusPrint = millis();
    printSystemStatus();
  }
  
  // ========================================
  // Small delay to prevent watchdog issues
  // ========================================
  delay(50);
}

// ==================== HELPER FUNCTIONS ====================

void printBootSummary() {
  Serial.println("Component Status:");
  Serial.println("┌─────────────────────┬─────────┐");
  Serial.printf("│ %-19s │ %7s │\n", "LoRa Module", loraReady ? "✓ OK" : "✗ FAIL");
  Serial.printf("│ %-19s │ %7s │\n", "ESP-NOW", espnowReady ? "✓ OK" : "✗ FAIL");
  Serial.printf("│ %-19s │ %7s │\n", "MPU6050 Motion", mpuReady ? "✓ OK" : "✗ FAIL");
  Serial.printf("│ %-19s │ %7s │\n", "DHT11 Temp/Hum", dhtReady ? "✓ OK" : "⚠ WARN");
  Serial.printf("│ %-19s │ %7s │\n", "Audio Module", audioReady ? "✓ OK" : "✗ FAIL");
  Serial.printf("│ %-19s │ %7s │\n", "MQ Gas Sensors", "✓ OK");
  Serial.printf("│ %-19s │ %7s │\n", "Emergency Button", "✓ OK");
  Serial.println("└─────────────────────┴─────────┘");
  
  // Critical warnings
  if (!loraReady) {
    Serial.println("\n⚠ WARNING: LoRa not functional - cannot send data!");
  }
  if (!espnowReady) {
    Serial.println("\n⚠ WARNING: ESP-NOW not functional - no wristband communication!");
  }
  if (!mpuReady) {
    Serial.println("\n⚠ WARNING: Motion detection disabled - fall detection unavailable!");
  }
  
  Serial.println();
}

// ---------------- Test commands & helpers ----------------
void printTestMenu() {
  Serial.println("\n╔═══════════════════════════════════════╗");
  Serial.println("║         TEST COMMANDS MENU            ║");
  Serial.println("╠═══════════════════════════════════════╣");
  Serial.println("║ dht, mq2, mq9, mq135, mq, all         ║");
  Serial.println("║ audio1..audio10, stop, volume+, volume-║");
  Serial.println("║ lora, button, emergency, calibrate     ║");
  Serial.println("║ status, scan/i2c, help/menu           ║");
  Serial.println("║ sendmsg <text>  (ESP-NOW -> wristband)║");
  // ========== ADD THIS LINE ==========
  Serial.println("║ relaystats      (Message relay stats) ║");
  // ========== END OF NEW LINE ==========
  Serial.println("╚═══════════════════════════════════════╝\n");
}

void handleTestCommand(String cmd) {
  Serial.println("\n>>> EXECUTING TEST: " + cmd + " <<<\n");
  if (cmd == "help" || cmd == "menu") printTestMenu();
  else if (cmd == "dht") testDHT();
  else if (cmd == "mq2") testMQ2();
  else if (cmd == "mq9") testMQ9();
  else if (cmd == "mq135") testMQ135();
  else if (cmd == "mq") testAllMQ();
  else if (cmd.startsWith("audio")) {
    int n = cmd.substring(5).toInt();
    if (n >= 1 && n <= 10) testAudio(n);
  } else if (cmd == "stop") { stopAudio(); Serial.println("Audio stopped."); }
  else if (cmd == "volume+") { setVolume(25); Serial.println("Volume 25"); }
  else if (cmd == "volume-") { setVolume(15); Serial.println("Volume 15"); }
  else if (cmd == "lora") testLoRa();
  else if (cmd == "button") testButton();
  else if (cmd == "emergency") testEmergency();
  else if (cmd == "all") testAllSensors();
  else if (cmd == "calibrate") calibrateSensors();
  else if (cmd == "status") printSystemStatus();
  else if (cmd == "scan" || cmd == "i2c") scanI2CDevices();
  else if (cmd.startsWith("sendmsg ")) {
    String txt = cmd.substring(8);
    if (txt.length() == 0) Serial.println("No message provided.");
    else {
      bool ok = sendTextToWristband(txt);
      Serial.printf("sendTextToWristband('%s') => %s\n", txt.c_str(), ok ? "SENT":"FAILED");
    }
  }
  // ========== ADD THIS BLOCK HERE ==========
  else if (cmd == "relaystats") {
    Serial.println("\n╔════════════════════════════════════════════╗");
    Serial.println("║      MESSAGE RELAY STATISTICS              ║");
    Serial.println("╚════════════════════════════════════════════╝");
    Serial.printf("Messages relayed to wristband: %lu\n", messagesRelayedToWristband);
    Serial.printf("Last message ID sent: %lu\n", (unsigned long)(outgoingMessageCounter - 1));
    Serial.printf("ESP-NOW status: %s\n", espnowReady ? "✓ Ready" : "✗ Not Ready");
    Serial.printf("Wristband connected: %s\n", wristbandStatus.connected ? "✓ Yes" : "✗ No");
    if (wristbandStatus.lastMessageId > 0) {
      Serial.printf("Last message acknowledged: %s\n", 
                    wristbandStatus.messageAcknowledged ? "✓ Yes" : "✗ No");
    }
    Serial.println("════════════════════════════════════════════\n");
  }
  // ========== END OF NEW BLOCK ==========
  else Serial.println("❌ Unknown command: " + cmd);
  Serial.println("\n>>> TEST COMPLETE <<<\n");
}

void testDHT() {
  Serial.println("Testing DHT11 (5 samples) with manual -30% humidity correction:");
  for (int i=0;i<5;i++) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      float corr = h - 30.0f;
      if (corr < 0) corr = 0; if (corr > 100) corr = 100;
      Serial.printf(" #%d: Temp=%.2f C, Hum(corrected)=%.2f %%\n", i+1, t, corr);
    } else {
      Serial.printf(" #%d: FAILED (NaN)\n", i+1);
    }
    delay(2000);
  }
}

void testMQ2() {
  Serial.println("Testing MQ2 (10 samples):");
  for (int i=0;i<10;i++) {
    int a = analogRead(MQ2_ANALOG_PIN);
    bool d = digitalRead(MQ2_DIGITAL_PIN) == LOW;
    Serial.printf(" #%d: analog=%d digital=%s\n", i+1, a, d?"ACTIVE":"INACTIVE");
    delay(500);
  }
  Serial.printf("Calibration baseline=%.1f threshold=%.1f\n", mq2_cal.baseline, mq2_cal.dangerThreshold);
}

void testMQ9() {
  Serial.println("Testing MQ9 (10 samples):");
  for (int i=0;i<10;i++) {
    int a = analogRead(MQ9_ANALOG_PIN);
    bool d = digitalRead(MQ9_DIGITAL_PIN) == LOW;
    Serial.printf(" #%d: analog=%d digital=%s\n", i+1, a, d?"ACTIVE":"INACTIVE");
    delay(500);
  }
  Serial.printf("Calibration baseline=%.1f threshold=%.1f\n", mq9_cal.baseline, mq9_cal.dangerThreshold);
}

void testMQ135() {
  Serial.println("Testing MQ135 (10 samples):");
  for (int i=0;i<10;i++) {
    int a = analogRead(MQ135_ANALOG_PIN);
    bool d = digitalRead(MQ135_DIGITAL_PIN) == LOW;
    Serial.printf(" #%d: analog=%d digital=%s rating=%s\n", i+1, a, d?"POOR":"GOOD", getAirQualityRating(a).c_str());
    delay(500);
  }
  Serial.printf("Calibration baseline=%.1f threshold=%.1f\n", mq135_cal.baseline, mq135_cal.dangerThreshold);
}

void testAllMQ() { testMQ2(); testMQ9(); testMQ135(); }

void testAudio(int fileNum) {
  if (!audioReady) { Serial.println("Audio not ready"); return; }
  Serial.printf("Playing audio file #%d\n", fileNum);
  playAudioFile(fileNum);
}

void testLoRa() {
  if (!loraReady) { Serial.println("LoRa not ready"); return; }
  Serial.println("Sending test LoRa packet...");
  SensorData d = readAllSensors();
  d.emergency = false;
  d.motion = motionData;
  sendLoRaData(d);
  Serial.println("Test LoRa sent.");
}

void testEmergency() {
  Serial.println("Triggering emergency now...");
  emergencyTriggered = true;
}

void testButton() {
  Serial.println("Testing emergency button for 10s...");
  unsigned long start = millis();
  bool last = digitalRead(EMERGENCY_BUTTON_PIN);
  while (millis() - start < 10000) {
    bool cur = digitalRead(EMERGENCY_BUTTON_PIN);
    if (cur != last) {
      Serial.printf("Button state change: %s\n", cur ? "HIGH" : "LOW");
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

// ---------------- System status and misc helpers ----------------
void scanI2CDevices() {
  Serial.println("\n=== I2C Device Scanner ===");
  Serial.println("Scanning I2C bus (0x00 to 0x7F)...");
  int devicesFound = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("✓ Device found at 0x%02X\n", address);
      devicesFound++;
      if (address == 0x68 || address == 0x69) Serial.println("  → This is likely the MPU6050!");
    }
  }
  if (devicesFound == 0) {
    Serial.println("\n❌ NO I2C devices found!");
    Serial.println("\nTroubleshooting:");
    Serial.println("1. Check VCC is connected to 3.3V (NOT 5V)");
    Serial.println("2. Check GND is connected");
    Serial.println("3. Verify SDA → GPIO21, SCL → GPIO22");
    Serial.println("4. Check all connections are firm");
    Serial.println("5. Add 4.7kΩ pull-up resistors to SDA & SCL");
    Serial.println("6. Try a different MPU6050 module (may be faulty)");
  } else {
    Serial.printf("\n✓ Total devices found: %d\n", devicesFound);
  }
  Serial.println("=========================\n");
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
  Serial.println("Starting sensor calibration...");
  delay(500);
  calibrateSensor(MQ2_ANALOG_PIN, &mq2_cal, "MQ2", MQ2_DANGER_THRESHOLD);
  calibrateSensor(MQ9_ANALOG_PIN, &mq9_cal, "MQ9", MQ9_DANGER_THRESHOLD);
  calibrateSensor(MQ135_ANALOG_PIN, &mq135_cal, "MQ135", MQ135_DANGER_THRESHOLD);
  Serial.println("Calibration completed.");
}

void calibrateSensor(int pin, SensorCalibration* cal, String sensorName, int minThreshold) {
  Serial.print("Calibrating " + sensorName + " ...");
  float sum = 0;
  for (int i=0;i<CALIBRATION_SAMPLES;i++) {
    int r = analogRead(pin);
    sum += r;
    Serial.print(".");
    delay(CALIBRATION_DELAY);
  }
  cal->baseline = sum / CALIBRATION_SAMPLES;
  
  // FIXED: For MQ9 specifically, if baseline is already high, use static threshold
  if (sensorName == "MQ9" && cal->baseline > (minThreshold * 0.8)) {
    Serial.printf("\n    ⚠ MQ9 baseline (%.0f) is high - using static threshold\n", cal->baseline);
    cal->dangerThreshold = minThreshold;
  } else {
    float calculatedThreshold = cal->baseline * DANGER_MULTIPLIER;
    cal->dangerThreshold = (calculatedThreshold > minThreshold) ? calculatedThreshold : minThreshold;
  }
  
  cal->calibrated = true;
  Serial.println(" Done");
  Serial.printf("    Baseline: %.0f, Danger threshold: %.0f\n", cal->baseline, cal->dangerThreshold);
}

bool checkSensorDanger(int currentValue, SensorCalibration* cal, int staticDangerThreshold) {
  if (!cal->calibrated) return currentValue >= staticDangerThreshold;
  return currentValue >= cal->dangerThreshold;
}

SensorData readAllSensors() {
  SensorData data;
  data.timestamp = millis();
  if (millis() - lastDHTReading > DHT_READING_INTERVAL) {
    float rt = dht.readTemperature();
    float rh = dht.readHumidity();
    if (!isnan(rt) && rt >= -40 && rt <= 80) { data.temperature = rt; lastValidTemperature = rt; }
    else data.temperature = lastValidTemperature;
    if (!isnan(rh) && rh >= 0 && rh <= 100) {
      float corr = rh - 30.0f;
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
  data.mq2_analog = analogRead(MQ2_ANALOG_PIN);
  data.mq9_analog = analogRead(MQ9_ANALOG_PIN);
  data.mq135_analog = analogRead(MQ135_ANALOG_PIN);
  data.mq2_digital = digitalRead(MQ2_DIGITAL_PIN) == LOW;
  data.mq9_digital = digitalRead(MQ9_DIGITAL_PIN) == LOW;
  data.mq135_digital = digitalRead(MQ135_DIGITAL_PIN) == LOW;
  data.emergency = digitalRead(EMERGENCY_BUTTON_PIN) == LOW;
  data.motion = motionData;
  return data;
}

void displayReadings(SensorData data) {
  Serial.println("\n--- SENSOR SNAPSHOT ---");
  Serial.printf("Timestamp: %lu\n", data.timestamp);
  Serial.printf("Temp: %.1f C  Hum: %.1f %%\n", data.temperature, data.humidity);
  Serial.printf("MQ2: %d (%s)  MQ9: %d (%s)  MQ135: %d (%s)\n",
                data.mq2_analog, data.mq2_digital ? "ALERT":"OK",
                data.mq9_analog, data.mq9_digital ? "ALERT":"OK",
                data.mq135_analog, data.mq135_digital ? "ALERT":"OK");
  Serial.printf("Motion: accel=%.2fm/s2 gyro=%.2f deg/s\n", data.motion.totalAccel, data.motion.totalGyro);
  Serial.printf("Emergency Button: %s\n", data.emergency ? "PRESSED" : "RELEASED");
  if (wristbandStatus.connected) {
    unsigned long age = (millis() - wristbandStatus.lastUpdate) / 1000;
    Serial.printf("Wristband: CONNECTED (BPM=%u SpO2=%u finger=%s, %lus ago)\n",
                  wristbandStatus.bpm, wristbandStatus.spo2, wristbandStatus.fingerDetected?"YES":"NO", age);
  } else {
    Serial.println("Wristband: DISCONNECTED");
  }
}

void checkAlerts(SensorData data) {
  // Alert cooldown tracking (static variables persist between function calls)
  static unsigned long lastTempHighAlert = 0;
  static unsigned long lastTempLowAlert = 0;
  static unsigned long lastHumidityHighAlert = 0;
  static unsigned long lastHumidityLowAlert = 0;
  static unsigned long lastMQ2Alert = 0;
  static unsigned long lastMQ9Alert = 0;
  static unsigned long lastMQ135Alert = 0;
  
  const unsigned long ALERT_COOLDOWN = 300000; // 5 minutes in milliseconds
  unsigned long now = millis();
  
  // Temperature Alerts
  if (data.temperature >= 45.0) {
    if (lastTempHighAlert == 0 || (now - lastTempHighAlert >= ALERT_COOLDOWN)) {
      Serial.println("!!! HIGH TEMPERATURE ALERT");
      Serial.printf("    Temperature: %.1f°C (threshold: 45°C)\n", data.temperature);
      if (audioReady) playAudioFile(HIGH_TEMP_ALERT);
      lastTempHighAlert = now;
    }
  }
  
  if (data.temperature <= 5.0) {
    if (lastTempLowAlert == 0 || (now - lastTempLowAlert >= ALERT_COOLDOWN)) {
      Serial.println("!!! LOW TEMPERATURE ALERT");
      Serial.printf("    Temperature: %.1f°C (threshold: 5°C)\n", data.temperature);
      if (audioReady) playAudioFile(LOW_TEMP_ALERT);
      lastTempLowAlert = now;
    }
  }
  
  // Humidity Alerts
  if (data.humidity >= 80.0) {
    if (lastHumidityHighAlert == 0 || (now - lastHumidityHighAlert >= ALERT_COOLDOWN)) {
      Serial.println("!!! HIGH HUMIDITY ALERT");
      Serial.printf("    Humidity: %.1f%% (threshold: 80%%)\n", data.humidity);
      if (audioReady) playAudioFile(HIGH_HUMIDITY_ALERT);
      lastHumidityHighAlert = now;
    }
  }
  
  if (data.humidity <= 5.0) {
    if (lastHumidityLowAlert == 0 || (now - lastHumidityLowAlert >= ALERT_COOLDOWN)) {
      Serial.println("!!! LOW HUMIDITY ALERT");
      Serial.printf("    Humidity: %.1f%% (threshold: 20%%)\n", data.humidity);
      if (audioReady) playAudioFile(LOW_HUMIDITY_ALERT);
      lastHumidityLowAlert = now;
    }
  }
  
  // MQ2 Alert
  bool mq2_danger = data.mq2_analog >= MQ2_DANGER_THRESHOLD || 
                    (mq2_cal.calibrated && data.mq2_analog >= mq2_cal.dangerThreshold);
  
  if (mq2_danger) {
    if (lastMQ2Alert == 0 || (now - lastMQ2Alert >= ALERT_COOLDOWN)) {
      Serial.println("!!! MQ2 Danger detected");
      Serial.printf("    MQ2 analog=%d (static threshold=%d, calibrated=%.0f)\n", 
                    data.mq2_analog, MQ2_DANGER_THRESHOLD, mq2_cal.dangerThreshold);
      if (audioReady) playAudioFile(SMOKE_ALERT);
      lastMQ2Alert = now;
    }
  }
  
  // MQ9 Alert
  bool mq9_danger = data.mq9_analog >= MQ9_DANGER_THRESHOLD || 
                    (mq9_cal.calibrated && data.mq9_analog >= mq9_cal.dangerThreshold);
  
  if (mq9_danger) {
    if (lastMQ9Alert == 0 || (now - lastMQ9Alert >= ALERT_COOLDOWN)) {
      Serial.println("!!! MQ9 Danger detected");
      Serial.printf("    MQ9 analog=%d (static threshold=%d, calibrated=%.0f)\n", 
                    data.mq9_analog, MQ9_DANGER_THRESHOLD, mq9_cal.dangerThreshold);
      if (audioReady) {
        playAudioFile(CO_ALERT);
        Serial.println("    ✓ Playing CO alert audio (0003.mp3)");
      }
      lastMQ9Alert = now;
    }
  }
  
  // MQ135 Alert
  bool mq135_danger = data.mq135_analog >= MQ135_DANGER_THRESHOLD || 
                      (mq135_cal.calibrated && data.mq135_analog >= mq135_cal.dangerThreshold);
  
  if (mq135_danger) {
    if (lastMQ135Alert == 0 || (now - lastMQ135Alert >= ALERT_COOLDOWN)) {
      Serial.println("!!! MQ135 Air quality degraded");
      Serial.printf("    MQ135 analog=%d (static threshold=%d, calibrated=%.0f, rating=%s)\n", 
                    data.mq135_analog, MQ135_DANGER_THRESHOLD, mq135_cal.dangerThreshold,
                    getAirQualityRating(data.mq135_analog).c_str());
      if (audioReady) playAudioFile(AIR_QUALITY_WARNING);
      lastMQ135Alert = now;
    }
  }
}
void sendLoRaData(SensorData data) {
  StaticJsonDocument<600> doc;
  doc["node"] = NODE_ID;
  doc["timestamp"] = data.timestamp;
  doc["temp"] = data.temperature;
  doc["hum"] = data.humidity;
  doc["mq2"] = data.mq2_analog;
  doc["mq9"] = data.mq9_analog;
  doc["mq135"] = data.mq135_analog;
  
  // CRITICAL: Explicitly set emergency field (not as 0/1 but as boolean)
  doc["emergency"] = data.emergency;  // This will be true or false
  
  doc["motion_accel"] = data.motion.totalAccel;
  doc["motion_gyro"] = data.motion.totalGyro;
  doc["bpm"] = wristbandStatus.connected ? wristbandStatus.bpm : 0;
  doc["spo2"] = wristbandStatus.connected ? wristbandStatus.spo2 : 0;
  doc["body_temp"] = wristbandStatus.connected ? wristbandStatus.bodyTemp : 0.0f;
  doc["wristband_connected"] = wristbandStatus.connected ? 1 : 0;
  
  char payload[600];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  
  if (!loraReady) { 
    Serial.println("LoRa not ready - cannot send"); 
    return; 
  }
  
  LoRa.beginPacket();
  LoRa.print(payload);
  LoRa.endPacket();
  
  packetCount++;
  
  // Enhanced logging for emergency packets
  if (data.emergency) {
    Serial.println("\n╔═══════════════════════════════════════╗");
    Serial.println("║   EMERGENCY PACKET TRANSMITTED        ║");
    Serial.println("╚═══════════════════════════════════════╝");
  }
  
  Serial.printf("LoRa packet #%d sent (%d bytes)%s\n", 
                packetCount, (int)n, data.emergency ? " [EMERGENCY]" : "");
  Serial.println("Payload: " + String(payload));
  delay(100);
  LoRa.receive(); // Explicitly return to RX mode after every TX
}

// ---------------- ESP-NOW Implementation ----------------
void initESPNOW() {
  // Ensure WiFi is properly initialized first
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false);
  delay(100);
  WiFi.begin();
  delay(100);
  
  int channel = 1;
  esp_err_t cherr = esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
  if (cherr == ESP_OK) {
    Serial.printf("✓ WiFi channel set to %d for ESP-NOW\n", channel);
  } else {
    Serial.printf("⚠ Failed to set WiFi channel (%d) err=%d\n", channel, (int)cherr);
  }

  if (esp_now_init() != ESP_OK) {
    Serial.println("⚠ ESP-NOW init failed - retrying...");
    delay(500);
    if (esp_now_init() != ESP_OK) {
      Serial.println("✗ ESP-NOW init failed after retry");
      espnowReady = false;
      return;
    }
  }
  espnowReady = true;
  Serial.println("✓ ESP-NOW initialized");

  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataRecv);

  delay(100);

  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, wristbandMac, 6);
  peerInfo.channel = channel;
  #if defined(ESP_IF_WIFI_STA)
    peerInfo.ifidx = ESP_IF_WIFI_STA;
  #elif defined(WIFI_IF_STA)
    peerInfo.ifidx = WIFI_IF_STA;
  #else
    peerInfo.ifidx = (wifi_interface_t)0;
  #endif
  peerInfo.encrypt = false;

  if (!esp_now_is_peer_exist(wristbandMac)) {
    esp_err_t addStatus = esp_now_add_peer(&peerInfo);
    if (addStatus != ESP_OK) {
      Serial.printf("⚠ Failed to add ESP-NOW peer (wristband) - error: %d\n", addStatus);
    } else {
      Serial.println("✓ Wristband ESP-NOW peer added");
      Serial.printf("  Peer MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                    wristbandMac[0], wristbandMac[1], wristbandMac[2],
                    wristbandMac[3], wristbandMac[4], wristbandMac[5]);
    }
  } else {
    Serial.println("✓ Wristband peer already exists");
  }
  
  delay(100);
}


void onDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len) {
  if (data == NULL || len < 1) return;
  
  uint8_t msgType = data[0];
  
  if (msgType == MSG_TYPE_VITALS) {
    if (len < (int)sizeof(espnow_vitals_t)) { 
      Serial.println("⚠ Received VITALS unexpected length"); 
      return; 
    }
    
    espnow_vitals_t vitals; 
    memcpy(&vitals, data, sizeof(vitals));
    
    wristbandStatus.bpm = vitals.bpm;
    wristbandStatus.spo2 = vitals.spo2;
    wristbandStatus.fingerDetected = (vitals.finger != 0);
    wristbandStatus.bodyTemp = (float)vitals.temperature;
    wristbandStatus.lastUpdate = millis();
    wristbandStatus.connected = true;

    Serial.printf("[ESP-NOW RX] VITALS -> BPM=%u SpO2=%u hand=%s bodyTemp=%.1f°C ts=%lu\n",
                  wristbandStatus.bpm,
                  wristbandStatus.spo2,
                  wristbandStatus.fingerDetected ? "YES" : "NO",
                  wristbandStatus.bodyTemp,
                  (unsigned long)vitals.timestamp);
                  
  } else if (msgType == MSG_TYPE_ACK) {
    if (len < (int)sizeof(espnow_ack_t)) { 
      Serial.println("⚠ Received ACK unexpected length"); 
      return; 
    }
    
    espnow_ack_t ack; 
    memcpy(&ack, data, sizeof(ack));
    
    if (ack.messageId == wristbandStatus.lastMessageId) {
      wristbandStatus.messageAcknowledged = (ack.success != 0);
      
      Serial.printf("[ESP-NOW RX] ACK for msgId=%lu success=%s\n", 
                    (unsigned long)ack.messageId, 
                    ack.success ? "YES" : "NO");
      
      // NEW: Play audio when message is successfully acknowledged by wristband
      if (ack.success && audioReady) {
  delay(200);  // Wait for ESP-NOW to finish
  playAudioFile(MESSAGE_RECEIVED);
  Serial.println("✓ Playing message received confirmation audio");
  delay(100);  // Ensure audio command is sent
}
      
    } else {
      Serial.printf("[ESP-NOW RX] ACK for unknown msgId=%lu\n", 
                    (unsigned long)ack.messageId);
    }
    
  } else {
    Serial.printf("[ESP-NOW RX] Unknown msgType: 0x%02X\n", msgType);
  }
}

void onDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  lastEspNowSendStatus = (status == ESP_NOW_SEND_SUCCESS) ? ESP_OK : ESP_FAIL;
  char macStr[18];
  sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X",
          wristbandMac[0], wristbandMac[1], wristbandMac[2],
          wristbandMac[3], wristbandMac[4], wristbandMac[5]);
  Serial.printf("[ESP-NOW TX] to %s status=%s\n", macStr, (status == ESP_NOW_SEND_SUCCESS) ? "OK":"FAIL");
}

bool sendTextToWristband(const String &message) {
  if (!espnowReady) { Serial.println("ESP-NOW not ready - cannot send text"); return false; }
  espnow_text_t pkt; memset(&pkt,0,sizeof(pkt));
  pkt.msgType = MSG_TYPE_TEXT;
  pkt.messageId = outgoingMessageCounter++;
  size_t len = message.length();
  if (len > MAX_TEXT_LEN - 1) len = MAX_TEXT_LEN - 1;
  pkt.length = (uint8_t)len;
  memcpy(pkt.text, message.c_str(), pkt.length);
  pkt.text[pkt.length] = '\0';
  esp_err_t rc = esp_now_send(wristbandMac, (uint8_t *)&pkt, sizeof(pkt));
  if (rc == ESP_OK) {
    wristbandStatus.lastMessageId = pkt.messageId;
    wristbandStatus.messageAcknowledged = false;
    Serial.printf("Sent TEXT msgId=%lu len=%u\n", (unsigned long)pkt.messageId, pkt.length);
    return true;
  } else {
    Serial.printf("Failed to send TEXT (esp_now_send rc=%d)\n", rc);
    return false;
  }
}

void checkWristbandConnection() {
  unsigned long now = millis();
  if (wristbandStatus.connected && (now - wristbandStatus.lastUpdate > 35000UL)) {
    wristbandStatus.connected = false;
    Serial.println("Wristband connection timed out (35s) -> DISCONNECTED");
    
    // ADD THESE LINES:
    // Clear vitals data when disconnected
    wristbandStatus.bpm = 0;
    wristbandStatus.spo2 = 0;
    wristbandStatus.bodyTemp = 0.0f;
    wristbandStatus.fingerDetected = false;
  }
}
void receiveLoRaMessages() {
  int packetSize = LoRa.parsePacket();
  if (packetSize <= 0) return;
  
  String incoming = "";
  while (LoRa.available()) incoming += (char)LoRa.read();
  incoming.trim();
  if (incoming.length() == 0) return;
  
  // Get signal quality
  int rssi = LoRa.packetRssi();
  float snr = LoRa.packetSnr();
  
  Serial.println("\n╔════════════════════════════════════════════╗");
  Serial.printf("║   LORA MESSAGE RECEIVED (RSSI: %4d dBm)   ║\n", rssi);
  Serial.println("╚════════════════════════════════════════════╝");
  Serial.println("Packet size: " + String(incoming.length()) + " bytes");
  Serial.println("SNR: " + String(snr, 1) + " dB");
  Serial.println("Raw data: " + incoming);
  
  // Parse JSON
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, incoming);
  
  if (err) { 
    Serial.println("❌ ERROR: JSON parse failed - " + String(err.c_str()));
    Serial.println("════════════════════════════════════════════\n");
    return; 
  }
  
  // Check if this is a message relay packet
  if (doc.containsKey("message")) {
    String message = doc["message"].as<String>();
    String from = doc["from"] | "unknown";
    unsigned long timestamp = doc["timestamp"] | 0;
    
    Serial.println("\n┌────────────────────────────────────────────┐");
    Serial.println("│   📨 MESSAGE RELAY REQUEST DETECTED        │");
    Serial.println("├────────────────────────────────────────────┤");
    Serial.printf("│ From: %-37s│\n", from.c_str());
    Serial.printf("│ Timestamp: %-32lu│\n", timestamp);
    Serial.printf("│ Message: %-34s│\n", message.substring(0, 34).c_str());
    if (message.length() > 34) {
      Serial.printf("│          %-34s│\n", message.substring(34, 68).c_str());
    }
    Serial.println("└────────────────────────────────────────────┘");
    
    Serial.println("\n→ Forwarding to wristband via ESP-NOW...");
    
    // Forward to wristband
    bool success = sendTextToWristband(message);

    
    if (success) {
      messagesRelayedToWristband++;
      Serial.println("✓ Message forwarded successfully!");
      Serial.println("  Total messages relayed: " + String(messagesRelayedToWristband));
      
      // Play audio confirmation (if audio is ready)
      if (audioReady) {
        delay(100);  // Small delay before audio
        // Note: MESSAGE_RECEIVED audio (0009.mp3) will play automatically
        // when wristband sends ACK in onDataRecv()
      }
    } else {
      Serial.println("✗ Failed to forward message to wristband");
      Serial.println("  Check: ESP-NOW status, wristband connection");
    }
    
    Serial.println("════════════════════════════════════════════\n");
  } 
  else {
    // Not a message packet - could be sensor data or other packet type
    Serial.println("ℹ️  Packet received but no 'message' field found");
    Serial.println("   (This is normal for sensor data packets)");
    
    // List available fields for debugging
    Serial.print("   Available fields: ");
    JsonObject obj = doc.as<JsonObject>();
    for (JsonPair kv : obj) {
      Serial.print(kv.key().c_str());
      Serial.print(" ");
    }
    Serial.println();
    Serial.println("════════════════════════════════════════════\n");
  }
}
// Enhanced system status with more details
void printSystemStatus() {
  unsigned long uptime = millis() / 1000;
  int hours = uptime / 3600;
  int minutes = (uptime % 3600) / 60;
  int seconds = uptime % 60;
  
  Serial.println("\n╔════════════════════════════════════════════╗");
  Serial.println("║          SYSTEM STATUS REPORT              ║");
  Serial.println("╚════════════════════════════════════════════╝");
  
  Serial.printf("Uptime: %02d:%02d:%02d\n", hours, minutes, seconds);
  Serial.println();
  
  Serial.println("Hardware Status:");
  Serial.printf("  LoRa:     %s  (Packets sent: %d)\n", 
                loraReady ? "✓ Active" : "✗ Offline", packetCount);
  Serial.printf("  ESP-NOW:  %s\n", 
                espnowReady ? "✓ Active" : "✗ Offline");
  Serial.printf("  MPU6050:  %s\n", 
                mpuReady ? "✓ Active" : "✗ Offline");
  Serial.printf("  DHT11:    %s\n", 
                dhtReady ? "✓ Active" : "⚠ Fallback");
  Serial.printf("  Audio:    %s\n", 
                audioReady ? "✓ Active" : "✗ Offline");
  Serial.println();
  
  // ========== ADD THIS BLOCK HERE ==========
  Serial.println("Message Relay Status:");
  Serial.printf("  Messages relayed to wristband: %lu\n", messagesRelayedToWristband);
  Serial.printf("  Last message ID sent: %lu\n", (unsigned long)(outgoingMessageCounter - 1));
  if (wristbandStatus.lastMessageId > 0) {
    Serial.printf("  Last message acknowledged: %s\n", 
                  wristbandStatus.messageAcknowledged ? "✓ Yes" : "✗ No");
  }
  Serial.println();
  // ========== END OF NEW BLOCK ==========
  
  if (espnowReady) {
    if (wristbandStatus.connected) {
      unsigned long age = (millis() - wristbandStatus.lastUpdate) / 1000;
      Serial.println("Wristband Status:");
      Serial.printf("  Connection: ✓ Active (%lu seconds ago)\n", age);
      Serial.printf("  Heart Rate: %u BPM\n", wristbandStatus.bpm);
      Serial.printf("  SpO2:       %u%%\n", wristbandStatus.spo2);
      Serial.printf("  Finger:     %s\n", wristbandStatus.fingerDetected ? "Detected" : "None");
    } else {
      Serial.println("Wristband Status:");
      Serial.println("  Connection: ✗ Disconnected");
    }
    Serial.println();
  }
  
  Serial.println("Sensor Calibration:");
  Serial.printf("  MQ2:   Baseline=%.0f  Threshold=%.0f  %s\n", 
                mq2_cal.baseline, mq2_cal.dangerThreshold, 
                mq2_cal.calibrated ? "✓" : "✗");
  Serial.printf("  MQ9:   Baseline=%.0f  Threshold=%.0f  %s\n", 
                mq9_cal.baseline, mq9_cal.dangerThreshold, 
                mq9_cal.calibrated ? "✓" : "✗");
  Serial.printf("  MQ135: Baseline=%.0f  Threshold=%.0f  %s\n", 
                mq135_cal.baseline, mq135_cal.dangerThreshold, 
                mq135_cal.calibrated ? "✓" : "✗");
  
  Serial.println("\n════════════════════════════════════════════\n");
}
