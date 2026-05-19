// src/db/migrate_all.js — Complete migration — runs on every startup (idempotent)
const { pool } = require("./pool");
const crypto = require("crypto");

async function runMigration() {
const client = await pool.connect();
try {
// Check if tables already exist
const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public')`);
const schemaExists = rows[0]?.exists;

if (schemaExists) {
  console.log("✅ Database schema exists — running column additions only");
} else {
  console.log("🆕 Fresh database — creating full schema");
}

// ── Safe column addition helper (always runs) ──────────────────────────────
const addCol = async (tbl, col, def) => {
  try {
    await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  } catch(e) {
    // Ignore errors (column may already exist, table may not exist yet)
  }
};

// ── Always run these column additions ──────────────────────────────────────
// USERS
await addCol("users","anon_tag","VARCHAR(20)");
await addCol("users","avatar_url","TEXT");
await addCol("users","is_verified","BOOLEAN DEFAULT FALSE");
await addCol("users","is_suspended","BOOLEAN DEFAULT FALSE");
await addCol("users","violation_count","INT DEFAULT 0");
await addCol("users","whatsapp_phone","VARCHAR(20)");
await addCol("users","mpesa_phone","VARCHAR(20)");
await addCol("users","bio","TEXT");
await addCol("users","free_unlock_approved","BOOLEAN DEFAULT FALSE");
await addCol("users","google_id","VARCHAR(100)");
await addCol("users","last_seen","TIMESTAMPTZ");
await addCol("users","is_online","BOOLEAN DEFAULT FALSE");
await addCol("users","email_verify_token","VARCHAR(64)");
await addCol("users","email_verify_expires","TIMESTAMPTZ");
await addCol("users","response_rate","NUMERIC(5,2) DEFAULT NULL");
await addCol("users","avg_response_hours","NUMERIC(6,2) DEFAULT NULL");
await addCol("users","avg_rating","NUMERIC(3,2) DEFAULT NULL");
await addCol("users","review_count","INT DEFAULT 0");
await addCol("users","admin_level","VARCHAR(20) DEFAULT NULL");
await addCol("users","account_status","VARCHAR(20) DEFAULT 'active'");
await addCol("users","total_listings_posted","INT DEFAULT 0");
await addCol("users","version","INT DEFAULT 1");

// LISTINGS
await addCol("listings","listing_anon_tag","VARCHAR(20)");
await addCol("listings","unlocked_at","TIMESTAMPTZ");
await addCol("listings","county","VARCHAR(60)");
await addCol("listings","expires_at","TIMESTAMPTZ DEFAULT NOW() + INTERVAL '75 days'");
await addCol("listings","expiry_warned","BOOLEAN DEFAULT FALSE");
await addCol("listings","moderation_note","TEXT");
await addCol("listings","reviewed_by","UUID REFERENCES users(id) ON DELETE SET NULL");
await addCol("listings","reviewed_at","TIMESTAMPTZ");
await addCol("listings","moderation_reviewed_at","TIMESTAMPTZ");
await addCol("listings","moderation_reviewed_by","UUID REFERENCES users(id) ON DELETE SET NULL");
await addCol("listings","is_contact_public","BOOLEAN DEFAULT FALSE");
await addCol("listings","subcat","VARCHAR(80)");
await addCol("listings","payment_expires_at","TIMESTAMPTZ");
await addCol("listings","sold_at","TIMESTAMPTZ");
await addCol("listings","sold_channel","VARCHAR(30)");
await addCol("listings","precise_location","TEXT");
await addCol("listings","unlock_discount","INT DEFAULT 0");
await addCol("listings","version","INT DEFAULT 1");

// PAYMENTS
await addCol("payments","amount_kes","NUMERIC(12,2)");
await addCol("payments","till_number","VARCHAR(20) DEFAULT '5673935'");
await addCol("payments","voucher_code","VARCHAR(30)");
await addCol("payments","type","VARCHAR(30)");
await addCol("payments","mpesa_phone","VARCHAR(20)");
await addCol("payments","mpesa_checkout_id","VARCHAR(100)");
await addCol("payments","stk_push_sent_at","TIMESTAMPTZ");
await addCol("payments","confirmed_at","TIMESTAMPTZ");
await addCol("payments","pitch_id","UUID REFERENCES seller_pitches(id) ON DELETE SET NULL");
await addCol("payments","version","INT DEFAULT 1");

// ESCROWS
await addCol("escrows","payment_id","UUID REFERENCES payments(id) ON DELETE SET NULL");
await addCol("escrows","item_amount","NUMERIC(12,2)");
await addCol("escrows","fee_amount","NUMERIC(12,2)");
await addCol("escrows","total_amount","NUMERIC(12,2)");
await addCol("escrows","buyer_confirmed","BOOLEAN DEFAULT FALSE");
await addCol("escrows","buyer_confirmed_at","TIMESTAMPTZ");
await addCol("escrows","version","INT DEFAULT 1");

// DISPUTES
await addCol("disputes","admin_alerted_at","TIMESTAMPTZ");

// CHAT VIOLATIONS
await addCol("chat_violations","reviewed","BOOLEAN DEFAULT FALSE");
await addCol("chat_violations","reviewed_by","UUID REFERENCES users(id) ON DELETE SET NULL");
await addCol("chat_violations","reviewed_at","TIMESTAMPTZ");

// VOUCHERS
await addCol("vouchers","active","BOOLEAN DEFAULT TRUE");
await addCol("vouchers","discount_percent","INT DEFAULT 0");
await addCol("vouchers","description","TEXT");
await addCol("vouchers","version","INT DEFAULT 1");

// REVIEWS
await addCol("reviews","reviewee_id","UUID REFERENCES users(id) ON DELETE CASCADE");
await addCol("reviews","version","INT DEFAULT 1");

// BUYER REQUESTS
await addCol("buyer_requests","user_id","UUID REFERENCES users(id) ON DELETE CASCADE");
await addCol("buyer_requests","category","VARCHAR(80)");
await addCol("buyer_requests","subcat","VARCHAR(80)");
await addCol("buyer_requests","keywords","TEXT");
await addCol("buyer_requests","min_price","NUMERIC(12,2)");
await addCol("buyer_requests","max_price","NUMERIC(12,2)");
await addCol("buyer_requests","photos","JSONB DEFAULT '[]'");
await addCol("buyer_requests","approved_by","UUID REFERENCES users(id) ON DELETE SET NULL");
await addCol("buyer_requests","approved_at","TIMESTAMPTZ");
await addCol("buyer_requests","rejection_reason","TEXT");
await addCol("buyer_requests","version","INT DEFAULT 1");

// CHAT MESSAGES
await addCol("chat_messages","version","INT DEFAULT 1");

// If tables don't exist yet, create them
if (!schemaExists) {
await client.query("BEGIN");

    // ── Extensions ───────────────────────────────────────────────────────────
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // ── Enums ─────────────────────────────────────────────────────────────────
    await client.query(`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('buyer','seller','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN CREATE TYPE violation_severity AS ENUM ('warning','flagged','suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

    // ── USERS ─────────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      role user_role NOT NULL DEFAULT 'buyer',
      anon_tag VARCHAR(20),
      avatar_url TEXT,
      is_verified BOOLEAN DEFAULT FALSE,
      email_verify_token VARCHAR(64),
      email_verify_expires TIMESTAMPTZ,
      is_suspended BOOLEAN DEFAULT FALSE,
      admin_level VARCHAR(20) DEFAULT NULL CHECK (admin_level IN ('viewer','moderator','manager','super')),
      violation_count INT DEFAULT 0,
      whatsapp_phone VARCHAR(20),
      mpesa_phone VARCHAR(20),
      bio TEXT,
      account_status VARCHAR(20) DEFAULT 'active',
      free_unlock_approved BOOLEAN DEFAULT FALSE,
      google_id VARCHAR(100),
      last_seen TIMESTAMPTZ,
      is_online BOOLEAN DEFAULT FALSE,
      response_rate NUMERIC(5,2) DEFAULT NULL,
      avg_response_hours NUMERIC(6,2) DEFAULT NULL,
      avg_rating NUMERIC(3,2) DEFAULT NULL,
      review_count INT DEFAULT 0,
      total_listings_posted INT DEFAULT 0,
      version INT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── LISTINGS ──────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS listings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      reason_for_sale TEXT,
      category VARCHAR(80),
      subcat VARCHAR(80),
      price NUMERIC(12,2) NOT NULL,
      location VARCHAR(255),
      county VARCHAR(60),
      status VARCHAR(30) DEFAULT 'active',
      is_unlocked BOOLEAN DEFAULT FALSE,
      locked_buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      locked_at TIMESTAMPTZ,
      unlocked_at TIMESTAMPTZ,
      listing_anon_tag VARCHAR(20),
      view_count INT DEFAULT 0,
      interest_count INT DEFAULT 0,
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '75 days',
      expiry_warned BOOLEAN DEFAULT FALSE,
      search_vector tsvector,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── LISTING REPORTS ───────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS listing_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(60) NOT NULL,
      details TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      resolved_by UUID REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(listing_id, reporter_id)
    );`);

    // ── PASSWORD RESETS ───────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS password_resets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── LISTING PHOTOS ────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS listing_photos (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      public_id TEXT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── PAYMENTS ──────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
      amount_kes NUMERIC(12,2) NOT NULL,
      till_number VARCHAR(20) DEFAULT '5673935',
      purpose VARCHAR(60),
      status VARCHAR(30) DEFAULT 'pending',
      mpesa_receipt VARCHAR(100),
      checkout_request_id VARCHAR(100),
      merchant_request_id VARCHAR(100),
      phone_used VARCHAR(20),
      voucher_code VARCHAR(30),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── ESCROWS ───────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS escrows (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
      buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
      amount_kes NUMERIC(12,2),
      platform_fee NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'holding',
      buyer_confirmed BOOLEAN DEFAULT FALSE,
      release_after TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      released_by UUID REFERENCES users(id),
      approved_by UUID REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── DISPUTES ──────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS disputes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      escrow_id UUID REFERENCES escrows(id),
      raised_by UUID REFERENCES users(id),
      reason TEXT,
      status VARCHAR(30) DEFAULT 'open',
      resolved_by UUID REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      resolution TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── CHAT MESSAGES ─────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      is_blocked BOOLEAN DEFAULT FALSE,
      block_reason TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── CHAT VIOLATIONS ───────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS chat_violations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
      message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
      reason TEXT,
      severity violation_severity DEFAULT 'warning',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(60),
      title VARCHAR(255),
      body TEXT,
      data JSONB,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── PUSH TOKENS ──────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS user_push_tokens (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      push_token VARCHAR(255) NOT NULL,
      platform VARCHAR(10) CHECK (platform IN ('android', 'ios')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON user_push_tokens(platform)`).catch(()=>{});

    // ── VOUCHERS ──────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS vouchers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code VARCHAR(30) UNIQUE NOT NULL,
      type VARCHAR(30) NOT NULL,
      discount_pct INT DEFAULT 0,
      max_uses INT DEFAULT 1,
      uses INT DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── PRICE OFFERS ──────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS price_offers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
      buyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
      offer_price NUMERIC(12,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── REVIEWS ───────────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewed_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_role VARCHAR(10) NOT NULL,
      rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      is_public BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(listing_id, reviewer_id)
    );`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON reviews(reviewed_user_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id)`).catch(()=>{});

    // ── BUYER REQUESTS ────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS buyer_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      budget NUMERIC(12,2),
      min_price NUMERIC(12,2),
      max_price NUMERIC(12,2),
      county VARCHAR(60),
      category VARCHAR(80),
      subcat VARCHAR(80),
      keywords TEXT,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── SELLER PITCHES ────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS seller_pitches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      request_id UUID NOT NULL REFERENCES buyer_requests(id) ON DELETE CASCADE,
      seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message VARCHAR(200) NOT NULL,
      offered_price NUMERIC(12,2),
      status VARCHAR(20) DEFAULT 'pending',
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(request_id, seller_id)
    );`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_buyer_requests_user ON buyer_requests(user_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_buyer_requests_status ON buyer_requests(status)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_buyer_requests_county ON buyer_requests(county)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_buyer_requests_category ON buyer_requests(category)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seller_pitches_request ON seller_pitches(request_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seller_pitches_seller ON seller_pitches(seller_id)`).catch(()=>{});

    // ── LINKED REQUEST FK (after buyer_requests exists) ───────────────────────
    await addCol("listings","linked_request_id","UUID REFERENCES buyer_requests(id) ON DELETE SET NULL");
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_linked_req ON listings(linked_request_id) WHERE linked_request_id IS NOT NULL`).catch(()=>{});

    // ── PASSWORD HISTORY ──────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS password_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── PUSH SUBSCRIPTIONS ────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT,
      auth TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── SAVED LISTINGS ────────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS saved_listings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, listing_id)
    );`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_saved_listings_user ON saved_listings(user_id)`).catch(()=>{});

    // ── INDEXES ───────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_county ON listings(county)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_expires ON listings(expires_at) WHERE status='active'`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_listing ON chat_messages(listing_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pw_reset_token ON password_resets(token)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_listing ON listing_reports(listing_id)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON listing_reports(status)`).catch(()=>{});

    // ── SEARCH VECTOR ─────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_search ON listings USING GIN(search_vector)`).catch(()=>{});
    await client.query(`
      CREATE OR REPLACE FUNCTION listings_search_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := to_tsvector('english',
          COALESCE(NEW.title,'') || ' ' ||
          COALESCE(NEW.description,'') || ' ' ||
          COALESCE(NEW.category,'') || ' ' ||
          COALESCE(NEW.location,'') || ' ' ||
          COALESCE(NEW.county,'')
        );
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
    `).catch(()=>{});
    await client.query(`DROP TRIGGER IF EXISTS listings_search_trigger ON listings`).catch(()=>{});
    await client.query(`
      CREATE TRIGGER listings_search_trigger
      BEFORE INSERT OR UPDATE ON listings
      FOR EACH ROW EXECUTE FUNCTION listings_search_update();
    `).catch(()=>{});

    // ── BACKFILLS ─────────────────────────────────────────────────────────────
    await client.query(`
      UPDATE users SET anon_tag = CONCAT(
        (ARRAY['Swift','Bold','Sharp','Bright','Keen','Wise','Calm','Fierce','Sleek','Prime'])[1+(abs(hashtext(id::text))%10)],
        (ARRAY['Falcon','Cheetah','Baobab','Serval','Mamba','Eagle','Kiboko','Tembo','Duma','Simba'])[1+(abs(hashtext(reverse(id::text)))%10)],
        (10+abs(hashtext(id::text||'salt'))%90)::text
      ) WHERE anon_tag IS NULL
    `).catch(()=>{});

    await client.query(`
      UPDATE listings SET listing_anon_tag =
        (ARRAY['Swift','Bold','Sharp','Bright','Keen','Wise','Calm','Fierce','Sleek','Prime'])[1+(abs(hashtext(id::text))%10)] ||
        (ARRAY['Falcon','Cheetah','Baobab','Serval','Mamba','Eagle','Kiboko','Tembo','Duma','Simba'])[1+(abs(hashtext(reverse(id::text)))%10)] ||
        (10+abs(hashtext(id::text||'tag'))%90)::text
      WHERE listing_anon_tag IS NULL
    `).catch(()=>{});

    await client.query(`
      UPDATE listings SET county = TRIM(SPLIT_PART(location, ',', -1))
      WHERE county IS NULL AND location IS NOT NULL AND location LIKE '%,%'
    `).catch(()=>{});

    // ── ADMIN AUDIT LOG ───────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
      admin_email VARCHAR(255),
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id VARCHAR(255),
      details JSONB DEFAULT '{}',
      ip VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC)`);

    // ── MAINTENANCE MODE ──────────────────────────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS platform_config (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL
    )`);
    await client.query(`INSERT INTO platform_config (key,value) VALUES ('maintenance_mode','false') ON CONFLICT (key) DO NOTHING`);
    await client.query(`INSERT INTO platform_config (key,value) VALUES ('maintenance_message','We are performing scheduled maintenance. Back shortly.') ON CONFLICT (key) DO NOTHING`);

    // ── OPTIMISTIC LOCKING INDEXES ────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_version ON listings(version) WHERE version IS NOT NULL`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_version ON payments(version) WHERE version IS NOT NULL`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_escrows_version ON escrows(version) WHERE version IS NOT NULL`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_version ON users(version) WHERE version IS NOT NULL`).catch(()=>{});

    // Backfill version=1
    await client.query(`UPDATE users SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE listings SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE payments SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE escrows SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE reviews SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE buyer_requests SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE seller_pitches SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE vouchers SET version=1 WHERE version IS NULL`).catch(()=>{});
    await client.query(`UPDATE chat_messages SET version=1 WHERE version IS NULL`).catch(()=>{});

    await client.query("COMMIT");
    console.log("✅ Full schema migration complete");
} else {
  // Schema exists — just ensure version columns are backfilled
  await client.query(`UPDATE users SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE listings SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE payments SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE escrows SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE reviews SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE buyer_requests SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE seller_pitches SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE vouchers SET version=1 WHERE version IS NULL`).catch(()=>{});
  await client.query(`UPDATE chat_messages SET version=1 WHERE version IS NULL`).catch(()=>{});
  console.log("✅ Column additions complete");
}

// ── Admin seed (runs OUTSIDE main transaction) ──────────────────────────────
if (process.env.ADMIN_SEED_EMAIL && process.env.ADMIN_SEED_PASSWORD) {
  try {
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD, 12);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, anon_tag, is_verified, admin_level)
       VALUES ('Admin', $1, $2, 'admin', 'AdminWekaSoko01', true, 'super')
       ON CONFLICT (email) DO UPDATE SET
         role='admin', password_hash=$2, is_verified=true, admin_level='super',
         is_suspended=false, account_status='active', updated_at=NOW()`,
      [process.env.ADMIN_SEED_EMAIL, hash]
    );
    console.log(`✅ Admin account ready: ${process.env.ADMIN_SEED_EMAIL}`);
  } catch (e) {
    console.error("❌ Admin seed failed:", e.message);
  }
}

} catch (err) {
console.error("❌ Migration failed:", err.message);
throw err;
} finally {
client.release();
}
}

module.exports = { runMigration };
