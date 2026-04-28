// Fix mpesa_receipt column size for Paystack - run this on Render
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixColumn() {
  const client = await pool.connect();
  try {
    console.log("Checking mpesa_receipt column size...");
    
    // Check current column type
    const { rows } = await client.query(`
      SELECT character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'payments' AND column_name = 'mpesa_receipt'
    `);
    
    if (rows.length) {
      const currentLength = rows[0].character_maximum_length;
      console.log(`Current mpesa_receipt length: ${currentLength}`);
      
      if (currentLength < 100) {
        console.log("Increasing to VARCHAR(100)...");
        await client.query(`ALTER TABLE payments ALTER COLUMN mpesa_receipt TYPE VARCHAR(100)`);
        console.log("✅ Column updated successfully!");
      } else {
        console.log("✅ Column already large enough");
      }
    } else {
      console.log("Column not found - may need to run full migration");
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixColumn();
