#!/usr/bin/env node
// Run all migrations (security + short-term fixes)

require('dotenv').config();
const { runSecurityMigration } = require('./migrations/001_security_constraints');
const { runShortTermMigration } = require('./migrations/002_short_term_fixes');

async function runAllMigrations() {
  console.log('🚀 Starting all migrations...\n');
  
  try {
    // Run security migrations
    console.log('Step 1: Security migrations...\n');
    await runSecurityMigration();
    console.log('');
    
    // Run short-term fixes
    console.log('Step 2: Short-term fixes...\n');
    await runShortTermMigration();
    console.log('');
    
    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllMigrations();
