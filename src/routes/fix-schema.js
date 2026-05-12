// One-time migration route
const express = require("express");
const router = express.Router();
const { fixAllMissingTables } = require("../db/migrations/fix_all_missing");

let migrationRunning = false;

router.get("/fix-all", async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.ADMIN_SEED_PASSWORD) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (migrationRunning) {
    return res.json({ status: "already_running", message: "Migration already in progress" });
  }

  try {
    migrationRunning = true;
    console.log("🚀 Starting comprehensive schema fix...");
    
    await fixAllMissingTables();
    
    res.json({ 
      success: true, 
      message: "All missing tables created successfully!",
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
