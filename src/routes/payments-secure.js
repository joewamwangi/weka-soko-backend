// src/routes/payments.js — Secure payment handling with idempotency
const express = require("express");
const crypto = require("crypto");
const { query, withTransaction } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { initializeTransaction, verifyTransaction, handleWebhook } = require("../services/paystack.service");
const { idempotencyMiddleware, generateIdempotencyKey, validatePaymentAmount } = require("../middleware/idempotency");
const { errors, ERROR_CODES } = require("../middleware/errorHandler");
const { sendPushToUser } = require("./push");
const { sendPaymentConfirmationEmail } = require("../services/notification.service");

const router = express.Router();
const UNLOCK_FEE = parseInt(process.env.UNLOCK_FEE_KES || "260");
const ESCROW_FEE_PCT = parseFloat(process.env.ESCROW_FEE_PERCENT || "5.5") / 100;

// Apply idempotency middleware to all payment routes
router.use(idempotencyMiddleware);

// ── POST /api/payments/unlock ──────────────────────────────────────────────────
// Initialize Paystack payment for unlocking seller contact
router.post("/unlock", requireAuth, async (req, res, next) => {
  const client = await query.pool.connect();
  
  try {
    await client.query('BEGIN');
    const { listing_id, email, voucher_code } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!listing_id) {
      throw errors.badRequest("listing_id is required", ERROR_CODES.MISSING_FIELD);
    }

    // Validate payment amount hasn't been tampered with
    const { rows: listingRows } = await client.query(
      `SELECT l.*, p.id as payment_id 
       FROM listings l 
       LEFT JOIN payments p ON p.listing_id = l.id AND p.type = 'unlock' AND p.status = 'confirmed'
       WHERE l.id = $1 AND l.status != 'deleted'`,
      [listing_id]
    );
    
    if (!listingRows.length) {
      throw errors.notFound("Listing not found", ERROR_CODES.LISTING_NOT_FOUND);
    }
    
    const listing = listingRows[0];
    
    if (listing.payment_id) {
      throw errors.conflict("Payment already confirmed for this listing", ERROR_CODES.ALREADY_UNLOCKED);
    }

    if (listing.seller_id !== userId) {
      throw errors.forbidden("Only the seller can unlock this listing");
    }
    
    if (listing.is_contact_public) {
      throw errors.badRequest("Listing is already unlocked", ERROR_CODES.ALREADY_UNLOCKED);
    }

    // Validate voucher if provided
    let discountPct = 0;
    if (voucher_code) {
      const { rows: vrows } = await client.query(
        `SELECT * FROM vouchers WHERE code = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW()) AND uses < max_uses`,
        [voucher_code.toUpperCase()]
      );
      if (vrows.length) {
        discountPct = parseFloat(vrows[0].discount_percent) || 0;
      }
    }

    // Calculate final amount
    const adminDiscount = parseInt(listing.unlock_discount || 0);
    const baseAmount = Math.max(0, UNLOCK_FEE - adminDiscount);
    const finalAmount = Math.max(0, Math.round(baseAmount * (1 - discountPct / 100)));

    // Validate amount matches expected
    if (finalAmount !== UNLOCK_FEE && req.body.amount !== finalAmount) {
      throw errors.badRequest("Invalid payment amount", ERROR_CODES.INVALID_AMOUNT);
    }

    // Get user email
    const userEmail = email || req.user.email;
    if (!userEmail) {
      throw errors.badRequest("email is required for payment", ERROR_CODES.MISSING_FIELD);
    }

    // Generate idempotency key if not provided
    const idempotencyKey = req.idempotencyKey || generateIdempotencyKey({
      userId,
      listingId: listing_id,
      type: 'unlock',
      timestamp: Date.now()
    });

    // Check for existing pending payment
    const { rows: existingPayments } = await client.query(
      `SELECT id, status FROM payments 
       WHERE listing_id = $1 AND payer_id = $2 AND type = 'unlock' 
       AND status IN ('pending', 'confirmed')
       ORDER BY created_at DESC LIMIT 1`,
      [listing_id, userId]
    );

    if (existingPayments.length > 0) {
      const existingPayment = existingPayments[0];
      if (existingPayment.status === 'confirmed') {
        throw errors.conflict("Payment already confirmed for this listing", ERROR_CODES.ALREADY_UNLOCKED);
      }
      // Return existing pending payment
      return res.json({
        message: "Existing payment found. Complete the payment.",
        paymentId: existingPayment.id,
        finalAmount,
        discountPct
      });
    }

    // Generate unique reference
    const reference = `WS-UNLOCK-${listing_id.slice(0,8).toUpperCase()}-${Date.now()}`;

    // Create payment record with idempotency key
    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments (
        payer_id, listing_id, type, amount_kes, mpesa_phone, mpesa_receipt, status, idempotency_key
      ) VALUES ($1,$2,'unlock',$3,$4,$5,'pending',$6) RETURNING id`,
      [userId, listing_id, finalAmount, req.user.phone || '', reference, idempotencyKey]
    );
    const paymentId = paymentRows[0].id;

    if (voucher_code && discountPct > 0) {
      await client.query(`UPDATE vouchers SET uses = uses + 1 WHERE code = $1`, [voucher_code.toUpperCase()]);
    }

    await client.query('COMMIT');

    // Initialize Paystack transaction (outside transaction)
    const paystackResult = await initializeTransaction({
      email: userEmail,
      amount: finalAmount,
      phone: req.user.phone || '',
      reference,
      description: `Unlock contact for: ${listing.title}`,
      metadata: { payment_id: paymentId, listing_id, type: 'unlock', voucher_code: voucher_code || null }
    });

    res.json({
      message: "Payment initialized. Complete payment on the checkout page.",
      authorization_url: paystackResult.authorization_url,
      reference: paystackResult.reference,
      paymentId,
      finalAmount,
      discountPct
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /api/payments/escrow ──────────────────────────────────────────────────
router.post("/escrow", requireAuth, async (req, res, next) => {
  const client = await query.pool.connect();
  
  try {
    await client.query('BEGIN');
    const { listing_id, email } = req.body;
    const userId = req.user.id;

    if (!listing_id || !email) {
      throw errors.badRequest("listing_id and email are required", ERROR_CODES.MISSING_FIELD);
    }

    const { rows: listingRows } = await client.query(
      `SELECT * FROM listings WHERE id = $1 AND status != 'deleted'`,
      [listing_id]
    );
    
    if (!listingRows.length) {
      throw errors.notFound("Listing not found", ERROR_CODES.LISTING_NOT_FOUND);
    }
    
    const listing = listingRows[0];
    
    if (listing.seller_id === userId) {
      throw errors.badRequest("Seller cannot use escrow for their own listing");
    }

    const { rows: existingEscrow } = await client.query(
      `SELECT id FROM escrows WHERE listing_id = $1 AND status = 'holding'`,
      [listing_id]
    );
    
    if (existingEscrow.length) {
      throw errors.conflict("An escrow is already active for this listing");
    }

    // Calculate escrow amount
    const feeAmount = Math.round(listing.price * ESCROW_FEE_PCT);
    const totalAmount = Math.round(listing.price + feeAmount);
    
    // Validate amount
    if (req.body.amount !== totalAmount) {
      throw errors.badRequest("Invalid escrow amount", ERROR_CODES.INVALID_AMOUNT);
    }

    const releaseAfter = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const reference = `WS-ESCROW-${listing_id.slice(0,8).toUpperCase()}-${Date.now()}`;
    const idempotencyKey = req.idempotencyKey || generateIdempotencyKey({
      userId,
      listingId: listing_id,
      type: 'escrow',
      timestamp: Date.now()
    });

    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments (
        payer_id, listing_id, type, amount_kes, mpesa_phone, mpesa_receipt, status, idempotency_key
      ) VALUES ($1,$2,'escrow',$3,$4,$5,'pending',$6) RETURNING id`,
      [userId, listing_id, totalAmount, '', reference, idempotencyKey]
    );
    const paymentId = paymentRows[0].id;

    await client.query(
      `INSERT INTO escrows (
        listing_id, buyer_id, seller_id, payment_id, item_amount, fee_amount, total_amount, amount_kes, status, release_after
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)`,
      [listing_id, userId, listing.seller_id, paymentId, listing.price, feeAmount, totalAmount, totalAmount, releaseAfter]
    );

    await client.query('COMMIT');

    const paystackResult = await initializeTransaction({
      email,
      amount: totalAmount,
      phone: req.user.phone || '',
      reference,
      description: `Escrow payment for: ${listing.title}`,
      metadata: { payment_id: paymentId, listing_id, type: 'escrow', seller_id: listing.seller_id, buyer_id: userId }
    });

    res.json({
      message: "Escrow payment initialized. Complete payment on the checkout page.",
      authorization_url: paystackResult.authorization_url,
      reference: paystackResult.reference,
      paymentId,
      breakdown: { item_price: listing.price, escrow_fee: feeAmount, total: totalAmount }
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /api/payments/verify ────────────────────────────────────────────────
// Verify payment status
router.post("/verify/:paymentId", requireAuth, async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    
    const { rows } = await query(
      `SELECT p.*, l.title as listing_title, l.id as listing_id
       FROM payments p
       JOIN listings l ON l.id = p.listing_id
       WHERE p.id = $1 AND (p.payer_id = $2 OR l.seller_id = $2)`,
      [paymentId, req.user.id]
    );

    if (!rows.length) {
      throw errors.notFound("Payment not found");
    }

    const payment = rows[0];
    
    res.json({
      status: payment.status,
      type: payment.type,
      amount: payment.amount_kes,
      receipt: payment.mpesa_receipt,
      created_at: payment.created_at,
      confirmed_at: payment.confirmed_at,
      listing_title: payment.listing_title
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
