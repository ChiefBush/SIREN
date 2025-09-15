#include <HardwareSerial.h>

HardwareSerial fnm16p(2);  // use UART2

// FN-M16P Command Structure
const byte FRAME_START = 0x7E;
const byte FRAME_END = 0xEF;
const byte VERSION = 0xFF;
const byte NO_FEEDBACK = 0x00;
const byte WITH_FEEDBACK = 0x01;

// Commands
const byte CMD_PLAY_TRACK = 0x03;
const byte CMD_VOLUME = 0x06;
const byte CMD_STOP = 0x16;

// Audio file mapping
enum AudioFiles {
  LOADING_AUDIO = 1,      // 0001.mp3 - Boot/Loading
  SUCCESS_AUDIO = 2,      // 0002.mp3 - Success/Normal operation
  ERROR_AUDIO = 3,        // 0003.mp3 - Error/Fault detected
  WARNING_AUDIO = 4,      // 0004.mp3 - Warning condition
  WELCOME_AUDIO = 5,      // 0005.mp3 - Motion/Presence detected
  GOODBYE_AUDIO = 6,      // 0006.mp3 - System shutdown/standby
  ALERT_AUDIO = 7,        // 0007.mp3 - Critical alert
  NOTIFICATION_AUDIO = 8  // 0008.mp3 - General notification
};

// System state variables
bool bootupComplete = false;
bool isPlaying = false;
unsigned long lastPlayTime = 0;
unsigned long lastSensorCheck = 0;
unsigned long bootTime = 0;

// Simulated sensor values (replace with real sensors)
float temperature = 25.0;
int motionLevel = 0;
int lightLevel = 512;  // 0-1023 (ADC range)
int soundLevel = 200;  // 0-1023
bool buttonState = false;
int batteryLevel = 100;  // 0-100%
bool emergencyFlag = false;

// Thresholds for triggering audio
const float TEMP_WARNING = 35.0;
const float TEMP_CRITICAL = 45.0;
const int MOTION_THRESHOLD = 500;
const int LIGHT_LOW_THRESHOLD = 200;
const int SOUND_HIGH_THRESHOLD = 700;
const int BATTERY_LOW_THRESHOLD = 20;

// Timing controls
const unsigned long SENSOR_CHECK_INTERVAL = 2000;  // Check sensors every 2 seconds
const unsigned long MIN_PLAY_INTERVAL = 5000;      // Minimum 5 seconds between audio plays
const unsigned long BOOTUP_DELAY = 3000;           // Wait 3 seconds before starting sensor monitoring

void setup() {
  Serial.begin(115200);
  fnm16p.begin(9600, SERIAL_8N1, 16, 17);  // RX=16, TX=17
  
  Serial.println("=== FN-M16P Automated Audio System ===");
  Serial.println("Booting up...");
  
  bootTime = millis();
  
  // Initialize random seed
  randomSeed(analogRead(A0));
  
  delay(2000);  // Give module time to initialize
  
  // Set volume
  setVolume(22);
  delay(200);
  
  // Play boot audio
  Serial.println("🎵 Playing boot audio (0001.mp3)");
  playAudioFile(LOADING_AUDIO);
  
  delay(BOOTUP_DELAY);
  bootupComplete = true;
  
  Serial.println("✅ System ready - Starting automated monitoring");
  Serial.println("📊 Monitoring: Temperature | Motion | Light | Sound | Battery");
  Serial.println("⌨️  Manual commands: temp, motion, light, sound, emergency, stop, vol+, vol-, status, help");
  Serial.println();
}

void loop() {
  // Handle manual commands
  handleManualCommands();
  
  // Clear any module replies
  clearModuleBuffer();
  
  // Only start sensor monitoring after bootup is complete
  if (bootupComplete) {
    // Update simulated sensor values
    updateSensorValues();
    
    // Check sensors and trigger audio if needed
    if (millis() - lastSensorCheck >= SENSOR_CHECK_INTERVAL) {
      checkSensorsAndPlayAudio();
      lastSensorCheck = millis();
    }
  }
  
  delay(100);
}

