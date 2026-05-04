/**
 * Weka Soko - Migration API
 * Run database migrations via HTTP request
 * Access: GET /api/migrate/agents
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const fs = require('fs');
const path = require('path');

// Simple migration endpoint - visit in browser
router.get('/agents', async (req, res) => {
  try {
    console.log('[Migrate] Starting agent system migration...');
    
    // Read the migration SQL file
    const sqlPath = path.join(__dirname, '..', 'db', 'migrations', '006_add_agent_system.sql');
    
    if (!fs.existsSync(sqlPath)) {
      return res.status(404).json({
        error: 'Migration file not found',
        path: sqlPath
      });
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
    
    const results = [];
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip comments-only statements
      if (statement.trim().startsWith('--') || statement.trim().startsWith('/*')) {
        continue;
      }
      
      try {
        await pool.query(statement);
        results.push({
          statement: statement.substring(0, 50) + '...',
          status: 'success'
        });
      } catch (err) {
        // If table already exists, that's okay
        if (err.message.includes('already exists')) {
          results.push({
            statement: statement.substring(0, 50) + '...',
            status: 'skipped',
            reason: 'Already exists'
          });
        } else {
          results.push({
            statement: statement.substring(0, 50) + '...',
            status: 'error',
            error: err.message
          });
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Agent system migration completed!',
      totalStatements: statements.length,
      results: results
    });
    
  } catch (error) {
    console.error('[Migrate] Error:', error);
    res.status(500).json({
      error: 'Migration failed',
      details: error.message
    });
  }
});

// Status check endpoint
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%agent%'
      OR table_name IN ('moderation_results', 'listing_quality_scores', 'listing_matches', 
                        'escrow_decisions', 'user_trust_scores', 'promotional_campaigns', 
                        'campaign_engagement', 'flagged_content_queue', 'cron_logs')
    `);
    
    const tables = result.rows.map(r => r.table_name);
    const requiredTables = [
      'agent_cache',
      'agent_activity_logs',
      'agent_metrics',
      'moderation_results',
      'flagged_content_queue',
      'listing_quality_scores',
      'listing_matches',
      'escrow_decisions',
      'user_trust_scores',
      'promotional_campaigns',
      'campaign_engagement',
      'cron_logs'
    ];
    
    const missing = requiredTables.filter(t => !tables.includes(t));
    
    res.json({
      success: true,
      tablesFound: tables,
      tablesMissing: missing,
      isComplete: missing.length === 0,
      message: missing.length === 0 
        ? 'All agent tables are ready!' 
        : `Missing ${missing.length} tables`
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check status',
      details: error.message
    });
  }
});

module.exports = router;
