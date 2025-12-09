#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <MAX30105.h>
#include <heartRate.h>

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

void setup() {
  Serial.begin(115200);
  while(!Serial) {
    delay(10);
  }
  
  delay(1000);
  Serial.println("\n\n========================================");
  Serial.println("MAX30102 + OLED Heart Rate Monitor");
  Serial.println("Shared I2C Bus (GPIO4=SDA, GPIO5=SCL)");
  Serial.println("========================================\n");

  // Initialize I2C bus (both devices on same bus)
  Serial.println("Initializing I2C Bus...");
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  delay(500);
  Serial.println("✓ I2C initialized\n");

  // Scan bus
  Serial.println("Scanning I2C bus...");
  scanBus();
  delay(500);

  // Initialize OLED
  Serial.println("Initializing OLED at 0x3C...");
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("ERROR: OLED not found!");
    while(1) {
      Serial.println("OLED Error - Check wiring");
      delay(2000);
    }
  }
  Serial.println("✓ OLED initialized!\n");
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Initializing MAX...");
  display.display();
  
  delay(500);

  // Initialize MAX30102
  Serial.println("Initializing MAX30102 at 0x57...");
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("ERROR: MAX30102 not found!");
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
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
  
  Serial.println("✓ MAX30102 initialized!\n");
  
  // Configure MAX30102
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeGreen(0);
  particleSensor.setPulseAmplitudeIR(0x33);
  
  Serial.println("✓ Setup complete!\n");
  
  // Show welcome screen
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
}

void loop() {
  // Read sensor values
  long irValue = particleSensor.getIR();
  long redValue = particleSensor.getRed();

  // Detect heartbeat
  if (checkForBeat(irValue) == true) {
    long delta = millis() - lastBeat;
    lastBeat = millis();

    beatsPerMinute = 60 / (delta / 1000.0);

    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
    }
  }

  // Calculate average BPM
  float avgBPM = 0;
  for (byte x = 0; x < RATE_SIZE; x++)
    avgBPM += rates[x];
  avgBPM /= RATE_SIZE;

  // Calculate SpO2
  if (redValue > 0 && irValue > 0) {
    float ratio = (float)redValue / irValue;
    avgSpO2 = 110 - 25 * ratio;
    
    if (avgSpO2 < 80) avgSpO2 = 80;
    if (avgSpO2 > 100) avgSpO2 = 100;
  }

  // Update display and serial every UPDATE_INTERVAL
  if (millis() - lastUpdate > UPDATE_INTERVAL) {
    lastUpdate = millis();
    
    // Update OLED Display
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    
    // Title
    display.setCursor(0, 0);
    display.println("HEART RATE MONITOR");
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
    
    // Check if finger is detected
    if (irValue < 50000) {
      display.setTextSize(2);
      display.setCursor(15, 25);
      display.println("NO FINGER");
      display.setTextSize(1);
      display.setCursor(10, 50);
      display.println("Place finger on sensor");
    } else {
      // BPM Display
      display.setTextSize(3);
      display.setCursor(0, 18);
      if (avgBPM > 0) {
        display.print((int)avgBPM);
      } else {
        display.print("--");
      }
      display.setTextSize(1);
      display.setCursor(50, 25);
      display.println("BPM");
      
      // SpO2 Display
      display.setTextSize(2);
      display.setCursor(0, 45);
      display.print((int)avgSpO2);
      display.println("%");
      
      display.setTextSize(1);
      display.setCursor(50, 50);
      display.println("SpO2");
      
      // Signal indicator
      display.setCursor(90, 50);
      if (irValue > 150000) {
        display.println("+++");
      } else if (irValue > 100000) {
        display.println("++");
      } else {
        display.println("+");
      }
    }
    
    display.display();
    
    // Serial output for debugging
    Serial.print("BPM: ");
    if (avgBPM > 0) {
      Serial.print((int)avgBPM);
    } else {
      Serial.print("--");
    }
    Serial.print(" | SpO2: ");
    Serial.print((int)avgSpO2);
    Serial.print("% | IR: ");
    Serial.println(irValue);
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
  
  if(foundCount == 0) {
    Serial.println("  No devices found!");
  } else {
    Serial.print("  Total: ");
    Serial.print(foundCount);
    Serial.println(" device(s)\n");
  }
}
