// One-time migration route - should be protected in production
const express = require("express");
const router = express.Router();
const { fixMissingSchema } = require("../db/migrations/fix_missing_schema");

let migrationRunning = false;

router.get("/run-migration", async (req, res) => {
  // Simple protection - check for secret query param
  const secret = req.query.secret;
  if (secret !== process.env.ADMIN_SEED_PASSWORD) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (migrationRunning) {
    return res.json({ status: "already_running", message: "Migration already in progress" });
  }

  try {
    migrationRunning = true;
    console.log("🚀 Starting manual schema migration...");
    
    await fixMissingSchema();
    
    res.json({ 
      success: true, 
      message: "Schema migration completed successfully!",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    migrationRunning = false;
  }
});

module.exports = router;
