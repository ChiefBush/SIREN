# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SIREN (Sensor based indicator for risk in environmental notification) is a patented wearable safety system for high-risk environments where conventional communication networks fail. It integrates environmental sensing, motion intelligence, LoRa-based mesh communication, and predictive machine learning to detect and relay distress signals without relying on cellular or Wi-Fi infrastructure.

**Awarded Most Commercially Viable Project — InCITe 2026**, Department of Information Technology, ASET, Amity University Noida.

## Repository Layout

The repo is split into four subsystems:

- **`CODE/`** — React 18 web application (dashboards, auth, workforce management)
- **`MLPart/`** — Python ML pipeline (Random Forest + LSTM) for air quality classification and emergency prediction
- **`hardware/`** — Arduino/ESP32 firmware (edge node, central gateway, wristband)
- **`supabase/`** — Database migrations and schema
- **`.functions/ctrl2/`** — Supabase Edge Function (Deno/TypeScript) for telemetry queries
- **`.github/workflows/mvp.yml`** — CI pipeline (firmware build, PHP lint, Supabase deploy)

## Tech Stack

- **Frontend**: React 18, Tailwind CSS, Recharts, React Router DOM
- **Backend/DB**: Supabase (PostgreSQL, Auth, Realtime)
- **ML**: Python 3, scikit-learn, TensorFlow/Keras, pandas, numpy, joblib
- **Hardware**: ESP32, LoRa (433E6), ESP-NOW, Arduino C++
- **Edge Functions**: Deno

## Common Commands

### Web Application (`CODE/`)

```bash
cd CODE
npm install          # Install dependencies
npm start            # Starts React dev server AND the ML live predictor concurrently
npm run build        # Production build
npm test             # React tests (react-scripts test)
```

### ML Pipeline (`MLPart/`)

```bash
cd MLPart
python3 generate_synthetic_data.py   # Generate training datasets
python3 train_rf_model.py             # Train Random Forest (outputs rf_model.pkl)
python3 train_lstm_model.py           # Train LSTM (outputs lstm_early_warning_model.keras + feature_scaler.pkl)
python3 predict_live_data.py          # Run live inference loop (polls sensor_data, alerts dashboard)
```

A Python virtual environment is expected at `MLPart/venv/`.

### Hardware

Hardware sketches are compiled via Arduino IDE or PlatformIO. The CI workflow looks for `prototype1/platformio.ini` to trigger `pio run`.

### Supabase

- Full schema: `CODE/docs/SUPABASE_SCHEMA.sql`
- Edge function: `.functions/ctrl2/index.ts`
- Migration: `supabase/migrations/0001_init.sql` (creates `telemetry` table with RLS)

## High-Level Architecture

### Dual Supabase Clients

`CODE/src/lib/supabase.js` exports two clients:

- **`supabase`** — Primary app database: users, attendance, incidents, shifts, leave_applications, ml_predictions, etc.
- **`sensorSupabase`** — Sensor/IOT database: `sensor_data` table with realtime telemetry. Falls back to the primary client if env vars are missing.

Required env vars (in `CODE/.env`):
- `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_SENSOR_DB_URL`, `REACT_APP_SENSOR_DB_ANON_KEY` (optional but recommended)

**Note:** `predict_live_data.py` hardcodes an absolute path to `CODE/.env` to load credentials:
```python
env_path = '/Users/alka/Desktop/SirnProject/SIREN/CODE/.env'
```

### Role-Based Auth & Routing

`CODE/src/App.jsx` enforces three roles: `miner`, `supervisor`, `admin`.

- Role is fetched from the `users` table after Supabase auth and cached in `sessionStorage` under `userRole` for fast page loads.
- Soft-delete guard: if `users.deleted_at` is set, the user is logged out immediately with an alert.
- Routes are role-gated:
  - `/miner` → MinerDashboard
  - `/supervisor` → SupervisorDashboard, `/supervisor/miners/:minerId` → MinerView
  - `/admin` → AdminDashboard, `/admin/miner/:minerId`, `/admin/supervisor/:supervisorId`

### Real-time Data Layer

The frontend relies on two custom hooks for live data:

