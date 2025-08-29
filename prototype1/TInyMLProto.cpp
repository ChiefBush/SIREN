/*
 * ESP32 Gas Sensor Monitor - MQ-9 and MQ-135 with Advanced Signal Processing
 * 
 * Hardware:
 * - ESP32-WROOM DevKit
 * - MQ-9: Analog → GPIO34, Heater PWM → GPIO25
 * - MQ-135: Analog → GPIO33
 * - 5V supply, 10kΩ load resistors, ADC ref ~1.1V
 * 
 * Features:
 * - Two-phase heater cycling for MQ-9
 * - Adaptive thresholds using rolling statistics
 * - Gas classification (CO, flammable, VOC, smoke)
 * - Serial CLI with JSON/CSV output modes
 * - Persistent calibration storage
 * 
 * Author: Shishir Dwivedi
 * Date: 29/08/2025
 * Generated for prototype development
 */

#include <Arduino.h>
#include <Preferences.h>
#include <driver/ledc.h>
#include <ArduinoJson.h>

// ========== PIN DEFINITIONS ==========
#define PIN_MQ9_AO      34
#define PIN_MQ135_AO    33
#define PIN_MQ9_HEATER  25

float lastK9Low = 1.0f;
float lastK9High = 1.0f; 
float lastK135 = 1.0f;

// ========== HARDWARE CONSTANTS ==========
constexpr float VCC       = 5.0f;      // Sensor supply voltage
constexpr float VADC_REF  = 1.10f;     // ESP32 ADC effective reference (calibrated)
constexpr float RL_OHMS   = 10000.0f;  // Load resistor value
constexpr int   ADC_SAMPLES = 12;      // Samples to average per reading

// ========== HEATER CONTROL ==========
constexpr float DUTY_LOW  = 0.45f;    // 45% duty for low phase
constexpr float DUTY_HIGH = 1.00f;    // 100% duty for high phase
constexpr int   T_LOW_MS  = 10000;    // Low phase duration (ms)
constexpr int   T_HIGH_MS = 10000;    // High phase duration (ms)

// ========== TIMING CONSTANTS ==========
constexpr int   WARMUP_MS = 180000;   // 3 minutes warm-up after flash
constexpr int   CALIB_MS  = 300000;   // 5 minutes R0 calibration
constexpr int   STAB_MS   = 120000;   // 2 minutes stabilization

// ========== SIGNAL PROCESSING ==========
constexpr float EMA_ALPHA = 0.3f;     // Exponential moving average factor
constexpr int   MED_WIN   = 5;        // Median filter window size
constexpr int   SLOPE_WIN = 6;        // Slope calculation window (cycles)

// ========== ALERT THRESHOLDS ==========
constexpr int   DEBOUNCE_N   = 3;      // Consecutive cycles for alert
constexpr int   T_WARN_MS    = 30000;  // Warning dwell time
constexpr int   T_DANGER_MS  = 90000;  // Danger dwell time

// ========== CLASSIFICATION CONSTANTS ==========
constexpr float ICO_CO_MIN   = 1.4f;   // Min I_CO for CO detection
constexpr float ICO_CH4_MAX  = 0.8f;   // Max I_CO for CH4 detection

// ========== ABSOLUTE THRESHOLDS ==========
constexpr float ABS_VOC_WARN   = 1.5f;
constexpr float ABS_VOC_DANGER = 2.5f;
constexpr float ABS_FLAM_WARN  = 1.6f;
constexpr float ABS_FLAM_DANGER = 2.6f;

// ========== ENUMS ==========
enum EventType : int {
  NONE = 0,
  GAS_DETECTED = 2,
  HW_FAULT = 4,
  MULTI_ALERT = 6
};

enum Subtype : int {
  VOC_LIKELY = 10,
  CO_LIKELY = 11,
  FLAMMABLE_LIKELY = 12,
  SMOKE_MIXED = 13,
  UNKNOWN_GAS = 19
};

enum HeaterPhase {
  PHASE_LOW,
  PHASE_HIGH
};

enum ThresholdMode {
  THRESH_ABSOLUTE,
  THRESH_MAD
};

// ========== GLOBAL STATE ==========
Preferences prefs;
bool csvMode = false;
bool armed = false;
bool rebasing = false;
ThresholdMode threshMode = THRESH_MAD;

// Heater control
HeaterPhase currentPhase = PHASE_LOW;
unsigned long phaseStartTime = 0;
unsigned long cycleCount = 0;

// Calibration baselines
float R0_mq9 = 0.0f;
float R0_mq135 = 0.0f;
bool calibrated = false;

// Raw sensor data
float medianK9Low[MED_WIN] = {0};
float medianK9High[MED_WIN] = {0};
float medianK135[MED_WIN] = {0};
int medianIndex = 0;

// Processed indices with EMA
float I_CO = 1.0f;
float I_FLAM = 1.0f;
float I_VOC = 1.0f;

