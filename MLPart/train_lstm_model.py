import pandas as pd
import numpy as np
import os
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import classification_report, confusion_matrix
import joblib

# Suppress TensorFlow logs for cleaner output
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout

def create_sequences(df, features, target_col, sequence_length, prediction_horizon):
    """
    Creates sequences of length `sequence_length` to predict the target `prediction_horizon` steps in the future.
    """
    X, y = [], []
    
    # We must process node by node so sequences don't cross between nodes
    for node in df['node_id'].unique():
        node_df = df[df['node_id'] == node].copy()
        node_df = node_df.sort_values('timestamp')
        
        feature_data = node_df[features].values
        target_data = node_df[target_col].values
        
        # Build sequences
        for i in range(len(feature_data) - sequence_length - prediction_horizon):
            # The input sequence (e.g., past 6 steps = 30 minutes of data)
            seq_x = feature_data[i:(i + sequence_length)]
            # The target (e.g., 3 steps in the future = 15 minutes ahead)
            # We predict 1 if an emergency occurs AT ALL in the prediction window
            window_y = target_data[(i + sequence_length):(i + sequence_length + prediction_horizon)]
            seq_y = 1 if any(window_y) else 0
            
            X.append(seq_x)
            y.append(seq_y)
            
    return np.array(X), np.array(y)

def train_lstm_model():
    data_path = 'lstm_synthetic_sensor_data.csv'
    
    if not os.path.exists(data_path):
        print(f"Dataset '{data_path}' not found. Please run generate_synthetic_data.py first.")
        return
        
    print(f"Loading sequence dataset from {data_path}...")
    df = pd.read_csv(data_path)
    
    # Target: Predict if 'emergency' will be True
    df['target'] = df['emergency'].astype(int)
    
    features = ['temperature', 'humidity', 'mq2_analog', 'mq9_analog', 'mq135_analog']
    
    # Scale Features (LSTMs perform better with normalized inputs 0-1)
    scaler = MinMaxScaler()
    df[features] = scaler.fit_transform(df[features])
    
    # Save the scaler for future inference
    joblib.dump(scaler, 'feature_scaler.pkl')
    
    # --- sequence parameters ---
    # 5 min per step. 
    # Sequence length = 12 steps (60 minutes of past data)
    sequence_length = 12 
    # Prediction horizon = 6 steps (Predict if an emergency occurs in the next 30 minutes)
    prediction_horizon = 6 
    
    print(f"Creating sequences: Past {sequence_length*5} mins to predict next {prediction_horizon*5} mins...")
    X, y = create_sequences(df, features, 'target', sequence_length, prediction_horizon)
    
    # Chronological Split (Train on first 80% of time, test on last 20%)
    split_index = int(len(X) * 0.8)
    X_train, X_test = X[:split_index], X[split_index:]
    y_train, y_test = y[:split_index], y[split_index:]
    
    print(f"Training sequences shape: {X_train.shape}")
    print(f"Testing sequences shape: {X_test.shape}")
    print(f"Class distribution in Train: {np.bincount(y_train)}")
    
    # Build LSTM Model
    print("\nBuilding LSTM Model...")
    model = Sequential([
        LSTM(64, activation='relu', input_shape=(sequence_length, len(features)), return_sequences=True),
        Dropout(0.2),
        LSTM(32, activation='relu'),
        Dropout(0.2),
        Dense(16, activation='relu'),
        Dense(1, activation='sigmoid') # Binary classification
    ])
    
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    
    # Train the model
    print("Training Model...")
    history = model.fit(
        X_train, y_train,
        epochs=15,
        batch_size=64,
        validation_split=0.2,
        verbose=1
    )
    
    # Evaluation
    print("\nEvaluating early prediction capabilities on unseen test data...")
    y_pred_probs = model.predict(X_test, verbose=0)
    y_pred = (y_pred_probs > 0.5).astype(int).flatten()
    
    print("\nClassification Report (Predicting Emergency 30 mins in advance):")
    print(classification_report(y_test, y_pred, target_names=["Safe", "Future Emergency"]))
    
    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    
    # Save the model
    model.save('lstm_early_warning_model.keras')
    print("\nSaved trained model as 'lstm_early_warning_model.keras'")
    print("Saved feature scaler as 'feature_scaler.pkl'")

if __name__ == '__main__':
    train_lstm_model()
