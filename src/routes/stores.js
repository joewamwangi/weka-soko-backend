// src/routes/stores.js — Weka Soko Malls (Store Storefronts)
const express = require("express");
const multer = require("multer");
const { query, withTransaction } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { uploadBuffer, deleteByPublicId } = require("../services/cloudinary.service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// ── helpers ───────────────────────────────────────────────────────────────────
function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let suffix = 0;
  while (true) {
    const candidate = suffix ? `${slug}-${suffix}` : slug;
    const { rows } = await query(`SELECT id FROM stores WHERE slug=$1`, [candidate]);
    if (!rows.length) return candidate;
    suffix++;
  }
}

// ── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// GET /api/stores — directory of active stores
router.get("/", async (req, res, next) => {
  try {
    const { category, county, q, limit = 24, offset = 0 } = req.query;
    const conditions = [`s.status = 'active'`];
    const params = [];
    if (category) { params.push(category); conditions.push(`s.category = $${params.length}`); }
    if (county)   { params.push(county);   conditions.push(`s.county   = $${params.length}`); }
    if (q)        { params.push(`%${q}%`); conditions.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length} OR s.tagline ILIKE $${params.length})`); }
    const where = conditions.join(" AND ");
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await query(
      `SELECT s.*, u.anon_tag AS owner_anon,
         (SELECT COUNT(*) FROM listings l WHERE l.store_id=s.id AND l.status='active') AS active_listing_count
       FROM stores s
       JOIN users u ON u.id=s.owner_id
       WHERE ${where}
       ORDER BY s.is_verified DESC, s.view_count DESC, s.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    const { rows: ct } = await query(
      `SELECT COUNT(*) FROM stores s WHERE ${where}`,
      params.slice(0, params.length - 2)
    );
    res.json({ stores: rows, total: parseInt(ct[0].count) });
  } catch (err) { next(err); }
});

// GET /api/stores/featured — up to 8 verified stores for homepage widget
router.get("/featured", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.slug, s.name, s.tagline, s.logo_url, s.category, s.county, s.is_verified,
         (SELECT COUNT(*) FROM listings l WHERE l.store_id=s.id AND l.status='active') AS active_listing_count
       FROM stores s WHERE s.status='active' AND s.is_verified=TRUE
       ORDER BY s.view_count DESC LIMIT 8`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/stores/:slug — single store (public)
router.get("/:slug", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, u.anon_tag AS owner_anon, u.avg_rating AS owner_rating, u.review_count AS owner_reviews
       FROM stores s JOIN users u ON u.id=s.owner_id
       WHERE s.slug=$1 AND s.status='active'`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: "Store not found" });
    // increment view count (fire-and-forget)
    query(`UPDATE stores SET view_count=view_count+1 WHERE id=$1`, [rows[0].id]).catch(()=>{});
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/stores/:slug/listings — store's active listings (public)
router.get("/:slug/listings", async (req, res, next) => {
  try {
    const { page = 1, limit = 24, category, sort = "newest" } = req.query;
    const { rows: storeRows } = await query(
      `SELECT id FROM stores WHERE slug=$1 AND status='active'`, [req.params.slug]
    );
    if (!storeRows.length) return res.status(404).json({ error: "Store not found" });
    const storeId = storeRows[0].id;
    const conditions = [`l.store_id=$1`, `l.status='active'`];
    const params = [storeId];
    if (category) { params.push(category); conditions.push(`l.category=$${params.length}`); }
    const orderMap = { newest:"l.created_at DESC", price_asc:"l.price ASC", price_desc:"l.price DESC", popular:"l.view_count DESC" };
    const order = orderMap[sort] || "l.created_at DESC";
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
    const { rows } = await query(
      `SELECT l.*,
         COALESCE((SELECT json_agg(lp.url ORDER BY lp.sort_order) FROM listing_photos lp WHERE lp.listing_id=l.id),'[]'::json) AS photos
       FROM listings l
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${order}
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    const { rows: ct } = await query(
      `SELECT COUNT(*) FROM listings l WHERE ${conditions.join(" AND ")}`,
      params.slice(0, params.length-2)
    );
    res.json({ listings: rows, total: parseInt(ct[0].count) });
  } catch (err) { next(err); }
});

// ── AUTHENTICATED ROUTES ──────────────────────────────────────────────────────

// GET /api/stores/mine/store — get my store
router.get("/mine/store", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.* FROM stores s WHERE s.owner_id=$1`, [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "No store yet" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/stores — create my store
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const existing = await query(`SELECT id FROM stores WHERE owner_id=$1`, [req.user.id]);
    if (existing.rows.length) return res.status(409).json({ error: "You already have a store" });
    const { name, tagline, description, category, location, county, phone, whatsapp, website, instagram, facebook } = req.body;
    if (!name) return res.status(400).json({ error: "Store name is required" });
    const slug = await uniqueSlug(name);
    const { rows } = await query(
      `INSERT INTO stores (owner_id,slug,name,tagline,description,category,location,county,phone,whatsapp,website,instagram,facebook,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
       RETURNING *`,
      [req.user.id, slug, name, tagline||null, description||null, category||null,
       location||null, county||null, phone||null, whatsapp||null, website||null,
       instagram||null, facebook||null]
    );
    const store = rows[0];
    // Link store to user
    await query(`UPDATE users SET store_id=$1 WHERE id=$2`, [store.id, req.user.id]);
    res.status(201).json(store);
  } catch (err) { next(err); }
});

// PATCH /api/stores/mine — update my store info
router.patch("/mine", requireAuth, async (req, res, next) => {
  try {
    const { rows: storeRows } = await query(`SELECT id FROM stores WHERE owner_id=$1`, [req.user.id]);
    if (!storeRows.length) return res.status(404).json({ error: "No store found" });
    const storeId = storeRows[0].id;
    const allowed = ["name","tagline","description","category","location","county","phone","whatsapp","website","instagram","facebook"];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key] || null);
        updates.push(`${key}=$${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    params.push(new Date().toISOString(), storeId);
    const { rows } = await query(
      `UPDATE stores SET ${updates.join(",")}, updated_at=$${params.length-1} WHERE id=$${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/stores/mine/logo — upload logo
router.post("/mine/logo", requireAuth, upload.single("logo"), async (req, res, next) => {
  try {
    const { rows: storeRows } = await query(`SELECT id, logo_url FROM stores WHERE owner_id=$1`, [req.user.id]);
    if (!storeRows.length) return res.status(404).json({ error: "No store found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const storeId = storeRows[0].id;
    const { url } = await uploadBuffer(req.file.buffer, { folder: "weka-soko/stores/logos" });
    await query(`UPDATE stores SET logo_url=$1, updated_at=NOW() WHERE id=$2`, [url, storeId]);
    res.json({ logo_url: url });
  } catch (err) { next(err); }
});

// POST /api/stores/mine/banner — upload banner
router.post("/mine/banner", requireAuth, upload.single("banner"), async (req, res, next) => {
  try {
    const { rows: storeRows } = await query(`SELECT id, banner_url FROM stores WHERE owner_id=$1`, [req.user.id]);
    if (!storeRows.length) return res.status(404).json({ error: "No store found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const storeId = storeRows[0].id;
    const { url } = await uploadBuffer(req.file.buffer, { folder: "weka-soko/stores/banners" });
    await query(`UPDATE stores SET banner_url=$1, updated_at=NOW() WHERE id=$2`, [url, storeId]);
    res.json({ banner_url: url });
  } catch (err) { next(err); }
});

module.exports = router;
