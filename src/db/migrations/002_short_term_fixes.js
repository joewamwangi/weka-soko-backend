// Short-term fixes migration - Appeal system, refunds, and performance
const { pool } = require("../pool");

async function runShortTermMigration() {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    console.log("🚀 Starting short-term fixes migration...");
    
    // 1. Create refunds table
    console.log("Creating refunds table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        admin_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
    `);

    // 2. Create moderation_appeals table
    console.log("Creating moderation appeals table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS moderation_appeals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        violation_id UUID NOT NULL REFERENCES chat_violations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        evidence JSONB,
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        admin_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_appeals_violation ON moderation_appeals(violation_id);
      CREATE INDEX IF NOT EXISTS idx_appeals_user ON moderation_appeals(user_id);
      CREATE INDEX IF NOT EXISTS idx_appeals_status ON moderation_appeals(status);
    `);

    // 3. Add webhook_logs table (for audit trail)
    console.log("Creating webhook logs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        signature VARCHAR(255),
        is_valid BOOLEAN DEFAULT FALSE,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_payment ON webhook_logs(payment_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_event ON webhook_logs(event_type);
    `);

    // 4. Add payment_attempts table (for idempotency tracking)
    console.log("Creating payment attempts table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        idempotency_key VARCHAR(255),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        response_data JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(idempotency_key, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_idempotency ON payment_attempts(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_user ON payment_attempts(user_id);
    `);

    // 5. Add Redis cache tracking (optional, for monitoring)
    console.log("Adding cache statistics view...");
    await client.query(`
      CREATE OR REPLACE VIEW cache_stats AS
      SELECT 
        COUNT(*) FILTER (WHERE key LIKE 'cache:listings:%') as listings_cache_count,
        COUNT(*) FILTER (WHERE key LIKE 'cache:categories:%') as categories_cache_count,
        COUNT(*) FILTER (WHERE key LIKE 'cache:users:%') as users_cache_count
      FROM (SELECT DISTINCT key FROM pg_locks WHERE locktype = 'advisory') as locks;
    `);

    // 6. Add user risk level tracking columns
    console.log("Adding user risk tracking columns...");
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_violation_date TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'normal' 
        CHECK (risk_level IN ('normal', 'low_risk', 'medium_risk', 'high_risk', 'banned'));
    `);

    // 7. Create index for user risk assessment
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_risk_level ON users(risk_level);
    `);

    // 8. Add refund tracking to payments
    await client.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN DEFAULT FALSE;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2);
    `);

    // 9. Create materialized view for user statistics (performance)
    console.log("Creating user statistics view...");
    await client.query(`
      CREATE OR REPLACE MATERIALIZED VIEW user_stats_mv AS
      SELECT 
        u.id as user_id,
        COUNT(DISTINCT l.id) FILTER (WHERE l.seller_id = u.id) as total_listings,
        COUNT(DISTINCT l.id) FILTER (WHERE l.seller_id = u.id AND l.status = 'sold') as sold_listings,
        COUNT(DISTINCT p.id) FILTER (WHERE p.payer_id = u.id) as total_payments,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as review_count
      FROM users u
      LEFT JOIN listings l ON l.seller_id = u.id
      LEFT JOIN payments p ON p.payer_id = u.id
      LEFT JOIN reviews r ON r.listing_id = l.id
      GROUP BY u.id;
      
      CREATE INDEX IF NOT EXISTS idx_user_stats_mv_user ON user_stats_mv(user_id);
    `);

    // Refresh materialized view periodically (can be done via cron)
    await client.query(`REFRESH MATERIALIZED VIEW user_stats_mv;`);

    // 10. Add cache for frequently accessed data
    console.log("Creating cache helper functions...");
    await client.query(`
      -- Function to get cached categories
      CREATE OR REPLACE FUNCTION get_cached_categories()
      RETURNS JSON AS $$
      BEGIN
        RETURN (SELECT json_agg(row_to_json(t)) FROM (
          SELECT DISTINCT category FROM listings WHERE status = 'active'
        ) t);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query("COMMIT");
    console.log("✅ Short-term fixes migration completed successfully");
    
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Short-term fixes migration failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { runShortTermMigration };
