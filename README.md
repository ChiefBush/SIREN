# SIREN Project

## MVP Pipeline (Supabase + CTRL1 + prototype1)

**GitHub Secrets (Settings → Actions → Secrets):**
- `SUPABASE_ACCESS_TOKEN` – personal access token for Supabase CLI
- `SUPABASE_PROJECT_ID` – Supabase project ref (e.g. abcd1234)
- *(Optional)* For server deployment, set `SUPABASE_SERVICE_ROLE_KEY` on your PHP host, not in GitHub.

**Endpoints:**
- IoT → `CTRL1/ingest.php` → writes to `telemetry` table
- App → `https://<PROJECT_REF>.functions.supabase.co/ctrl2?device_id=EDGE-001&limit=50`

**Firmware:**
- If `prototype1/platformio.ini` exists, CI builds it automatically and uploads artifacts. 
