// src/routes/pitches.js — Seller replies to buyer requests ("I Have This")
const express = require("express");
const { query } = require("../db/pool");
const { requireAuth, requireSeller } = require("../middleware/auth");
const { initializeTransaction, verifyTransaction } = require("../services/paystack.service");
const router = express.Router();

// ── POST /api/pitches — Seller pitches to a buyer request ────────────────────
// Seller writes a short pitch (max 200 chars, no contact info)
// Buyer gets notified and can accept — revealing the seller's contact
router.post("/", requireAuth, requireSeller, async (req, res, next) => {
  try {
    const { request_id, message, price } = req.body;
    if (!request_id || !message) return res.status(400).json({ error: "request_id and message are required" });
    if (message.length > 200) return res.status(400).json({ error: "Pitch must be 200 characters or less" });

    // Check the request exists and is active
    const { rows: reqRows } = await query(
      `SELECT * FROM buyer_requests WHERE id=$1 AND status='active'`, [request_id]
    );
    if (!reqRows.length) return res.status(404).json({ error: "Buyer request not found or no longer active" });

    const buyerReq = reqRows[0];
    if (buyerReq.user_id === req.user.id) return res.status(400).json({ error: "Cannot pitch to your own request" });

    // Check seller hasn't already pitched on this request
    const { rows: existing } = await query(
      `SELECT id FROM seller_pitches WHERE request_id=$1 AND seller_id=$2`,
      [request_id, req.user.id]
    );
    if (existing.length) return res.status(409).json({ error: "You have already pitched on this request" });

    // Insert pitch
    const { rows: pitchRows } = await query(
      `INSERT INTO seller_pitches (request_id,seller_id,message,price) VALUES ($1,$2,$3,$4) RETURNING *`,
      [request_id, req.user.id, message.trim(), price || null]
    );
    const pitch = pitchRows[0];

    // Notify buyer
    await query(
      `INSERT INTO notifications (user_id,type,title,body,data) VALUES ($1,'new_pitch','New pitch on your request!',$2,$3)`,
      [buyerReq.user_id, `${req.user.name} pitched on "${buyerReq.title}"`, JSON.stringify({ request_id, pitch_id: pitch.id })]
    );

    const io = req.app?.get("io");
    if (io) io.to(`user:${buyerReq.user_id}`).emit("notification", { type: "new_pitch", title: "New pitch received!", data: { request_id, pitch_id: pitch.id } });

    res.status(201).json({ ok: true, pitch });
  } catch (err) { next(err); }
});

