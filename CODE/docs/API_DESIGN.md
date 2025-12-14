# SIREN API Design

This document describes the API endpoints and data structures for the SIREN application. The application uses Supabase as the backend, which provides a RESTful API and real-time subscriptions.

## Authentication

All API requests require authentication via Supabase Auth. The authentication token should be included in the request headers.

### Headers
```
Authorization: Bearer <supabase_access_token>
apikey: <supabase_anon_key>
```

---

## Endpoints

### Authentication Endpoints

#### Sign Up
```http
POST /auth/v1/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "data": {
    "full_name": "John Doe"
  }
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "session": {
    "access_token": "token",
    "refresh_token": "refresh_token"
  }
}
```

#### Sign In
```http
POST /auth/v1/token?grant_type=password
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "token",
  "refresh_token": "refresh_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

#### Sign Out
```http
POST /auth/v1/logout
```

---

## Data Endpoints

### Users

#### Get Current User
```http
GET /rest/v1/users?id=eq.{user_id}
```

**Response:**
```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "miner",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

#### Get All Users (Admin/Supervisor)
```http
GET /rest/v1/users?select=*
```

#### Update User Role (Admin)
```http
PATCH /rest/v1/users?id=eq.{user_id}
Content-Type: application/json

{
  "role": "supervisor"
}
```

#### Delete User (Admin)
```http
DELETE /rest/v1/users?id=eq.{user_id}
```

---

### Sensor Data

#### Get Latest Sensor Data
```http
GET /rest/v1/sensor_data?order=timestamp.desc&limit=1
```

**Response:**
```json
[
  {
    "id": "uuid",
    "mq2": 150.5,
    "mq9": 120.3,
    "mq135": 200.8,
    "htu21d_temp": 25.5,
    "htu21d_humidity": 60.2,
    "timestamp": "2024-01-01T12:00:00Z",
    "device_id": "device_001",
    "location": "Mine A"
  }
]
```

#### Get Sensor Data History
```http
GET /rest/v1/sensor_data?order=timestamp.desc&limit=100
```

#### Insert Sensor Data (IoT Device)
```http
POST /rest/v1/sensor_data
Content-Type: application/json

{
  "mq2": 150.5,
  "mq9": 120.3,
  "mq135": 200.8,
  "htu21d_temp": 25.5,
  "htu21d_humidity": 60.2,
  "device_id": "device_001",
  "location": "Mine A"
}
```

---

### Sensor Alerts

#### Get Alerts
```http
GET /rest/v1/sensor_alerts?order=created_at.desc&limit=50
```

**Response:**
```json
[
  {
    "id": "uuid",
    "sensor_type": "mq2",
    "value": 450.0,
    "threshold": 400.0,
    "status": "critical",
    "message": "MQ2 sensor reading exceeded critical threshold",
    "created_at": "2024-01-01T12:00:00Z",
    "acknowledged_at": null,
    "acknowledged_by": null
  }
]
```

#### Get Critical Alerts
```http
GET /rest/v1/sensor_alerts?status=eq.critical&order=created_at.desc
```

#### Acknowledge Alert
```http
PATCH /rest/v1/sensor_alerts?id=eq.{alert_id}
Content-Type: application/json

{
  "status": "acknowledged",
  "acknowledged_at": "2024-01-01T12:00:00Z",
  "acknowledged_by": "user_uuid"
}
```

#### Create Alert
```http
POST /rest/v1/sensor_alerts
Content-Type: application/json

{
  "sensor_type": "mq2",
  "value": 450.0,
  "threshold": 400.0,
  "status": "critical",
  "message": "Critical threshold exceeded",
  "created_by": "user_uuid"
}
```

---

### Attendance

#### Get User Attendance
```http
GET /rest/v1/attendance?user_id=eq.{user_id}&order=date.desc
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "user_uuid",
    "date": "2024-01-01",
    "entry_time": "08:00:00",
    "exit_time": "17:00:00",
    "hours_worked": 9.0,
    "status": "present",
    "marked_by": "supervisor_uuid",
    "created_at": "2024-01-01T08:00:00Z"
  }
]
```

#### Get All Attendance (Supervisor/Admin)
```http
GET /rest/v1/attendance?select=*,users(email,full_name)&order=date.desc&limit=100
```

#### Create Attendance Record
```http
POST /rest/v1/attendance
Content-Type: application/json

{
  "user_id": "user_uuid",
  "date": "2024-01-01",
  "entry_time": "08:00:00",
  "exit_time": "17:00:00",
  "hours_worked": 9.0,
  "status": "present",
  "marked_by": "supervisor_uuid"
}
```

---

### Salary Calculations

#### Get User Salary Records
```http
GET /rest/v1/salary_calculations?user_id=eq.{user_id}&order=period_start.desc
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "user_uuid",
    "period_start": "2024-01-01",
    "period_end": "2024-01-31",
    "hours_worked": 180.0,
    "hourly_rate": 25.0,
    "total_amount": 4500.0,
    "status": "pending",
    "created_at": "2024-01-31T00:00:00Z",
    "paid_at": null
  }
]
```

#### Get All Salary Records (Admin)
```http
GET /rest/v1/salary_calculations?select=*,users(email,full_name)&order=period_start.desc
```

#### Create Salary Calculation
```http
POST /rest/v1/salary_calculations
Content-Type: application/json

{
  "user_id": "user_uuid",
  "period_start": "2024-01-01",
  "period_end": "2024-01-31",
  "hours_worked": 180.0,
  "hourly_rate": 25.0,
  "total_amount": 4500.0,
  "status": "pending"
}
```

