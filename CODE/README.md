# SIREN - Sensor based indicator for risk in environmental notification

Safety & Workforce Management Web Application for miners and supervisors.

## Tech Stack

- **Frontend**: React (JavaScript), Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase

1. Create a `.env` file in the root directory:
```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

2. Set up the database by running `docs/SUPABASE_SCHEMA.sql` in your Supabase SQL Editor

### 3. Run the Application

```bash
npm start
```

The application will open at `http://localhost:3000`

## Application Flow

1. **Landing Page** - Information about the project
2. **Authentication Page** - Login or Sign Up
3. **Role-Based Dashboard** - Redirected based on user role

## User Roles

- **Miner** - Basic worker access
- **Supervisor** - Manager access
- **Admin** - Full system access

## Employee ID Format

Employee IDs are automatically generated:
- Miners: `MIN-0001`, `MIN-0002`, etc.
- Supervisors: `SUP-0001`, `SUP-0002`, etc.
- Admins: `ADM-0001`, `ADM-0002`, etc.

## Project Structure

```
src/
├── pages/
│   ├── LandingPage.jsx      # Landing/information page
│   ├── AuthPage.jsx          # Authentication (Login/Signup)
│   ├── MinerDashboard.jsx   # Miner dashboard (placeholder)
│   ├── SupervisorDashboard.jsx  # Supervisor dashboard (placeholder)
│   └── AdminDashboard.jsx   # Admin dashboard (placeholder)
├── lib/
│   └── supabase.js          # Supabase client configuration
├── App.jsx                   # Main app with routing
├── index.js                  # Entry point
└── index.css                 # Global styles
```

## Documentation

- `docs/SUPABASE_SCHEMA.sql` - Complete database schema
- `docs/DATABASE_SCHEMA.md` - Database documentation
- `docs/API_DESIGN.md` - API documentation
- `SETUP_INSTRUCTIONS.md` - Detailed setup guide