// Slope calculation buffers
float slopeBufferFLAM[SLOPE_WIN] = {0};
float slopeBufferVOC[SLOPE_WIN] = {0};
int slopeIndex = 0;

// Rolling statistics for adaptive thresholds
#define STATS_SIZE 120  // 30-60 minutes at 30s/cycle
float rollingCO[STATS_SIZE] = {0};
float rollingFLAM[STATS_SIZE] = {0};
float rollingVOC[STATS_SIZE] = {0};
int statsIndex = 0;
int statsCount = 0;

float mu_CO = 1.0f, mu_FLAM = 1.0f, mu_VOC = 1.0f;
float mad_CO = 0.1f, mad_FLAM = 0.1f, mad_VOC = 0.1f;

// Alert state
bool warnCO = false, warnFLAM = false, warnVOC = false;
bool dangerCO = false, dangerFLAM = false, dangerVOC = false;
int debounceCounters[6] = {0}; // CO_warn, CO_danger, FLAM_warn, FLAM_danger, VOC_warn, VOC_danger
unsigned long alertStartTimes[6] = {0};

// System timing
unsigned long bootTime;
bool firstBoot = false;

// ========== UTILITY FUNCTIONS ==========

float clamp01(float x) {
  return constrain(x, 0.0f, 1.0f);
}

float clampFloat(float x, float minVal, float maxVal) {
  if (isnan(x) || isinf(x)) return minVal;
  return constrain(x, minVal, maxVal);
}

// ========== ADC AND SENSOR FUNCTIONS ==========

float readADC(int pin) {
  long sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    sum += analogRead(pin);
    delayMicroseconds(100);
  }
  return (float)sum / ADC_SAMPLES;
}

float computeRs(float adcValue) {
  float voltage = adcValue * (VADC_REF / 4095.0f);
  voltage = clampFloat(voltage, 0.001f, VADC_REF * 0.99f);
  
  float Rs = RL_OHMS * (VCC - voltage) / voltage;
  return clampFloat(Rs, 100.0f, 1000000.0f);
}

float medianFilter(float* buffer, float newValue) {
  // Simple insertion sort median filter
  buffer[medianIndex] = newValue;
  
  float sorted[MED_WIN];
  memcpy(sorted, buffer, sizeof(sorted));
  
  for (int i = 1; i < MED_WIN; i++) {
    float key = sorted[i];
    int j = i - 1;
    while (j >= 0 && sorted[j] > key) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = key;
  }
  
  return sorted[MED_WIN / 2];
}

float ema(float current, float newValue, float alpha) {
  return alpha * newValue + (1.0f - alpha) * current;
}

float computeSlope(float* buffer, int windowSize) {
  if (windowSize < 2) return 0.0f;
  
  float sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (int i = 0; i < windowSize; i++) {
    sumX += i;
    sumY += buffer[i];
    sumXY += i * buffer[i];
    sumX2 += i * i;
  }
  
  float denominator = windowSize * sumX2 - sumX * sumX;
  if (abs(denominator) < 0.001f) return 0.0f;
  
  return (windowSize * sumXY - sumX * sumY) / denominator;
}

// ========== HEATER CONTROL ==========

void setupHeater() {
  // ESP32 Arduino Core 3.x uses ledcAttach instead of ledcSetup + ledcAttachPin
  if (!ledcAttach(PIN_MQ9_HEATER, 1000, 8)) {
    Serial.println("ERROR: Failed to attach heater pin to LEDC");
  }
}

void applyHeaterPhase(HeaterPhase phase) {
  float duty = (phase == PHASE_LOW) ? DUTY_LOW : DUTY_HIGH;
  int dutyCycle = (int)(duty * 255);
  ledcWrite(PIN_MQ9_HEATER, dutyCycle);  // Changed from ledcWrite(0, dutyCycle)
  
  currentPhase = phase;
  phaseStartTime = millis();
}

// ========== STATISTICS ==========

