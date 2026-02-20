import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

def generate_lstm_synthetic_data(num_Nodes=10, days=5):
    """
    Generates continuous time-series data for multiple nodes.
    Simulates "ramp-up" periods before an emergency occurs, which is crucial for LSTM early prediction.
    """
    np.random.seed(42)
    random.seed(42)

    data = []
    start_time = datetime(2025, 1, 1, 0, 0, 0)
    
    # 5 minutes per step
    steps_per_day = (24 * 60) // 5
    total_steps = days * steps_per_day
    
    nodes = [f"NODE_{i:03d}" for i in range(1, num_Nodes + 1)]
    print(f"Generating {(total_steps * num_Nodes)} continuous time-series records across {num_Nodes} nodes...")

    for node_id in nodes:
        current_time = start_time
        
        # State variables for the node
        in_emergency = False
        emergency_duration_left = 0
        in_ramp_up = False
        ramp_up_steps_left = 0
        
        # Node baselines
        base_temp = 25.0
        base_hum = 60.0
        base_mq2 = 200
        base_mq9 = 150
        base_mq135 = 250
        
        for step in range(total_steps):
            # Normal fluctuation
            temperature = np.random.normal(loc=base_temp, scale=1.0)
            humidity = np.random.normal(loc=base_hum, scale=2.0)
            mq2_analog = int(np.random.normal(loc=base_mq2, scale=10))
            mq9_analog = int(np.random.normal(loc=base_mq9, scale=10))
            mq135_analog = int(np.random.normal(loc=base_mq135, scale=10))
            air_quality = 'Good'
            is_emergency = False
            
            # Chance to start a ramp-up if everything is normal (e.g., 2% per step)
            if not in_emergency and not in_ramp_up:
                if np.random.random() < 0.02:
                    in_ramp_up = True
                    # Ramp up phase lasts for 6 to 12 steps (30 to 60 minutes)
                    total_ramp_steps = random.randint(6, 12)
                    ramp_up_steps_left = total_ramp_steps
                    
            if in_ramp_up:
                # Calculate how far along the ramp-up we are (0.0 to 1.0)
                progress = 1.0 - (ramp_up_steps_left / total_ramp_steps)
                
                # Gradually increase values based on progress
                temperature += (5.0 * progress) + np.random.normal(0, 0.5)
                mq2_analog += int((400 * progress) + np.random.normal(0, 20))
                mq9_analog += int((200 * progress) + np.random.normal(0, 20))
                mq135_analog += int((400 * progress) + np.random.normal(0, 20))
                
                # Air quality degrades as it ramps up
                if progress > 0.7:
                    air_quality = 'Poor'
                elif progress > 0.3:
                    air_quality = 'Moderate'
                
                ramp_up_steps_left -= 1
                
                # Transition to actual emergency
                if ramp_up_steps_left <= 0:
                    in_ramp_up = False
                    in_emergency = True
                    # Emergency lasts for 3 to 8 steps (15 to 40 minutes)
                    emergency_duration_left = random.randint(3, 8)
            
            elif in_emergency:
                # Hazardous levels
                temperature = np.random.normal(loc=40.0, scale=3.0)
                mq2_analog = int(np.random.normal(loc=800, scale=50))
                mq9_analog = int(np.random.normal(loc=600, scale=50))
                mq135_analog = int(np.random.normal(loc=900, scale=50))
                
                air_quality = 'Hazardous'
                is_emergency = True
                
                emergency_duration_left -= 1
                if emergency_duration_left <= 0:
                    in_emergency = False
            
            # Additional network fields
            rssi = int(np.random.normal(loc=-85, scale=2))
            snr = round(np.random.normal(loc=6.0, scale=0.5), 1)
            
            # Bounds checking
            mq2_analog = max(0, min(1023, mq2_analog))
            mq9_analog = max(0, min(1023, mq9_analog))
            mq135_analog = max(0, min(1023, mq135_analog))
            humidity = max(0, min(100, humidity))
            
            data.append({
                'node_id': node_id,
                'timestamp': current_time.strftime('%Y-%m-%dT%H:%M:%S'),
                'temperature': round(temperature, 2),
                'humidity': round(humidity, 2),
                'mq2_analog': mq2_analog,
                'mq9_analog': mq9_analog,
                'mq135_analog': mq135_analog,
                'rssi': rssi,
                'snr': snr,
                'air_quality': air_quality,
                'emergency': is_emergency
            })
            
            current_time += timedelta(minutes=5)
            
    df = pd.DataFrame(data)
    # Sort chronologically, then by node
    df = df.sort_values(by=['node_id', 'timestamp'])
    
    output_file = 'lstm_synthetic_sensor_data.csv'
    df.to_csv(output_file, index=False)
    print(f"Successfully saved to '{output_file}'")
    
    print("\nClass Distribution (air_quality):")
    print(df['air_quality'].value_counts())
    
    print("\nEmergency Instances:")
    print(df['emergency'].value_counts())

if __name__ == '__main__':
    generate_lstm_synthetic_data(num_Nodes=5, days=15)
