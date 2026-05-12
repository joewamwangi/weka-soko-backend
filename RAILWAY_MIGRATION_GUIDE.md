# ============================================
# Weka Soko - Railway Migration Guide
# Complete step-by-step instructions
# ============================================

# PHASE 1: PREPARE RAILWAY ACCOUNT
# ============================================

# 1. Create Railway account at https://railway.app
# 2. Create new project called "weka-soko"
# 3. Add PostgreSQL database:
#    - Click "New" → "PostgreSQL"
#    - Name: weka-soko-db
#    - Wait for provisioning
#    - Copy DATABASE_URL from Settings tab

# 4. Set up database schema:
#    - Go to "Data" tab in Railway
#    - Click "SQL" or use a tool like DBeaver/pgAdmin
#    - Run the entire railway_schema.sql script
#    - Verify tables are created

# PHASE 2: DEPLOY BACKEND TO RAILWAY
# ============================================

# Option A: Deploy from GitHub (Recommended)
# 1. In Railway Dashboard:
#    - Click "New" → "GitHub Repo"
#    - Select: wekasoko-joe-wa-mwangi-2026/weka-soko-backend
#    - Railway will auto-detect Node.js

# 2. Configure build:
#    - Build Command: (leave empty - Railway auto-detects)
#    - Start Command: node src/index.js

# 3. Add environment variables in Railway:
#    DATABASE_URL=<your Railway PostgreSQL connection string>
#    JWT_SECRET=<generate strong random string>
#    JWT_EXPIRES_IN=7d
#    NODE_ENV=production
#    FRONTEND_URL=https://weka-soko-nextjs.vercel.app
#    ADMIN_URL=https://weka-soko-admin-gamma.vercel.app
#    
#    # Payment (M-Pesa)
#    MPESA_ENVIRONMENT=sandbox
#    MPESA_CONSUMER_KEY=<your key>
#    MPESA_CONSUMER_SECRET=<your secret>
#    MPESA_PASSKEY=<your passkey>
#    MPESA_SHORTCODE=174379
#    MPESA_CALLBACK_URL=https://<your-railway-app>.railway.app/api/payments/mpesa/callback
#    
#    # Cloudinary (for images)
#    CLOUDINARY_CLOUD_NAME=<your cloud name>
#    CLOUDINARY_API_KEY=<your API key>
#    CLOUDINARY_API_SECRET=<your API secret>
#    
#    # Admin
#    ADMIN_URL=https://weka-soko-admin-gamma.vercel.app
#    
#    # Optional: AI/Email
#    GROQ_API_KEY=<optional>
#    HUGGINGFACE_API_KEY=<optional>
#    CRON_SECRET=<random string for cron security>
#    VAPID_PUBLIC_KEY=<for push notifications>
#    VAPID_PRIVATE_KEY=<for push notifications>

# 4. Deploy!
#    - Railway will automatically deploy
#    - Copy the generated URL (e.g., weka-soko-backend-production.up.railway.app)

# PHASE 3: UPDATE FRONTEND ENVIRONMENT
# ============================================

# 1. Go to Vercel Dashboard
# 2. Select: weka-soko-nextjs
# 3. Go to Settings → Environment Variables
# 4. Update:
#    NEXT_PUBLIC_API_URL=https://<your-railway-backend>.railway.app

# 5. Redeploy frontend:
#    - Go to Deployments tab
#    - Click "Redeploy" on latest deployment
#    - Wait for completion

# PHASE 4: UPDATE ADMIN PANEL
# ============================================

# 1. Go to Vercel Dashboard
# 2. Select: weka-soko-admin
# 3. No changes needed if backend URL is dynamic
# 4. If hardcoded, update environment or redeploy

# PHASE 5: DATA MIGRATION (CRITICAL!)
# ============================================

# Export from Supabase:
# 1. Go to Supabase Dashboard
# 2. Select your database
# 3. Go to "Data" → "Tables"
# 4. For each table:
#    - Click table name
#    - Click "..." → "Export"
#    - Choose CSV format
#    - Save file