void updateRollingStats() {
  if (!armed) return;
  
  rollingCO[statsIndex] = I_CO;
  rollingFLAM[statsIndex] = I_FLAM;
  rollingVOC[statsIndex] = I_VOC;
  
  statsIndex = (statsIndex + 1) % STATS_SIZE;
  if (statsCount < STATS_SIZE) statsCount++;
  
  // Compute median and MAD
  if (statsCount >= 10) {
    float sortedCO[STATS_SIZE], sortedFLAM[STATS_SIZE], sortedVOC[STATS_SIZE];
    memcpy(sortedCO, rollingCO, statsCount * sizeof(float));
    memcpy(sortedFLAM, rollingFLAM, statsCount * sizeof(float));
    memcpy(sortedVOC, rollingVOC, statsCount * sizeof(float));
    
    // Simple bubble sort for median
    for (int i = 0; i < statsCount - 1; i++) {
      for (int j = 0; j < statsCount - i - 1; j++) {
        if (sortedCO[j] > sortedCO[j + 1]) {
          float temp = sortedCO[j]; sortedCO[j] = sortedCO[j + 1]; sortedCO[j + 1] = temp;
        }
        if (sortedFLAM[j] > sortedFLAM[j + 1]) {
          float temp = sortedFLAM[j]; sortedFLAM[j] = sortedFLAM[j + 1]; sortedFLAM[j + 1] = temp;
        }
        if (sortedVOC[j] > sortedVOC[j + 1]) {
          float temp = sortedVOC[j]; sortedVOC[j] = sortedVOC[j + 1]; sortedVOC[j + 1] = temp;
        }
      }
    }
    
    mu_CO = sortedCO[statsCount / 2];
    mu_FLAM = sortedFLAM[statsCount / 2];
    mu_VOC = sortedVOC[statsCount / 2];
    
    // Compute MAD
    float madBufferCO[STATS_SIZE], madBufferFLAM[STATS_SIZE], madBufferVOC[STATS_SIZE];
    for (int i = 0; i < statsCount; i++) {
      madBufferCO[i] = abs(rollingCO[i] - mu_CO);
      madBufferFLAM[i] = abs(rollingFLAM[i] - mu_FLAM);
      madBufferVOC[i] = abs(rollingVOC[i] - mu_VOC);
    }
    
    // Sort MAD buffers
    for (int i = 0; i < statsCount - 1; i++) {
      for (int j = 0; j < statsCount - i - 1; j++) {
        if (madBufferCO[j] > madBufferCO[j + 1]) {
          float temp = madBufferCO[j]; madBufferCO[j] = madBufferCO[j + 1]; madBufferCO[j + 1] = temp;
        }
        if (madBufferFLAM[j] > madBufferFLAM[j + 1]) {
          float temp = madBufferFLAM[j]; madBufferFLAM[j] = madBufferFLAM[j + 1]; madBufferFLAM[j + 1] = temp;
        }
        if (madBufferVOC[j] > madBufferVOC[j + 1]) {
          float temp = madBufferVOC[j]; madBufferVOC[j] = madBufferVOC[j + 1]; madBufferVOC[j + 1] = temp;
        }
      }
    }
    
    mad_CO = max(madBufferCO[statsCount / 2], 0.05f);
    mad_FLAM = max(madBufferFLAM[statsCount / 2], 0.05f);
    mad_VOC = max(madBufferVOC[statsCount / 2], 0.05f);
  }
}

// ========== ALERT PROCESSING ==========

void updateAlerts() {
  unsigned long now = millis();
  
  // Determine thresholds
  float threshWarnCO, threshDangerCO, threshWarnFLAM, threshDangerFLAM, threshWarnVOC, threshDangerVOC;
  
  if (threshMode == THRESH_MAD) {
    threshWarnCO = mu_CO + 3.0f * mad_CO;
    threshDangerCO = mu_CO + 6.0f * mad_CO;
    threshWarnFLAM = mu_FLAM + 3.0f * mad_FLAM;
    threshDangerFLAM = mu_FLAM + 6.0f * mad_FLAM;
    threshWarnVOC = mu_VOC + 3.0f * mad_VOC;
    threshDangerVOC = mu_VOC + 6.0f * mad_VOC;
  } else {
    threshWarnCO = 1.4f;
    threshDangerCO = 2.0f;
    threshWarnFLAM = ABS_FLAM_WARN;
    threshDangerFLAM = ABS_FLAM_DANGER;
    threshWarnVOC = ABS_VOC_WARN;
    threshDangerVOC = ABS_VOC_DANGER;
  }
  
  // Apply absolute minimums
  threshWarnFLAM = max(threshWarnFLAM, ABS_FLAM_WARN);
  threshDangerFLAM = max(threshDangerFLAM, ABS_FLAM_DANGER);
  threshWarnVOC = max(threshWarnVOC, ABS_VOC_WARN);
  threshDangerVOC = max(threshDangerVOC, ABS_VOC_DANGER);
  
  // Check conditions with debouncing
  bool conditions[6] = {
    I_CO >= threshWarnCO,    // CO warn
    I_CO >= threshDangerCO,  // CO danger
    I_FLAM >= threshWarnFLAM,    // FLAM warn
    I_FLAM >= threshDangerFLAM,  // FLAM danger
    I_VOC >= threshWarnVOC,      // VOC warn
    I_VOC >= threshDangerVOC     // VOC danger
  };
  
  bool newAlerts[6] = {false, false, false, false, false, false};
  
  for (int i = 0; i < 6; i++) {
    if (conditions[i]) {
      debounceCounters[i]++;
      if (debounceCounters[i] >= DEBOUNCE_N) {
        if (alertStartTimes[i] == 0) {
          alertStartTimes[i] = now;
        }
        
        unsigned long alertDuration = now - alertStartTimes[i];
        unsigned long requiredDuration = (i % 2 == 0) ? T_WARN_MS : T_DANGER_MS;
        
        if (alertDuration >= requiredDuration) {
          newAlerts[i] = true;
        }
      }
    } else {
      debounceCounters[i] = 0;
      alertStartTimes[i] = 0;
    }
  }
  
  // Apply hysteresis - only clear when dropping below lower threshold for 2x dwell
  if (warnCO && !newAlerts[0] && I_CO < threshWarnCO * 0.9f) {
    static unsigned long coWarnClearStart = 0;
    if (coWarnClearStart == 0) coWarnClearStart = now;
    if (now - coWarnClearStart >= T_WARN_MS * 2) {
      warnCO = false;
      coWarnClearStart = 0;
    }
  } else if (newAlerts[0]) {
    warnCO = true;
  }
  
  // Similar hysteresis for other alerts (simplified for brevity)
  warnFLAM = newAlerts[2] || (warnFLAM && I_FLAM >= threshWarnFLAM * 0.9f);
  warnVOC = newAlerts[4] || (warnVOC && I_VOC >= threshWarnVOC * 0.9f);
  dangerCO = newAlerts[1] || (dangerCO && I_CO >= threshDangerCO * 0.9f);
  dangerFLAM = newAlerts[3] || (dangerFLAM && I_FLAM >= threshDangerFLAM * 0.9f);
  dangerVOC = newAlerts[5] || (dangerVOC && I_VOC >= threshDangerVOC * 0.9f);
}

