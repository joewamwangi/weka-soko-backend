// src/services/cron.service.js
// Runs background jobs for Weka Soko
const cron = require("node-cron");
const { query } = require("../db/pool");

function startCronJobs() {
  // ── Auto-release expired escrows every 30 minutes ─────────────────────────
  cron.schedule("*/30 * * * *", async () => {
    try {
      const { rows } = await query(
        `SELECT e.id, e.seller_id, e.listing_id
         FROM escrows e
         WHERE e.status = 'holding'
           AND e.release_after < NOW()
           AND e.buyer_confirmed = FALSE`,
      );

      for (const escrow of rows) {
        await query(
          `UPDATE escrows SET status = 'released', released_at = NOW(), notes = 'Auto-released after 48hr window' WHERE id = $1`,
          [escrow.id]
        );
        await query(`UPDATE listings SET status = 'sold' WHERE id = $1`, [escrow.listing_id]);
        await query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'escrow_auto_released', '💰 Funds Auto-Released', 'The 48-hour confirmation window has passed. Your escrow funds have been automatically released.')`,
          [escrow.seller_id]
        );
        console.log(`✅ Auto-released escrow ${escrow.id}`);
      }
    } catch (err) {
      console.error("Escrow auto-release cron error:", err.message);
    }
  });

  // ── Clean up stale pending payments every hour ────────────────────────────
  cron.schedule("0 * * * *", async () => {
    try {
      await query(
        `UPDATE payments SET status = 'failed'
         WHERE status = 'pending'
           AND created_at < NOW() - INTERVAL '2 hours'`
      );
    } catch (err) {
      console.error("Stale payment cleanup error:", err.message);
    }
  });

  console.log("⏰ Cron jobs started");
}

module.exports = { startCronJobs };
