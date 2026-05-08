# Admin Login Setup Guide

## Problem
Admins cannot log in because there is no admin user in the database yet.

## Solution: Create Admin User

### Option 1: Run Seed Script from Railway Dashboard (RECOMMENDED)

1. Go to Railway dashboard: https://railway.app
2. Select your project: `weka-soko-backend`
3. Go to "Settings" → "Deployments"
4. Click "Deployments" → "View Logs"
5. In the terminal, run:
   ```bash
   node src/db/seed-admin.js
   ```

### Option 2: Run Locally (if you have database access)

1. Make sure you have the DATABASE_URL environment variable
2. Run:
   ```bash
   node src/db/seed-admin.js
   ```

## Default Admin Credentials

After running the seed script:
- **Email**: `admin@wekasoko.co.ke`
- **Password**: `WekaSoko@Admin2026`

**IMPORTANT**: Change this password after first login!

## Backend Status

The backend is hosted on Render FREE tier which:
- Sleeps after 15 minutes of inactivity
- Takes 30-60 seconds to wake up
- To keep it awake, visit: https://weka-soko-backend.onrender.com/health every 15 minutes

OR upgrade to Render Starter ($7/month) to prevent sleep.

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