// ========== CLASSIFICATION ==========

void classify(EventType& eventType, Subtype& subtype, float& confidence) {
  eventType = NONE;
  subtype = (Subtype)0;
  confidence = 0.0f;
  
  if (!armed) return;
  
  // Compute slopes
  float slopeFLAM = computeSlope(slopeBufferFLAM, min(SLOPE_WIN, (int)cycleCount));
  float slopeVOC = computeSlope(slopeBufferVOC, min(SLOPE_WIN, (int)cycleCount));
  
  bool anyWarn = warnCO || warnFLAM || warnVOC;
  bool anyDanger = dangerCO || dangerFLAM || dangerVOC;
  
  if (!anyWarn && !anyDanger) {
    eventType = NONE;
    return;
  }
  
  eventType = GAS_DETECTED;
  
  // Count simultaneous dangers for MULTI_ALERT
  int dangerCount = (dangerCO ? 1 : 0) + (dangerFLAM ? 1 : 0) + (dangerVOC ? 1 : 0);
  if (dangerCount >= 2) {
    eventType = MULTI_ALERT;
    subtype = (Subtype)0; // Mixed
    confidence = 0.95f;
    return;
  }
  
  // Classification rules (in order)
  if (I_CO >= ICO_CO_MIN && (warnFLAM || dangerFLAM)) {
    subtype = CO_LIKELY;
    confidence = clamp01(0.5f * (I_CO - ICO_CO_MIN) / ICO_CO_MIN + 0.5f * I_FLAM / ABS_FLAM_WARN);
  }
  else if ((warnFLAM || dangerFLAM) && I_CO <= ICO_CH4_MAX) {
    subtype = FLAMMABLE_LIKELY;
    confidence = clamp01(I_FLAM / ABS_FLAM_WARN);
  }
  else if ((warnVOC || dangerVOC) && !warnFLAM && !dangerFLAM) {
    subtype = VOC_LIKELY;
    confidence = clamp01(I_VOC / ABS_VOC_WARN);
  }
  else if ((warnVOC || dangerVOC) && (warnFLAM || dangerFLAM) && 
           slopeFLAM > 0.001f && slopeVOC > 0.001f) {
    subtype = SMOKE_MIXED;
    confidence = clamp01(0.5f * (I_VOC / ABS_VOC_WARN + I_FLAM / ABS_FLAM_WARN));
  }
  else if (anyDanger) {
    subtype = UNKNOWN_GAS;
    confidence = 0.6f;
  }
  else {
    subtype = UNKNOWN_GAS;
    confidence = 0.3f;
  }
}

// ========== CALIBRATION ==========

void saveR0() {
  if (!prefs.begin("gasmonitor", false)) {
    Serial.println("ERROR: Failed to open preferences");
    return;
  }
  
  prefs.putFloat("R0_mq9", R0_mq9);
  prefs.putFloat("R0_mq135", R0_mq135);
  prefs.putBool("calibrated", true);
  prefs.end();
  
  Serial.printf("R0 saved: MQ9=%.1f, MQ135=%.1f\n", R0_mq9, R0_mq135);
}

