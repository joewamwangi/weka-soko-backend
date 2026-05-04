/**
 * Weka Soko - Agent Routes
 * API endpoints for the AI Agent Ecosystem
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const orchestrator = require('../agents/orchestrator');
const { pool } = require('../db/pool');

/**
 * POST /api/agents/process
 * Process an event through the agent orchestrator
 * Body: { eventType, payload }
 */
router.post('/process', requireAuth, async (req, res) => {
  try {
    const { eventType, payload, options = {} } = req.body;

    if (!eventType || !payload) {
      return res.status(400).json({
        error: 'Missing required fields: eventType, payload'
      });
    }

    // Add user context if authenticated
    const enrichedPayload = {
      ...payload,
      _userId: req.user.id,
      _timestamp: new Date().toISOString()
    };

    const result = await orchestrator.processEvent(eventType, enrichedPayload, options);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Agents API] Process error:', error);
    res.status(500).json({
      error: 'Agent processing failed',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/listings/:id/analyze
 * Analyze a specific listing through all relevant agents
 */
router.post('/listings/:id/analyze', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get listing data
    const listingResult = await pool.query(`
      SELECT l.*, u.username, u.created_at as user_created
      FROM listings l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = $1
    `, [id]);

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listingResult.rows[0];

    // Process through orchestrator
    const result = await orchestrator.processEvent('listing:created', listing, {
      parallel: true,
      cache: false // Force fresh analysis
    });

    res.json({
      success: true,
      listing: {
        id: listing.id,
        title: listing.title
      },
      analysis: result.results
    });
  } catch (error) {
    console.error('[Agents API] Analyze error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

/**
 * GET /api/agents/health
 * Get orchestrator and agent health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await orchestrator.getHealth();
    
    // Get recent error rate
    const errors = await pool.query(`
      SELECT COUNT(*) as error_count
      FROM agent_activity_logs
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND results_summary::text LIKE '%"success": false%'
    `);

    res.json({
      status: 'healthy',
      ...health,
      recentErrors: parseInt(errors.rows[0]?.error_count || 0),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Agents API] Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /api/agents/activity
 * Get recent agent activity (admin only)
 */
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activity = await orchestrator.getRecentActivity(limit);

    res.json({
      success: true,
      count: activity.length,
      activity
    });
  } catch (error) {
    console.error('[Agents API] Activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

/**
 * GET /api/agents/stats
 * Get agent statistics and metrics
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    // Get stats from database
    const statsResult = await pool.query(`
      SELECT 
        agent_name,
        SUM(total_calls) as total_calls,
        SUM(successful_calls) as successful_calls,
        SUM(failed_calls) as failed_calls,
        AVG(avg_duration_ms) as avg_duration
      FROM agent_metrics
      WHERE date > CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY agent_name
    `);

    // Get daily breakdown
    const dailyResult = await pool.query(`
      SELECT 
        date,
        agent_name,
        total_calls,
        successful_calls
      FROM agent_metrics
      WHERE date > CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date DESC, agent_name
    `);

    res.json({
      success: true,
      period: `${days} days`,
      agents: statsResult.rows.map(row => ({
        name: row.agent_name,
        totalCalls: parseInt(row.total_calls),
        successfulCalls: parseInt(row.successful_calls),
        failedCalls: parseInt(row.failed_calls),
        successRate: row.total_calls > 0 
          ? ((row.successful_calls / row.total_calls) * 100).toFixed(2) + '%'
          : 'N/A',
        avgDuration: Math.round(row.avg_duration) + 'ms'
      })),
      daily: dailyResult.rows
    });
  } catch (error) {
    console.error('[Agents API] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/agents/dashboard
 * Get dashboard data for agent command center
 */
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    // Get today's activity
    const todayActivity = await pool.query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration
      FROM agent_activity_logs
      WHERE created_at > CURRENT_DATE
      GROUP BY event_type
    `);

    // Get moderation stats
    const moderationStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN risk_score > 70 THEN 1 END) as high_risk,
        AVG(risk_score) as avg_risk
      FROM moderation_results
      WHERE created_at > CURRENT_DATE
    `);

    // Get match stats
    const matchStats = await pool.query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN notified THEN 1 END) as notified,
        COUNT(CASE WHEN clicked THEN 1 END) as clicked
      FROM listing_matches
      WHERE matched_at > CURRENT_DATE
    `);

    // Get agent health
    const health = await orchestrator.getHealth();

    res.json({
      success: true,
      systemHealth: health,
      today: {
        activity: todayActivity.rows,
        moderation: moderationStats.rows[0],
        matches: matchStats.rows[0]
      },
      agents: {
        gatekeeper: { status: 'operational', lastActivity: new Date().toISOString() },
        sentinel: { status: 'operational', lastActivity: new Date().toISOString() },
        matchmaker: { status: 'operational', lastActivity: new Date().toISOString() },
        arbitrator: { status: 'operational', lastActivity: new Date().toISOString() },
        promoter: { status: 'operational', lastActivity: new Date().toISOString() }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Agents API] Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * GET /api/agents/queue
 * Get current moderation/review queue
 */
router.get('/queue', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending';

    const queue = await pool.query(`
      SELECT 
        fcq.*,
        CASE 
          WHEN fcq.target_type = 'listing' THEN l.title
          WHEN fcq.target_type = 'user' THEN u.username
          ELSE 'N/A'
        END as target_name
      FROM flagged_content_queue fcq
      LEFT JOIN listings l ON fcq.target_id = l.id AND fcq.target_type = 'listing'
      LEFT JOIN users u ON fcq.target_id = u.id AND fcq.target_type = 'user'
      WHERE fcq.status = $1
      ORDER BY fcq.risk_score DESC, fcq.created_at DESC
      LIMIT 50
    `, [status]);

    res.json({
      success: true,
      status,
      count: queue.rows.length,
      queue: queue.rows
    });
  } catch (error) {
    console.error('[Agents API] Queue error:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

/**
 * POST /api/agents/queue/:id/review
 * Review a flagged item
 */
router.post('/queue/:id/review', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'approved', 'rejected', 'escalated'

    await pool.query(`
      UPDATE flagged_content_queue
      SET status = $1, 
          reviewed_by = $2, 
          reviewed_at = NOW(),
          moderator_notes = $3
      WHERE id = $4
    `, [action, req.user.id, notes, id]);

    // Take action based on review
    if (action === 'rejected') {
      const flagged = await pool.query('SELECT * FROM flagged_content_queue WHERE id = $1', [id]);
      if (flagged.rows[0]?.target_type === 'listing') {
        await pool.query("UPDATE listings SET status = 'rejected' WHERE id = $1", [flagged.rows[0].target_id]);
      }
    }

    res.json({
      success: true,
      message: `Item ${action}`
    });
  } catch (error) {
    console.error('[Agents API] Review error:', error);
    res.status(500).json({ error: 'Review failed' });
  }
});

/**
 * GET /api/agents/matches/:listingId
 * Get matches for a specific listing
 */
router.get('/matches/:listingId', requireAuth, async (req, res) => {
  try {
    const { listingId } = req.params;

    // Verify ownership
    const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
    if (listing.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const matches = await pool.query(`
      SELECT 
        m.*,
        u.username as buyer_name,
        u.email as buyer_email
      FROM listing_matches m
      JOIN users u ON m.buyer_id = u.id
      WHERE m.listing_id = $1
      ORDER BY m.similarity DESC
    `, [listingId]);

    res.json({
      success: true,
      listingId,
      matchCount: matches.rows.length,
      matches: matches.rows
    });
  } catch (error) {
    console.error('[Agents API] Matches error:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * POST /api/agents/promote/:listingId
 * Trigger promotion for a listing
 */
router.post('/promote/:listingId', requireAuth, async (req, res) => {
  try {
    const { listingId } = req.params;

    // Get listing
    const listing = await pool.query(`
      SELECT l.*, u.username
      FROM listings l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = $1
    `, [listingId]);

    if (listing.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Process through promoter
    const result = await orchestrator.processEvent('promotion:purchased', listing.rows[0]);

    res.json({
      success: true,
      listingId,
      promotion: result
    });
  } catch (error) {
    console.error('[Agents API] Promote error:', error);
    res.status(500).json({ error: 'Promotion failed' });
  }
});

module.exports = router;
