// src/routes/admin_moderation.js
// Mount in src/index.js with:  app.use("/api/admin/moderation", require("./routes/admin_moderation"));
// Or append the router lines to admin.js — see INTEGRATION NOTE at bottom.

const express = require("express");
const router  = express.Router();
const { query } = require("../db/pool");
const { sendEmail } = require("../services/email.service");

const FRONTEND = process.env.FRONTEND_URL || "https://weka-soko.vercel.app";

// ── GET /api/admin/moderation/queue ─────────────────────────────────────────
router.get("/queue", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         l.id, l.title, l.description, l.reason_for_sale,
         l.category, l.subcat, l.price, l.location, l.county,
         l.status, l.moderation_note, l.created_at,
         u.id AS seller_id, u.name AS seller_name, u.email AS seller_email,
         COALESCE(
           (SELECT json_agg(lp.url ORDER BY lp.sort_order)
            FROM listing_photos lp WHERE lp.listing_id = l.id),
           '[]'::json
         ) AS photos
       FROM listings l
       JOIN users u ON u.id = l.seller_id
       WHERE l.status = 'pending_review'
       ORDER BY l.created_at ASC`,
      []
    );
    res.json({ listings: rows, total: rows.length });
  } catch (err) { next(err); }
});

// ── POST /api/admin/moderation/:id/approve ───────────────────────────────────
router.post("/:id/approve", async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: check } = await query(
      `SELECT l.id, l.title, l.seller_id, u.name, u.email
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = $1`,
      [id]
    );
    if (!check.length) return res.status(404).json({ error: "Listing not found" });
    const listing = check[0];

    await query(
      `UPDATE listings SET status='active', moderation_note=NULL, reviewed_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id]
    );

    // In-app notification
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'listing_approved', '✅ Ad Approved!', $2, $3)`,
      [
        listing.seller_id,
        `Great news! Your listing "${listing.title}" has been approved and is now live on Weka Soko.`,
        JSON.stringify({ listing_id: id })
      ]
    ).catch(() => {});

    // Real-time push via Socket.io (attached to app instance)
    const io = req.app?.get("io");
    if (io) {
      io.to(`user:${listing.seller_id}`).emit("notification", {
        type: "listing_approved",
        title: "✅ Ad Approved!",
        body: `Your listing "${listing.title}" is now live!`,
        data: { listing_id: id }
      });
    }

    // Email
    sendEmail(
      listing.email, listing.name,
      "✅ Your ad is live on Weka Soko!",
      `Hi ${listing.name},\n\nGreat news! Your listing "${listing.title}" has been reviewed and approved.\n\nIt's now visible to all buyers:\n${FRONTEND}\n\nGood luck with your sale!\n\n— Weka Soko`
    ).catch(e => console.error("[Moderation approve email]", e.message));

    console.log(`[Moderation] Approved listing ${id}`);
    res.json({ ok: true, message: "Listing approved and live" });
  } catch (err) { next(err); }
});

// ── POST /api/admin/moderation/:id/reject ────────────────────────────────────
router.post("/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: "Rejection reason is required" });

    const { rows: check } = await query(
      `SELECT l.id, l.title, l.seller_id, u.name, u.email
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = $1`,
      [id]
    );
    if (!check.length) return res.status(404).json({ error: "Listing not found" });
    const listing = check[0];

    await query(
      `UPDATE listings SET status='rejected', moderation_note=$1, reviewed_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [reason.trim(), id]
    );

    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'listing_rejected', '❌ Ad Not Approved', $2, $3)`,
      [
        listing.seller_id,
        `Your listing "${listing.title}" was not approved. Reason: ${reason.trim()}`,
        JSON.stringify({ listing_id: id, reason: reason.trim() })
      ]
    ).catch(() => {});

    const io = req.app?.get("io");
    if (io) {
      io.to(`user:${listing.seller_id}`).emit("notification", {
        type: "listing_rejected",
        title: "❌ Ad Not Approved",
        body: `"${listing.title}" — ${reason.trim().slice(0, 80)}`,
        data: { listing_id: id }
      });
    }

    sendEmail(
      listing.email, listing.name,
      "❌ Your Weka Soko ad was not approved",
      `Hi ${listing.name},\n\nUnfortunately your listing "${listing.title}" was not approved.\n\nReason: ${reason.trim()}\n\nYou can edit your listing and resubmit it at:\n${FRONTEND}\n\nQuestions? Contact support@wekasoko.co.ke\n\n— Weka Soko`
    ).catch(e => console.error("[Moderation reject email]", e.message));

    console.log(`[Moderation] Rejected listing ${id}: ${reason}`);
    res.json({ ok: true, message: "Listing rejected, seller notified" });
  } catch (err) { next(err); }
});

// ── POST /api/admin/moderation/:id/request-changes ──────────────────────────
router.post("/:id/request-changes", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: "Change request note is required" });

    const { rows: check } = await query(
      `SELECT l.id, l.title, l.seller_id, u.name, u.email
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = $1`,
      [id]
    );
    if (!check.length) return res.status(404).json({ error: "Listing not found" });
    const listing = check[0];

    // Keep as pending_review but store the note so seller can see what to fix
    await query(
      `UPDATE listings SET moderation_note=$1, updated_at=NOW() WHERE id=$2`,
      [note.trim(), id]
    );

    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'listing_changes_requested', '✏️ Changes Needed on Your Ad', $2, $3)`,
      [
        listing.seller_id,
        `Your listing "${listing.title}" needs changes before it can go live. Note: ${note.trim()}`,
        JSON.stringify({ listing_id: id, note: note.trim() })
      ]
    ).catch(() => {});

    const io = req.app?.get("io");
    if (io) {
      io.to(`user:${listing.seller_id}`).emit("notification", {
        type: "listing_changes_requested",
        title: "✏️ Changes Needed",
        body: `"${listing.title}" — ${note.trim().slice(0, 80)}`,
        data: { listing_id: id }
      });
    }

    sendEmail(
      listing.email, listing.name,
      "✏️ Changes needed on your Weka Soko ad",
      `Hi ${listing.name},\n\nYour listing "${listing.title}" needs a few changes before going live.\n\nNote from our team: ${note.trim()}\n\nPlease edit your listing at:\n${FRONTEND}\n\nOnce updated it will be re-reviewed automatically.\n\n— Weka Soko`
    ).catch(e => console.error("[Moderation changes email]", e.message));

    console.log(`[Moderation] Changes requested for listing ${id}`);
    res.json({ ok: true, message: "Change request sent to seller" });
  } catch (err) { next(err); }
});

module.exports = router;

/*
── INTEGRATION NOTE ─────────────────────────────────────────────────────────────
In src/index.js, add this line alongside your other route registrations:

  const moderationRoutes = require("./routes/admin_moderation");
  app.use("/api/admin/moderation", moderationRoutes);

Place it near the other admin route:
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin/moderation", moderationRoutes);  // ← add this line
────────────────────────────────────────────────────────────────────────────────
*/