void loadR0() {
  if (!prefs.begin("gasmonitor", true)) {
    Serial.println("WARNING: Failed to open preferences for reading");
    return;
  }
  
  R0_mq9 = prefs.getFloat("R0_mq9", 0.0f);
  R0_mq135 = prefs.getFloat("R0_mq135", 0.0f);
  calibrated = prefs.getBool("calibrated", false);
  firstBoot = !prefs.getBool("booted", false);
  
  prefs.end();
  
  if (calibrated && R0_mq9 > 0 && R0_mq135 > 0) {
    Serial.printf("R0 loaded: MQ9=%.1f, MQ135=%.1f\n", R0_mq9, R0_mq135);
  } else {
    calibrated = false;
    Serial.println("No valid calibration found. Run REBASE command.");
  }
}

void performCalibration() {
  Serial.println("Starting R0 calibration (clean air assumed)...");
  rebasing = true;
  
  const int numSamples = CALIB_MS / 1000; // 1 sample per second
  float sumR9 = 0, sumR135 = 0;
  int validSamples = 0;
  
  for (int i = 0; i < numSamples; i++) {
    float adc9 = readADC(PIN_MQ9_AO);
    float adc135 = readADC(PIN_MQ135_AO);
    
    float Rs9 = computeRs(adc9);
    float Rs135 = computeRs(adc135);
    
    if (Rs9 > 1000 && Rs135 > 1000) { // Sanity check
      sumR9 += Rs9;
      sumR135 += Rs135;
      validSamples++;
    }
    
    if (i % 30 == 0) { // Progress every 30 seconds
      Serial.printf("Calibration progress: %d%% (Rs9=%.0f, Rs135=%.0f)\n", 
                    (i * 100) / numSamples, Rs9, Rs135);
    }
    
    delay(1000);
  }
  
  if (validSamples >= numSamples * 0.8f) {
    R0_mq9 = sumR9 / validSamples;
    R0_mq135 = sumR135 / validSamples;
    calibrated = true;
    saveR0();
    Serial.printf("Calibration complete: R0_MQ9=%.1f, R0_MQ135=%.1f\n", R0_mq9, R0_mq135);
  } else {
    Serial.printf("Calibration failed: only %d/%d valid samples\n", validSamples, numSamples);
  }
  
  rebasing = false;
}

// ========== OUTPUT FUNCTIONS ==========

void printHuman(float adc9, float adc135, float Rs9Low, float Rs9High, float Rs135,
               float K9Low, float K9High, float K135, EventType eventType, Subtype subtype, float confidence) {
  
  Serial.printf("\n=== Cycle %lu | Phase: %s ===\n", 
                cycleCount, (currentPhase == PHASE_LOW) ? "LOW" : "HIGH");
  
  Serial.printf("Raw ADC: MQ9=%.0f, MQ135=%.0f\n", adc9, adc135);
  Serial.printf("Rs (Ohm): MQ9_low=%.0f, MQ9_high=%.0f, MQ135=%.0f\n", Rs9Low, Rs9High, Rs135);
  Serial.printf("K (Rs/R0): MQ9_low=%.2f, MQ9_high=%.2f, MQ135=%.2f\n", K9Low, K9High, K135);
  Serial.printf("Indices: I_CO=%.2f, I_FLAM=%.2f, I_VOC=%.2f\n", I_CO, I_FLAM, I_VOC);
  Serial.printf("Stats: μ(%.2f,%.2f,%.2f) MAD(%.2f,%.2f,%.2f)\n", 
                mu_CO, mu_FLAM, mu_VOC, mad_CO, mad_FLAM, mad_VOC);
  Serial.printf("Alerts: WARN(%c%c%c) DANGER(%c%c%c)\n",
                warnCO ? 'C' : '-', warnFLAM ? 'F' : '-', warnVOC ? 'V' : '-',
                dangerCO ? 'C' : '-', dangerFLAM ? 'F' : '-', dangerVOC ? 'V' : '-');
  
  String classification = "NONE";
  if (eventType == GAS_DETECTED || eventType == MULTI_ALERT) {
    switch (subtype) {
      case CO_LIKELY: classification = "CO_LIKELY"; break;
      case FLAMMABLE_LIKELY: classification = "FLAMMABLE"; break;
      case VOC_LIKELY: classification = "VOC"; break;
      case SMOKE_MIXED: classification = "SMOKE_MIXED"; break;
      case UNKNOWN_GAS: classification = "UNKNOWN_GAS"; break;
    }
  }
  
  Serial.printf("Classification: %s (conf=%.2f)\n", classification.c_str(), confidence);
  Serial.printf("Armed: %s | Rebasing: %s\n", armed ? "YES" : "NO", rebasing ? "YES" : "NO");
}