void updateSensorValues() {
  // Simulate realistic sensor data with random variations
  static unsigned long lastUpdate = 0;
  
  if (millis() - lastUpdate >= 1000) {  // Update every second
    // Temperature: Slow random walk
    temperature += random(-10, 11) / 10.0;  // ±1°C variation
    if (temperature < 15) temperature = 15;
    if (temperature > 50) temperature = 50;
    
    // Motion: Random spikes
    if (random(100) < 15) {  // 15% chance of motion
      motionLevel = random(400, 800);
    } else {
      motionLevel = random(0, 100);
    }
    
    // Light: Gradual changes (day/night simulation)
    lightLevel += random(-50, 51);
    if (lightLevel < 0) lightLevel = 0;
    if (lightLevel > 1023) lightLevel = 1023;
    
    // Sound: Random environmental noise
    soundLevel = random(100, 300);
    if (random(100) < 10) {  // 10% chance of loud sound
      soundLevel = random(600, 900);
    }
    
    // Battery: Slowly drain
    if (random(100) < 2) {  // 2% chance to decrease
      batteryLevel--;
      if (batteryLevel < 0) batteryLevel = 0;
    }
    
    // Emergency: Very rare random event
    if (random(1000) < 2) {  // 0.2% chance
      emergencyFlag = true;
    }
    
    lastUpdate = millis();
  }
}

void checkSensorsAndPlayAudio() {
  // Don't interrupt if already playing
  if (isPlaying && (millis() - lastPlayTime < MIN_PLAY_INTERVAL)) {
    return;
  }
  
  // Priority order: Emergency > Critical > Warning > Normal events
  
  // EMERGENCY - Highest priority
  if (emergencyFlag) {
    Serial.println("🚨 EMERGENCY DETECTED!");
    printSensorValues();
    playAudioFile(ALERT_AUDIO);
    emergencyFlag = false;  // Reset flag
    return;
  }
  
  // CRITICAL CONDITIONS
  if (temperature >= TEMP_CRITICAL) {
    Serial.println("🌡️ CRITICAL: Temperature too high!");
    printSensorValues();
    playAudioFile(ERROR_AUDIO);
    return;
  }
  
  if (batteryLevel <= 5) {
    Serial.println("🔋 CRITICAL: Battery critically low!");
    printSensorValues();
    playAudioFile(ERROR_AUDIO);
    return;
  }
  
  // WARNING CONDITIONS
  if (temperature >= TEMP_WARNING) {
    Serial.println("⚠️ WARNING: High temperature detected");
    printSensorValues();
    playAudioFile(WARNING_AUDIO);
    return;
  }
  
  if (batteryLevel <= BATTERY_LOW_THRESHOLD && batteryLevel > 5) {
    Serial.println("⚠️ WARNING: Low battery");
    printSensorValues();
    playAudioFile(WARNING_AUDIO);
    batteryLevel = 5;  // Prevent repeated warnings
    return;
  }
  
  if (soundLevel >= SOUND_HIGH_THRESHOLD) {
    Serial.println("🔊 WARNING: High noise level detected");
    printSensorValues();
    playAudioFile(WARNING_AUDIO);
    return;
  }
  
  // NORMAL EVENTS
  if (motionLevel >= MOTION_THRESHOLD) {
    Serial.println("👋 Motion detected - Welcome!");
    printSensorValues();
    playAudioFile(WELCOME_AUDIO);
    return;
  }
  
  if (lightLevel <= LIGHT_LOW_THRESHOLD) {
    static bool lowLightAlerted = false;
    if (!lowLightAlerted) {
      Serial.println("🌙 Low light conditions");
      printSensorValues();
      playAudioFile(NOTIFICATION_AUDIO);
      lowLightAlerted = true;
    }
    return;
  } else {
    static bool lowLightAlerted = false;
    lowLightAlerted = false;  // Reset when light is normal
  }
  
  // RANDOM POSITIVE EVENTS (less frequent)
  if (random(1000) < 3) {  // 0.3% chance
    Serial.println("✨ Random success event!");
    printSensorValues();
    playAudioFile(SUCCESS_AUDIO);
    return;
  }
}

void handleManualCommands() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toLowerCase();
    
    if (command == "temp") {
      temperature = TEMP_WARNING + 5;  // Trigger temperature warning
      Serial.println("🌡️ Temperature spike simulated");
    }
    else if (command == "motion") {
      motionLevel = MOTION_THRESHOLD + 100;  // Trigger motion
      Serial.println("👋 Motion simulation triggered");
    }
    else if (command == "light") {
      lightLevel = LIGHT_LOW_THRESHOLD - 50;  // Trigger low light
      Serial.println("🌙 Low light simulation triggered");
    }
    else if (command == "sound") {
      soundLevel = SOUND_HIGH_THRESHOLD + 50;  // Trigger high sound
      Serial.println("🔊 High sound simulation triggered");
    }
    else if (command == "emergency") {
      emergencyFlag = true;
      Serial.println("🚨 Emergency simulation triggered");
    }
    else if (command == "battery") {
      batteryLevel = BATTERY_LOW_THRESHOLD - 5;  // Trigger low battery
      Serial.println("🔋 Low battery simulation triggered");
    }
    else if (command == "stop") {
      stopAudio();
    }
    else if (command == "vol+" || command == "volup") {
      adjustVolume(3);
    }
    else if (command == "vol-" || command == "voldown") {
      adjustVolume(-3);
    }
    else if (command == "status") {
      printSystemStatus();
    }
    else if (command == "1" || command == "2" || command == "3" || 
             command == "4" || command == "5" || command == "6" || 
             command == "7" || command == "8") {
      playAudioFile(command.toInt());
    }
    else if (command == "help") {
      printHelp();
    }
  }
}

