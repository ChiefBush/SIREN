// ========================= REPLACE YOUR setup() FUNCTION WITH THIS =========================
void setup() {
  Serial.begin(115200);
  while(!Serial) { delay(10); }
  delay(200);

  Serial.println("\n\nMAX30102 + OLED Heart Rate Monitor + ESP-NOW (fixed peer.ifidx)");

  // CRITICAL FIX: Initialize WiFi BEFORE setting channel
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false);  // Changed from true to false
  delay(100);  // Give WiFi time to initialize
  
  // Start WiFi explicitly
  WiFi.begin();
  delay(100);

  // Set WiFi channel explicitly for ESP-NOW to match edge node (both must use same channel)
  int channel = 1;
  esp_err_t cherr = esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
  if (cherr == ESP_OK) {
    Serial.printf("✓ WiFi channel set to %d for ESP-NOW\n", channel);
  } else {
    Serial.printf("⚠ Failed to set WiFi channel (%d) err=%d\n", channel, (int)cherr);
    // Continue anyway - ESP-NOW will use default channel
  }

  // Initialize ESP-NOW AFTER WiFi is ready
  initESPNOW();
  
  // Give ESP-NOW time to fully initialize
  delay(200);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  delay(500);

  Serial.println("\n=== I2C Device Scan ===");
  scanBus();
  Serial.println("Note: 0x3C=OLED, 0x57=MAX30102 (both correct)");
  delay(500);

  // Initialize OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("ERROR: OLED not found!");
    while(1) { Serial.println("OLED Error - Check wiring"); delay(2000); }
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Initializing MAX...");
  display.display();
  delay(500);

  // Initialize MAX30102
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
  display.setCursor(0, 0);
  display.println("Heart Rate Monitor");
  display.setCursor(0, 15);
  display.println("Place finger on sensor");
  display.setCursor(0, 30);
  display.println("and keep it steady...");
  display.display();
  
  delay(3000);

  lastVitalsSent = millis() - (VITALS_INTERVAL - 5000); // send first vitals soon, 5s before LoRa typical
  
  Serial.println("\n✓ Wristband ready - waiting for edge node connection...");
}


// ========================= REPLACE YOUR initESPNOW() FUNCTION WITH THIS =========================
void initESPNOW() {
  // Ensure WiFi is started first
  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("⚠ WiFi not ready, attempting to start...");
    WiFi.mode(WIFI_STA);
    delay(100);
  }
  
  if (esp_now_init() != ESP_OK) {
    Serial.println("⚠ ESP-NOW init failed - retrying...");
    delay(500);
    // Try once more
    if (esp_now_init() != ESP_OK) {
      Serial.println("✗ ESP-NOW init failed after retry");
      espnowReady = false;
      return;
    }
  }
  espnowReady = true;
  Serial.println("✓ ESP-NOW initialized (wristband)");

  // Register callbacks - use signatures for ESP32 Arduino Core 3.3.2
  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataRecv);

  // Small delay before adding peer
  delay(100);

  // Register peer (edge node) and bind to channel 1 and STA interface
  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, edgeNodeMac, 6);
  peerInfo.channel = 1;  // Must match edge node

  // Set interface index robustly; use macros when available otherwise cast
  #if defined(ESP_IF_WIFI_STA)
    peerInfo.ifidx = ESP_IF_WIFI_STA;
  #elif defined(WIFI_IF_STA)
    peerInfo.ifidx = WIFI_IF_STA;
  #else
    peerInfo.ifidx = (wifi_interface_t)0; // cast fallback
  #endif

  peerInfo.encrypt = false;

  if (!esp_now_is_peer_exist(edgeNodeMac)) {
    esp_err_t addStatus = esp_now_add_peer(&peerInfo);
    if (addStatus != ESP_OK) {
      Serial.printf("⚠ Failed to add ESP-NOW peer (edge node) - error: %d\n", addStatus);
    } else {
      Serial.println("✓ Edge node ESP-NOW peer added");
      // Print the MAC address we added
      Serial.printf("  Peer MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                    edgeNodeMac[0], edgeNodeMac[1], edgeNodeMac[2],
                    edgeNodeMac[3], edgeNodeMac[4], edgeNodeMac[5]);
    }
  } else {
    Serial.println("✓ Edge node peer already exists");
  }
  
  // Final delay to ensure everything is ready
  delay(100);
}
