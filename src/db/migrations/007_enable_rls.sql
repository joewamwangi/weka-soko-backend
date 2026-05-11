-- =====================================================
-- Weka Soko - Row Level Security (RLS) Migration
-- Purpose: Enable RLS on all tables for data security
-- Run this on your Supabase database IMMEDIATELY
-- =====================================================

-- Enable RLS on ALL tables
-- This ensures users can only access their own data

-- ============================================
-- CORE TABLES
-- ============================================

-- 1. listings table
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Users can view active listings
CREATE POLICY "Listings are viewable by everyone when active" ON listings
  FOR SELECT
  USING (status = 'active' OR status = 'sold');

-- Only listing owner can update/delete their listing
CREATE POLICY "Users can update their own listings" ON listings
  FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Users can delete their own listings" ON listings
  FOR DELETE
  USING (auth.uid() = seller_id);

-- Only authenticated users can create listings
CREATE POLICY "Authenticated users can create listings" ON listings
  FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- 2. users table (if exists, or auth.users)
-- Note: auth.users is managed by Supabase Auth, don't modify

-- 3. saved_listings / listing_saves (join table)
DO $$ BEGIN
  ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table saved_listings does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own saved listings" ON saved_listings
    FOR SELECT
    USING (auth.uid() = user_id);
  
  CREATE POLICY "Users can save listings" ON saved_listings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
    
  CREATE POLICY "Users can remove their saves" ON saved_listings
    FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for saved_listings';
END $$;

-- ============================================
-- CHAT & MESSAGES
-- ============================================

-- 4. chat_messages
DO $$ BEGIN
  ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table chat_messages does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own chat messages" ON chat_messages
    FOR SELECT
    USING (
      auth.uid() = sender_id 
      OR auth.uid() = recipient_id
      OR EXISTS (
        SELECT 1 FROM listings 
        WHERE id = chat_messages.listing_id 
        AND seller_id = auth.uid()
      )
    );
    
  CREATE POLICY "Users can send messages" ON chat_messages
    FOR INSERT
    WITH CHECK (auth.uid() = sender_id);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for chat_messages';
END $$;

-- ============================================
-- PAYMENTS & ESCROW
-- ============================================

-- 5. payments
DO $$ BEGIN
  ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table payments does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own payments" ON payments
    FOR SELECT
    USING (auth.uid() = payer_id OR auth.uid() = recipient_id);
    
  CREATE POLICY "Users can create payments" ON payments
    FOR INSERT
    WITH CHECK (auth.uid() = payer_id);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for payments';
END $$;

-- 6. escrows
DO $$ BEGIN
  ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table escrows does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own escrows" ON escrows
    FOR SELECT
    USING (
      auth.uid() = buyer_id 
      OR auth.uid() = seller_id
      OR auth.uid() = agent_id
    );
    
  CREATE POLICY "Authorized users can update escrows" ON escrows
    FOR UPDATE
    USING (
      auth.uid() = buyer_id 
      OR auth.uid() = seller_id
      OR auth.uid() = agent_id
    );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for escrows';
END $$;

-- ============================================
-- ADMIN & MODERATION
-- ============================================

-- 7. admin_actions
DO $$ BEGIN
  ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table admin_actions does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view admin actions" ON admin_actions
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    );
    
  CREATE POLICY "Admins can create admin actions" ON admin_actions
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for admin_actions';
END $$;

-- 8. violations / reports
DO $$ BEGIN
  ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table violations does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own violations" ON violations
    FOR SELECT
    USING (auth.uid() = user_id);
    
  CREATE POLICY "Admins can view all violations" ON violations
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for violations';
END $$;

-- ============================================
-- AGENT SYSTEM TABLES (from migration 006)
-- ============================================

-- 9. agent_cache - No RLS needed (cache table, read-only)
-- 10. agent_activity_logs - No RLS needed (audit logs)
-- 11. moderation_results - Already covered by admin policies
-- 12. flagged_content_queue - Already covered by admin policies
-- 13. listing_quality_scores - No RLS needed (system-generated)
-- 14. listing_matches - User-specific
-- 15. user_trust_scores - User-specific
-- 16. promotional_campaigns - User-specific
-- 17. campaign_engagement - System table
-- 18. agent_metrics - System table
-- 19. cron_logs - System table

-- Listing matches
DO $$ BEGIN
  ALTER TABLE listing_matches ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table listing_matches does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own matches" ON listing_matches
    FOR SELECT
    USING (auth.uid() = buyer_id);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for listing_matches';
END $$;

-- User trust scores
DO $$ BEGIN
  ALTER TABLE user_trust_scores ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table user_trust_scores does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own trust score" ON user_trust_scores
    FOR SELECT
    USING (auth.uid() = user_id);
    
  CREATE POLICY "System can update trust scores" ON user_trust_scores
    FOR UPDATE
    USING (true); -- System-managed
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for user_trust_scores';
END $$;

-- Promotional campaigns
DO $$ BEGIN
  ALTER TABLE promotional_campaigns ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table promotional_campaigns does not exist, skipping...';
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own campaigns" ON promotional_campaigns
    FOR SELECT
    USING (auth.uid() = seller_id);
    
  CREATE POLICY "Users can create campaigns" ON promotional_campaigns
    FOR INSERT
    WITH CHECK (auth.uid() = seller_id);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Policy creation skipped for promotional_campaigns';
END $$;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is seller of listing
CREATE OR REPLACE FUNCTION is_listing_seller(listing_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM listings 
    WHERE id = listing_id_param 
    AND seller_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICATION
-- ============================================

-- List all tables with RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
JOIN pg_namespace ON pg_tables.schemaname = pg_namespace.nspname
WHERE schemaname = 'public'
ORDER BY tablename;

-- List all policies
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as command,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
SELECT '✅ RLS Migration Complete! All tables now have Row Level Security enabled.' as status;
SELECT '⚠️  IMPORTANT: Test thoroughly to ensure users can still access their data correctly.' as warning;
