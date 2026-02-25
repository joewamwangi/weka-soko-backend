# 🛍 Weka Soko — Backend API

> Full backend for Kenya's smartest resell platform. Post free, pay KSh 250 only when a real buyer locks in.

---

## 📁 Project Structure

```
weka-soko-backend/
├── src/
│   ├── index.js                  # Entry point — Express + Socket.io server
│   ├── db/
│   │   ├── pool.js               # PostgreSQL connection pool
│   │   ├── migrate.js            # Run: node src/db/migrate.js
│   │   └── seed.js               # Optional: seed demo data
│   ├── routes/
│   │   ├── auth.js               # Register, login, profile
│   │   ├── listings.js           # CRUD listings, lock-in, search
│   │   ├── payments.js           # M-Pesa STK Push, escrow, callback
│   │   ├── chat.js               # REST chat history + Socket.io handler
│   │   ├── admin.js              # Admin dashboard endpoints
│   │   └── notifications.js      # User notifications
│   ├── middleware/
│   │   └── auth.js               # JWT verification, role guards
│   └── services/
│       ├── mpesa.service.js       # Safaricom Daraja API integration
│       ├── moderation.service.js  # Contact-info detection engine
│       ├── cloudinary.service.js  # Photo upload to Cloudinary
│       └── cron.service.js        # Auto-release escrows, cleanup
├── .env.example                  # Copy to .env and fill in values
└── package.json
```

---

