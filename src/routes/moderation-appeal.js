// Moderation appeal system - allow users to contest violations
const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { errors } = require('../middleware/errorHandler');
const { sendEmail } = require('../services/email.service');

const router = express.Router();

// ── POST /api/moderation/appeal ───────────────────────────────────────────────
// Submit an appeal for a violation
router.post('/appeal', requireAuth, async (req, res, next) => {
  try {
    const { violation_id, reason, evidence } = req.body;
    
    if (!violation_id || !reason) {
      throw errors.badRequest('violation_id and reason are required');
    }

    const userId = req.user.id;

    // Check if violation exists and belongs to user
    const { rows: violationRows } = await query(
      `SELECT * FROM chat_violations WHERE id = $1 AND user_id = $2`,
      [violation_id, userId]
    );

    if (!violationRows.length) {
      throw errors.notFound('Violation not found');
    }

    const violation = violationRows[0];

    // Check if already appealed
    const { rows: existingAppeal } = await query(
      `SELECT * FROM moderation_appeals WHERE violation_id = $1 AND status = 'pending'`,
      [violation_id]
    );

    if (existingAppeal.length) {
      throw errors.conflict('Appeal already submitted for this violation');
    }

    // Create appeal
    const { rows: appealRows } = await query(
      `INSERT INTO moderation_appeals (
        violation_id, user_id, reason, evidence, status, created_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW())
      RETURNING id`,
      [violation_id, userId, reason, evidence ? JSON.stringify(evidence) : null]
    );

    const appealId = appealRows[0].id;

    // Notify admins
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT id, 'moderation_appeal', 'New Moderation Appeal', 
              'User ${userId} has appealed a violation',
              json_build_object('appeal_id', $1, 'user_id', $2)
       FROM users WHERE role = 'admin'`,
      [appealId, userId]
    );

    res.json({
      message: 'Appeal submitted successfully',
      appeal_id: appealId,
      status: 'pending'
    });

  } catch (err) {
    next(err);
  }
});

// ── GET /api/moderation/appeals ───────────────────────────────────────────────
// Get user's appeals
router.get('/appeals', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ma.*, cv.reason as violation_reason, cv.severity
       FROM moderation_appeals ma
       JOIN chat_violations cv ON cv.id = ma.violation_id
       WHERE ma.user_id = $1
       ORDER BY ma.created_at DESC`,
      [req.user.id]
    );

    res.json({ appeals: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/moderation/appeal/:id/resolve ──────────────────────────────────
// Admin resolves an appeal (admin only)
router.post('/appeal/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body; // decision: 'approved' | 'rejected'

    if (!['approved', 'rejected'].includes(decision)) {
      throw errors.badRequest('decision must be "approved" or "rejected"');
    }

    // Check if admin
    if (req.user.role !== 'admin') {
      throw errors.forbidden('Only admins can resolve appeals');
    }

    // Update appeal
    const { rows } = await query(
      `UPDATE moderation_appeals 
       SET status = $1, resolved_by = $2, resolved_at = NOW(), admin_notes = $3
       WHERE id = $4
       RETURNING *`,
      [decision === 'approved' ? 'approved' : 'rejected', req.user.id, notes, id]
    );

    if (!rows.length) {
      throw errors.notFound('Appeal not found');
    }

    const appeal = rows[0];

    // If approved, reduce violation count
    if (decision === 'approved') {
      await query(
        `UPDATE users SET violation_count = GREATEST(0, violation_count - 1) WHERE id = $1`,
        [appeal.user_id]
      );

      // Remove suspension if applicable
      if (appeal.severity === 'suspended') {
        await query(`UPDATE users SET is_suspended = FALSE WHERE id = $1`, [appeal.user_id]);
      }

      // Send email
      const { rows: userRows } = await query(
        `SELECT name, email FROM users WHERE id = $1`,
        [appeal.user_id]
      );
      
      if (userRows.length) {
        await sendEmail(
          userRows[0].email,
          userRows[0].name,
          'Moderation Appeal Approved',
          `Your appeal has been approved and the violation has been removed.\n\nDecision: ${decision}\nNotes: ${notes}`
        );
      }
    }

    res.json({
      message: `Appeal ${decision}`,
      appeal_id: id,
      decision
    });

  } catch (err) {
    next(err);
  }
});

// ── GET /api/moderation/appeals/pending ──────────────────────────────────────
// Get pending appeals (admin only)
router.get('/appeals/pending', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      throw errors.forbidden('Admin access only');
    }

    const { rows } = await query(
      `SELECT ma.*, u.name as user_name, u.email as user_email
       FROM moderation_appeals ma
       JOIN users u ON u.id = ma.user_id
       WHERE ma.status = 'pending'
       ORDER BY ma.created_at DESC`
    );

    res.json({ appeals: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
