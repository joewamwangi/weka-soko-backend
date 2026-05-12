// Run this migration to add missing tables and columns
const { pool } = require("../pool");

async function fixMissingSchema() {
  const client = await pool.connect();
  
  try {
    console.log("🔧 Starting missing schema migration...");
    
    // 1. Add missing columns to listings
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ`);
    console.log("✅ Added missing columns to listings");
    
    // 2. Add missing columns to escrows
    await client.query(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS release_after TIMESTAMPTZ`);
    console.log("✅ Added missing columns to escrows");
    
    // 3. Create disputes table if not exists
    await client.query(`CREATE TABLE IF NOT EXISTS disputes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      escrow_id UUID REFERENCES escrows(id) ON DELETE CASCADE,
      listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
      buyer_id UUID REFERENCES users(id),
      seller_id UUID REFERENCES users(id),
      reason TEXT NOT NULL,
      status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'closed')),
      resolution TEXT,
      resolved_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )`);
    console.log("✅ Created disputes table");
    
    // 4. Create seller_pitches table if not exists (for buyer requests)
    await client.query(`CREATE TABLE IF NOT EXISTS seller_pitches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      request_id UUID REFERENCES buyer_requests(id) ON DELETE CASCADE,
      seller_id UUID REFERENCES users(id),
      message TEXT,
      offered_price DECIMAL(12,2),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created seller_pitches table");
    
    // 5. Create password_history table
    await client.query(`CREATE TABLE IF NOT EXISTS password_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created password_history table");
    
    // 6. Create user_push_tokens table
    await client.query(`CREATE TABLE IF NOT EXISTS user_push_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) NOT NULL,
      device_type VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, token)
    )`);
    console.log("✅ Created user_push_tokens table");
    
    // 7. Create push_subscriptions table
    await client.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      keys JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created push_subscriptions table");
    
    // 8. Create chat_violations table
    await client.query(`CREATE TABLE IF NOT EXISTS chat_violations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      message_id UUID,
      reporter_id UUID REFERENCES users(id),
      reported_user_id UUID REFERENCES users(id),
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created chat_violations table");
    
    // 9. Create listing_reports table
    await client.query(`CREATE TABLE IF NOT EXISTS listing_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
      reporter_id UUID REFERENCES users(id),
      reason TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created listing_reports table");
    
    // 10. Create image_scans table
    await client.query(`CREATE TABLE IF NOT EXISTS image_scans (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
      image_url TEXT,
      scan_result JSONB,
      is_safe BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created image_scans table");
    
    console.log("✅ All missing schema migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { fixMissingSchema };