# OR use pg_dump (advanced):
# pg_dump "postgresql://<supabase-connection-string>" -f supabase_backup.sql

# Import to Railway:
# 1. Use Railway's SQL editor or pgAdmin
# 2. Run INSERT statements for each table
# 3. Or use: psql <your-railway-connection-string> < supabase_backup.sql

# IMPORTANT: Migrate in this order:
# 1. users
# 2. listings
# 3. saved_listings
# 4. chat_messages
# 5. payments
# 6. escrows
# 7. violations
# 8. admin_actions
# 9. buyer_requests
# 10. pitches
# 11. reviews
# 12. notifications

# PHASE 6: TEST EVERYTHING
# ============================================

# 1. Test backend health:
#    curl https://<your-railway-backend>.railway.app/api/stats

# 2. Test frontend:
#    - Visit your Vercel app
#    - Try to sign up
#    - Try to log in
#    - Create a test listing
#    - Check if it appears

# 3. Test admin panel:
#    - Visit admin panel
#    - Log in as admin
#    - Check if you can see listings
#    - Try moderation features

# 4. Test payments (sandbox mode):
#    - Create test listing
#    - Try to "buy" with M-Pesa sandbox
#    - Verify callback works

# 5. Test chat:
#    - Open chat between test accounts
#    - Send messages
#    - Verify real-time delivery

# PHASE 7: SWITCH DNS (IF USING CUSTOM DOMAIN)
# ============================================

# 1. Go to your domain registrar
# 2. Update DNS records:
#    - Point to Railway's IP or use CNAME
# 3. Wait for propagation (up to 48 hours)

# PHASE 8: MONITOR & OPTIMIZE
# ============================================

# 1. Monitor Railway dashboard for:
#    - CPU usage
#    - Memory usage
#    - Database connections
#    - Response times

# 2. Set up alerts in Railway:
#    - High CPU usage
#    - Database connection issues
#    - Deployment failures

# 3. Check logs regularly:
#    - Railway → Logs tab
#    - Look for errors
#    - Monitor slow queries

# ROLLBACK PLAN (IF SOMETHING GOES WRONG)
# ============================================

# If Railway has issues:
# 1. Keep Supabase database running
# 2. Point backend back to Supabase:
#    - Update DATABASE_URL in Railway env vars
# 3. Or redeploy backend to Render with Supabase

# EMERGENCY CONTACTS
# ============================================
# Railway Support: https://railway.app/help
# Railway Status: https://status.railway.app
# PostgreSQL Docs: https://docs.railway.app/databases/postgresql

# TROUBLESHOOTING
# ============================================

# Issue: Database connection fails
# Solution: Check DATABASE_URL format, ensure SSL is enabled

# Issue: Migrations fail
# Solution: Run migrations one table at a time, check for syntax errors

# Issue: Backend won't start
# Solution: Check start command is "node src/index.js"

# Issue: Frontend can't connect
# Solution: Verify NEXT_PUBLIC_API_URL is correct, check CORS settings

# Issue: M-Pesa callbacks fail
# Solution: Ensure callback URL is publicly accessible, check webhook logs

# ============================================
# MIGRATION CHECKLIST
# ============================================
# [ ] Railway account created
# [ ] PostgreSQL database provisioned
# [ ] Schema migrated successfully
# [ ] Backend deployed to Railway
# [ ] All environment variables set
# [ ] Data exported from Supabase
# [ ] Data imported to Railway
# [ ] Frontend updated with new backend URL
# [ ] Admin panel tested
# [ ] All features tested (auth, listings, chat, payments)
# [ ] Monitoring set up
# [ ] Rollback plan documented
# [ ] DNS updated (if applicable)
# [ ] Old Supabase/Render instances backed up

# ============================================
# POST-MIGRATION TASKS
# ============================================
# 1. Monitor for 48 hours
# 2. Check all cron jobs are running
# 3. Verify all API endpoints work
# 4. Test all user flows
# 5. Check error logs
# 6. Optimize slow queries
# 7. Set up automated backups
# 8. Document any Railway-specific configurations
