// ── AD MODERATION ROUTES ─────────────────────────────────────────────────────
// Append these routes to src/routes/admin.js (before module.exports = router)
// Endpoints:
//   GET  /api/admin/moderation/queue           — fetch pending_review listings
//   POST /api/admin/moderation/:id/approve     — approve (→ active) + notify seller
//   POST /api/admin/moderation/:id/reject      — reject (→ rejected) + notify seller
//   POST /api/admin/moderation/:id/request-changes — ask seller to edit + notify

const { sendEmail } = require("../services/email.service");
const FRONTEND = process.env.FRONTEND_URL || "https://weka-soko.vercel.app";

// ── GET /api/admin/moderation/queue ─────────────────────────────────────────
router.get("/moderation/queue", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         l.id, l.title, l.description, l.reason_for_sale,
         l.category, l.subcat, l.price, l.location, l.county,
         l.status, l.created_at,
         u.name AS seller_name, u.email AS seller_email,
         COALESCE(
           (SELECT json_agg(lp.url ORDER BY lp.sort_order)
            FROM listing_photos lp WHERE lp.listing_id = l.id),
           '[]'
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
router.post("/moderation/:id/approve", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check listing exists and is pending
    const { rows: check } = await query(
      `SELECT l.id, l.title, l.seller_id, u.name, u.email
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = $1`,
      [id]
    );
    if (!check.length) return res.status(404).json({ error: "Listing not found" });
    const listing = check[0];

    // Approve: set status to active
    await query(
      `UPDATE listings SET status='active', updated_at=NOW() WHERE id=$1`,
      [id]
    );

    // Notify seller in-app
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'listing_approved', '✅ Ad Approved!', $2, $3)`,
      [
        listing.seller_id,
        `Great news! Your listing "${listing.title}" has been approved and is now live on Weka Soko.`,
        JSON.stringify({ listing_id: id })
      ]
    ).catch(() => {});

    // Push real-time notification if socket available
    const io = req.app?.get("io");
    if (io) {
      io.to(`user:${listing.seller_id}`).emit("notification", {
        type: "listing_approved",
        title: "✅ Ad Approved!",
        body: `Your listing "${listing.title}" is now live!`,
        data: { listing_id: id }
      });
    }

    // Email seller
    sendEmail(
      listing.email, listing.name,
      "✅ Your ad is live on Weka Soko!",
      `Hi ${listing.name},\n\nGreat news! Your listing "${listing.title}" has been reviewed and approved.\n\nIt's now visible to all buyers on Weka Soko:\n${FRONTEND}\n\nGood luck with your sale!\n\n— Weka Soko`
    ).catch(e => console.error("[Moderation approve email]", e.message));

    console.log(`[Moderation] Approved listing ${id} by ${listing.seller_name}`);
    res.json({ ok: true, message: "Listing approved and live" });
  } catch (err) { next(err); }
});

// ── POST /api/admin/moderation/:id/reject ────────────────────────────────────
router.post("/moderation/:id/reject", async (req, res, next) => {
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

    // Reject: set status + store reason
    await query(
      `UPDATE listings SET status='rejected', moderation_note=$1, updated_at=NOW() WHERE id=$2`,
      [reason.trim(), id]
    );

    // Notify seller in-app
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'listing_rejected', '❌ Ad Not Approved', $2, $3)`,
      [
        listing.seller_id,
        `Your listing "${listing.title}" was not approved. Reason: ${reason.trim()}`,
        JSON.stringify({ listing_id: id, reason: reason.trim() })
      ]
    ).catch(() => {});

    // Real-time push
    const io = req.app?.get("io");
    if (io) {
      io.to(`user:${listing.seller_id}`).emit("notification", {
        type: "listing_rejected",
        title: "❌ Ad Not Approved",
        body: `"${listing.title}" — ${reason.trim().slice(0, 80)}`,
        data: { listing_id: id }
      });
    }

    // Email seller
    sendEmail(
      listing.email, listing.name,
      "❌ Your Weka Soko ad was not approved",
      `Hi ${listing.name},\n\nUnfortunately your listing "${listing.title}" was not approved.\n\nReason: ${reason.trim()}\n\nYou can edit the listing and resubmit it for review at:\n${FRONTEND}\n\nIf you have questions, contact support@wekasoko.co.ke\n\n— Weka Soko`
    ).catch(e => console.error("[Moderation reject email]", e.message));

    console.log(`[Moderation] Rejected listing ${id}: ${reason}`);
    res.json({ ok: true, message: "Listing rejected, seller notified" });
  } catch (err) { next(err); }
});

// ── POST /api/admin/moderation/:id/request-changes ──────────────────────────
router.post("/moderation/:id/request-changes", async (req, res, next) => {
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

    // Keep as pending_review but store the note — seller will re-edit and it stays in queue
    await query(
      `UPDATE listings SET moderation_note=$1, updated_at=NOW() WHERE id=$2`,
      [note.trim(), id]
    );

    // Notify seller
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'listing_changes_requested', '✏️ Changes Needed on Your Ad', $2, $3)`,
      [
        listing.seller_id,
        `Your listing "${listing.title}" needs some changes before it can go live. Note: ${note.trim()}`,
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
      `Hi ${listing.name},\n\nYour listing "${listing.title}" needs a few changes before it can go live.\n\nNote from our team: ${note.trim()}\n\nPlease edit your listing at:\n${FRONTEND}\n\nOnce updated, it will be re-reviewed automatically.\n\n— Weka Soko`
    ).catch(e => console.error("[Moderation changes email]", e.message));

    console.log(`[Moderation] Changes requested for listing ${id}`);
    res.json({ ok: true, message: "Change request sent to seller" });
  } catch (err) { next(err); }
});