- **`useSensorData`** (`CODE/src/hooks/useSensorData.js`) — Subscribes to `sensor_data` INSERT events on `sensorSupabase`. It has a hardcoded "target miner" concept: real sensor data is only shown for the specific user `akpnvfbel@yomail.info` / `Miner A`, or when no `userId` is provided (supervisor global view). Falls back to synthetic/demo data for everyone else.
- **`usePredictions`** (`CODE/src/hooks/usePredictions.js`) — Subscribes to `ml_predictions` INSERT events on `supabase`. Maps DB `risk_level` values to UI display labels (`critical` → `Elevated Risk`, `high` → `Predictive Risk`, etc.).

### Hardware Data Flow

1. **Wristband** (`hardware/watch.ino`) — MAX30102 (BPM/SpO2), SSD1306 OLED. Sends vitals to edge node via ESP-NOW.
2. **Edge Node** (`hardware/edge_node.ino`) — MQ2/MQ9/MQ135 gas sensors, DHT11, MPU6050 IMU. Receives wristband data via ESP-NOW. Relays aggregated sensor packet to central node via LoRa.
3. **Central Node** (`hardware/central_node.ino`) — Receives LoRa packets and forwards them to Supabase REST API (`sensor_data` table) over WiFi. Also sends email alerts via SMTP on emergencies.

### ML Pipeline Data Flow

1. `generate_synthetic_data.py` creates `synthetic_sensor_data.csv` and `lstm_synthetic_sensor_data.csv`.
2. `train_rf_model.py` trains a Random Forest to classify `air_quality` into `Good`, `Moderate`, `Poor`, `Hazardous`. Output: `rf_model.pkl`.
3. `train_lstm_model.py` trains an LSTM to predict if an emergency occurs in the next 30 minutes (binary). Uses 12-step sequences (60 min history). Output: `lstm_early_warning_model.keras` + `feature_scaler.pkl`.
4. `predict_live_data.py` runs a continuous loop:
   - Polls the newest row from `sensor_data` via Supabase.
   - Runs RF inference.
   - Only alerts if confidence ≥ 85% and a 2-minute cooldown per `prediction_type` has passed.
   - Alerts are sent by POSTing to the Supabase Edge Function `ml-predictions`, which writes to the `ml_predictions` table and surfaces them in the dashboard UI.

### Database Schema Highlights

Key tables (full schema in `CODE/docs/SUPABASE_SCHEMA.sql`):

- **`users`** — Auto-generated employee IDs (`MIN-0001`, `SUP-0001`, `ADM-0001`) via trigger. Soft-delete support via `deleted_at`.
- **`sensor_data`** — Raw IoT telemetry (MQ gas, DHT11, motion, vitals).
- **`ml_predictions`** — ML alert output (`prediction_type`, `risk_score`, `risk_level`, `miner_id`).
- **`sensor_alerts`** — Threshold-based alerts with acknowledgement workflow.
- **`attendance`**, **`shifts`**, **`salary_calculations`** — Workforce management.
- **`incidents`** — Hazard reporting with severity and resolution tracking.
- **`leave_applications`** — Leave request/approval workflow.
- **`chat_messages`** — In-app messaging.

RLS policies restrict access by role. Realtime replication must be enabled in Supabase for `sensor_data`, `sensor_alerts`, `incidents`, `leave_applications`, and `ml_predictions`.

### Edge Function

`.functions/ctrl2/index.ts` is a Deno function that queries the `telemetry` table by `device_id` and returns the latest N rows. The CI workflow deploys it and runs a smoke test after deployment.

### Leave Management Architecture

The leave system was refactored from a single monolithic `LeaveApplication.jsx` into two role-specific components:
- `MinerLeaveApplication.jsx` — Submit form + view own applications (read-only status).
- `SupervisorLeaveManagement.jsx` — View all applications, filter by status, approve/reject. Includes a statistics dashboard.

Both components use Supabase realtime subscriptions on `leave_applications` to stay synchronized.

## Important Implementation Details

- `CODE/package.json` uses `concurrently` to run the React dev server and `predict_live_data.py` together on `npm start`.
- The frontend normalizes many sensor field names (e.g., `mq2_analog` / `mq2`, `dht11_temp` / `temperature`) when reading from `sensor_data` to handle schema variations.
- Hardware sketches contain hardcoded WiFi credentials and Supabase anon keys — these are prototype devices.
- The project uses EmailJS (`@emailjs/browser`) for client-side email sending in the web app.
