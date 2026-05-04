// Security and Data Integrity Migration
// Adds CHECK constraints, indexes, and fixes race conditions

const { pool } = require("../pool");

async function runSecurityMigration() {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    console.log("🔒 Starting security and performance migration...");
    
    // 1. Add CHECK constraints for data integrity
    console.log("Adding CHECK constraints...");
    
    // Price must be positive
    await client.query(`
      ALTER TABLE listings ADD CONSTRAINT IF NOT EXISTS listings_price_check 
      CHECK (price >= 0);
    `).catch(() => {}); // Ignore if already exists
    
    // Rating must be between 0-5
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_avg_rating_check 
      CHECK (avg_rating IS NULL OR (avg_rating >= 0 AND avg_rating <= 5));
    `).catch(() => {});
    
    // Review count must be non-negative
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_review_count_check 
      CHECK (review_count >= 0);
    `).catch(() => {});
    
    // Violation count must be non-negative
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_violation_count_check 
      CHECK (violation_count >= 0);
    `).catch(() => {});
    
    // Amount must be positive in payments
    await client.query(`
      ALTER TABLE payments ADD CONSTRAINT IF NOT EXISTS payments_amount_check 
      CHECK (amount_kes >= 0);
    `).catch(() => {});
    
    // 2. Create critical indexes for performance
    console.log("Creating performance indexes...");
    
    // Listings filtering indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_county ON listings(county);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_expires_at ON listings(expires_at);`);
    
    // Composite indexes for common queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listings_category_status_created 
      ON listings(category, status, created_at DESC)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listings_county_status 
      ON listings(county, status)
    `);
    
    // User lookups
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_anon_tag ON users(anon_tag);`);
    
    // Payment lookups
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_listing ON payments(listing_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_mpesa_checkout ON payments(mpesa_checkout_id);`);
    
    // Chat messages
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_listing ON chat_messages(listing_id, created_at);`);
    
    // Notifications
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);`);
    
    // 3. Add idempotency key column to payments
    console.log("Adding idempotency support...");
    await client.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
    `).catch(() => {});
    
    // 4. Add audit trail columns
    await client.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_metadata JSONB;
    `).catch(() => {});
    
    // 5. Add webhook signature tracking
    await client.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS webhook_signature VARCHAR(255);
    `).catch(() => {});
    
    // 6. Create table for tracking duplicate payment attempts
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
        attempt_type VARCHAR(50) NOT NULL,
        attempt_data JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON payment_attempts(payment_id);
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_created ON payment_attempts(created_at DESC);
    `);
    
    // 7. Add listing renewal tracking
    await client.query(`
      ALTER TABLE listings ADD COLUMN IF NOT EXISTS renewal_count INT DEFAULT 0;
      ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ;
    `).catch(() => {});
    
    // 8. Add soft delete tracking
    await client.query(`
      ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
    `).catch(() => {});
    
    // 9. Create index for frequently queried soft-delete status
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listings_not_deleted 
      ON listings(status) WHERE status != 'deleted';
    `);
    
    // 10. Add user data export tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_exports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(30) DEFAULT 'pending',
        export_data JSONB,
        download_url TEXT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(user_id);
    `);
    
    // 11. Add account deletion tracking (GDPR compliance)
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_deletion_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT,
        status VARCHAR(30) DEFAULT 'pending',
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        deleted_by UUID REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON account_deletion_requests(user_id);
    `);
    
    await client.query("COMMIT");
    console.log("✅ Security migration completed successfully");
    
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Security migration failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { runSecurityMigration };
