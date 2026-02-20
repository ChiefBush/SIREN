import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib
import os

def train_model():
    data_path = 'synthetic_sensor_data.csv'
    
    if not os.path.exists(data_path):
        print(f"Dataset '{data_path}' not found. Please run generate_synthetic_data.py first.")
        return
        
    print(f"Loading dataset from {data_path}...")
    df = pd.read_csv(data_path)
    
    # We will train the model to predict 'air_quality' from the sensor readings.
    # Features for the model:
    features = ['temperature', 'humidity', 'mq2_analog', 'mq9_analog', 'mq135_analog', 'rssi', 'snr']
    
    X = df[features]
    y = df['air_quality']
    
    # Check for missing values
    if X.isnull().values.any():
        print("Dataset contains missing values. Handling missing values...")
        X = X.fillna(X.mean())

    # Train-test split (80% training, 20% testing)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    print(f"Training set shape: {X_train.shape}")
    print(f"Testing set shape: {X_test.shape}")
    print("\nTraining Random Forest Classifier on 'air_quality'...")
    
    # Initialize Random Forest
    rf_model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    
    # Train the model
    rf_model.fit(X_train, y_train)
    
    # Evaluation
    print("\nEvaluating model on test set...")
    y_pred = rf_model.predict(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {acc:.4f}")
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    
    # Feature Importance
    feature_imp = pd.Series(rf_model.feature_importances_, index=features).sort_values(ascending=False)
    print("\nFeature Importances:")
    print(feature_imp)
    
    # Save the model to disk
    model_filename = 'rf_model.pkl'
    joblib.dump(rf_model, model_filename)
    print(f"\nModel successfully saved to '{model_filename}'")
    
if __name__ == '__main__':
    train_model()
