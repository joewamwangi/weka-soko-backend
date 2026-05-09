# Admin Login Setup Guide

## Problem
Admins cannot log in because there is no admin user in the database yet.

## Solution: Create Admin User

### Option 1: Run Seed Script from Render Dashboard (RECOMMENDED)

1. Go to Render dashboard: https://dashboard.render.com
2. Select your web service: `weka-soko-backend`
3. Click on "Shell" tab (or "Shell" in the top navigation)
4. Wait for the shell to connect
5. Run:
   ```bash
   node src/db/seed-admin.js
   ```

### Option 2: Run Locally (if you have database access)

1. Make sure you have the DATABASE_URL environment variable from Render
2. Install dependencies: `npm install`
3. Run:
   ```bash
   node src/db/seed-admin.js
   ```

## Default Admin Credentials

After running the seed script:
- **Email**: `admin@wekasoko.co.ke`
- **Password**: `WekaSoko@Admin2026`

**IMPORTANT**: Change this password after first login!

## Backend Status on Render Free Tier

Your backend is on **Render Free Tier** which:
- 😴 **Sleeps after 15 minutes** of inactivity
- ⏱️ Takes **30-60 seconds** to wake up
- ❌ Returns connection errors while sleeping

### Keep Backend Awake (Free Options):

**Option A**: Use UptimeRobot (FREE)
1. Go to https://uptimerobot.com
2. Create free account
3. Add new monitor: `https://weka-soko-backend.onrender.com/health`
4. Set interval to 5 minutes
5. This will ping your backend every 5 minutes and keep it awake!

**Option B**: Manual wake-up
- Visit https://weka-soko-backend.onrender.com/health every 15 minutes

**Option C**: Upgrade Render (Paid - $7/month)
- Go to Render dashboard
- Select `weka-soko-backend`
- Click "Upgrade" → Select "Starter" plan
- No more sleep!

## Testing Admin Login

Once the admin user is created, test with:
```bash
curl -X POST https://weka-soko-backend.onrender.com/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wekasoko.co.ke","password":"WekaSoko@Admin2026"}'
```

Expected response:
```json
{
  "user": {
    "id": "...",
    "email": "admin@wekasoko.co.ke",
    "role": "admin"
  },
  "token": "..."
}
```
