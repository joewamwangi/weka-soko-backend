// src/db/migrate_all.js
// FULL migration — runs everything from scratch safely.
// Safe to run multiple times — uses IF NOT EXISTS and IF EXISTS everywhere.
// Run with: node src/db/migrate_all.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  console.log("🗄️  Weka Soko — Full Migration Starting...");
  try {

    // ── STEP 1: Extensions ────────────────────────────────────────────────────
    console.log("  [1/9] Extensions...");
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);

    // ── STEP 2: Enums (safe — only create if not exists) ──────────────────────
    console.log("  [2/9] Enums...");
    await client.query(`DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN
      CREATE TYPE listing_status AS ENUM ('active', 'locked', 'sold', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN
      CREATE TYPE payment_type AS ENUM ('unlock', 'escrow');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN
      CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'failed', 'refunded');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN
      CREATE TYPE escrow_status AS ENUM ('holding', 'released', 'disputed', 'refunded');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN
      CREATE TYPE violation_severity AS ENUM ('warning', 'flagged', 'suspended');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await client.query(`DO $$ BEGIN
      CREATE TYPE dispute_status AS ENUM ('open', 'resolved', 'escalated');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

    // ── STEP 3: Core tables ───────────────────────────────────────────────────
    console.log("  [3/9] Core tables...");
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name            VARCHAR(120) NOT NULL,
      email           VARCHAR(255) UNIQUE NOT NULL,
      password_hash   VARCHAR(255) NOT NULL,
      phone           VARCHAR(20),
      role            user_role NOT NULL DEFAULT 'buyer',
      anon_tag        VARCHAR(20),
      avatar_url      TEXT,
      is_verified     BOOLEAN DEFAULT FALSE,
      is_suspended    BOOLEAN DEFAULT FALSE,
      violation_count INT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS listings (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      seller_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title           VARCHAR(255) NOT NULL,
      description     TEXT NOT NULL,
      reason_for_sale TEXT,
      category        VARCHAR(80),
      price           NUMERIC(12,2) NOT NULL,
      location        VARCHAR(255),
      status          listing_status DEFAULT 'active',
      is_unlocked     BOOLEAN DEFAULT FALSE,
      unlocked_at     TIMESTAMPTZ,
      locked_buyer_id UUID REFERENCES users(id),
      locked_at       TIMESTAMPTZ,
      view_count      INT DEFAULT 0,
      interest_count  INT DEFAULT 0,
      search_vector   TSVECTOR,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS listing_photos (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      public_id   TEXT,
      sort_order  INT DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payments (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payer_id          UUID NOT NULL REFERENCES users(id),
      listing_id        UUID NOT NULL REFERENCES listings(id),
      type              payment_type NOT NULL,
      amount_kes        NUMERIC(12,2) NOT NULL,
      status            payment_status DEFAULT 'pending',
      mpesa_checkout_id VARCHAR(100),
      mpesa_receipt     VARCHAR(100),
      mpesa_phone       VARCHAR(20),
      stk_push_sent_at  TIMESTAMPTZ,
      confirmed_at      TIMESTAMPTZ,
      metadata          JSONB DEFAULT '{}',
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS escrows (
      id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id         UUID NOT NULL REFERENCES listings(id),
      buyer_id           UUID NOT NULL REFERENCES users(id),
      seller_id          UUID NOT NULL REFERENCES users(id),
      payment_id         UUID NOT NULL REFERENCES payments(id),
      item_amount        NUMERIC(12,2) NOT NULL,
      fee_amount         NUMERIC(12,2) NOT NULL,
      total_amount       NUMERIC(12,2) NOT NULL,
      status             escrow_status DEFAULT 'holding',
      release_after      TIMESTAMPTZ,
      released_at        TIMESTAMPTZ,
      released_by        UUID REFERENCES users(id),
      buyer_confirmed    BOOLEAN DEFAULT FALSE,
      buyer_confirmed_at TIMESTAMPTZ,
      notes              TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS disputes (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      escrow_id   UUID NOT NULL REFERENCES escrows(id),
      raised_by   UUID NOT NULL REFERENCES users(id),
      reason      TEXT NOT NULL,
      evidence    JSONB DEFAULT '[]',
      status      dispute_status DEFAULT 'open',
      resolved_by UUID REFERENCES users(id),
      resolution  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );`);

    // messages table — inbox style (different from old chat messages)
    await client.query(`CREATE TABLE IF NOT EXISTS inbox_messages (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_type   VARCHAR(30) DEFAULT 'system',
      subject       VARCHAR(255) NOT NULL,
      body          TEXT NOT NULL,
      listing_id    UUID REFERENCES listings(id) ON DELETE SET NULL,
      is_read       BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS chat_messages (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      sender_id   UUID NOT NULL REFERENCES users(id),
      receiver_id UUID NOT NULL REFERENCES users(id),
      body        TEXT NOT NULL,
      is_blocked  BOOLEAN DEFAULT FALSE,
      block_reason VARCHAR(100),
      is_read     BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS chat_violations (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id),
      listing_id  UUID REFERENCES listings(id),
      message_id  UUID REFERENCES chat_messages(id),
      reason      TEXT,
      severity    violation_severity DEFAULT 'warning',
      reviewed    BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS notifications (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id),
      type        VARCHAR(80) NOT NULL,
      title       VARCHAR(255),
      body        TEXT,
      data        JSONB DEFAULT '{}',
      is_read     BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── STEP 4: New feature tables ────────────────────────────────────────────
    console.log("  [4/9] Vouchers...");
    await client.query(`CREATE TABLE IF NOT EXISTS vouchers (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code             VARCHAR(30) UNIQUE NOT NULL,
      type             VARCHAR(20) NOT NULL DEFAULT 'unlock',
      discount_percent INT NOT NULL DEFAULT 100,
      description      TEXT,
      max_uses         INT NOT NULL DEFAULT 50,
      uses             INT NOT NULL DEFAULT 0,
      active           BOOLEAN DEFAULT TRUE,
      expires_at       TIMESTAMPTZ,
      created_by       UUID REFERENCES users(id),
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`INSERT INTO vouchers (code, type, discount_percent, description, max_uses)
      VALUES 
        ('WS-FREE50', 'unlock', 100, 'Free unlock - launch promo', 50),
        ('WS-ESC25',  'escrow', 50,  '50% off escrow fee',         20)
      ON CONFLICT (code) DO NOTHING;`);

    console.log("  [5/9] Price offers...");
    await client.query(`CREATE TABLE IF NOT EXISTS price_offers (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id   UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      buyer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      offer_price  NUMERIC(12,2) NOT NULL,
      message      TEXT,
      status       VARCHAR(20) DEFAULT 'pending',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      responded_at TIMESTAMPTZ
    );`);

    console.log("  [6/9] Image scans...");
    await client.query(`CREATE TABLE IF NOT EXISTS image_scans (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
      image_url   TEXT NOT NULL,
      has_contact BOOLEAN DEFAULT FALSE,
      has_nudity  BOOLEAN DEFAULT FALSE,
      scan_result JSONB,
      scanned_at  TIMESTAMPTZ DEFAULT NOW()
    );`);

    // ── STEP 5: Add new columns to existing tables ────────────────────────────
    console.log("  [7/9] Updating existing tables with new columns...");

    const addCols = [
      // users
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS mpesa_phone VARCHAR(20)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS free_unlock_approved BOOLEAN DEFAULT FALSE`,
      // listings
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS sold_via VARCHAR(20)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS negotiated_price NUMERIC(12,2)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS subcat VARCHAR(80)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS photos TEXT[]`,
      // escrows
      `ALTER TABLE escrows ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE escrows ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id)`,
      `ALTER TABLE escrows ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
      // payments
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS till_number VARCHAR(20) DEFAULT '5673935'`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(30)`,
    ];

    for (const sql of addCols) {
      await client.query(sql);
    }

    // ── STEP 6: Indexes ───────────────────────────────────────────────────────
    console.log("  [8/9] Indexes...");
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_listings_seller   ON listings(seller_id)`,
      `CREATE INDEX IF NOT EXISTS idx_listings_status   ON listings(status)`,
      `CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category)`,
      `CREATE INDEX IF NOT EXISTS idx_listings_created  ON listings(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_listings_price    ON listings(price)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_listing      ON chat_messages(listing_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_sender       ON chat_messages(sender_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payments_listing  ON payments(listing_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payments_mpesa    ON payments(mpesa_checkout_id)`,
      `CREATE INDEX IF NOT EXISTS idx_escrows_listing   ON escrows(listing_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notifs_user       ON notifications(user_id, is_read)`,
      `CREATE INDEX IF NOT EXISTS idx_violations_user   ON chat_violations(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_inbox_recipient   ON inbox_messages(recipient_id, created_at DESC)`,
    ];
    for (const sql of indexes) {
      await client.query(sql);
    }

    // ── STEP 7: Functions and triggers ───────────────────────────────────────
    console.log("  [9/9] Functions and triggers...");
    await client.query(`
      CREATE OR REPLACE FUNCTION update_listing_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(NEW.location, '')), 'D');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(`DROP TRIGGER IF EXISTS listings_search_update ON listings`);
    await client.query(`
      CREATE TRIGGER listings_search_update
        BEFORE INSERT OR UPDATE ON listings
        FOR EACH ROW EXECUTE FUNCTION update_listing_search_vector();
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION touch_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);
    for (const tbl of ["users","listings","payments","escrows"]) {
      await client.query(`DROP TRIGGER IF EXISTS touch_${tbl} ON ${tbl}`);
      await client.query(`
        CREATE TRIGGER touch_${tbl}
          BEFORE UPDATE ON ${tbl}
          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
      `);
    }

    console.log("");
    console.log("✅ Migration complete! All tables, indexes and triggers created.");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
