import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

def generate_rf_synthetic_data(num_records=20000):
    """
    Generates synthetic sensor data with value ranges matching the real SIREN hardware.
    Real hardware baseline (FAIR air quality):
      - temperature: ~29C, humidity: ~52%
      - mq2_analog: ~470, mq9_analog: ~2086, mq135_analog: ~870
      - rssi: ~-57, snr: ~12.5
    """
    np.random.seed(42)
    random.seed(42)

    data = []
    start_time = datetime(2025, 1, 1, 0, 0, 0)

    # Baselines matching real hardware
    base_temp = 29.0
    base_hum = 52.0
    base_mq2 = 470
    base_mq9 = 2000
    base_mq135 = 870

    for i in range(num_records):
        # Normal fluctuation around baselines
        temperature = np.random.normal(loc=base_temp, scale=1.5)
        humidity = np.random.normal(loc=base_hum, scale=5.0)
        mq2_analog = int(np.random.normal(loc=base_mq2, scale=30))
        mq9_analog = int(np.random.normal(loc=base_mq9, scale=100))
        mq135_analog = int(np.random.normal(loc=base_mq135, scale=40))
        rssi = int(np.random.normal(loc=-60, scale=5))
        snr = round(np.random.normal(loc=12.0, scale=1.5), 1)
        air_quality = 'Good'

        # Introduce hazardous conditions randomly (10% chance)
        if np.random.random() < 0.10:
            hazard_type = np.random.choice(['gas_leak', 'fire_risk', 'poor_air'])
            if hazard_type == 'gas_leak':
                mq9_analog += int(np.random.normal(loc=800, scale=200))
                mq2_analog += int(np.random.normal(loc=300, scale=100))
                temperature += np.random.normal(loc=5.0, scale=2.0)
                air_quality = 'Hazardous'
            elif hazard_type == 'fire_risk':
                temperature += np.random.normal(loc=15.0, scale=5.0)
                mq2_analog += int(np.random.normal(loc=500, scale=150))
                mq135_analog += int(np.random.normal(loc=400, scale=100))
                air_quality = 'Hazardous'
            elif hazard_type == 'poor_air':
                mq135_analog += int(np.random.normal(loc=500, scale=150))
                mq2_analog += int(np.random.normal(loc=200, scale=80))
                humidity += np.random.normal(loc=20.0, scale=10.0)
                air_quality = np.random.choice(['Poor', 'Moderate'])

        # Introduce moderate conditions randomly (15% chance)
        elif np.random.random() < 0.15:
            mq2_analog += int(np.random.normal(loc=100, scale=50))
            mq135_analog += int(np.random.normal(loc=100, scale=50))
            temperature += np.random.normal(loc=2.0, scale=1.0)
            air_quality = 'Moderate'

        # Bounds checking
        mq2_analog = max(0, min(5000, mq2_analog))
        mq9_analog = max(0, min(5000, mq9_analog))
        mq135_analog = max(0, min(5000, mq135_analog))
        humidity = max(0, min(100, humidity))

        data.append({
            'temperature': round(temperature, 2),
            'humidity': round(humidity, 2),
            'mq2_analog': mq2_analog,
            'mq9_analog': mq9_analog,
            'mq135_analog': mq135_analog,
            'rssi': rssi,
            'snr': snr,
            'air_quality': air_quality
        })

    df = pd.DataFrame(data)
    output_file = 'synthetic_sensor_data.csv'
    df.to_csv(output_file, index=False)
    print(f"Successfully saved {len(df)} records to '{output_file}'")

    print("\nClass Distribution (air_quality):")
    print(df['air_quality'].value_counts())

    print("\nFeature Statistics:")
    print(df[['temperature', 'humidity', 'mq2_analog', 'mq9_analog', 'mq135_analog']].describe())

if __name__ == '__main__':
    generate_rf_synthetic_data(num_records=20000)
