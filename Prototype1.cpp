/*
ESP8266MOD     MQ-9 Sensor     MQ-135 Sensor
----------     -----------     -------------
3.3V      -->  VCC        -->  VCC
GND       -->  GND        -->  GND
A0        -->  A0 (analog output)
D1        -->                  D0 (digital output)

Created by Shishir Dwivedi - 17 Aug 2025 1:11 AM

Both MQ series sensors are connected in different GPIOs, MQ-9 is in Analog
output and MQ-135 in Digital Output,
This prototype is pre multiplexer :D


*/



#include <ESP8266WiFi.h>

// Pin definitions
const int MQ9_ANALOG = A0;      // MQ-9 connected to analog pin
const int MQ135_DIGITAL = D1;   // MQ-135 digital output

// Calibration values - TO BE CHANGED
float MQ9_THRESHOLD = 1.5;      // Voltage threshold for MQ-9
bool MQ135_ALERT_STATE = LOW;   // MQ-135 alerts when pin goes LOW

void setup() {
  Serial.begin(115200); // Serial Monitor baud rate
  pinMode(MQ135_DIGITAL, INPUT);
  
  delay(2000);
  Serial.println("=== ESP8266 Gas Detection System ===");
  Serial.println("MQ-9: Analog reading (CO, LPG, Methane)");
  Serial.println("MQ-135: Digital alert (Air pollution)");
  Serial.println("Warming up sensors... wait 20 seconds");
  
  // Sensor warm-up period
  delay(20000);
  Serial.println("System ready!");
}

void readAndIdentifyGases() {
  Serial.println("\n=== Gas Detection Results ===");
  
  // Read MQ-9 analog value
  int mq9_raw = analogRead(MQ9_ANALOG);
  float mq9_voltage = mq9_raw * (3.3 / 1023.0);
  
  Serial.print("MQ-9 Raw Value: ");
  Serial.print(mq9_raw);
  Serial.print(" | Voltage: ");
  Serial.print(mq9_voltage, 2);
  Serial.print("V | Status: ");
  
  // Analyze MQ-9 readings
  if (mq9_voltage > 2.0) {
    Serial.println(" >>> HIGH DANGER - Toxic gas levels!");
    Serial.println("   Likely gases: Carbon Monoxide, LPG, or Methane");
  } else if (mq9_voltage > MQ9_THRESHOLD) {
    Serial.println(" >>> MODERATE - Gas detected");
    Serial.println("   Possible: Low levels of CO/LPG/Methane");
  } else {
    Serial.println(" >>> NORMAL - No dangerous gases");
  }
  
  // Read MQ-135 digital alert
  int mq135_digital = digitalRead(MQ135_DIGITAL);
  Serial.print("MQ-135 Digital Pin: ");
  Serial.print(mq135_digital == HIGH ? "HIGH" : "LOW");
  Serial.print(" | Status: ");
  
  if (mq135_digital == MQ135_ALERT_STATE) {
    Serial.println(" >>> ALERT - Air pollution detected!");
    Serial.println("   Possible pollutants: Ammonia, Smoke, Benzene, Alcohol, CO2");
  } else {
    Serial.println(" >>> GOOD - Air quality acceptable");
  }
  
  Serial.println("========================");
}

void loop() {
  readAndIdentifyGases();
  delay(3000); // Read every 3 seconds
}
