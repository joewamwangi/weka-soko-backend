-- Weka Soko Agent System Database Schema
-- Run this migration to enable the AI Agent Ecosystem

-- ============================================
-- CACHE & LOGGING TABLES
-- ============================================

-- Agent result cache
CREATE TABLE IF NOT EXISTS agent_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(64) UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_cache_key ON agent_cache(cache_key);
CREATE INDEX idx_agent_cache_created ON agent_cache(created_at);

-- Agent activity logs
CREATE TABLE IF NOT EXISTS agent_activity_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    payload_summary JSONB,
    results_summary JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_event ON agent_activity_logs(event_type);
CREATE INDEX idx_agent_logs_created ON agent_activity_logs(created_at);

-- ============================================
-- GATEKEEPER TABLES
-- ============================================

-- Moderation results
CREATE TABLE IF NOT EXISTS moderation_results (
    id SERIAL PRIMARY KEY,
    target_id VARCHAR(50) NOT NULL,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('listing', 'message', 'user')),
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
    flags JSONB DEFAULT '[]',
    action_taken VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(target_id, target_type)
);

CREATE INDEX idx_moderation_target ON moderation_results(target_id, target_type);
CREATE INDEX idx_moderation_risk ON moderation_results(risk_score);

-- Flagged content queue
CREATE TABLE IF NOT EXISTS flagged_content_queue (
    id SERIAL PRIMARY KEY,
    target_id VARCHAR(50) NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    risk_score INTEGER,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_flagged_status ON flagged_content_queue(status);

-- ============================================
-- SENTINEL TABLES
-- ============================================

-- Listing quality scores
CREATE TABLE IF NOT EXISTS listing_quality_scores (
    id SERIAL PRIMARY KEY,
    listing_id VARCHAR(50) UNIQUE NOT NULL,
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    grade VARCHAR(2),
    issues JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    searchable BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quality_score ON listing_quality_scores(quality_score);
CREATE INDEX idx_quality_searchable ON listing_quality_scores(searchable);

-- ============================================
-- MATCHMAKER TABLES
-- ============================================

-- Listing matches
CREATE TABLE IF NOT EXISTS listing_matches (
    id SERIAL PRIMARY KEY,
    listing_id VARCHAR(50) NOT NULL,
    buyer_id VARCHAR(50) NOT NULL,
    match_type VARCHAR(30) NOT NULL,
    similarity DECIMAL(5,2),
    notified BOOLEAN DEFAULT false,
    matched_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(listing_id, buyer_id)
);

CREATE INDEX idx_matches_listing ON listing_matches(listing_id);
CREATE INDEX idx_matches_buyer ON listing_matches(buyer_id);

-- ============================================
-- ARBITRATOR TABLES
-- ============================================

-- Escrow decisions
CREATE TABLE IF NOT EXISTS escrow_decisions (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(50) UNIQUE NOT NULL,
    action VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    confidence DECIMAL(3,2),
    auto_released BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_escrow_txn ON escrow_decisions(transaction_id);

-- User trust scores
CREATE TABLE IF NOT EXISTS user_trust_scores (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    trust_score INTEGER CHECK (trust_score >= 0 AND trust_score <= 100),
    transaction_count INTEGER DEFAULT 0,
    dispute_count INTEGER DEFAULT 0,
    tier VARCHAR(10) DEFAULT 'BRONZE',
    calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trust_score ON user_trust_scores(trust_score);

-- ============================================
-- PROMOTER TABLES
-- ============================================

-- Promotional campaigns
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

CREATE INDEX idx_campaigns_listing ON promotional_campaigns(listing_id);
CREATE INDEX idx_campaigns_status ON promotional_campaigns(status);

-- Campaign engagement
CREATE TABLE IF NOT EXISTS campaign_engagement (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES promotional_campaigns(id),
    platform VARCHAR(20) NOT NULL,
    metric VARCHAR(30) NOT NULL,
    value INTEGER DEFAULT 1,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_engagement_campaign ON campaign_engagement(campaign_id);

-- ============================================
-- AGENT METRICS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS agent_metrics (
    id SERIAL PRIMARY KEY,
    agent_name VARCHAR(30) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    avg_duration_ms INTEGER,
    tokens_used INTEGER DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    UNIQUE(agent_name, event_type, date)
);

CREATE INDEX idx_metrics_agent ON agent_metrics(agent_name);

-- ============================================
-- CRON LOGGING
-- ============================================

-- Cron job execution logs
CREATE TABLE IF NOT EXISTS cron_logs (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    result JSONB NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cron_logs_job ON cron_logs(job_name);
CREATE INDEX idx_cron_logs_executed ON cron_logs(executed_at);

-- ============================================
-- VIEWS FOR DASHBOARD
-- ============================================

CREATE OR REPLACE VIEW daily_agent_activity AS
SELECT 
    DATE(created_at) as date,
    event_type,
    COUNT(*) as event_count,
    AVG(duration_ms) as avg_duration
FROM agent_activity_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), event_type;

CREATE OR REPLACE VIEW moderation_summary AS
SELECT 
    DATE(created_at) as date,
    target_type,
    COUNT(*) as total_reviewed,
    AVG(risk_score) as avg_risk_score
FROM moderation_results
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), target_type;

-- Insert initial data
INSERT INTO agent_metrics (agent_name, event_type, date) VALUES
('Gatekeeper', 'listing:created', CURRENT_DATE),
('Sentinel', 'listing:created', CURRENT_DATE),
('Matchmaker', 'listing:approved', CURRENT_DATE),
('Arbitrator', 'payment:received', CURRENT_DATE),
('Promoter', 'promotion:purchased', CURRENT_DATE)
ON CONFLICT DO NOTHING;

SELECT 'Agent system migration completed' as status;
