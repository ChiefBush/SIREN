# Quick Reference Guide - Leave Application System

## For Miners

### How to Apply for Leave

1. **Navigate to Leave Application**
   - Click on "Leave Application" (📝) in the sidebar

2. **Fill out the form**
   - **Leave Type**: Select from dropdown
     - Sick Leave
     - Casual Leave
     - Annual Leave
     - Emergency Leave
   - **Start Date**: Pick the first day of leave
   - **End Date**: Pick the last day of leave
   - **Reason** (optional): Explain why you need leave

3. **Submit**
   - Click "Submit Application"
   - You'll see a success message
   - Your supervisor will be notified automatically

### View Your Applications

- All your submitted applications appear in the table below the form
- Each application shows:
  - Leave Type
  - Start Date
  - End Date
  - Number of Days
  - Status (Pending/Accepted/Rejected)
  - Date Applied

### Status Meanings

| Status | Color | Meaning |
|--------|-------|---------|
| **Pending** | 🟡 Yellow | Waiting for supervisor approval |
| **Accepted** | 🟢 Green | Your leave has been approved |
| **Rejected** | 🔴 Red | Your leave was not approved |

---

## For Supervisors

### How to Manage Leave Applications

1. **Navigate to Leave Management**
   - Click on "Leave Management" (📝) in the sidebar

2. **View Statistics**
   - See at-a-glance counts:
     - Total Applications
     - Pending (needs your action)
     - Accepted
     - Rejected

3. **Filter Applications**
   - Click filter buttons to view:
     - **All**: Every application
     - **Pending**: Only applications awaiting approval
     - **Accepted**: Only approved applications
     - **Rejected**: Only rejected applications

4. **Review Applications**
   - Each row shows:
     - Miner name and employee ID
     - Leave type
     - Start and end dates
     - Number of days
     - Current status
     - Date applied

5. **Approve or Reject**
   - For pending applications:
     - Click **Accept** (green button) to approve
     - Click **Reject** (red button) to deny
   - Already processed applications show "-" (no action needed)

### Best Practices

- ✅ Review pending applications regularly
- ✅ Use filters to focus on pending items
- ✅ Check miner's name and employee ID before approving
- ✅ Consider the number of days requested
- ✅ The miner will see your decision immediately

---

## Database Migration

### If you're setting up for the first time:

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy contents of `docs/LEAVE_APPLICATIONS_MIGRATION.sql`
4. Paste and run the SQL
5. Verify the table is created

### What the migration does:

- Creates `leave_applications` table (if it doesn't exist)
- Adds `leave_type` column (if it doesn't exist)
- Sets up proper indexes for performance
- Configures Row Level Security (RLS) policies
- Ensures miners can only see their own applications
- Ensures supervisors can see and manage all applications

---

## Troubleshooting

### Miner Issues

**Problem**: Can't submit leave application
- ✅ Check that all required fields are filled
- ✅ Ensure start date is not in the past
- ✅ Ensure end date is not before start date
- ✅ Check your internet connection

**Problem**: Don't see my applications
- ✅ Click the Refresh button
- ✅ Check if you're logged in as the correct user
- ✅ Verify you have submitted applications

### Supervisor Issues

**Problem**: Can't see any applications
- ✅ Click the Refresh button
- ✅ Check if miners have submitted any applications
- ✅ Verify you're logged in as a supervisor

**Problem**: Can't approve/reject
- ✅ Only pending applications can be approved/rejected
- ✅ Already processed applications cannot be changed
- ✅ Check your internet connection

---

## Technical Details

### Leave Types

```javascript
const leaveTypes = [
  'sick',      // Sick Leave
  'casual',    // Casual Leave
  'annual',    // Annual Leave
  'emergency'  // Emergency Leave
]
```

### Status Values

```javascript
const statuses = [
  'pending',   // Awaiting supervisor decision
  'accepted',  // Approved by supervisor
  'rejected'   // Denied by supervisor
]
```

### Real-time Updates

- Both miner and supervisor views update automatically
- No need to refresh the page manually
- Changes appear within seconds
- Uses Supabase real-time subscriptions

---

## API Endpoints (Supabase)

### For Miners

```javascript
// Create leave application
supabase
  .from('leave_applications')
  .insert({
    user_id: currentUserId,
    start_date: '2024-01-15',
    end_date: '2024-01-17',
    leave_type: 'sick',
    reason: 'Medical appointment',
    status: 'pending'
  })

// Read own applications
supabase
  .from('leave_applications')
  .select('*')
  .eq('user_id', currentUserId)
```

### For Supervisors

```javascript
// Read all applications
supabase
  .from('leave_applications')
  .select(`
    *,
    users(full_name, email, employee_id)
  `)

// Update application status
supabase
  .from('leave_applications')
  .update({ status: 'accepted' })
  .eq('id', applicationId)
```

---

## Support

If you encounter any issues:

1. Check this guide first
2. Verify database migration was run
3. Check browser console for errors
4. Ensure you have the correct role (miner/supervisor)
5. Contact your system administrator

---

## Version History

- **v1.0** - Initial split from monolithic component
  - Added leave type field
  - Added reason field
  - Separated miner and supervisor components
  - Added statistics dashboard for supervisors
  - Added filtering for supervisors
