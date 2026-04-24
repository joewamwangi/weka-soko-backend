// src/routes/requests.js — What Buyers Want
const express = require("express");
const multer = require("multer");
const { query } = require("../db/pool");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { detectContactInfo } = require("../services/moderation.service");
const { uploadBuffer } = require("../services/cloudinary.service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 4 } });

// ── GET /api/requests ──────────────────────────────────────────────────────
// List all active buyer requests (paginated)
router.get("/", optionalAuth, async (req, res, next) => {
try {
const { county, search, category, subcat, min_price, max_price, sort = 'newest' } = req.query;
let { page = 1, limit = 20 } = req.query;
page = parseInt(page, 10);
limit = parseInt(limit, 10);
if (!page || isNaN(page) || page < 1) page = 1;
if (!limit || isNaN(limit) || limit < 1 || limit > 100) limit = 20;
const offset = (page - 1) * limit;
const params = [];
const conditions = ["r.status = 'active'"];

    if (county) { params.push(county); conditions.push(`r.county ILIKE $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`); }
    if (category) { params.push(category); conditions.push(`r.category ILIKE $${params.length}`); }
    if (subcat) { params.push(subcat); conditions.push(`r.subcat ILIKE $${params.length}`); }
    if (min_price) { params.push(parseFloat(min_price)); conditions.push(`(r.budget IS NULL OR r.budget >= $${params.length})`); }
    if (max_price) { params.push(parseFloat(max_price)); conditions.push(`(r.budget IS NULL OR r.budget <= $${params.length})`); }

    const sortMap = { newest: 'r.created_at DESC', oldest: 'r.created_at ASC', budget_asc: 'r.budget ASC NULLS LAST', budget_desc: 'r.budget DESC NULLS LAST' };
    const orderBy = sortMap[sort] || 'r.created_at DESC';

    const where = "WHERE " + conditions.join(" AND ");
    params.push(parseInt(limit), offset);

    const { rows } = await query(
      `SELECT r.*, u.anon_tag AS requester_anon,
        (SELECT COUNT(*) FROM listings l
         WHERE l.status = 'active'
         AND l.expires_at > NOW()
         AND (l.title ILIKE '%' || r.title || '%' OR l.description ILIKE '%' || r.title || '%')) AS matching_listings
       FROM buyer_requests r
       JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: cnt } = await query(
      `SELECT COUNT(*) FROM buyer_requests r ${where}`,
      params.slice(0, -2)
    );

    res.json({ requests: rows, total: parseInt(cnt[0].count), page });
  } catch (err) { next(err); }
});

// ── POST /api/requests ─────────────────────────────────────────────────────
// Create a new buyer request + notify matching sellers
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { title, description, budget, county, category, subcat, keywords, min_price, max_price } = req.body;
    if (!title || !description) return res.status(400).json({ error: "Title and description are required" });
    if (title.length > 120) return res.status(400).json({ error: "Title too long (max 120 chars)" });

    // Contact info scan
    for (const [field, val] of [["title", title], ["description", description]]) {
      if (val) {
        const r = detectContactInfo(val);
        if (r.blocked) return res.status(422).json({ error: `"${field}" contains contact info (${r.reason}). Remove it to proceed.` });
      }
    }

    const { rows } = await query(
      `INSERT INTO buyer_requests
         (user_id, title, description, budget, county, category, subcat, keywords, min_price, max_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_review') RETURNING *`,
      [req.user.id, title.trim(), description.trim(),
       budget ? parseFloat(budget) : null, county || null,
       category || null, subcat || null, keywords || null,
       min_price ? parseFloat(min_price) : null,
       max_price ? parseFloat(max_price) : null]
    );
    const request = rows[0];
    res.status(201).json({ ...request, message: "Your request has been submitted and is pending review. It will go live once approved." });
  } catch (err) { next(err); }
});

// ── PATCH /api/requests/:id ────────────────────────────────────────────────
// Edit own request (buyer can edit their own request)
router.patch("/:id", requireAuth, async (req, res, next) => {
 try {
 const { title, description, budget, county, category, subcat } = req.body;
 const { rows } = await query(`SELECT user_id, status FROM buyer_requests WHERE id = $1`, [req.params.id]);
 if (!rows.length) return res.status(404).json({ error: "Request not found" });
 if (rows[0].user_id !== req.user.id && req.user.role !== "admin") {
 return res.status(403).json({ error: "Not your request" });
 }
 if (rows[0].status === 'deleted') return res.status(400).json({ error: "Cannot edit deleted request" });

 // Build update fields
 const updates = [];
 const params = [];
 let paramIdx = 1;

 if (title !== undefined) { updates.push(`title = $${paramIdx++}`); params.push(title.trim()); }
 if (description !== undefined) { updates.push(`description = $${paramIdx++}`); params.push(description.trim()); }
 if (budget !== undefined) { updates.push(`budget = $${paramIdx++}`); params.push(budget ? parseFloat(budget) : null); }
 if (county !== undefined) { updates.push(`county = $${paramIdx++}`); params.push(county || null); }
 if (category !== undefined) { updates.push(`category = $${paramIdx++}`); params.push(category || null); }
 if (subcat !== undefined) { updates.push(`subcat = $${paramIdx++}`); params.push(subcat || null); }

 if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

 updates.push(`updated_at = NOW()`);
 params.push(req.params.id);

 const { rows: updated } = await query(
 `UPDATE buyer_requests SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
 params
 );
 res.json(updated[0]);
 } catch (err) { next(err); }
});

// ── DELETE /api/requests/:id ───────────────────────────────────────────────
// Delete own request (or admin can delete any)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT user_id FROM buyer_requests WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Request not found" });
    if (rows[0].user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not your request" });
    }
    await query(`UPDATE buyer_requests SET status = 'deleted' WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/requests/mine ─────────────────────────────────────────────────
// Get current user's own requests
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM buyer_requests WHERE user_id = $1 AND status != 'deleted' ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/requests/:id ──────────────────────────────────────────────────
// Get a single buyer request by ID
router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.anon_tag AS requester_anon,
        (SELECT COUNT(*) FROM listings l
         WHERE l.status = 'active' AND l.expires_at > NOW()
         AND (l.title ILIKE '%' || r.title || '%' OR l.description ILIKE '%' || r.title || '%')) AS matching_listings
       FROM buyer_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1 AND r.status != 'deleted'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Request not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/requests/:id/photos ──────────────────────────────────────────
// Upload up to 4 photos for a buyer request (owner only)
router.post("/:id/photos", requireAuth, upload.array("photos", 4), async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM buyer_requests WHERE id = $1 AND status != 'deleted'`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Request not found" });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: "Not your request" });
    if (!req.files || !req.files.length) return res.status(400).json({ error: "No files uploaded" });

    const existing = Array.isArray(rows[0].photos) ? rows[0].photos : [];
    const uploads = await Promise.all(
      req.files.map(f => uploadBuffer(f.buffer, { folder: `weka-soko/requests/${req.params.id}` }))
    );
    const updated = [...existing, ...uploads.map(u => u.url)].slice(0, 4);
    await query(`UPDATE buyer_requests SET photos = $1 WHERE id = $2`, [JSON.stringify(updated), req.params.id]);
    res.json({ photos: updated });
  } catch (err) { next(err); }
});

module.exports = router;
