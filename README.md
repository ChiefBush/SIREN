# 5.3v Hardware Payload

## Overview
The 5.3v Hardware Payload project consists of an ESP32 LoRa Central Node and an edge node. The central node connects to WiFi, handles LoRa packets, and sends emergency emails using SMTP. The edge node is responsible for receiving data from sensors and transmitting it to the central node.

## Setup Instructions
1. Clone the repository to your local machine.
2. Open the project in your preferred IDE.
3. Ensure you have the necessary libraries installed for ESP32, LoRa, and SMTP functionality.
4. Update the WiFi credentials and SMTP settings in `Central_node.ino` as needed.

## Usage Guidelines
- Upload the `Central_node.ino` to your ESP32 device to set up the central node.
- Implement the `edge_node.ino` to handle sensor data and communicate with the central node.
- Monitor the serial output for debugging and status messages.

## License
This project is licensed under the MIT License.