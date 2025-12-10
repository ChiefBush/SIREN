//contents:
// wristband_espnow.ino
// Wristband with MAX30102 + SSD1306 + ESP-NOW integration (fixed peer/channel)

#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> // for esp_wifi_set_channel

// OLED Display
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// I2C Pins - Both devices on same bus (GPIO4=SDA, GPIO5=SCL)
#define SDA_PIN 4
#define SCL_PIN 5

MAX30105 particleSensor;

// Heart rate calculation
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;

float beatsPerMinute = 0;
float avgSpO2 = 0;

// Timing
unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 500;

// ========================= ESP-NOW message types & sizes =========================
#define MSG_TYPE_VITALS 0x01
#define MSG_TYPE_TEXT   0x02
#define MSG_TYPE_ACK    0x03

#define MAX_TEXT_LEN 128

typedef struct __attribute__((packed)) {
  uint8_t msgType;      // MSG_TYPE_VITALS
  uint8_t bpm;          // 0..255
  uint8_t spo2;         // 0..100
  uint8_t finger;       // 0/1
  uint32_t timestamp;   // millis()
} espnow_vitals_t;

typedef struct __attribute__((packed)) {
  uint8_t msgType;        // MSG_TYPE_TEXT
  uint32_t messageId;
  uint8_t length;         // number of bytes used in message
  char text[MAX_TEXT_LEN];
} espnow_text_t;

typedef struct __attribute__((packed)) {
  uint8_t msgType;        // MSG_TYPE_ACK
  uint32_t messageId;
  uint8_t success;        // 0/1
} espnow_ack_t;

// ========================= Peer MAC addresses (from mac_addresses.txt) =============
// Edge Node MAC: 28:56:2f:49:56:ac
uint8_t edgeNodeMac[6] = {0x28, 0x56, 0x2F, 0x49, 0x56, 0xAC};

// ========================= Display / connection state =========================
bool displayingMessage = false;
String currentMessage = "";
unsigned long messageStartTime = 0;
uint32_t currentMessageId = 0;

bool edgeNodeConnected = false;
unsigned long lastEdgeNodeContact = 0;

bool espnowReady = false;

// Vitals send interval and timers
const unsigned long VITALS_INTERVAL = 25000UL; // 25 seconds
unsigned long lastVitalsSent = 0;

// message display duration (15 seconds)
const unsigned long MESSAGE_DISPLAY_MS = 15000UL;

// connection timeouts
const unsigned long EDGE_NODE_DISCONNECT_MS = 60000UL; // 60 seconds

// Forward declarations
void initESPNOW();
void onDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len);
void onDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status);
void sendVitals(uint8_t bpm, uint8_t spo2, bool fingerDetected);
void sendAcknowledgment(uint32_t messageId, bool success);
void checkConnection();
void displayMessageScreen(const String &msg, uint32_t messageId);
void displayVitalsScreen(uint8_t bpm, uint8_t spo2, bool finger, bool connected);
void drawWrappedText(const String &text, int x, int y, int maxWidthChars, int lineHeight);
void scanBus();

// ========================= Setup & Loop =========================
void setup() {
  Serial.begin(115200);
  while(!Serial) { delay(10); }
  delay(200);

  Serial.println("\n\nMAX30102 + OLED Heart Rate Monitor + ESP-NOW (fixed peer/channel)");

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);

  // Set WiFi channel explicitly for ESP-NOW to match edge node
  int channel = 1;
  esp_err_t err = esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
  if (err == ESP_OK) {
    Serial.printf("Setting WiFi channel to %d for ESP-NOW\n", channel);
  } else {
    Serial.printf("Failed to set WiFi channel (%d) err=%d\n", channel, err);
  }

  initESPNOW();

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  delay(500);
  scanBus();
  delay(500);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("ERROR: OLED not found!");
    while(1) {
      Serial.println("OLED Error - Check wiring");
      delay(2000);
    }
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Initializing MAX...");
  display.display();
  delay(500);

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("ERROR: MAX30102 not found!");
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("MAX30102 Error!");
    display.setCursor(0, 10);
    display.println("Check wiring");
    display.display();
    while(1) {
      Serial.println("MAX30102 Error - Check wiring");
      delay(2000);
    }
  }

  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeGreen(0);
  particleSensor.setPulseAmplitudeIR(0x33);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Heart Rate Monitor");
  display.setCursor(0, 15);
  display.println("Place finger on sensor");
  display.setCursor(0, 30);
  display.println("and keep it steady...");
  display.display();
  delay(3000);

  lastVitalsSent = millis() - (VITALS_INTERVAL - 5000); // send first vitals soon
}

