#!/bin/bash
# Run this script in Render Shell to create admin user
# Steps:
# 1. Go to https://dashboard.render.com
# 2. Select weka-soko-backend
# 3. Click "Shell" tab
# 4. Paste this entire script or run: node src/db/seed-admin.js

echo "🔧 Creating admin user..."
node src/db/seed-admin.js

echo ""
echo "✅ Admin user created!"
echo "📧 Email: admin@wekasoko.co.ke"
echo "🔑 Password: WekaSoko@Admin2026"
echo ""
echo "⚠️  IMPORTANT: Change this password after first login!"
