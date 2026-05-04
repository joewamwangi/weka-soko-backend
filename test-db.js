// Simple database test
const { pool } = require('./src/db/pool');

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected!');
    console.log('Time:', result.rows[0].now);
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\nMake sure DATABASE_URL is set in your .env file');
    process.exit(1);
  }
}

testConnection();
