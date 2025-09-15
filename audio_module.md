Based on your working code, here's the complete reference for future LLM interactions:

## **📋 FN-M16P Communication Reference**

### **🔌 Hardware Configuration**
```cpp
// UART Configuration
HardwareSerial fnm16p(2);  // Use UART2 on ESP32
fnm16p.begin(9600, SERIAL_8N1, 16, 17);  // RX=GPIO16, TX=GPIO17

// Pin Connections
ESP32 GPIO 16 (RX2) → FN-M16P TX
ESP32 GPIO 17 (TX2) → FN-M16P RX
ESP32 GND → FN-M16P GND
ESP32 5V/3.3V → FN-M16P VCC
```

### **📦 Packet Format**
```
[0x7E] [0xFF] [0x06] [CMD] [Feedback] [Para_MSB] [Para_LSB] [Check_MSB] [Check_LSB] [0xEF]

Byte Position: 0    1     2     3     4         5         6         7         8         9
Total Length: 10 bytes
```

**Field Details:**
- `0x7E` - Frame Start (always)
- `0xFF` - Version (always) 
- `0x06` - Data Length (always for standard commands)
- `CMD` - Command byte
- `Feedback` - `0x00` (no reply) or `0x01` (request reply)
- `Para_MSB` - Parameter high byte
- `Para_LSB` - Parameter low byte  
- `Check_MSB` - Checksum high byte
- `Check_LSB` - Checksum low byte
- `0xEF` - Frame End (always)

### **🧮 Checksum Calculation**
```cpp
// Formula: 0xFFFF - (Ver + Len + CMD + Feedback + Para_MSB + Para_LSB) + 1
uint16_t sum = 0xFF + 0x06 + cmd + feedback + param1 + param2;
uint16_t checksum = 0xFFFF - sum + 1;
byte check_msb = (checksum >> 8) & 0xFF;
byte check_lsb = checksum & 0xFF;
```

### **🎵 Command Reference**
```cpp
// Common Commands
const byte CMD_PLAY_TRACK = 0x03;    // Play specific track
const byte CMD_VOLUME = 0x06;        // Set volume (0-30)
const byte CMD_STOP = 0x16;          // Stop playback
const byte CMD_PAUSE = 0x0E;         // Pause playback
const byte CMD_PLAY = 0x0D;          // Resume/Play
const byte CMD_QUERY_STATUS = 0x42;   // Query module status
const byte CMD_QUERY_FILES = 0x48;    // Query total files
```

### **📂 File Naming Convention**
- Files must be named: `0001.mp3`, `0002.mp3`, `0003.mp3`, etc.
- SD card format: FAT32
- Maximum 8 files supported in your current setup
- Files stored in root directory (not in folders)

### **💻 Working sendCommand Function**
```cpp
void sendCommand(byte cmd, byte param1 = 0x00, byte param2 = 0x00, bool feedback = false) {
  byte packet[10];
  
  packet[0] = 0x7E;        // Frame Start
  packet[1] = 0xFF;        // Version
  packet[2] = 0x06;        // Length
  packet[3] = cmd;         // Command
  packet[4] = feedback ? 0x01 : 0x00;  // Feedback flag
  packet[5] = param1;      // Para_MSB
  packet[6] = param2;      // Para_LSB
  
  // Calculate checksum
  uint16_t sum = packet[1] + packet[2] + packet[3] + packet[4] + packet[5] + packet[6];
  uint16_t checksum = 0xFFFF - sum + 1;
  
  packet[7] = (checksum >> 8) & 0xFF;  // Check_MSB
  packet[8] = checksum & 0xFF;         // Check_LSB
  packet[9] = 0xEF;        // Frame End
  
  fnm16p.write(packet, 10);
}
```

### **🎯 Example Packets**

**Play Track 1:**
```
Command: sendCommand(0x03, 0x00, 0x01, false);
Packet:  7E FF 06 03 00 00 01 FE F6 EF
```

**Set Volume to 25:**
```
Command: sendCommand(0x06, 0x00, 0x19, false);
Packet:  7E FF 06 06 00 00 19 FE DB EF
```

**Query Status:**
```
Command: sendCommand(0x42, 0x00, 0x00, true);
Packet:  7E FF 06 42 01 00 00 FE B8 EF
```

### **⚙️ System Parameters**
- **Baud Rate:** 9600 (confirmed working)
- **Data Bits:** 8
- **Parity:** None  
- **Stop Bits:** 1
- **Volume Range:** 0-30
- **Track Range:** 1-8 (for your setup)
- **Response Time:** Allow 100-500ms delay between commands

### **🔍 Module Responses**
When feedback is enabled, expect responses starting with `0x7E` and ending with `0xEF`. Common response patterns:
- `0x7E FF 06 41 00 ...` - Acknowledgment
- `0x7E FF 06 3D 00 ...` - Track playing  
- `0x7E FF 06 3C 00 ...` - Track finished

---

## **🤖 For LLM Reference - Copy This:**

```
FN-M16P MP3 Module Communication Protocol:
- Baud Rate: 9600
- Packet Format: [0x7E][0xFF][0x06][CMD][Feedback][Para_MSB][Para_LSB][Check_MSB][Check_LSB][0xEF]
- Checksum: 0xFFFF - (0xFF + 0x06 + CMD + Feedback + Para_MSB + Para_LSB) + 1
- ESP32 Pins: GPIO16=RX, GPIO17=TX
- Files: 0001.mp3 to 0008.mp3 in SD card root
- Commands: Play=0x03, Volume=0x06, Stop=0x16
- Working sendCommand function provided above
```

Save this reference - it contains everything needed for accurate code generation!
