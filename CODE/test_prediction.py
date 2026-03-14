import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv('.env')

url: str = os.environ.get("REACT_APP_SUPABASE_URL")
key: str = os.environ.get("REACT_APP_SUPABASE_ANON_KEY")  # Usually you'd use a service role key from python

if not url or not key:
    print("Could not find Supabase credentials in .env")
    exit(1)

supabase: Client = create_client(url, key)

data, count = supabase.table("ml_predictions").insert({
    "prediction_type": "gas_leak",
    "risk_score": 0.95,
    "risk_level": "critical",
    "details": {"source": "test_script"}
}).execute()

print(f"Inserted: {data}")
