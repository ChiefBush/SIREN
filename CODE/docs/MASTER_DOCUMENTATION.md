# SIREN - Master Project Guide
## Sensor-based Indicator for Risk in Environmental Notification

SIREN is a cutting-edge **Safety & Workforce Management System** designed specifically for the mining industry. This document explains how the system works, why we built it this way, and what makes it a robust solution for both technical and non-technical stakeholders.

---

## 🚀 1. Executive Summary (The Big Picture)
In a mine, every second counts. SIREN ensures that workers are safe and management is informed by combining three main systems:
1.  **Safety Ears & Eyes**: Electronic sensors that "smell" hazardous gases and "feel" if a worker has fallen.
2.  **Digital Manager**: A tool for tracking attendance, shifts, leave, and salary so nothing gets lost in paperwork.
3.  **Real-Time Dashboard**: A live monitor that alerts supervisors the exact moment something goes wrong.

---

## 🛠 2. The Software Stack (What's Under the Hood)
We chose these technologies to ensure the system is **fast**, **secure**, and **reliable**:

### The "Face" (Frontend)
*   **React & Tailwind CSS**: Think of this as the skin and muscles. React makes the app interactive (buttons click instantly), and Tailwind makes it look modern and clean on any screen (phone, tablet, or laptop).
*   **Recharts (The Graphics)**: This converts boring rows of numbers into beautiful live charts, allowing supervisors to see gas levels or heart rates at a glance.

### The "Brain & Memory" (Backend)
*   **Supabase (The Motor)**: Instead of a traditional slow server, we use Supabase. It's like a high-speed engine that handles:
    *   **Memory (Database)**: Storing every login, every sensor reading, and every report.
    *   **Passports (Auth)**: Ensuring only authorized people can enter the system.
    *   **Live Broadcast (Real-time)**: Sending alerts to the supervisor's screen without them needing to "refresh" the page.

---

## 🏗 3. Smart Design Decisions (The "Why")

### 3.1 The "Two-Channel" Strategy
*   **Technical**: Dual Supabase client initialization.
*   **Simple Explanation**: We have two separate "pipelines" for data. One pipeline handles "Slow but Critical" data (like employee records and salaries). The other handles "Fast and Constant" data (thousands of sensor readings from the mine). 
*   **Why it Matters**: Even if the sensors are sending a massive amount of data, the management part of the app will never lag or get stuck.

### 3.2 The "Smart Memory" (Caching)
*   **Technical**: SessionStorage Role Caching.
*   **Simple Explanation**: The app "remembers" who you are for your current session.
*   **Why it Matters**: When you click between pages, you don't see a "Loading..." screen every time. It feels smooth and professional.

### 3.3 The "Digital Paper Trail" (Soft-Delete)
*   **Technical**: Soft-delete via `deleted_at`.
*   **Simple Explanation**: When you "delete" a user or a record, we don't actually erase it from existence—we just hide it and lock it.
*   **Why it Matters**: In mining, you need records for years. If an incident happened 6 months ago involving a worker who has since left, their safety logs are still there for insurance or legal reasons.

---

## 🛡 4. Safety & Security (Protecting the Data)

### 4.1 Digital Walls (Row Level Security)
*   **Explanation**: Every table in our database has a "security guard" (RLS). 
*   **Scenario**: A Miner tries to look at the Admin's activity logs. The system stops them automatically because the "guard" only allows them to see their own name and data.

### 4.2 Error Protection (Sanitization)
*   **Explanation**: Sometimes a sensor might malfunction and send a broken message (like 'NaN' or empty text).
*   **How we fix it**: Our code is trained to spot these "broken messages" and replace them with a '0' so the app doesn't crash.

---

## 📝 5. How the Features Work (For Everyone)

### 📈 Sensor Monitoring & Alerts
1.  **IoT Device**: A sensor on the worker's wristband sends a reading.
2.  **The Threshold**: Our system checks: "Is this gas level above the safety limit?" 
3.  **The Alert**: If the level is high, a "Siren" (Alert) is created in the database.
4.  **The Notification**: Within 0.5 seconds, a red alert pops up on the Supervisor's computer.

### 📅 Workforce Management
*   **Attendance**: When a worker logs in/out, the system calculates their total hours worked automatically.
*   **Leave Applications**: Miners can submit a request (e.g., "Sick Leave"). Supervisors get a notification, see the reason, and click "Approve" or "Reject." Both parties are updated instantly.
*   **Incident Reports**: Anyone can report a hazard. It gets assigned a severity (Low to Critical) and tracks who resolved it and when.

---

## ❓ 6. Common Questions (Q&A)

**Q: Does the app work on mobile?**
A: Yes, the design is "Responsive," meaning it adjusts to fit phones and tablets perfectly.

**Q: Can a Supervisor change a Miner's password?**
A: No, only Admins have that level of power. Our role-based system ensures everyone has just the right amount of access.

**Q: What is "Miner A"?**
A: This is a special profile we use for live demos. If you are using real sensors in a test, they are linked specifically to this profile so you can see live hardware data.

**Q: Is the data safe?**
A: Yes. Every piece of data is encrypted and protected by the "Digital Walls" mentioned in Section 4.

---

## ⚙️ 7. Quick Setup (Technical Summary)
1.  **Environment**: Create a `.env` file with your Supabase keys.
2.  **Database**: Run the `SUPABASE_SCHEMA.sql` in the Supabase SQL Editor.
3.  **Launch**: Run `npm install` and then `npm start`.

---

**Master documentation version: 2.0 (Stakeholder Ready)**
