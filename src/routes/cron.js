/**
 * Weka Soko - Cron Routes
 * Scheduled task endpoints for agent automation
 */

const express = require('express');
const router = express.Router();
const orchestrator = require('../agents/orchestrator');
const { pool } = require('../db/pool');

/**
 * Cron Secret - Protect these endpoints
 * Call with: curl -H "X-Cron-Secret: YOUR_SECRET" ...
 */
const CRON_SECRET = process.env.CRON_SECRET || 'weka-soko-cron-secret-2025';

function requireCronAuth(req, res, next) {
  const secret = req.headers['x-cron-secret'];
  if (secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /api/cron/escrow
 * Check and auto-release escrow transactions (run every hour)
 * Trigger: 0 * * * *
 */
router.post('/escrow', requireCronAuth, async (req, res) => {
  try {
    console.log('[Cron] Checking escrow releases...');
    
    const result = await orchestrator.processEvent('escrow:check_release', {});
    
    // Log to cron_logs
    await pool.query(`
      INSERT INTO cron_logs (job_name, result, executed_at)
      VALUES ('escrow:check_release', $1, NOW())
    `, [JSON.stringify(result)]);

    res.json({
      success: true,
      job: 'escrow:check_release',
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('[Cron] Escrow check failed:', error);
    res.status(500).json({
      success: false,
      job: 'escrow:check_release',
      error: error.message
    });
  }
});

/**
 * POST /api/cron/ghost-listings
 * Detect and alert on ghost listings (run daily at midnight)
 * Trigger: 0 0 * * *
 */
router.post('/ghost-listings', requireCronAuth, async (req, res) => {
  try {
    console.log('[Cron] Checking ghost listings...');
    
    const result = await orchestrator.agents.sentinel.detectGhostListings();
    
    // Send alerts to inactive sellers
    if (result.recommendations) {
      for (const rec of result.recommendations) {
        await pool.query(`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES ($1, $2, $3, 'SYSTEM', NOW())
        `, [
          rec.userId,
          'Your listing needs attention',
          `Your listing "${rec.listingId}" has been inactive. Respond to messages to keep it visible.`
        ]);
      }
    }

    // Log to cron_logs
    await pool.query(`
      INSERT INTO cron_logs (job_name, result, executed_at)
      VALUES ('listing:check_ghost', $1, NOW())
    `, [JSON.stringify(result)]);

    res.json({
      success: true,
      job: 'listing:check_ghost',
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('[Cron] Ghost listing check failed:', error);
    res.status(500).json({
      success: false,
      job: 'listing:check_ghost',
      error: error.message
    });
  }
});

/**
 * POST /api/cron/promotions
 * Execute scheduled promotional campaigns (run every 30 minutes)
 * Trigger: every 30 minutes
 */
router.post('/promotions', requireCronAuth, async (req, res) => {
  try {
    console.log('[Cron] Executing scheduled promotions...');
    
    const result = await orchestrator.agents.promoter.executeScheduledCampaigns();

    // Log to cron_logs
    await pool.query(`
      INSERT INTO cron_logs (job_name, result, executed_at)
      VALUES ('promoter:execute', $1, NOW())
    `, [JSON.stringify(result)]);

    res.json({
      success: true,
      job: 'promoter:execute',
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('[Cron] Promotion execution failed:', error);
    res.status(500).json({
      success: false,
      job: 'promoter:execute',
      error: error.message
    });
  }
});

/**
 * POST /api/cron/matchmaker
 * Run matchmaker for all active listings (run twice daily)
 * Trigger: every 12 hours
 */
router.post('/matchmaker', requireCronAuth, async (req, res) => {
  try {
    console.log('[Cron] Running matchmaker...');
    
    // Get all active listings
    const listings = await pool.query(`
      SELECT * FROM listings 
      WHERE status = 'active'
        AND created_at > NOW() - INTERVAL '7 days'
      LIMIT 100
    `);

    const results = [];
    for (const listing of listings.rows) {
      const result = await orchestrator.processEvent('listing:approved', listing);
      results.push({
        listingId: listing.id,
        matchesFound: result.results?.agents?.matchmaker?.result?.matchesFound || 0
      });
    }

    const totalMatches = results.reduce((sum, r) => sum + r.matchesFound, 0);

    // Log to cron_logs
    await pool.query(`
      INSERT INTO cron_logs (job_name, result, executed_at)
      VALUES ('matchmaker:batch', $1, NOW())
    `, [JSON.stringify({ totalMatches, processed: results.length })]);

    res.json({
      success: true,
      job: 'matchmaker:batch',
      timestamp: new Date().toISOString(),
      processed: results.length,
      totalMatches
    });
  } catch (error) {
    console.error('[Cron] Matchmaker failed:', error);
    res.status(500).json({
      success: false,
      job: 'matchmaker:batch',
      error: error.message
    });
  }
});

/**
 * POST /api/cron/cache-cleanup
 * Clean old agent cache entries (run daily at 2 AM)
 * Trigger: 0 2 * * *
 */
router.post('/cache-cleanup', requireCronAuth, async (req, res) => {
  try {
    console.log('[Cron] Cleaning agent cache...');
    
    const result = await pool.query(`
      DELETE FROM agent_cache 
      WHERE created_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `);

    res.json({
      success: true,
      job: 'cache:cleanup',
      timestamp: new Date().toISOString(),
      deleted: result.rowCount
    });
  } catch (error) {
    console.error('[Cron] Cache cleanup failed:', error);
    res.status(500).json({
      success: false,
      job: 'cache:cleanup',
      error: error.message
    });
  }
});

/**
 * POST /api/cron/health-check
 * Health check and report (run every 15 minutes)
 * Trigger: every 15 minutes
 */
router.post('/health-check', requireCronAuth, async (req, res) => {
  try {
    const health = await orchestrator.getHealth();
    
    // Alert if any agent is down
    const downAgents = Object.entries(health.agents)
      .filter(([_, status]) => !status.healthy)
      .map(([name, _]) => name);

    if (downAgents.length > 0) {
      // Send alert to admins
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, created_at)
        SELECT id, $1, $2, 'SYSTEM', NOW()
        FROM users WHERE role = 'admin'
      `, [
        'Agent System Alert',
        `The following agents are down: ${downAgents.join(', ')}`
      ]);
    }

    res.json({
      success: true,
      job: 'health:check',
      timestamp: new Date().toISOString(),
      health,
      alerts: downAgents.length > 0 ? downAgents : null
    });
  } catch (error) {
    console.error('[Cron] Health check failed:', error);
    res.status(500).json({
      success: false,
      job: 'health:check',
      error: error.message
    });
  }
});

/**
 * GET /api/cron/status
 * Get cron job execution status (admin only)
 */
router.get('/status', async (req, res) => {
  try {
    // Get recent cron executions
    const recentJobs = await pool.query(`
      SELECT 
        job_name,
        result->>'success' as success,
        executed_at,
        result->>'error' as error
      FROM cron_logs
      WHERE executed_at > NOW() - INTERVAL '24 hours'
      ORDER BY executed_at DESC
      LIMIT 50
    `);

    // Get job statistics
    const stats = await pool.query(`
      SELECT 
        job_name,
        COUNT(*) as total_runs,
        COUNT(CASE WHEN result->>'success' = 'true' THEN 1 END) as successful_runs,
        MAX(executed_at) as last_run
      FROM cron_logs
      WHERE executed_at > NOW() - INTERVAL '7 days'
      GROUP BY job_name
    `);

    res.json({
      success: true,
      recentJobs: recentJobs.rows,
      stats: stats.rows
    });
  } catch (error) {
    console.error('[Cron] Status check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