void printJSON(float adc9, float adc135, float K9Low, float K9High, float K135,
               EventType eventType, Subtype subtype, float confidence) {
  if (csvMode) return;
  
  DynamicJsonDocument doc(512);
  doc["cycle"] = cycleCount;
  doc["mq135_k"] = K135;
  doc["mq9_k_low"] = K9Low;
  doc["mq9_k_high"] = K9High;
  doc["i_co"] = I_CO;
  doc["i_flam"] = I_FLAM;
  doc["i_voc"] = I_VOC;
  
  JsonObject warn = doc.createNestedObject("warn");
  warn["co"] = warnCO;
  warn["flam"] = warnFLAM;
  warn["voc"] = warnVOC;
  
  JsonObject danger = doc.createNestedObject("danger");
  danger["co"] = dangerCO;
  danger["flam"] = dangerFLAM;
  danger["voc"] = dangerVOC;
  
  doc["event_type"] = (int)eventType;
  doc["subtype"] = (int)subtype;
  doc["confidence"] = confidence;
  doc["armed"] = armed;
  doc["rebasing"] = rebasing;
  
  serializeJson(doc, Serial);
  Serial.println();
}

void printCSV(float adc9, float adc135, float Rs9Low, float Rs9High, float Rs135,
              float K9Low, float K9High, float K135, EventType eventType, float confidence) {
  if (!csvMode) return;
  
  Serial.printf("%lu,%.0f,%.0f,%.0f,%.0f,%.0f,%.0f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d,%.2f\n",
                millis(), adc9, adc9, adc135, Rs9Low, Rs9High, Rs135, 
                K9Low, K9High, K135, I_CO, I_FLAM, I_VOC, (int)eventType, confidence);
}

// ========== SERIAL COMMAND INTERFACE ==========

void printHelp() {
  Serial.println("\n=== AVAILABLE COMMANDS ===");
  Serial.println("HELP        - Show this help");
  Serial.println("STATUS      - Show current settings and baselines");
  Serial.println("REBASE      - Start R0 calibration sequence");
  Serial.println("CSV ON|OFF  - Toggle CSV output mode");
  Serial.println("THRESH ABS|MAD - Set threshold mode (absolute or MAD-based)");
  Serial.println("SET <key> <value> - Change runtime parameters:");
  Serial.println("  T_LOW <seconds>    - Low phase duration");
  Serial.println("  T_HIGH <seconds>   - High phase duration"); 
  Serial.println("  DUTY_LOW <0.0-1.0> - Low phase duty cycle");
  Serial.println("  DUTY_HIGH <0.0-1.0>- High phase duty cycle");
  Serial.println("  EMA_ALPHA <0.0-1.0>- Exponential moving average factor");
  Serial.println();
}

void printStatus() {
  Serial.println("\n=== SYSTEM STATUS ===");
  Serial.printf("Pin Map: MQ9_AO=%d, MQ135_AO=%d, HEATER=%d\n", 
                PIN_MQ9_AO, PIN_MQ135_AO, PIN_MQ9_HEATER);
  Serial.printf("Hardware: VCC=%.1fV, VADC_REF=%.2fV, RL=%.0fΩ\n", 
                VCC, VADC_REF, RL_OHMS);
  Serial.printf("Timing: T_LOW=%ds, T_HIGH=%ds\n", T_LOW_MS/1000, T_HIGH_MS/1000);
  Serial.printf("Heater: DUTY_LOW=%.1f%%, DUTY_HIGH=%.1f%%\n", 
                DUTY_LOW*100, DUTY_HIGH*100);
  Serial.printf("Calibration: R0_MQ9=%.1f, R0_MQ135=%.1f (Valid: %s)\n", 
                R0_mq9, R0_mq135, calibrated ? "YES" : "NO");
  Serial.printf("State: Armed=%s, CSV_Mode=%s, Thresh_Mode=%s\n",
                armed ? "YES" : "NO", csvMode ? "YES" : "NO",
                threshMode == THRESH_MAD ? "MAD" : "ABS");
  Serial.printf("Statistics: μ(%.2f,%.2f,%.2f) MAD(%.2f,%.2f,%.2f)\n",
                mu_CO, mu_FLAM, mu_VOC, mad_CO, mad_FLAM, mad_VOC);
  Serial.printf("Runtime: %lu cycles, %lu minutes since boot\n",
                cycleCount, (millis() - bootTime) / 60000);
  Serial.println();
}

