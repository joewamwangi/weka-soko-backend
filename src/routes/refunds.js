// Refund mechanism for disputed payments
const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { errors } = require('../middleware/errorHandler');
const { sendEmail } = require('../services/email.service');

const router = express.Router();

// ── POST /api/refunds/request ────────────────────────────────────────────────
// Request a refund for a payment
router.post('/request', requireAuth, async (req, res, next) => {
  const client = await query.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { payment_id, reason, amount } = req.body;
    
    if (!payment_id || !reason) {
      throw errors.badRequest('payment_id and reason are required');
    }

    const userId = req.user.id;

    // Get payment details
    const { rows: paymentRows } = await client.query(
      `SELECT p.*, l.title as listing_title, l.seller_id 
       FROM payments p
       JOIN listings l ON l.id = p.listing_id
       WHERE p.id = $1`,
      [payment_id]
    );

    if (!paymentRows.length) {
      throw errors.notFound('Payment not found');
    }

    const payment = paymentRows[0];

    // Verify user is the payer
    if (payment.payer_id !== userId) {
      throw errors.forbidden('Only the payer can request a refund');
    }

    // Check payment status
    if (payment.status !== 'confirmed') {
      throw errors.badRequest('Only confirmed payments can be refunded');
    }

    // Check if already refunded
    const { rows: existingRefund } = await client.query(
      `SELECT id FROM refunds WHERE payment_id = $1`,
      [payment_id]
    );

    if (existingRefund.length) {
      throw errors.conflict('Refund already requested for this payment');
    }

    // Create refund request
    const refundAmount = amount || payment.amount_kes;
    const { rows: refundRows } = await client.query(
      `INSERT INTO refunds (
        payment_id, user_id, amount, reason, status, created_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW())
      RETURNING id`,
      [payment_id, userId, refundAmount, reason]
    );

    const refundId = refundRows[0].id;

    // Notify admins
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT id, 'refund_request', 'New Refund Request', 
              'User ${userId} requested a refund',
              json_build_object('refund_id', $1, 'payment_id', $2)
       FROM users WHERE role = 'admin'`,
      [refundId, payment_id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Refund request submitted',
      refund_id: refundId,
      status: 'pending',
      amount: refundAmount
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /api/refunds/:id/decide ─────────────────────────────────────────────
// Admin approves/rejects refund
router.post('/:id/decide', requireAuth, async (req, res, next) => {
  const client = await query.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { decision, notes } = req.body; // decision: 'approved' | 'rejected'

    if (req.user.role !== 'admin') {
      throw errors.forbidden('Admin access only');
    }

    if (!['approved', 'rejected'].includes(decision)) {
      throw errors.badRequest('decision must be "approved" or "rejected"');
    }

    // Update refund
    const { rows } = await client.query(
      `UPDATE refunds 
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), admin_notes = $3
       WHERE id = $4
       RETURNING *`,
      [decision, req.user.id, notes, id]
    );

    if (!rows.length) {
      throw errors.notFound('Refund not found');
    }

    const refund = rows[0];

    if (decision === 'approved') {
      // Process refund (mark payment as refunded)
      await client.query(
        `UPDATE payments SET status = 'refunded' WHERE id = $1`,
        [refund.payment_id]
      );

      // If it was an unlock, re-lock the listing
      const { rows: paymentRows } = await client.query(
        `SELECT type, listing_id FROM payments WHERE id = $1`,
        [refund.payment_id]
      );

      if (paymentRows.length && paymentRows[0].type === 'unlock') {
        await client.query(
          `UPDATE listings SET is_unlocked = FALSE, is_contact_public = FALSE WHERE id = $1`,
          [paymentRows[0].listing_id]
        );
      }

      // Send refund email
      const { rows: userRows } = await client.query(
        `SELECT name, email FROM users WHERE id = $1`,
        [refund.user_id]
      );

      if (userRows.length) {
        await sendEmail(
          userRows[0].email,
          userRows[0].name,
          'Refund Approved',
          `Your refund of KSh ${refund.amount} has been approved.\n\nReason: ${refund.reason}\nNotes: ${notes}`
        );
      }
    }

    await client.query('COMMIT');

    res.json({
      message: `Refund ${decision}`,
      refund_id: id,
      decision
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/refunds ─────────────────────────────────────────────────────────
// Get user's refunds
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.*, p.amount_kes, p.type as payment_type
       FROM refunds r
       JOIN payments p ON p.id = r.payment_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json({ refunds: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/refunds/pending ─────────────────────────────────────────────────
// Get pending refunds (admin only)
router.get('/pending', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      throw errors.forbidden('Admin access only');
    }

    const { rows } = await query(
      `SELECT r.*, u.name as user_name, u.email as user_email,
              p.amount_kes, p.type as payment_type
       FROM refunds r
       JOIN users u ON u.id = r.user_id
       JOIN payments p ON p.id = r.payment_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at DESC`
    );

    res.json({ refunds: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