void loop() {
  long irValue = particleSensor.getIR();
  long redValue = particleSensor.getRed();

  if (checkForBeat(irValue) == true) {
    long delta = millis() - lastBeat;
    lastBeat = millis();

    beatsPerMinute = 60 / (delta / 1000.0);
    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
    }
  }

  float avgBPM = 0;
  for (byte x = 0; x < RATE_SIZE; x++) avgBPM += rates[x];
  avgBPM /= RATE_SIZE;

  if (redValue > 0 && irValue > 0) {
    float ratio = (float)redValue / irValue;
    avgSpO2 = 110 - 25 * ratio;
    if (avgSpO2 < 80) avgSpO2 = 80;
    if (avgSpO2 > 100) avgSpO2 = 100;
  }

  if (millis() - lastUpdate > UPDATE_INTERVAL) {
    lastUpdate = millis();
    if (displayingMessage) {
      unsigned long elapsed = millis() - messageStartTime;
      if (elapsed >= MESSAGE_DISPLAY_MS) {
        displayingMessage = false;
        currentMessage = "";
      } else {
        displayMessageScreen(currentMessage, currentMessageId);
      }
    } else {
      bool fingerDetected = (irValue > 50000);
      displayVitalsScreen((uint8_t)avgBPM, (uint8_t)avgSpO2, fingerDetected, edgeNodeConnected);
    }
    Serial.print("BPM: ");
    if (avgBPM > 0) Serial.print((int)avgBPM); else Serial.print("--");
    Serial.print(" | SpO2: ");
    Serial.print((int)avgSpO2);
    Serial.print("% | IR: ");
    Serial.println(irValue);
  }

  if (millis() - lastVitalsSent >= VITALS_INTERVAL) {
    long irVal = particleSensor.getIR();
    bool fingerDetected = (irVal > 50000);
    uint8_t bpmSend = 0;
    uint8_t spo2Send = 0;
    if (fingerDetected && beatsPerMinute > 0 && beatsPerMinute < 255) bpmSend = (uint8_t)beatsPerMinute;
    if (fingerDetected && avgSpO2 >= 0 && avgSpO2 <= 100) spo2Send = (uint8_t)avgSpO2;
    sendVitals(bpmSend, spo2Send, fingerDetected);
    lastVitalsSent = millis();
  }

  checkConnection();
  delay(20);
}

// ========================= ESP-NOW Implementation (Wristband) =========================

void initESPNOW() {
  if (esp_now_init() != ESP_OK) {
    Serial.println("⚠ ESP-NOW init failed");
    espnowReady = false;
    return;
  }
  espnowReady = true;
  Serial.println("✓ ESP-NOW initialized (wristband)");

  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataRecv);

  // Add edge node as peer bound to STA and channel 1
  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, edgeNodeMac, 6);
  peerInfo.channel = 1;
#if defined(ESP_IF_WIFI_STA)
  peerInfo.ifidx = ESP_IF_WIFI_STA;
#elif defined(WIFI_IF_STA)
  peerInfo.ifidx = WIFI_IF_STA;
#else
  peerInfo.ifidx = 0;
#endif
  peerInfo.encrypt = false;

  if (!esp_now_is_peer_exist(edgeNodeMac)) {
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
      Serial.println("⚠ Failed to add ESP-NOW peer (edge node)");
    } else {
      Serial.println("✓ Edge node ESP-NOW peer added");
    }
  } else {
    Serial.println("✓ Edge node peer already exists");
  }
}

void onDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len) {
  if (data == NULL || len < 1) return;
  uint8_t msgType = data[0];
  lastEdgeNodeContact = millis();
  edgeNodeConnected = true;
  if (msgType == MSG_TYPE_TEXT) {
    if (len < 6) {
      Serial.println("⚠ Received TEXT with unexpected minimal length");
      return;
    }
    uint32_t msgId = 0;
    uint8_t lengthField = 0;
    memcpy(&msgId, &data[1], sizeof(msgId));
    memcpy(&lengthField, &data[5], 1);
    if (lengthField > MAX_TEXT_LEN - 1) lengthField = MAX_TEXT_LEN - 1;
    char txtbuf[MAX_TEXT_LEN + 1];
    memset(txtbuf, 0, sizeof(txtbuf));
    int copyLen = min((int)lengthField, len - 6);
    if (copyLen > 0) memcpy(txtbuf, &data[6], copyLen);
    txtbuf[copyLen] = '\0';
    String receivedText = String(txtbuf);
    Serial.printf("[ESP-NOW RX] TEXT msgId=%lu text='%s'\n", (unsigned long)msgId, receivedText.c_str());
    displayMessageScreen(receivedText, msgId);
    sendAcknowledgment(msgId, true);
  } else if (msgType == MSG_TYPE_ACK) {
    Serial.println("[ESP-NOW RX] Received ACK (ignored at wristband)");
  } else if (msgType == MSG_TYPE_VITALS) {
    Serial.println("[ESP-NOW RX] Received VITALS (ignored at wristband)");
  } else {
    Serial.printf("[ESP-NOW RX] Unknown msgType: 0x%02X\n", msgType);
  }
}

// send callback (wifi_tx_info_t* signature)
void onDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  Serial.printf("[ESP-NOW TX] status=%s\n", (status == ESP_NOW_SEND_SUCCESS) ? "OK":"FAIL");
}

