-- =====================================================
-- Weka Soko - Railway Database Migration Script
-- Run this on your Railway PostgreSQL database
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table (if not using Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin')),
  is_verified BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  suspension_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reason_for_sale TEXT,
  category VARCHAR(100) NOT NULL,
  subcat VARCHAR(100),
  price DECIMAL(12,2) NOT NULL,
  location VARCHAR(255),
  county VARCHAR(100),
  precise_location VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'active', 'locked', 'sold', 'needs_changes', 'rejected', 'flagged')),
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
  locked_buyer_id UUID REFERENCES users(id),
  is_unlocked BOOLEAN DEFAULT false,
  is_contact_public BOOLEAN DEFAULT false,
  linked_request_id UUID,
  view_count INTEGER DEFAULT 0,
  interest_count INTEGER DEFAULT 0,
  photos JSONB DEFAULT '[]',
  seller_anon VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  sold_at TIMESTAMP,
  sold_channel VARCHAR(50),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_listings_seller ON listings(seller_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category);
CREATE INDEX idx_listings_created ON listings(created_at);
CREATE INDEX idx_listings_locked ON listings(locked_buyer_id);

-- ============================================
-- CHAT & MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_listing ON chat_messages(listing_id);
CREATE INDEX idx_chat_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_recipient ON chat_messages(recipient_id);
CREATE INDEX idx_chat_created ON chat_messages(created_at);

-- ============================================
-- PAYMENTS & ESCROW
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id),
  payer_id UUID REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  mpesa_receipt VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP
);

CREATE INDEX idx_payments_listing ON payments(listing_id);
CREATE INDEX idx_payments_payer ON payments(payer_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS escrows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'holding' CHECK (status IN ('holding', 'released', 'refunded', 'disputed')),
  admin_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  refunded_at TIMESTAMP
);

CREATE INDEX idx_escrows_listing ON escrows(listing_id);
CREATE INDEX idx_escrows_status ON escrows(status);

-- ============================================
-- ADMIN & MODERATION
-- ============================================

CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_type ON admin_actions(action_type);

CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  listing_id UUID REFERENCES listings(id),
  severity VARCHAR(20) CHECK (severity IN ('warning', 'flagged', 'suspension')),
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX idx_violations_user ON violations(user_id);
CREATE INDEX idx_violations_status ON violations(status);

-- ============================================
-- SAVED LISTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS saved_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX idx_saved_user ON saved_listings(user_id);
CREATE INDEX idx_saved_listing ON saved_listings(listing_id);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  body TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================
-- REQUESTS (Buyer Requests)
-- ============================================

CREATE TABLE IF NOT EXISTS buyer_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  budget DECIMAL(12,2),
  county VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived', 'expired')),
  requester_id UUID REFERENCES users(id),
  requester_anon VARCHAR(100),
  pitch_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_requests_status ON buyer_requests(status);
CREATE INDEX idx_requests_category ON buyer_requests(category);

-- Pitches (Seller responses to buyer requests)
CREATE TABLE IF NOT EXISTS pitches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES buyer_requests(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES users(id),
  message TEXT,
  offered_price DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pitches_request ON pitches(request_id);
CREATE INDEX idx_pitches_seller ON pitches(seller_id);

-- ============================================
-- REVIEWS
-- ============================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id),
  reviewer_id UUID REFERENCES users(id),
  reviewee_id UUID REFERENCES users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reviews_listing ON reviews(listing_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);

-- ============================================
-- SYSTEM TABLES (from your existing migrations)
-- ============================================

-- Agent system tables (from migration 006)
CREATE TABLE IF NOT EXISTS agent_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(64) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_activity_logs (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  payload_summary JSONB,
  results_summary JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_results (
  id SERIAL PRIMARY KEY,
  target_id VARCHAR(50) NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  risk_score INTEGER,
  flags JSONB DEFAULT '[]',
  action_taken VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flagged_content_queue (
  id SERIAL PRIMARY KEY,
  target_id VARCHAR(50) NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  risk_score INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_quality_scores (
  id SERIAL PRIMARY KEY,
  listing_id VARCHAR(50) UNIQUE NOT NULL,
  quality_score INTEGER,
  grade VARCHAR(2),
  issues JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  searchable BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_matches (
  id SERIAL PRIMARY KEY,
  listing_id VARCHAR(50) NOT NULL,
  buyer_id VARCHAR(50) NOT NULL,
  match_type VARCHAR(30) NOT NULL,
  similarity DECIMAL(5,2),
  notified BOOLEAN DEFAULT false,
  matched_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escrow_decisions (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(50) UNIQUE NOT NULL,
  action VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL,
  confidence DECIMAL(3,2),
  auto_released BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_trust_scores (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) UNIQUE NOT NULL,
  trust_score INTEGER,
  transaction_count INTEGER DEFAULT 0,
  dispute_count INTEGER DEFAULT 0,
  tier VARCHAR(10) DEFAULT 'BRONZE',
  calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotional_campaigns (
  id SERIAL PRIMARY KEY,
  listing_id VARCHAR(50) UNIQUE NOT NULL,
  seller_id VARCHAR(50) NOT NULL,
  platforms JSONB NOT NULL,
  content JSONB NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  executed_at TIMESTAMP,
  results JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_engagement (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER,
  platform VARCHAR(20) NOT NULL,
  metric VARCHAR(30) NOT NULL,
  value INTEGER DEFAULT 1,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_metrics (
  id SERIAL PRIMARY KEY,
  agent_name VARCHAR(30) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS cron_logs (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  result JSONB NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buyer_requests_updated_at BEFORE UPDATE ON buyer_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
SELECT '✅ Railway database schema migration complete!' as status;
