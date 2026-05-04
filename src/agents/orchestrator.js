/**
 * Weka Soko - Agent Orchestrator
 * Coordinates all AI agents: Gatekeeper, Sentinel, Matchmaker, Arbitrator, Promoter
 * 
 * Architecture:
 * - Event-driven (listings created, messages sent, payments made)
 * - Parallel execution where possible
 * - Smart caching to minimize API costs
 * - Queue for rate-limited operations
 */

const crypto = require('crypto');
const { pool } = require('../db/pool');

// Agent imports (will create these files)
const GatekeeperAgent = require('./agents/gatekeeper.agent');
const SentinelAgent = require('./agents/sentinel.agent');
const MatchmakerAgent = require('./agents/matchmaker.agent');
const ArbitratorAgent = require('./agents/arbitrator.agent');
const PromoterAgent = require('./agents/promoter.agent');

class AgentOrchestrator {
  constructor() {
    // Initialize all agents
    this.agents = {
      gatekeeper: new GatekeeperAgent(),
      sentinel: new SentinelAgent(),
      matchmaker: new MatchmakerAgent(),
      arbitrator: new ArbitratorAgent(),
      promoter: new PromoterAgent()
    };

    // Agent registry - defines capabilities and triggers
    this.agentRegistry = {
      gatekeeper: {
        triggers: ['listing:created', 'listing:updated', 'message:reported', 'user:reported'],
        priority: 'high',
        parallelSafe: true
      },
      sentinel: {
        triggers: ['listing:created', 'listing:photo_uploaded', 'seller:metrics_updated'],
        priority: 'medium',
        parallelSafe: true
      },
      matchmaker: {
        triggers: ['listing:approved', 'buyer_request:created', 'user:preferences_updated'],
        priority: 'medium',
        parallelSafe: true
      },
      arbitrator: {
        triggers: ['payment:received', 'escrow:created', 'dispute:opened', 'transaction:completed'],
        priority: 'high',
        parallelSafe: false // Sequential for financial safety
      },
      promoter: {
        triggers: ['listing:approved', 'listing:featured', 'promotion:purchased'],
        priority: 'low',
        parallelSafe: true
      }
    };

    // Cache configuration
    this.cacheEnabled = true;
    this.cacheTTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  /**
   * Main entry point - Process any event through relevant agents
   * @param {string} eventType - Type of event (e.g., 'listing:created')
   * @param {Object} payload - Event data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Results from all agents
   */
  async processEvent(eventType, payload, options = {}) {
    const startTime = Date.now();
    const { parallel = true, cache = true, priority = 'normal' } = options;

    console.log(`[Orchestrator] Processing event: ${eventType}`);

    // Find agents that should handle this event
    const relevantAgents = this.getAgentsForEvent(eventType);
    
    if (relevantAgents.length === 0) {
      console.log(`[Orchestrator] No agents registered for ${eventType}`);
      return { processed: false, agents: [] };
    }

    // Check cache first (if enabled)
    if (cache && this.cacheEnabled) {
      const cached = await this.checkCache(eventType, payload);
      if (cached) {
        console.log(`[Orchestrator] Cache hit for ${eventType}`);
        return { processed: true, fromCache: true, results: cached };
      }
    }

    // Prepare agent tasks
    const agentTasks = relevantAgents.map(agentName => ({
      name: agentName,
      execute: () => this.runAgent(agentName, eventType, payload)
    }));

    // Execute agents
    let results;
    if (parallel && this.canRunParallel(relevantAgents)) {
      results = await this.executeParallel(agentTasks);
    } else {
      results = await this.executeSequential(agentTasks);
    }

    // Store results in cache
    if (cache && this.cacheEnabled) {
      await this.storeCache(eventType, payload, results);
    }

    // Log to database
    await this.logActivity(eventType, payload, results, Date.now() - startTime);

    return {
      processed: true,
      eventType,
      agents: relevantAgents,
      results,
      duration: Date.now() - startTime
    };
  }

  /**
   * Run a specific agent
   * @param {string} agentName - Name of agent to run
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Promise<Object>} Agent result
   */
  async runAgent(agentName, eventType, payload) {
    const agent = this.agents[agentName];
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    const startTime = Date.now();
    
    try {
      console.log(`[Agent:${agentName}] Starting ${eventType}`);
      
      const result = await agent.process(eventType, payload);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        agent: agentName,
        result,
        duration,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[Agent:${agentName}] Error:`, error.message);
      
      return {
        success: false,
        agent: agentName,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute agents in parallel
   * @param {Array} tasks - Array of agent tasks
   * @returns {Promise<Object>} Combined results
   */
  async executeParallel(tasks) {
    const results = await Promise.all(
      tasks.map(task => 
        task.execute().catch(error => ({
          success: false,
          agent: task.name,
          error: error.message
        }))
      )
    );

    return this.combineResults(results);
  }

  /**
   * Execute agents sequentially (for dependent tasks)
   * @param {Array} tasks - Array of agent tasks
   * @returns {Promise<Object>} Combined results
   */
  async executeSequential(tasks) {
    const results = [];
    
    for (const task of tasks) {
      const result = await task.execute();
      results.push(result);
      
      // Pass context to next agent if needed
      if (result.success && result.context) {
        // Context can be used by subsequent agents
      }
    }

    return this.combineResults(results);
  }

  /**
   * Combine results from multiple agents
   * @param {Array} results - Individual agent results
   * @returns {Object} Combined results
   */
  combineResults(results) {
    const combined = {
      agents: {},
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
      },
      recommendations: []
    };

    for (const result of results) {
      combined.agents[result.agent] = result;
      
      // Collect recommendations
      if (result.success && result.result?.recommendations) {
        combined.recommendations.push(...result.result.recommendations);
      }
    }

    // Determine overall action
    const hasRejection = results.some(r => 
      r.success && r.result?.action === 'REJECT'
    );
    
    const hasEscalation = results.some(r => 
      r.success && r.result?.action === 'ESCALATE'
    );

    combined.overallAction = hasRejection ? 'REJECT' : 
                            hasEscalation ? 'ESCALATE' : 'APPROVE';

    return combined;
  }

  /**
   * Get agents that should handle an event type
   * @param {string} eventType - Event type
   * @returns {Array} Agent names
   */
  getAgentsForEvent(eventType) {
    const agents = [];
    
    for (const [agentName, config] of Object.entries(this.agentRegistry)) {
      if (config.triggers.includes(eventType)) {
        agents.push(agentName);
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return agents.sort((a, b) => 
      priorityOrder[this.agentRegistry[a].priority] - 
      priorityOrder[this.agentRegistry[b].priority]
    );
  }

  /**
   * Check if agents can run in parallel
   * @param {Array} agentNames - List of agents
   * @returns {boolean}
   */
  canRunParallel(agentNames) {
    return agentNames.every(name => this.agentRegistry[name]?.parallelSafe);
  }

  /**
   * Generate cache key from event
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {string} Cache key
   */
  getCacheKey(eventType, payload) {
    // Extract key fields for caching
    const keyData = {
      eventType,
      // For listings, use title + description hash
      listingHash: payload.title && payload.description ? 
        crypto.createHash('md5').update(payload.title + payload.description).digest('hex') : null,
      // For users, use userId
      userId: payload.user_id || payload.seller_id || payload.buyer_id,
      // Include relevant IDs
      id: payload.id || payload.listing_id || payload.request_id
    };
    
    return crypto.createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');
  }

  /**
   * Check if result exists in cache
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Promise<Object|null>} Cached result or null
   */
  async checkCache(eventType, payload) {
    try {
      const cacheKey = this.getCacheKey(eventType, payload);
      
      const result = await pool.query(`
        SELECT result, created_at 
        FROM agent_cache 
        WHERE cache_key = $1 
        AND created_at > NOW() - INTERVAL '7 days'
      `, [cacheKey]);

      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].result);
      }
      
      return null;
    } catch (error) {
      console.error('[Orchestrator] Cache check error:', error);
      return null;
    }
  }

  /**
   * Store result in cache
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @param {Object} results - Results to cache
   */
  async storeCache(eventType, payload, results) {
    try {
      const cacheKey = this.getCacheKey(eventType, payload);
      
      await pool.query(`
        INSERT INTO agent_cache (cache_key, event_type, result, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (cache_key) 
        DO UPDATE SET result = $3, created_at = NOW()
      `, [cacheKey, eventType, JSON.stringify(results)]);
    } catch (error) {
      console.error('[Orchestrator] Cache store error:', error);
    }
  }

  /**
   * Log agent activity to database
   * @param {string} eventType - Event type
   * @param {Object} payload - Event data
   * @param {Object} results - Agent results
   * @param {number} duration - Processing duration
   */
  async logActivity(eventType, payload, results, duration) {
    try {
      await pool.query(`
        INSERT INTO agent_activity_logs 
        (event_type, payload_summary, results_summary, duration_ms, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        eventType,
        JSON.stringify({
          id: payload.id || payload.listing_id,
          userId: payload.user_id || payload.seller_id,
          category: payload.category
        }),
        JSON.stringify({
          agents: Object.keys(results.agents || {}),
          action: results.overallAction,
          success: results.summary?.successful
        }),
        duration
      ]);
    } catch (error) {
      console.error('[Orchestrator] Activity log error:', error);
    }
  }

  /**
   * Get orchestrator health status
   * @returns {Object} Health metrics
   */
  async getHealth() {
    const agentStatus = {};
    
    for (const [name, agent] of Object.entries(this.agents)) {
      agentStatus[name] = {
        registered: true,
        healthy: agent.isHealthy?.() ?? true,
        lastCheck: new Date().toISOString()
      };
    }

    // Get stats from last 24 hours
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN (results_summary::jsonb->>'success')::boolean THEN 1 END) as successful,
        AVG(duration_ms) as avg_duration
      FROM agent_activity_logs 
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    return {
      status: 'healthy',
      agents: agentStatus,
      stats: stats.rows[0],
      cacheEnabled: this.cacheEnabled
    };
  }

  /**
   * Get recent activity for dashboard
   * @param {number} limit - Number of activities to return
   * @returns {Promise<Array>} Recent activities
   */
  async getRecentActivity(limit = 50) {
    const result = await pool.query(`
      SELECT 
        event_type,
        payload_summary,
        results_summary,
        duration_ms,
        created_at
      FROM agent_activity_logs 
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      eventType: row.event_type,
      payload: JSON.parse(row.payload_summary),
      results: JSON.parse(row.results_summary),
      duration: row.duration_ms,
      timestamp: row.created_at
    }));
  }
}

// Singleton instance
const orchestrator = new AgentOrchestrator();

module.exports = orchestrator;