void sendVitals(uint8_t bpm, uint8_t spo2, bool fingerDetected) {
  if (!espnowReady) {
    Serial.println("ESP-NOW not ready - cannot send vitals");
    return;
  }
  espnow_vitals_t pkt;
  pkt.msgType = MSG_TYPE_VITALS;
  pkt.bpm = bpm;
  pkt.spo2 = spo2;
  pkt.finger = fingerDetected ? 1 : 0;
  pkt.timestamp = (uint32_t)millis();
  esp_err_t rc = esp_now_send(edgeNodeMac, (uint8_t *)&pkt, sizeof(pkt));
  if (rc == ESP_OK) Serial.printf("Sent VITALS bpm=%u spo2=%u finger=%s\n", bpm, spo2, fingerDetected?"YES":"NO");
  else Serial.printf("Failed to send VITALS (rc=%d)\n", rc);
}

void sendAcknowledgment(uint32_t messageId, bool success) {
  if (!espnowReady) {
    Serial.println("ESP-NOW not ready - cannot send ack");
    return;
  }
  espnow_ack_t ack;
  ack.msgType = MSG_TYPE_ACK;
  ack.messageId = messageId;
  ack.success = success ? 1 : 0;
  esp_err_t rc = esp_now_send(edgeNodeMac, (uint8_t *)&ack, sizeof(ack));
  if (rc == ESP_OK) Serial.printf("Sent ACK msgId=%lu success=%s\n", (unsigned long)messageId, success ? "YES":"NO");
  else Serial.printf("Failed to send ACK (rc=%d)\n", rc);
}

void checkConnection() {
  unsigned long now = millis();
  if (edgeNodeConnected && (now - lastEdgeNodeContact > EDGE_NODE_DISCONNECT_MS)) {
    edgeNodeConnected = false;
    Serial.println("Edge node connection timeout (60s) -> DISCONNECTED");
    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 10);
    display.println("NO EDGE NODE");
    display.setTextSize(1);
    display.setCursor(0, 40);
    display.println("Reconnecting...");
    display.display();
  }
}

void displayMessageScreen(const String &msg, uint32_t messageId) {
  displayingMessage = true;
  currentMessage = msg;
  messageStartTime = millis();
  currentMessageId = messageId;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("MSG:");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  display.setCursor(0, 12);
  drawWrappedText(currentMessage, 0, 12, 21, 10);
  unsigned long elapsed = millis() - messageStartTime;
  unsigned long remaining = 0;
  if (elapsed < MESSAGE_DISPLAY_MS) remaining = (MESSAGE_DISPLAY_MS - elapsed) / 1000;
  display.setTextSize(1);
  display.setCursor(90, 0);
  display.printf("%2lus", remaining);
  display.display();
}

void displayVitalsScreen(uint8_t bpm, uint8_t spo2, bool finger, bool connected) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(88, 0);
  if (connected) display.print("[OK]");
  else display.print("[DISC]");
  display.setCursor(0, 0);
  display.println("HEART RATE MONITOR");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  if (!finger) {
    display.setTextSize(2);
    display.setCursor(15, 25);
    display.println("NO FINGER");
    display.setTextSize(1);
    display.setCursor(10, 50);
    display.println("Place finger on sensor");
  } else {
    display.setTextSize(3);
    display.setCursor(0, 18);
    if (bpm > 0) display.print(bpm); else display.print("--");
    display.setTextSize(1);
    display.setCursor(50, 25);
    display.println("BPM");
    display.setTextSize(2);
    display.setCursor(0, 45);
    display.print(spo2);
    display.println("%");
    display.setTextSize(1);
    display.setCursor(50, 50);
    display.println("SpO2");
    display.setCursor(90, 50);
    display.println("++");
  }
  display.display();
}

void drawWrappedText(const String &text, int x, int y, int maxWidthChars, int lineHeight) {
  int start = 0;
  int len = text.length();
  int line = 0;
  while (start < len) {
    int remaining = len - start;
    int take = remaining;
    if (take > maxWidthChars) take = maxWidthChars;
    if (take == maxWidthChars) {
      int lastSpace = -1;
      for (int i = 0; i < take; i++) {
        if (text.charAt(start + i) == ' ') lastSpace = i;
      }
      if (lastSpace > 0) take = lastSpace;
    }
    String part = text.substring(start, start + take);
    display.setCursor(x, y + (line * lineHeight));
    display.println(part);
    line++;
    start += take;
    while (start < len && text.charAt(start) == ' ') start++;
  }
}

void scanBus() {
  int foundCount = 0;
  for(byte i = 0; i < 128; i++) {
    Wire.beginTransmission(i);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("  Found device at: 0x");
      if (i < 16) Serial.print("0");
      Serial.println(i, HEX);
      foundCount++;
    }
  }
  if(foundCount == 0) Serial.println("  No devices found!");
  else {
    Serial.print("  Total: ");
    Serial.print(foundCount);
    Serial.println(" device(s)\n");
  }
}