#### Update Salary Status
```http
PATCH /rest/v1/salary_calculations?id=eq.{salary_id}
Content-Type: application/json

{
  "status": "paid",
  "paid_at": "2024-02-01T00:00:00Z"
}
```

---

### Health & Safety Logs

#### Get User Health Logs
```http
GET /rest/v1/health_safety_logs?user_id=eq.{user_id}&order=date.desc
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "user_uuid",
    "date": "2024-01-01",
    "fatigue_level": "moderate",
    "symptoms": "Headache, fatigue",
    "notes": "Feeling tired after long shift",
    "created_at": "2024-01-01T18:00:00Z"
  }
]
```

#### Get All Health Logs (Supervisor/Admin)
```http
GET /rest/v1/health_safety_logs?select=*,users(email,full_name)&order=date.desc
```

#### Create Health Log
```http
POST /rest/v1/health_safety_logs
Content-Type: application/json

{
  "user_id": "user_uuid",
  "date": "2024-01-01",
  "fatigue_level": "moderate",
  "symptoms": "Headache, fatigue",
  "notes": "Feeling tired after long shift"
}
```

---

### Shifts

#### Get User Shifts
```http
GET /rest/v1/shifts?user_id=eq.{user_id}&order=shift_date.desc
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "user_uuid",
    "shift_date": "2024-01-01",
    "start_time": "08:00:00",
    "end_time": "17:00:00",
    "notes": "Regular shift",
    "assigned_by": "supervisor_uuid",
    "notified": false,
    "created_at": "2023-12-25T00:00:00Z"
  }
]
```

#### Get All Shifts (Supervisor/Admin)
```http
GET /rest/v1/shifts?select=*,users(email,full_name)&order=shift_date.desc&limit=100
```

#### Create Shift
```http
POST /rest/v1/shifts
Content-Type: application/json

{
  "user_id": "user_uuid",
  "shift_date": "2024-01-01",
  "start_time": "08:00:00",
  "end_time": "17:00:00",
  "notes": "Regular shift",
  "assigned_by": "supervisor_uuid",
  "notified": false
}
```

#### Update Shift Notification Status
```http
PATCH /rest/v1/shifts?id=eq.{shift_id}
Content-Type: application/json

{
  "notified": true
}
```

#### Delete Shift
```http
DELETE /rest/v1/shifts?id=eq.{shift_id}
```

---

### Incidents

#### Get User Incidents
```http
GET /rest/v1/incidents?reported_by=eq.{user_id}&order=reported_at.desc
```

**Response:**
```json
[
  {
    "id": "uuid",
    "reported_by": "user_uuid",
    "incident_type": "hazard",
    "severity": "high",
    "location": "Mine A, Level 2",
    "description": "Loose rock detected on ceiling",
    "date": "2024-01-01",
    "status": "reported",
    "reported_at": "2024-01-01T10:00:00Z",
    "resolved_at": null,
    "resolved_by": null
  }
]
```

#### Get All Incidents (Supervisor/Admin)
```http
GET /rest/v1/incidents?select=*,users(email,full_name)&order=reported_at.desc
```

#### Create Incident Report
```http
POST /rest/v1/incidents
Content-Type: application/json

{
  "reported_by": "user_uuid",
  "incident_type": "hazard",
  "severity": "high",
  "location": "Mine A, Level 2",
  "description": "Loose rock detected on ceiling",
  "date": "2024-01-01",
  "status": "reported"
}
```

#### Update Incident Status
```http
PATCH /rest/v1/incidents?id=eq.{incident_id}
Content-Type: application/json

{
  "status": "resolved",
  "resolved_at": "2024-01-01T15:00:00Z",
  "resolved_by": "supervisor_uuid"
}
```

#### Delete Incident (Admin)
```http
DELETE /rest/v1/incidents?id=eq.{incident_id}
```

---

## Real-time Subscriptions

### Subscribe to Sensor Data
```javascript
const channel = supabase
  .channel('sensor_data_changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'sensor_data',
    },
    (payload) => {
      console.log('Sensor data updated:', payload)
    }
  )
  .subscribe()
```

### Subscribe to Sensor Alerts
```javascript
const channel = supabase
  .channel('sensor_alerts_changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'sensor_alerts',
    },
    (payload) => {
      console.log('Alert updated:', payload)
    }
  )
  .subscribe()
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "message": "Invalid request parameters",
  "code": "400"
}
```

### 401 Unauthorized
```json
{
  "message": "Authentication required",
  "code": "401"
}
```

### 403 Forbidden
```json
{
  "message": "Insufficient permissions",
  "code": "403"
}
```

### 404 Not Found
```json
{
  "message": "Resource not found",
  "code": "404"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal server error",
  "code": "500"
}
```

---

## Query Parameters

Supabase PostgREST supports various query parameters:

- `select`: Specify columns to return (e.g., `select=id,email,name`)
- `filter`: Filter results (e.g., `user_id=eq.{uuid}`)
- `order`: Sort results (e.g., `order=created_at.desc`)
- `limit`: Limit number of results (e.g., `limit=10`)
- `offset`: Skip results (e.g., `offset=20`)

### Filter Operators
- `eq`: Equal
- `neq`: Not equal
- `gt`: Greater than
- `gte`: Greater than or equal
- `lt`: Less than
- `lte`: Less than or equal
- `like`: Pattern match
- `ilike`: Case-insensitive pattern match
- `in`: In array
- `is`: IS NULL/IS NOT NULL

---

## Rate Limiting

Supabase has rate limits based on your plan:
- Free tier: 500 requests per second
- Pro tier: Higher limits

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- UUIDs are used for all primary keys
- Foreign key relationships are enforced at the database level
- Row Level Security (RLS) policies control access based on user roles
- Real-time subscriptions require WebSocket connections




