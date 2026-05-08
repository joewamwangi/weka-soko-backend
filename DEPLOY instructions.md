# Quick Deploy Instructions - Weka Soko Backend to Render

## ✅ What's Done
- ✅ Code pushed to GitHub: `https://github.com/wekasoko-joe-wa-mwangi-2026/weka-soko-backend`
- ✅ `render.yaml` configuration added
- ✅ All buyer request endpoints included (approve/reject)
- ✅ Latest fixes merged

---

## 🚀 Deploy to Render (5 minutes)

### Step 1: Create Render Account
1. Go to https://render.com
2. Sign up with GitHub
3. Click **"New +"** → **"Web Service"**

### Step 2: Connect Repository
- **Repository**: Select `wekasoko-joe-wa-mwangi-2026/weka-soko-backend`
- **Name**: `weka-soko-backend`
- **Region**: Frankfurt (Germany) - closest to Kenya
- **Branch**: `main`
- **Root Directory**: (leave blank)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node src/index.js`
- **Instance**: Free tier (or Starter for production)

### Step 3: Add Environment Variables

In Render dashboard → **Environment** → Add these:

```bash
# Database (from Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]/postgres

# Security
JWT_SECRET=wekasoko_jwt_secret_2026_min_32_chars_random

# AI APIs (free tier)
GROQ_API_KEY=gsk_xxx (get from https://console.groq.com)
HUGGINGFACE_API_KEY=hf_xxx (get from https://huggingface.co)

# System
CRON_SECRET=wekasoko_cron_secret_2026
NODE_ENV=production

# Cloudinary (images)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# M-Pesa
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://YOUR-RENDER-URL.up.r.app/api/payments/mpesa/callback

# Frontend
FRONTEND_URL=https://weka-soko.vercel.app

# Push notifications (optional)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# App config
UNLOCK_FEE_KES=250
```

### Step 4: Deploy
- Click **"Create Web Service"**
- Wait 5-10 minutes for deployment
- Copy your URL: `https://weka-soko-backend-xyz.up.r.app`

---

## 📝 Update Frontend

Update `lib/utils.js` in the frontend:

```javascript
// Change this line:
export const API = (process.env.NEXT_PUBLIC_API_URL || 'https://wekasokobackend.up.railway.app').replace(/\/$/, '');

// To:
export const API = (process.env.NEXT_PUBLIC_API_URL || 'https://YOUR-NEW-RENDER-URL.up.r.app').replace(/\/$/, '');
```

Or create `.env.local`:
```
NEXT_PUBLIC_API_URL=https://YOUR-NEW-RENDER-URL.up.r.app
```

Then redeploy frontend to Vercel.

---

## ✅ Verify Deployment

Test the health endpoint:
```bash
curl https://YOUR-RENDER-URL.up.r.app/api/health
```

Test buyer request approve (requires admin token):
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://YOUR-RENDER-URL.up.r.app/api/admin/requests/REQUEST_ID/approve
```

Expected response:
```json
{
  "ok": true,
  "request": {
    "id": "REQUEST_ID",
    "status": "active",
    "title": "..."
  }
}
```

---

## 🗄️ Supabase Setup

1. Create project at https://supabase.com
2. Go to **SQL Editor**
3. Run migrations:
   ```bash
   psql <your-supabase-connection-string> < src/db/migrations/*.sql
   ```
4. Copy connection string to Render env vars

---

## 📊 Available Endpoints

Once deployed, these endpoints will work:

- `POST /api/admin/requests/:id/approve` - Approve buyer request
- `POST /api/admin/requests/:id/reject` - Reject buyer request  
- `PATCH /api/admin/requests/:id/status` - Update request status
- `GET /api/admin/requests` - List all requests
- `GET /api/health` - Health check

---

## 🆘 Troubleshooting

**Backend won't start:**
- Check Render logs in dashboard
- Verify `DATABASE_URL` is correct
- Ensure all required env vars are set

**404 on routes:**
- Routes are case-sensitive
- Check that `src/index.js` imports `admin.js`
- Verify route paths match exactly

**Database errors:**
- Use Supabase connection pooler URL
- Check firewall allows Render IPs
- Verify migrations ran successfully

---

## 💰 Cost

- **Render Free Tier**: 750 hours/month (enough for 1 service)
- **Supabase Free**: 500MB DB, 50K users
- **Total**: **$0/month** for testing

Production:
- Render Starter: $7/month
- Supabase Pro: $25/month
- **Total**: ~$32/month

---

**Next Steps:**
1. ✅ Create Supabase database
2. ✅ Deploy to Render
3. ✅ Update frontend URL
4. ✅ Test approve/reject endpoints
5. ✅ Update M-Pesa callback URL in Daraja dashboard

**Support:**
- Render: https://render.com/docs
- Supabase: https://supabase.com/docs