// ── POST /api/pitches/:id/accept — Buyer accepts pitch, pays KSh 260 ─────────
// Reveals seller contact; payment required unless voucher makes it free
router.post("/:id/accept", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, phone, voucher_code } = req.body;

    // Get pitch with request info
    const { rows: pitchRows } = await query(
      `SELECT p.*, r.user_id AS buyer_id, r.title AS request_title, r.description AS request_description
       FROM seller_pitches p
       JOIN buyer_requests r ON r.id=p.request_id
       WHERE p.id=$1`,
      [id]
    );
    if (!pitchRows.length) return res.status(404).json({ error: "Pitch not found" });
    const pitch = pitchRows[0];
    if (pitch.buyer_id !== req.user.id) return res.status(403).json({ error: "Not your request" });
    if (pitch.status !== "pending") return res.status(400).json({ error: "Pitch already responded to" });

    // Check for existing confirmed payment on this pitch
    const { rows: existingPay } = await query(
      `SELECT id FROM payments WHERE listing_id IS NULL AND payer_id=$1 AND status='confirmed'
      AND mpesa_receipt LIKE 'WS-PITCH-%'`,
      [req.user.id]
    );

    // Check voucher
    let discountPct = 0;
    let voucherRow = null;
    if (voucher_code) {
      const { rows: vrows } = await query(
        `SELECT * FROM vouchers WHERE code=$1 AND active=true
        AND (expires_at IS NULL OR expires_at > NOW()) AND uses < max_uses`,
        [voucher_code.toUpperCase()]
      );
      if (vrows.length) { voucherRow = vrows[0]; discountPct = vrows[0].discount_percent || 0; }
    }

    const PITCH_FEE = 260;
    const finalAmount = Math.max(0, Math.round(PITCH_FEE * (1 - discountPct / 100)));

    // Free via voucher
    if (finalAmount === 0) {
      if (voucherRow) await query(`UPDATE vouchers SET uses=uses+1 WHERE id=$1`, [voucherRow.id]);
      await query(`UPDATE seller_pitches SET status='accepted', accepted_at=NOW() WHERE id=$1`, [id]);

      // Get seller's contact info
      const { rows: seller } = await query(`SELECT name,phone,email,anon_tag FROM users WHERE id=$1`, [pitch.seller_id]);

      // Notify seller
      await query(
        `INSERT INTO notifications (user_id,type,title,body,data) VALUES ($1,'pitch_accepted','Your pitch was accepted!',$2,$3)`,
        [pitch.seller_id, `A buyer accepted your pitch on "${pitch.request_title}". They now have your contact details.`, JSON.stringify({ request_id: pitch.request_id, pitch_id: id })]
      );
      const io = req.app?.get("io");
      if (io) io.to(`user:${pitch.seller_id}`).emit("notification", { type: "pitch_accepted", title: "Your pitch was accepted!", data: { pitch_id: id } });

      return res.json({ ok: true, unlocked: true, seller_contact: { name: seller[0].name, phone: seller[0].phone, email: seller[0].email } });
    }

    if (!email) return res.status(400).json({ error: "email is required for paid reveal" });

    // Generate Paystack reference
    const reference = `WS-PITCH-${id.slice(0,8).toUpperCase()}-${Date.now()}`;

    // Create payment record
    const { rows: payRow } = await query(
      `INSERT INTO payments (payer_id,type,amount_kes,mpesa_phone,mpesa_receipt,status,pitch_id) VALUES ($1,'pitch_reveal',$2,$3,$4,'pending',$5) RETURNING id`,
      [req.user.id, finalAmount, phone || '', reference, id]
    );
    const paymentId = payRow[0].id;
    if (voucherRow) await query(`UPDATE vouchers SET uses=uses+1 WHERE id=$1`, [voucherRow.id]);

    // Initialize Paystack transaction
    const paystackResult = await initializeTransaction({
      email,
      amount: finalAmount,
      phone: phone || '',
      reference,
      description: `Reveal seller contact for: ${pitch.request_title}`,
      metadata: { payment_id: paymentId, pitch_id: id, type: 'pitch_reveal', request_id: pitch.request_id }
    });

    res.json({
      message: "Payment initialized. Complete payment on the checkout page.",
      authorization_url: paystackResult.authorization_url,
      reference: paystackResult.reference,
      paymentId,
      finalAmount,
    });
  } catch (err) { next(err); }
});

// ── POST /api/pitches/:id/decline — Buyer declines a pitch ───────────────────
router.post("/:id/decline", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: pitchRows } = await query(
      `SELECT p.*, r.user_id AS buyer_id FROM seller_pitches p JOIN buyer_requests r ON r.id=p.request_id WHERE p.id=$1`, [id]
    );
    if (!pitchRows.length) return res.status(404).json({ error: "Pitch not found" });
    if (pitchRows[0].buyer_id !== req.user.id) return res.status(403).json({ error: "Not your request" });
    await query(`UPDATE seller_pitches SET status='declined' WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/pitches/mine — Seller sees their own pitches ────────────────────
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, r.title AS request_title, r.description AS request_description,
      r.budget, r.county AS request_county
      FROM seller_pitches p JOIN buyer_requests r ON r.id=p.request_id
      WHERE p.seller_id=$1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/pitches/for-me — Buyer sees pitches on their requests ───────────
router.get("/for-me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, r.title AS request_title, u.name AS seller_name, u.anon_tag AS seller_anon_tag,
      EXISTS (SELECT 1 FROM payments WHERE payer_id=$1 AND pitch_id=p.id AND status='confirmed') AS paid
      FROM seller_pitches p
      JOIN buyer_requests r ON r.id=p.request_id
      JOIN users u ON u.id=p.seller_id
      WHERE r.user_id=$1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
