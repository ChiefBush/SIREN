# Component Architecture - Before and After

## BEFORE: Single Monolithic Component

```
┌─────────────────────────────────────────┐
│      LeaveApplication.jsx               │
│  (Handles BOTH roles in one file)       │
├─────────────────────────────────────────┤
│                                         │
│  • Checks user role (miner/supervisor) │
│  • Conditionally renders UI             │
│  • Mixed concerns and responsibilities  │
│                                         │
│  IF MINER:                              │
│    - Show application form              │
│    - Show own applications              │
│                                         │
│  IF SUPERVISOR:                         │
│    - Hide application form              │
│    - Show all applications              │
│    - Show approve/reject buttons        │
│                                         │
└─────────────────────────────────────────┘
```

**Problems:**
- ❌ Violates separation of concerns
- ❌ Hard to maintain and test
- ❌ Confusing code with many conditionals
- ❌ Difficult to add role-specific features

---

## AFTER: Separated Role-Based Components

```
┌──────────────────────────────────────────────────────────────┐
│                    MINER ROLE                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │   MinerLeaveApplication.jsx                        │     │
│  ├────────────────────────────────────────────────────┤     │
│  │                                                    │     │
│  │  📝 Leave Application Form                        │     │
│  │     • Leave Type (dropdown)                       │     │
│  │     • Start Date                                  │     │
│  │     • End Date                                    │     │
│  │     • Reason (optional)                           │     │
│  │     • Submit Button                               │     │
│  │                                                    │     │
│  │  📋 My Leave Applications                         │     │
│  │     • View own applications only                  │     │
│  │     • Status badges (pending/accepted/rejected)   │     │
│  │     • Read-only (no approve/reject)               │     │
│  │                                                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  SUPERVISOR ROLE                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │   SupervisorLeaveManagement.jsx                    │     │
│  ├────────────────────────────────────────────────────┤     │
│  │                                                    │     │
│  │  📊 Statistics Dashboard                          │     │
│  │     • Total Applications                          │     │
│  │     • Pending Count                               │     │
│  │     • Accepted Count                              │     │
│  │     • Rejected Count                              │     │
│  │                                                    │     │
│  │  🔍 Filter Options                                │     │
│  │     [All] [Pending] [Accepted] [Rejected]         │     │
│  │                                                    │     │
│  │  📋 All Leave Applications                        │     │
│  │     • View ALL applications from ALL miners       │     │
│  │     • Miner name & employee ID shown              │     │
│  │     • Accept/Reject buttons (pending only)        │     │
│  │     • No application form                         │     │
│  │                                                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Clear separation of concerns
- ✅ Easy to maintain and test
- ✅ Role-specific features without conditionals
- ✅ Better user experience for each role

---

## Data Flow

```
┌─────────────────┐
│     MINER       │
│   Dashboard     │
└────────┬────────┘
         │
         │ uses
         ▼
┌─────────────────────────┐
│ MinerLeaveApplication   │
│                         │
│  1. Submit application  │────┐
│  2. View own apps       │    │
└─────────────────────────┘    │
                               │
                               │ writes to
                               ▼
                    ┌──────────────────────┐
                    │  leave_applications  │
                    │      (Database)      │
                    └──────────────────────┘
                               │
                               │ reads from
                               ▼
┌──────────────────────────────┐
│ SupervisorLeaveManagement    │
│                              │
│  1. View all applications    │
│  2. Filter by status         │
│  3. Approve/Reject           │────┐
└──────────────────────────────┘    │
         ▲                           │
         │                           │ updates
         │ uses                      │
         │                           ▼
┌────────┴────────┐         ┌──────────────────────┐
│   SUPERVISOR    │         │  leave_applications  │
│    Dashboard    │         │      (Database)      │
└─────────────────┘         └──────────────────────┘
                                     │
                                     │ real-time sync
                                     ▼
                            ┌─────────────────────┐
                            │  Both components    │
                            │  stay synchronized  │
                            └─────────────────────┘
```

---

## File Structure

```
src/pages/
├── LeaveApplication.jsx          ← OLD (deprecated, can be removed)
├── MinerLeaveApplication.jsx     ← NEW (for miners)
├── SupervisorLeaveManagement.jsx ← NEW (for supervisors)
├── MinerDashboard.jsx            ← UPDATED (uses MinerLeaveApplication)
└── SupervisorDashboard.jsx       ← UPDATED (uses SupervisorLeaveManagement)

docs/
├── LEAVE_APPLICATIONS_MIGRATION.sql     ← Database migration
└── LEAVE_APPLICATION_SPLIT_SUMMARY.md   ← Implementation docs
```

---

## Key Differences Summary

| Feature | Miner Component | Supervisor Component |
|---------|----------------|---------------------|
| **Application Form** | ✅ Yes (with leave type & reason) | ❌ No |
| **View Applications** | ✅ Own only | ✅ All miners |
| **Approve/Reject** | ❌ No | ✅ Yes (pending only) |
| **Miner Details** | ❌ Not shown | ✅ Name & Employee ID |
| **Filtering** | ❌ No | ✅ All/Pending/Accepted/Rejected |
| **Statistics** | ❌ No | ✅ Dashboard with counts |
| **Leave Type Field** | ✅ Yes | ✅ Displayed |
| **Reason Field** | ✅ Yes (optional) | ✅ Displayed |

---

## Real-time Synchronization

Both components use Supabase real-time subscriptions:

```javascript
// Both components subscribe to changes
supabase
  .channel('leave-applications-realtime')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'leave_applications'
  }, (payload) => {
    // Automatically refresh data when changes occur
    fetchLeaveApplications()
  })
  .subscribe()
```

This ensures:
- When a miner submits an application, supervisor sees it immediately
- When supervisor approves/rejects, miner sees the update immediately
- No manual refresh needed
