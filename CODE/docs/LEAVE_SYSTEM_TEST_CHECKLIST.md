# Leave Application System - Testing Checklist

## Pre-Testing Setup
- [ ] Ensure Supabase is configured correctly (check `.env` file)
- [ ] Verify `leave_applications` table exists in Supabase
- [ ] Enable real-time replication for `leave_applications` table in Supabase Dashboard
- [ ] Have at least one miner account and one supervisor account ready

## Miner Tests

### Leave Creation
- [ ] Can access Leave Application page
- [ ] Form shows Start Date and End Date fields
- [ ] Cannot select past dates for Start Date
- [ ] Cannot select End Date before Start Date
- [ ] Submit button is enabled when both dates are filled
- [ ] Clicking Submit shows success message (top-right corner)
- [ ] Form resets after successful submission
- [ ] New application appears in "My Leave Applications" table
- [ ] Application status shows as "Pending" (yellow badge)

### View Own Applications
- [ ] Can see all own leave applications
- [ ] Applications are sorted by creation date (newest first)
- [ ] Each application shows: Start Date, End Date, Days, Status, Applied On
- [ ] Status badges have correct colors:
  - Pending: Yellow
  - Accepted: Green
  - Rejected: Red

### Real-time Updates (Miner Side)
- [ ] When supervisor accepts/rejects, status updates automatically (or on refresh)
- [ ] Status badge color changes accordingly

## Supervisor Tests

### View All Applications
- [ ] Can access Leave Management page
- [ ] Can see statistics cards (Total, Pending, Accepted, Rejected)
- [ ] Can see all leave applications from all miners
- [ ] Each application shows: Miner Name, Employee ID, Leave Type, Dates, Days, Status
- [ ] Can filter by: All, Pending, Accepted, Rejected
- [ ] Filter buttons work correctly

### Accept Leave Application
- [ ] Pending applications show Accept and Reject buttons
- [ ] Clicking "Accept" shows confirmation dialog
- [ ] Confirmation dialog shows:
  - Title: "Confirm Accept"
  - Miner's name
  - Cancel button
  - Confirm Accept button (green)
- [ ] Clicking "Cancel" closes dialog without changes
- [ ] Clicking "Confirm Accept":
  - Closes dialog
  - Shows success message (top-right)
  - Updates status to "Accepted"
  - Removes Accept/Reject buttons (shows "-")
  - Updates statistics cards

### Reject Leave Application
- [ ] Clicking "Reject" shows confirmation dialog
- [ ] Confirmation dialog shows:
  - Title: "Confirm Reject"
  - Miner's name
  - Cancel button
  - Confirm Reject button (red)
- [ ] Clicking "Cancel" closes dialog without changes
- [ ] Clicking "Confirm Reject":
  - Closes dialog
  - Shows success message (top-right)
  - Updates status to "Rejected"
  - Removes Accept/Reject buttons (shows "-")
  - Updates statistics cards

### Real-time Updates (Supervisor Side)
- [ ] When miner submits new leave, it appears automatically (or on refresh)
- [ ] Statistics cards update automatically
- [ ] Refresh button works correctly

## Cross-Role Tests

### Real-time Synchronization
- [ ] Open miner view in one browser/tab
- [ ] Open supervisor view in another browser/tab
- [ ] Miner submits leave application
- [ ] Verify supervisor sees new application (refresh if needed)
- [ ] Supervisor accepts/rejects application
- [ ] Verify miner sees updated status (refresh if needed)

## Edge Cases

### Date Validation
- [ ] Cannot submit with empty dates
- [ ] Cannot submit with start date in the past
- [ ] Cannot submit with end date before start date
- [ ] Can submit with same start and end date (1 day leave)

### Multiple Actions
- [ ] Cannot accept/reject already processed applications
- [ ] Can process multiple applications in sequence
- [ ] Confirmation dialog shows correct miner name for each application

### Error Handling
- [ ] If submission fails, error message is shown
- [ ] If status update fails, error message is shown
- [ ] Application state remains consistent after errors

## UI/UX Checks

### Visual Consistency
- [ ] All buttons have consistent styling
- [ ] Status badges are clearly visible
- [ ] Confirmation dialog is centered and readable
- [ ] Success messages are visible and auto-dismiss
- [ ] Tables are responsive and scrollable if needed

### Accessibility
- [ ] All buttons are clickable
- [ ] Form inputs are properly labeled
- [ ] Error messages are clear and helpful
- [ ] Loading states are indicated

## Performance

- [ ] Page loads quickly
- [ ] Form submission is responsive
- [ ] Status updates happen quickly
- [ ] No console errors
- [ ] Real-time updates work without lag

## Final Verification

- [ ] No existing UI has been changed (only confirmation dialogs added)
- [ ] All features work as expected
- [ ] No breaking changes to other parts of the application
- [ ] Documentation is clear and accurate

---

## Notes

Use this space to record any issues found during testing:

```
Issue 1:
- Description:
- Steps to reproduce:
- Expected behavior:
- Actual behavior:

Issue 2:
- Description:
- Steps to reproduce:
- Expected behavior:
- Actual behavior:
```

## Sign-off

- [ ] All tests passed
- [ ] Issues documented and resolved
- [ ] Ready for production

Tested by: _______________
Date: _______________
