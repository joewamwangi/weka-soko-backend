// Comprehensive migration to fix all missing tables
const { pool } = require("../pool");

async function fixAllMissingTables() {
  const client = await pool.connect();
  
  try {
    console.log("🔧 Starting comprehensive schema fix...");
    
    // 1. listing_photos table (CRITICAL - used in listings query)
    await client.query(`CREATE TABLE IF NOT EXISTS listing_photos (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created listing_photos table");
    
    // 2. messages table (for chat)
    await client.query(`CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      sender_id UUID REFERENCES users(id),
      recipient_id UUID REFERENCES users(id),
      listing_id UUID REFERENCES listings(id),
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created messages table");
    
    // 3. price_offers table
    await client.query(`CREATE TABLE IF NOT EXISTS price_offers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID REFERENCES listings(id),
      buyer_id UUID REFERENCES users(id),
      offer_amount DECIMAL(12,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created price_offers table");
    
    // 4. vouchers table
    await client.query(`CREATE TABLE IF NOT EXISTS vouchers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code VARCHAR(50) UNIQUE NOT NULL,
      discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed')),
      discount_value DECIMAL(10,2) NOT NULL,
      min_amount DECIMAL(10,2) DEFAULT 0,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log("✅ Created vouchers table");
    
    // 5. Add missing columns to listings if not exists
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_vector tsvector`);
    await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS reason_for_sale TEXT`);
    console.log("✅ Added missing columns to listings");
    
    console.log("✅ All comprehensive fixes completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { fixAllMissingTables };
