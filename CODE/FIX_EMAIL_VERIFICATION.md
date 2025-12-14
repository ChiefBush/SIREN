# Fix: Email Verification Not Received

## Problem
Account is created successfully, but verification email is not received.

## Solutions

### Solution 1: Check Supabase Email Settings

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Check Authentication Settings**
   - Go to **Authentication** → **Settings** (or **Configuration**)
   - Look for **"Enable email confirmations"** or **"Email Auth"**
   - Check if email confirmation is **enabled** or **disabled**

3. **If Email Confirmation is Disabled:**
   - Users can log in immediately without email verification
   - This is common in development
   - You can enable it later for production

### Solution 2: Configure SMTP (For Production)

If you need email verification to work, you need to configure SMTP:

1. **Go to Authentication → Settings**
2. **Find "SMTP Settings"** or **"Email Templates"**
3. **Configure SMTP:**
   - **Host**: Your SMTP server (e.g., `smtp.gmail.com`, `smtp.sendgrid.net`)
   - **Port**: Usually 587 or 465
   - **Username**: Your SMTP username
   - **Password**: Your SMTP password
   - **Sender email**: The email address that will send verification emails

4. **Popular SMTP Providers:**
   - **SendGrid** (Free tier: 100 emails/day)
   - **Mailgun** (Free tier: 5,000 emails/month)
   - **AWS SES** (Very cheap, pay-as-you-go)
   - **Gmail** (For personal use, requires app password)

### Solution 3: Disable Email Confirmation (For Development)

If you're in development and don't need email verification:

1. **Go to Supabase Dashboard**
2. **Authentication → Settings**
3. **Disable "Enable email confirmations"**
4. **Save changes**

Users will be able to log in immediately after signup.

### Solution 4: Check Spam Folder

- Check your **spam/junk folder**
- Check **promotions tab** (if using Gmail)
- The email might be filtered

### Solution 5: Use Supabase's Built-in Email (Limited)

Supabase provides a built-in email service, but it has limitations:
- **Rate limits**: Very limited emails per hour
- **May go to spam**: Emails from Supabase domains often get filtered
- **Not recommended for production**: Use a proper SMTP service

### Solution 6: Manual Email Verification (Development Only)

For development, you can manually verify users:

1. **Go to Supabase Dashboard**
2. **Authentication → Users**
3. **Find the user**
4. **Click on the user**
5. **Manually verify the email** (if option available)

Or use SQL:

```sql
-- Manually verify a user's email (DEVELOPMENT ONLY)
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'user@example.com';
```

## Recommended Setup for Development

1. **Disable email confirmation** in Supabase settings
2. Users can log in immediately after signup
3. Enable email confirmation when deploying to production

## Recommended Setup for Production

1. **Enable email confirmation** in Supabase settings
2. **Configure SMTP** with a reliable provider (SendGrid, Mailgun, etc.)
3. **Customize email templates** in Supabase
4. **Test email delivery** before going live

## Quick Check Commands

Run these in Supabase SQL Editor to check user status:

```sql
-- Check if user's email is confirmed
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'your-email@example.com';

-- If email_confirmed_at is NULL, the email is not confirmed
```

## Update Code to Handle Unverified Users

If you want to allow unverified users to log in (development only), you can modify the login logic, but this is **NOT recommended for production**.

---

**For now, the easiest solution is to disable email confirmation in Supabase settings for development.**