void playAudioFile(int fileNumber) {
  if (fileNumber < 1 || fileNumber > 8) return;
  
  Serial.print("🎵 Playing: ");
  Serial.print(getAudioDescription(fileNumber));
  Serial.print(" (");
  Serial.print(String(fileNumber, 4).c_str());
  Serial.println(".mp3)");
  
  sendCommand(CMD_PLAY_TRACK, 0x00, fileNumber, false);
  isPlaying = true;
  lastPlayTime = millis();
}

String getAudioDescription(int fileNumber) {
  switch(fileNumber) {
    case 1: return "Boot/Loading";
    case 2: return "Success";
    case 3: return "Error/Critical";
    case 4: return "Warning";
    case 5: return "Welcome/Motion";
    case 6: return "Goodbye";
    case 7: return "Emergency Alert";
    case 8: return "Notification";
    default: return "Unknown";
  }
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
  
  fnm16p.write(packet, 10);
}

void setVolume(int volume) {
  if (volume < 0) volume = 0;
  if (volume > 30) volume = 30;
  sendCommand(CMD_VOLUME, 0x00, volume, false);
}

void adjustVolume(int change) {
  static int currentVolume = 22;
  currentVolume += change;
  if (currentVolume < 0) currentVolume = 0;
  if (currentVolume > 30) currentVolume = 30;
  
  Serial.print("🔊 Volume: ");
  Serial.println(currentVolume);
  setVolume(currentVolume);
}

void stopAudio() {
  Serial.println("⏹️ Stopping audio");
  sendCommand(CMD_STOP, 0x00, 0x00, false);
  isPlaying = false;
}

void clearModuleBuffer() {
  while (fnm16p.available()) {
    fnm16p.read();  // Clear any incoming data
  }
}

void printSensorValues() {
  Serial.print("📊 Sensors: ");
  Serial.print("Temp:");
  Serial.print(temperature, 1);
  Serial.print("°C | Motion:");
  Serial.print(motionLevel);
  Serial.print(" | Light:");
  Serial.print(lightLevel);
  Serial.print(" | Sound:");
  Serial.print(soundLevel);
  Serial.print(" | Battery:");
  Serial.print(batteryLevel);
  Serial.println("%");
}

void printSystemStatus() {
  Serial.println("\n=== SYSTEM STATUS ===");
  Serial.print("Uptime: ");
  Serial.print((millis() - bootTime) / 1000);
  Serial.println(" seconds");
  Serial.print("Boot Complete: ");
  Serial.println(bootupComplete ? "YES" : "NO");
  Serial.print("Currently Playing: ");
  Serial.println(isPlaying ? "YES" : "NO");
  printSensorValues();
  Serial.println("\n=== THRESHOLDS ===");
  Serial.print("Temperature Warning: >");
  Serial.print(TEMP_WARNING);
  Serial.println("°C");
  Serial.print("Temperature Critical: >");
  Serial.print(TEMP_CRITICAL);
  Serial.println("°C");
  Serial.print("Motion Threshold: >");
  Serial.println(MOTION_THRESHOLD);
  Serial.print("Low Light: <");
  Serial.println(LIGHT_LOW_THRESHOLD);
  Serial.print("High Sound: >");
  Serial.println(SOUND_HIGH_THRESHOLD);
  Serial.print("Low Battery: <");
  Serial.print(BATTERY_LOW_THRESHOLD);
  Serial.println("%");
  Serial.println("==================\n");
}

void printHelp() {
  Serial.println("\n=== COMMAND REFERENCE ===");
  Serial.println("🎯 Sensor Triggers:");
  Serial.println("  temp       - Simulate high temperature");
  Serial.println("  motion     - Simulate motion detection");
  Serial.println("  light      - Simulate low light");
  Serial.println("  sound      - Simulate high sound");
  Serial.println("  battery    - Simulate low battery");
  Serial.println("  emergency  - Simulate emergency");
  Serial.println("\n🎵 Direct Audio:");
  Serial.println("  1-8        - Play specific audio file");
  Serial.println("\n🎛️ Controls:");
  Serial.println("  stop       - Stop current audio");
  Serial.println("  vol+/vol-  - Adjust volume");
  Serial.println("  status     - Show system status");
  Serial.println("  help       - Show this help");
  Serial.println("========================\n");
}