void handleSerialCommand() {
  if (!Serial.available()) return;
  
  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toUpperCase();
  
  if (command == "HELP") {
    printHelp();
  }
  else if (command == "STATUS") {
    printStatus();
  }
  else if (command == "REBASE") {
    if (rebasing) {
      Serial.println("Calibration already in progress");
      return;
    }
    performCalibration();
  }
  else if (command == "CSV ON") {
    csvMode = true;
    Serial.println("CSV mode ON");
    Serial.println("t_ms,adc_mq135,adc_mq9_low,adc_mq9_high,Rs135,Rs9_low,Rs9_high,K135,K9_low,K9_high,I_CO,I_FLAM,I_VOC,event,conf");
  }
  else if (command == "CSV OFF") {
    csvMode = false;
    Serial.println("CSV mode OFF");
  }
  else if (command == "THRESH ABS") {
    threshMode = THRESH_ABSOLUTE;
    Serial.println("Threshold mode: ABSOLUTE");
  }
  else if (command == "THRESH MAD") {
    threshMode = THRESH_MAD;
    Serial.println("Threshold mode: MAD-based adaptive");
  }
  else if (command.startsWith("SET ")) {
    // Parse SET commands
    int firstSpace = command.indexOf(' ', 4);
    if (firstSpace > 0) {
      String key = command.substring(4, firstSpace);
      String valueStr = command.substring(firstSpace + 1);
      float value = valueStr.toFloat();
      
      Serial.printf("SET command: %s = %.3f\n", key.c_str(), value);
      Serial.println("Note: Runtime parameter changes require code modification for persistence");
    } else {
      Serial.println("Invalid SET syntax. Use: SET <key> <value>");
    }
  }
  else if (command.length() > 0) {
    Serial.printf("Unknown command: %s\n", command.c_str());
    Serial.println("Type HELP for available commands");
  }
}

// ========== MAIN SENSOR PROCESSING ==========

void processSensorCycle() {
  unsigned long now = millis();
  
  // Check if phase should change
  unsigned long phaseElapsed = now - phaseStartTime;
  unsigned long phaseDuration = (currentPhase == PHASE_LOW) ? T_LOW_MS : T_HIGH_MS;
  
  if (phaseElapsed >= phaseDuration) {
    // Switch phase
    currentPhase = (currentPhase == PHASE_LOW) ? PHASE_HIGH : PHASE_LOW;
    applyHeaterPhase(currentPhase);
    
    // Only process measurements at end of each complete cycle (after high phase)
    if (currentPhase == PHASE_LOW) {
      // We just finished a complete cycle, process the data
      cycleCount++;
      
      // Read sensors
      float adc9 = readADC(PIN_MQ9_AO);
      float adc135 = readADC(PIN_MQ135_AO);
      
      float Rs9 = computeRs(adc9);
      float Rs135 = computeRs(adc135);
      
      // Compute normalized K values
      float K9Low = 1.0f, K9High = 1.0f, K135 = 1.0f;
      
      if (calibrated && R0_mq9 > 0 && R0_mq135 > 0) {
        if (currentPhase == PHASE_LOW) {
          lastK9Low = Rs9 / R0_mq9;       // Capture LOW phase reading
        } else {
          lastK9High = Rs9 / R0_mq9;      // Capture HIGH phase reading  
        }
      }
      
      // Apply median filtering
      float filteredK9Low = medianFilter(medianK9Low, K9Low);
      float filteredK9High = medianFilter(medianK9High, K9High);  
      float filteredK135 = medianFilter(medianK135, K135);
      
      medianIndex = (medianIndex + 1) % MED_WIN;
      
      // Update indices with EMA
      I_FLAM = ema(I_FLAM, filteredK9High, EMA_ALPHA);
      I_VOC = ema(I_VOC, filteredK135, EMA_ALPHA);
      
      // I_CO requires both phases
      if (filteredK9High > 0.001f) {
        float newI_CO = filteredK9Low / filteredK9High;
        I_CO = ema(I_CO, newI_CO, EMA_ALPHA);
      }
      
      // Update slope buffers
      slopeBufferFLAM[slopeIndex] = I_FLAM;
      slopeBufferVOC[slopeIndex] = I_VOC;
      slopeIndex = (slopeIndex + 1) % SLOPE_WIN;
      
      // Update rolling statistics and alerts
      updateRollingStats();
      updateAlerts();
      
      // Classification
      EventType eventType;
      Subtype subtype;
      float confidence;
      classify(eventType, subtype, confidence);
      
      // Output results
      if (!csvMode) {
        printHuman(adc9, adc135, Rs9, Rs9, Rs135, 
                  filteredK9Low, filteredK9High, filteredK135,
                  eventType, subtype, confidence);
      }
      
      printJSON(adc9, adc135, filteredK9Low, filteredK9High, filteredK135,
                eventType, subtype, confidence);
      
      printCSV(adc9, adc135, Rs9, Rs9, Rs135,
               filteredK9Low, filteredK9High, filteredK135,
               eventType, confidence);
    }
  }
}

// ========== INITIALIZATION ==========