## 🚀 Local Setup

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+
- A [Safaricom Daraja](https://developer.safaricom.co.ke) account (for M-Pesa)
- A [Cloudinary](https://cloudinary.com) account (for photos)

### 2. Install

```bash
git clone <your-repo>
cd weka-soko-backend
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 4. Create Database

```bash
# In PostgreSQL:
createdb weka_soko

# Run migrations
node src/db/migrate.js
```

### 5. Start Development Server

```bash
npm run dev
# → Server running on http://localhost:5000
# → Socket.io ready for connections
```

---

## ☁️ Deployment (Railway + Vercel)

### Backend → Railway

1. Create a new project on [Railway](https://railway.app)
2. Add a **PostgreSQL** service — copy the `DATABASE_URL`
3. Add your backend repo, set **Root Directory** to `/`  
4. Add all environment variables from `.env.example`
5. Railway auto-deploys on push to `main`

```bash
# Railway auto-detects Node.js. Start command:
npm start
```

### M-Pesa Callback URL
Once deployed, set your `MPESA_CALLBACK_URL` to:
```
https://your-railway-app.up.railway.app/api/payments/mpesa/callback
```
Register this URL in your [Daraja app settings](https://developer.safaricom.co.ke).

### Frontend → Vercel
- Deploy the React frontend to Vercel
- Set `NEXT_PUBLIC_API_URL=https://your-railway-app.up.railway.app`
- Set `NEXT_PUBLIC_WS_URL=wss://your-railway-app.up.railway.app`

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account (buyer or seller) |
| POST | `/api/auth/login` | Login, receive JWT |
| GET | `/api/auth/me` | Get current user profile |
| PATCH | `/api/auth/profile` | Update name/phone |
| POST | `/api/auth/change-password` | Change password |

### Listings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/listings` | Browse listings (search, filter, paginate) |
| GET | `/api/listings/:id` | View single listing (increments views) |
| POST | `/api/listings` | Create listing with photos (seller only) |
| PATCH | `/api/listings/:id` | Update listing (owner only) |
| DELETE | `/api/listings/:id` | Soft-delete listing |
| GET | `/api/listings/seller/mine` | Get all my listings (seller) |
| POST | `/api/listings/:id/lock-in` | Buyer locks in to buy |

**Listing Search Query Params:**
```
?search=samsung tv
&category=Electronics
&minPrice=10000
&maxPrice=50000
&sort=newest|oldest|price_asc|price_desc|popular
&page=1
&limit=20
```

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/unlock` | Seller pays KSh 250 STK Push |
| POST | `/api/payments/escrow` | Buyer pays escrow (7.5% fee) |
| POST | `/api/payments/mpesa/callback` | ← Safaricom callback (public) |
| GET | `/api/payments/status/:checkoutId` | Poll payment status |
| POST | `/api/payments/escrow/:id/confirm-receipt` | Buyer confirms item received |
| POST | `/api/payments/escrow/:id/dispute` | Buyer raises dispute |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/:listingId` | Get message history |
| GET | `/api/chat/threads/mine` | Get all my chat threads |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get my notifications |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |

### Admin (requires admin role)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Platform overview stats |
| GET | `/api/admin/violations` | Chat violations list |
| POST | `/api/admin/violations/:id/review` | Dismiss/warn/suspend |
| GET | `/api/admin/escrows` | All escrow records |
| POST | `/api/admin/escrows/:id/release` | Force-release escrow |
| GET | `/api/admin/disputes` | Open disputes |
| POST | `/api/admin/disputes/:id/resolve` | Resolve dispute |
| GET | `/api/admin/users` | All users |
| POST | `/api/admin/users/:id/suspend` | Suspend/unsuspend user |
| GET | `/api/admin/payments` | All payments |

---

## 🔌 Socket.io Events

### Client → Server
```js
// Join a listing chat room
socket.emit("join_listing", listingId)

// Send a message
socket.emit("send_message", { listingId, body: "Is this still available?" })

// Typing indicators
socket.emit("typing", listingId)
socket.emit("stop_typing", listingId)
```

### Server → Client
```js
// Message received
socket.on("new_message", { id, senderId, senderAnon, body, createdAt, blocked })

// Message was blocked by moderation bot
socket.on("message_blocked", { reason, severity, violationCount, warning })

// Joined room confirmation
socket.on("joined", { listingId, canChat })

// Typing indicators
socket.on("user_typing", { user })
socket.on("user_stop_typing")

// Admin only — real-time violation alerts
socket.on("violation_alert", { user, listingId, reason, severity })
```

### Connect with Auth
```js
const socket = io("https://your-api.up.railway.app", {
  auth: { token: "your_jwt_token_here" }
});
```

---

## 🤖 Chat Moderation Engine

The moderation service detects contact info in 15+ ways:

| Pattern | Example | Detected? |
|---------|---------|-----------|
| Kenyan phone (raw) | `0712345678` | ✅ |
| Phone with separators | `0712-345-678` | ✅ |
| International | `+254712345678` | ✅ |
| Phone with dots | `07.12.34.56.78` | ✅ |
| Phone in words | `zero seven one two...` | ✅ |
| L33tspeak | `071234567eight` | ✅ |
| Email | `john@gmail.com` | ✅ |
| Email disguised | `john at gmail dot com` | ✅ |
| URLs | `https://wa.me/...` | ✅ |
| WhatsApp | `whatsapp me`, `wa.me` | ✅ |
| Telegram | `t.me/john` | ✅ |
| "Call me" | `call me on...` | ✅ |
| "My number" | `my number is...` | ✅ |

**Violation Escalation:**
- 1st offense → Warning (message blocked)
- 2nd offense → Account flagged for review  
- 3rd offense → Account auto-suspended

---

## 💳 M-Pesa Integration Notes

- Uses **Daraja 2.0** STK Push (CustomerPayBillOnline)
- Sandbox: `https://sandbox.safaricom.co.ke`
- Production: `https://api.safaricom.co.ke`
- Phone numbers auto-normalized to `254XXXXXXXXX` format
- OAuth tokens cached and auto-refreshed
- Callback URL **must be HTTPS** and publicly accessible
- Use [ngrok](https://ngrok.com) for local callback testing: `ngrok http 5000`

---

## 🔐 Security Notes

- Passwords hashed with bcrypt (cost factor 12)
- JWT tokens with configurable expiry (default 30 days)
- Rate limiting: 200 req/15min globally, 20 req/15min for auth
- Helmet.js for security headers
- SQL injection prevented via parameterized queries
- Seller contact info never exposed in DB queries until `is_unlocked = TRUE`
- Admin routes double-protected (JWT + role check)

---

## 🧰 Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 18 |
| Framework | Express.js |
| Real-time | Socket.io |
| Database | PostgreSQL 14 |
| ORM/Query | pg (node-postgres) |
| Auth | JWT (jsonwebtoken) |
| Payments | Safaricom Daraja API |
| Photos | Cloudinary |
| Jobs | node-cron |
| Validation | express-validator |
| Security | helmet, express-rate-limit |
| Hosting | Railway (API) + Vercel (frontend) |
