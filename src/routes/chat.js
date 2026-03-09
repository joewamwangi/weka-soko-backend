// src/routes/chat.js  — REST endpoints for chat history only
const express = require("express");
const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/chat/threads/mine ────────────────────────────────────────────────
// Returns all listings where the user has sent or received a message
router.get("/threads/mine", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT ON (l.id)
        l.id AS listing_id, l.title, l.price, l.status, l.seller_id, l.is_unlocked, l.locked_buyer_id,
        m.body AS last_message, m.created_at AS last_message_at,
        (SELECT COUNT(*) FROM chat_messages WHERE listing_id = l.id AND sender_id != $1 AND is_read = FALSE) AS unread_count,
        COALESCE(other_u.anon_tag, 'User') AS other_party_anon,
        other_u.id AS other_user_id,
        other_u.is_online,
        other_u.last_seen
       FROM listings l
       JOIN chat_messages m ON m.listing_id = l.id
       LEFT JOIN users other_u ON other_u.id = CASE WHEN l.seller_id = $1 THEN m.sender_id ELSE l.seller_id END
       WHERE (l.seller_id = $1 OR m.sender_id = $1 OR m.receiver_id = $1)
         AND other_u.id IS NOT NULL AND other_u.id != $1
       ORDER BY l.id, m.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/chat/:listingId ──────────────────────────────────────────────────
router.get("/:listingId", requireAuth, async (req, res, next) => {
  try {
    const { listingId } = req.params;

    const { rows: listing } = await query(
      `SELECT seller_id, locked_buyer_id FROM listings WHERE id = $1`,
      [listingId]
    );
    if (!listing.length) return res.status(404).json({ error: "Listing not found" });

    const l = listing[0];
    const isSeller = l.seller_id === req.user.id;
    const isBuyer = l.locked_buyer_id === req.user.id;

    // Check if user has sent or received any message on this listing
    const { rows: hasMsg } = await query(
      `SELECT 1 FROM chat_messages WHERE listing_id = $1 AND (sender_id = $2 OR receiver_id = $2) LIMIT 1`,
      [listingId, req.user.id]
    );

    if (!isSeller && !isBuyer && !hasMsg.length && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows } = await query(
      `SELECT m.id, m.sender_id, m.body, m.is_blocked, m.block_reason, m.is_read, m.created_at,
              -- Show listing-specific anon tag: seller appears as the listing's unique identity
              CASE WHEN m.sender_id = l.seller_id
                THEN COALESCE(l.listing_anon_tag, 'Seller_' || upper(substring(md5(l.id::text), 1, 6)))
                ELSE COALESCE(u.anon_tag, 'Buyer_' || upper(substring(md5(u.id::text), 1, 6)))
              END AS sender_anon,
              CASE WHEN m.sender_id = $1 THEN 'me' ELSE 'them' END AS direction
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN listings l ON l.id = m.listing_id
       WHERE m.listing_id = $2
       ORDER BY m.created_at ASC`,
      [req.user.id, listingId]
    );

    await query(
      `UPDATE chat_messages SET is_read = TRUE WHERE listing_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [listingId, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/chat/presence/:userId ───────────────────────────────────────────
// Get online status + last seen for a user (for inbox display)
router.get("/presence/:userId", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT is_online, last_seen FROM users WHERE id = $1`,
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/chat/presence/bulk ───────────────────────────────────────────────
// Get presence for multiple users at once (pass ?ids=uuid1,uuid2,...)
router.get("/presence", requireAuth, async (req, res, next) => {
  try {
    const ids = (req.query.ids || "").split(",").filter(Boolean).slice(0, 50);
    if (!ids.length) return res.json({});
    const { rows } = await query(
      `SELECT id, is_online, last_seen FROM users WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    const map = {};
    rows.forEach(r => { map[r.id] = { is_online: r.is_online, last_seen: r.last_seen }; });
    res.json(map);
  } catch (err) { next(err); }
});

// ── GET /api/chat/presence/:userId ───────────────────────────────────────────
// Get online status and last seen for a user
router.get("/presence/:userId", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT is_online, last_seen FROM users WHERE id = $1`,
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/chat/threads/mine ─── already defined above ─────────────────────

module.exports = router;