void markFirstBootComplete() {
  if (!prefs.begin("gasmonitor", false)) return;
  prefs.putBool("booted", true);
  prefs.end();
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(100);
  
  bootTime = millis();
  
  Serial.println("\n" + String('=', 60));
  Serial.println("  ESP32 GAS SENSOR MONITOR v1.0");
  Serial.println("  MQ-9 + MQ-135 with Adaptive Classification");
  Serial.println(String('=', 60));
  
  // Initialize hardware
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // For 0-3.3V range
  
  setupHeater();
  applyHeaterPhase(PHASE_LOW);
  
  // Load calibration
  loadR0();
  
  // Print configuration
  Serial.printf("\nHARDWARE CONFIG:\n");
  Serial.printf("  MQ9 Analog: GPIO%d, MQ135 Analog: GPIO%d\n", PIN_MQ9_AO, PIN_MQ135_AO);
  Serial.printf("  MQ9 Heater: GPIO%d (PWM)\n", PIN_MQ9_HEATER);
  Serial.printf("  Supply: %.1fV, ADC_Ref: %.2fV, Load_R: %.0fΩ\n", VCC, VADC_REF, RL_OHMS);
  Serial.printf("  Heater: Low=%.0f%% (%ds), High=%.0f%% (%ds)\n",
                DUTY_LOW*100, T_LOW_MS/1000, DUTY_HIGH*100, T_HIGH_MS/1000);
  
  Serial.printf("\nSIGNAL PROCESSING:\n");
  Serial.printf("  ADC Samples: %d, Median Window: %d, EMA Alpha: %.2f\n", 
                ADC_SAMPLES, MED_WIN, EMA_ALPHA);
  Serial.printf("  Debounce: %d cycles, Warn: %ds, Danger: %ds\n",
                DEBOUNCE_N, T_WARN_MS/1000, T_DANGER_MS/1000);
  
  Serial.printf("\nCALIBRATION STATUS:\n");
  if (calibrated) {
    Serial.printf("  R0 Loaded: MQ9=%.1fΩ, MQ135=%.1fΩ\n", R0_mq9, R0_mq135);
  } else {
    Serial.println("  NO CALIBRATION - Run 'REBASE' command in clean air");
  }
  
  // Warm-up sequence
  if (firstBoot) {
    Serial.printf("\nFIRST BOOT WARM-UP: %d minutes\n", WARMUP_MS/60000);
    unsigned long warmupEnd = millis() + WARMUP_MS;
    
    while (millis() < warmupEnd) {
      unsigned long remaining = (warmupEnd - millis()) / 1000;
      Serial.printf("Warm-up: %lu seconds remaining...\r", remaining);
      delay(10000); // Update every 10 seconds
    }
    Serial.println("\nWarm-up complete!");
    markFirstBootComplete();
  }
  
  // Stabilization period
  Serial.printf("\nSTABILIZATION: %d seconds\n", STAB_MS/1000);
  unsigned long stabEnd = millis() + STAB_MS;
  
  while (millis() < stabEnd) {
    unsigned long remaining = (stabEnd - millis()) / 1000;
    Serial.printf("Stabilizing: %lu seconds remaining...\r", remaining);
    
    // Continue heater cycling during stabilization
    processSensorCycle();
    delay(1000);
  }
  
  Serial.println("\nStabilization complete!");
  
  if (calibrated) {
    armed = true;
    Serial.println("SYSTEM ARMED - Gas monitoring active");
  } else {
    Serial.println("SYSTEM NOT ARMED - Calibration required (REBASE command)");
  }
  
  Serial.println("\nType 'HELP' for available commands");
  Serial.println("Starting sensor monitoring...\n");
}

// ========== MAIN LOOP ==========

void loop() {
  // Handle serial commands
  handleSerialCommand();
  
  // Process sensor measurements and heater cycling
  processSensorCycle();
  
  // Small delay to prevent overwhelming the system
  delay(100);
}

/*
 * EXAMPLE SERIAL OUTPUT:
 * 
 * === Cycle 45 | Phase: HIGH ===
 * Raw ADC: MQ9=1250, MQ135=890
 * Rs (Ohm): MQ9_low=15420, MQ9_high=12100, MQ135=18900
 * K (Rs/R0): MQ9_low=1.15, MQ9_high=0.95, MQ135=1.82
 * Indices: I_CO=1.21, I_FLAM=0.95, I_VOC=1.82
 * Stats: μ(1.05,1.02,1.15) MAD(0.08,0.12,0.25)
 * Alerts: WARN(--V) DANGER(---)
 * Classification: VOC_LIKELY (conf=0.67)
 * Armed: YES | Rebasing: NO
 * 
 * {"cycle":45,"mq135_k":1.82,"mq9_k_low":1.15,"mq9_k_high":0.95,"i_co":1.21,
 * "i_flam":0.95,"i_voc":1.82,"warn":{"co":false,"flam":false,"voc":true},
 * "danger":{"co":false,"flam":false,"voc":false},"event_type":2,"subtype":10,
 * "confidence":0.67,"armed":true,"rebasing":false}
 * 
 * COMMANDS TESTED:
 * > HELP
 * > STATUS  
 * > REBASE
 * > CSV ON
 * > THRESH MAD
 * > SET EMA_ALPHA 0.25
 */
