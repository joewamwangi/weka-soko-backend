-- Drop all tables to allow clean migration
-- Run this ONCE before deploying to Railway

-- Drop all tables in dependency order
DROP TABLE IF EXISTS campaign_engagement CASCADE;
DROP TABLE IF EXISTS promotional_campaigns CASCADE;
DROP TABLE IF EXISTS user_trust_scores CASCADE;
DROP TABLE IF EXISTS escrow_decisions CASCADE;
DROP TABLE IF EXISTS listing_matches CASCADE;
DROP TABLE IF EXISTS listing_quality_scores CASCADE;
DROP TABLE IF EXISTS flagged_content_queue CASCADE;
DROP TABLE IF EXISTS moderation_results CASCADE;
DROP TABLE IF EXISTS agent_metrics CASCADE;
DROP TABLE IF EXISTS cron_logs CASCADE;
DROP TABLE IF EXISTS agent_activity_logs CASCADE;
DROP TABLE IF EXISTS agent_cache CASCADE;
DROP TABLE IF EXISTS pitches CASCADE;
DROP TABLE IF EXISTS buyer_requests CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS saved_listings CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS violations CASCADE;
DROP TABLE IF EXISTS admin_actions CASCADE;
DROP TABLE IF EXISTS escrows CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_violations CASCADE;
DROP TABLE IF EXISTS listing_reports CASCADE;
DROP TABLE IF EXISTS listing_photos CASCADE;
DROP TABLE IF EXISTS listings CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS password_history CASCADE;
DROP TABLE IF EXISTS user_push_tokens CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS price_offers CASCADE;
DROP TABLE IF EXISTS vouchers CASCADE;
DROP TABLE IF EXISTS disputes CASCADE;
DROP TABLE IF EXISTS refunds CASCADE;
DROP TABLE IF EXISTS moderation_appeals CASCADE;
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS payment_attempts CASCADE;
DROP TABLE IF EXISTS data_exports CASCADE;
DROP TABLE IF EXISTS account_deletion_requests CASCADE;
DROP TABLE IF EXISTS seller_pitches CASCADE;
DROP TABLE IF EXISTS platform_config CASCADE;
DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop enums
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS violation_severity CASCADE;

SELECT '✅ Schema dropped successfully - ready for clean migration' as status;
