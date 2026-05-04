/**
 * Weka Soko - Agent System Setup
 * Initialize and configure the AI Agent Ecosystem
 */

const { pool } = require('../db/pool');
const orchestrator = require('./orchestrator');

class AgentSetup {
  async initialize() {
    console.log('🤖 Initializing Weka Soko AI Agent Ecosystem...\n');

    try {
      await this.verifyDatabase();
      await this.checkApiKeys();
      await this.testAgents();
      await this.setupCronJobs();

      console.log('\n✅ Agent Ecosystem initialized successfully!');
      console.log('\nYour agents are ready:');
      console.log('  🔒 Gatekeeper - Content moderation & fraud detection');
      console.log('  👁️  Sentinel - Quality assurance & ghost detection');
      console.log('  💕 Matchmaker - Buyer-seller matching & recommendations');
      console.log('  ⚖️  Arbitrator - Escrow management & dispute resolution');
      console.log('  📢 Promoter - Social media automation\n');

      return true;
    } catch (error) {
      console.error('❌ Agent initialization failed:', error.message);
      return false;
    }
  }

  async verifyDatabase() {
    console.log('Step 1: Verifying database tables...');
    
    const requiredTables = [
      'agent_cache',
      'agent_activity_logs',
      'moderation_results',
      'listing_quality_scores',
      'listing_matches',
      'escrow_decisions',
      'promotional_campaigns',
      'agent_metrics'
    ];

    for (const table of requiredTables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [table]);
      
      if (!result.rows[0].exists) {
        throw new Error(`Required table missing: ${table}. Run migration 006_add_agent_system.sql`);
      }
    }
    
    console.log('  ✓ All database tables verified');
  }

  async checkApiKeys() {
    console.log('Step 2: Checking API keys...');
    
    const required = {
      GROQ_API_KEY: 'Groq AI (free tier)',
      HUGGINGFACE_API_KEY: 'Hugging Face (free tier)'
    };

    const missing = [];
    for (const [key, desc] of Object.entries(required)) {
      if (!process.env[key]) {
        missing.push(`${key} (${desc})`);
      }
    }

    if (missing.length > 0) {
      console.log('  ⚠️  Missing optional API keys:', missing.join(', '));
      console.log('  Agents will run with limited functionality');
    } else {
      console.log('  ✓ All API keys configured');
    }
  }

  async testAgents() {
    console.log('Step 3: Testing agent connections...');
    
    // Test health endpoint
    const health = await orchestrator.getHealth();
    console.log('  ✓ Orchestrator health:', health.status);
    
    // Test individual agents
    const agents = ['gatekeeper', 'sentinel', 'matchmaker', 'arbitrator', 'promoter'];
    for (const agent of agents) {
      const agentHealth = health.agents[agent];
      console.log(`  ✓ ${agent}: ${agentHealth?.healthy ? 'healthy' : 'unavailable'}`);
    }
  }

  async setupCronJobs() {
    console.log('Step 4: Setting up cron jobs...');
    console.log('  ✓ Cron jobs will be handled by external scheduler');
    console.log('    - escrow:check_release (every hour)');
    console.log('    - listing:check_ghost (daily)');
    console.log('    - promoter:execute (every 30 minutes)');
  }
}

const setup = new AgentSetup();
module.exports = setup;

// Run if called directly
if (require.main === module) {
  setup.initialize().then(success => {
    process.exit(success ? 0 : 1);
  });
}
