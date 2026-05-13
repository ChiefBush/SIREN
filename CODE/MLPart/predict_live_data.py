import os
import time
import requests
import json
import joblib
import pandas as pd
import numpy as np

class SirenDashboardAlerter:
    # The public URL of the Edge Function we just deployed
    EDGE_ENDPOINT = "https://dieuqoldqijtpuxfhmtg.supabase.co/functions/v1/ml-predictions"

    @staticmethod
    def send_alert(prediction_type: str, risk_score: float, risk_level: str, miner_id: str = None, details: dict = None):
        """
        prediction_type: e.g. "gas_leak", "fatigue", "fall_risk"
        risk_score: Float between 0.0 and 1.0 (e.g. 0.95 = 95%)
        risk_level: Must be exactly "low", "medium", "high", or "critical"
        miner_id: (Optional) UUID of the miner if known
        details: (Optional) Dictionary of extra context like node ID
        """
        payload = {
            "prediction_type": prediction_type,
            "risk_score": float(risk_score),
            "risk_level": risk_level
        }
        
        # Ensure miner_id is actually a valid UUID string
        if miner_id:
            import uuid
            try:
                uuid.UUID(str(miner_id))
                payload["miner_id"] = str(miner_id)
            except ValueError:
                # If it's not a UUID (like "001"), put it in details instead so the DB doesn't crash!
                if details is None:
                    details = {}
                details["invalid_miner_id_attempted"] = str(miner_id)
                
        if details:
            payload["details"] = details
            
        headers = {"Content-Type": "application/json"}
        
        try:
            response = requests.post(
                SirenDashboardAlerter.EDGE_ENDPOINT, 
                data=json.dumps(payload), 
                headers=headers
            )
            
            if response.status_code == 200:
                print(f"[OK] Dashboard Alert Sent: {prediction_type} ({risk_level})")
            else:
                print(f"[X] Failed to reach dashboard. Status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"[X] Webhook Error: {e}")

def run_live_inference():
    """
    This script constantly pulls the latest real sensor string from your Supabase 
    database, analyzes it using the trained Random Forest model, and alerts the 
    dashboard if there's danger.
    
    FALSE-POSITIVE MITIGATION:
    - Confidence threshold: Only alerts when model confidence >= 85%
    - Cooldown timer: Same prediction_type won't re-alert within 2 minutes
    - Risk level remapping: 'Poor' demoted to 'medium' (was 'high')
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(script_dir, 'rf_model.pkl')
    
    # ── Tunable thresholds ──────────────────────────────────────────────
    CONFIDENCE_THRESHOLD = 0.85       # Minimum confidence to fire any alert
    CRITICAL_CONFIDENCE  = 0.95       # Confidence required for "critical" label
    COOLDOWN_SECONDS     = 120        # 2 minutes between same prediction_type alerts
    # ────────────────────────────────────────────────────────────────────
    
    if not os.path.exists(model_path):
        print(f"Model {model_path} not found. Train it first!")
        return
        
    print("Loading Trained Random Forest Model...")
    model = joblib.load(model_path)
    
    # ------------------------------------------------------------------
    # Connect to the database where your REAL sensor data lives
    # ------------------------------------------------------------------
    from dotenv import load_dotenv
    from supabase import create_client, Client
    
    # We explicitly point it to your CODE/.env file which has the credentials
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, '..', '.env')
    print(f"Loading environment variables from: {env_path}")
    load_dotenv(env_path)

    # NOTE: Ensure they point to your SENSOR database project (or main, if combined)
    SENSOR_DB_URL = os.environ.get("REACT_APP_SENSOR_DB_URL") or os.environ.get("SUPABASE_URL")
    SENSOR_DB_KEY = os.environ.get("REACT_APP_SENSOR_DB_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY")

    if not SENSOR_DB_URL or not SENSOR_DB_KEY:
        print("[X] Waiting on Supabase Credentials... Please add them to your environment variables.")
        return

    supabase: Client = create_client(SENSOR_DB_URL, SENSOR_DB_KEY)

    print("Starting Live Monitoring on REAL Sensor Data...")
    print(f"  Confidence threshold: {CONFIDENCE_THRESHOLD*100:.0f}%")
    print(f"  Critical threshold:   {CRITICAL_CONFIDENCE*100:.0f}%")
    print(f"  Cooldown:             {COOLDOWN_SECONDS}s")
    print("Press Ctrl+C to stop.\n")
    
    last_processed_id = None
    
    # Cooldown tracker: { prediction_type: last_alert_timestamp }
    last_alert_times = {}

    try:
        while True:
            # 1. Fetch the absolute newest single row of sensor data from your Supabase table
            try:
                response = supabase.table('sensor_data').select('*').order('created_at', desc=True).limit(1).execute()
            except Exception as e:
                print(f"Network err fetching data: {e}. Retrying in 5s...")
                time.sleep(5)
                continue
            
            if not response.data:
                print("No sensor data found in database yet. Waiting...")
                time.sleep(5)
                continue

            latest_row = response.data[0]
            
            # Avoid re-processing the exact same row endlessly if no new data has arrived
            if last_processed_id == latest_row.get('id'):
                time.sleep(2)
                continue
                
            last_processed_id = latest_row.get('id')

            # 2. Extract exactly the features your model was trained on
            try:
                current_sensor_data = {
                    'temperature': float(latest_row.get('temperature', 25.0)), 
                    'humidity': float(latest_row.get('humidity', 50.0)),
                    'mq2_analog': float(latest_row.get('mq2_analog', 150.0)),
                    'mq9_analog': float(latest_row.get('mq9_analog', 150.0)),
                    'mq135_analog': float(latest_row.get('mq135_analog', 150.0)),
                    'rssi': float(latest_row.get('rssi', -60.0)),
                    'snr': float(latest_row.get('snr', 8.0))
                }
            except Exception as e:
                print(f"Error parsing sensor row {last_processed_id}: {e}")
                time.sleep(2)
                continue

            df_current = pd.DataFrame([current_sensor_data])
            
            # 3. Run prediction and probability
            prediction = model.predict(df_current)[0] # e.g. 'Good', 'Hazardous'
            probabilities = model.predict_proba(df_current)[0] 
            max_prob = np.max(probabilities)
            
            # Print status periodically
            print(f"[{latest_row.get('created_at')}] Analyzed -> '{prediction}' (Confidence: {max_prob:.2f})")
            
            # 4. Logic to determine if we should send an alert
            if prediction in ['Poor', 'Hazardous']:
                
                # ── GATE 1: Confidence threshold ────────────────────────
                if max_prob < CONFIDENCE_THRESHOLD:
                    print(f"   -> Suppressed (confidence {max_prob:.0%} < threshold {CONFIDENCE_THRESHOLD:.0%})")
                    time.sleep(5)
                    continue
                
                # ── GATE 2: Cooldown timer ──────────────────────────────
                pred_type = "air_quality_warning"
                now = time.time()
                last_sent = last_alert_times.get(pred_type, 0)
                if (now - last_sent) < COOLDOWN_SECONDS:
                    remaining = int(COOLDOWN_SECONDS - (now - last_sent))
                    print(f"   -> Cooldown active ({remaining}s remaining)")
                    time.sleep(5)
                    continue
                
                # ── Determine risk level with softer mapping ────────────
                if prediction == 'Hazardous' and max_prob >= CRITICAL_CONFIDENCE:
                    risk_level = "critical"     # Genuine critical — ≥95% Hazardous
                elif prediction == 'Hazardous':
                    risk_level = "high"         # Hazardous but < 95% confidence
                else:
                    risk_level = "medium"       # Poor air quality (was "high", demoted)
                
                print(f"   [!]  ALERT FIRED: {risk_level.upper()} (conf: {max_prob:.0%})")
                
                node_identifier = latest_row.get('sensor_node_id') or latest_row.get('central_node_id') or latest_row.get('device_id', 'UnknownNode')
                actual_user_uuid = latest_row.get('user_id')
                
                # 5. Trigger the Supabase Edge Function to update your Dashboard UI!
                SirenDashboardAlerter.send_alert(
                    prediction_type=pred_type, 
                    risk_score=max_prob, 
                    risk_level=risk_level,
                    miner_id=actual_user_uuid,
                    details={"hardware_node_id": str(node_identifier)}
                )
                
                # Record cooldown timestamp
                last_alert_times[pred_type] = now
            else:
                # Good / Moderate — no alert needed
                pass
                
            # Wait a few seconds before checking the database for brand new rows again
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\nLive Monitoring Stopped.")

if __name__ == "__main__":
    run_live_inference()
