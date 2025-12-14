# Quick Fix: Invalid API Key Error

## Problem
You're seeing "Invalid API key" error when trying to login.

## Solution

### Step 1: Get Your Supabase Credentials

1. Go to your Supabase project: https://supabase.com/dashboard
2. Select your project
3. Click on **Settings** (gear icon) in the left sidebar
4. Click on **API** in the settings menu

### Step 2: Copy Your Credentials

You'll see two important values:

1. **Project URL**
   - Located under "Project URL" section
   - Format: `https://xxxxxxxxxxxxx.supabase.co`
   - Copy the ENTIRE URL

2. **anon public key**
   - Located under "Project API keys" → "anon public"
   - This is a LONG string that starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **IMPORTANT**: Copy the ENTIRE key (it's usually 200+ characters long)
   - Make sure you don't miss any characters at the beginning or end

### Step 3: Create .env File

1. In your project root directory (same folder as `package.json`), create a file named `.env`
2. Add the following content:

```env
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_complete_key_here
```

3. Replace:
   - `https://your-project-id.supabase.co` with your actual Project URL
   - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_complete_key_here` with your actual anon public key

### Step 4: Verify the .env File

Make sure:
- ✅ File is named exactly `.env` (with the dot at the beginning)
- ✅ No spaces around the `=` sign
- ✅ No quotes around the values (unless the value itself contains spaces)
- ✅ The URL starts with `https://`
- ✅ The key is the complete long string

### Step 5: Restart the Server

**CRITICAL**: After creating or modifying the `.env` file, you MUST restart the development server:

```bash
# Stop the current server (press Ctrl+C)
# Then start it again:
npm start
```

### Step 6: Verify It's Working

1. Check the browser console - you should see: `✅ Supabase client initialized successfully`
2. If you see error messages, check:
   - Is the `.env` file in the root directory?
   - Did you restart the server after creating `.env`?
   - Are the values correct (no typos, complete keys)?

## Common Mistakes

❌ **Wrong**: Using the "service_role" key instead of "anon public" key
✅ **Correct**: Use the "anon public" key

❌ **Wrong**: Copying only part of the key
✅ **Correct**: Copy the entire key (it's very long)

❌ **Wrong**: Not restarting the server after creating `.env`
✅ **Correct**: Always restart after changing environment variables

❌ **Wrong**: File named `env` or `.env.txt`
✅ **Correct**: File must be named exactly `.env`

## Still Having Issues?

1. Check browser console for specific error messages
2. Verify your Supabase project is active (not paused)
3. Make sure you're using the correct project's credentials
4. Try copying the key again - sometimes copy/paste can miss characters

