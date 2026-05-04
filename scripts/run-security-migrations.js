#!/usr/bin/env node
// Run security migrations

require('dotenv').config();
const { runSecurityMigration } = require('./migrations/001_security_constraints');

async function runMigrations() {
  console.log('🚀 Starting security migrations...\n');
  
  try {
    await runSecurityMigration();
    console.log('\n✅ All security migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigrations();
