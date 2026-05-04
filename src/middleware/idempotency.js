// Idempotency middleware to prevent duplicate payments and race conditions

const { query } = require("../db/pool");

/**
 * Idempotency middleware
 * Ensures that duplicate requests with the same idempotency key are handled safely
 */
async function idempotencyMiddleware(req, res, next) {
  // Only apply to POST, PUT, PATCH requests
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers['x-idempotency-key'];
  const userId = req.user?.id;

  // If no idempotency key and it's a payment request, generate one
  if (req.path.includes('/payments/') && !idempotencyKey) {
    const { v4: uuidv4 } = require('uuid');
    req.idempotencyKey = uuidv4();
  } else if (idempotencyKey) {
    req.idempotencyKey = idempotencyKey;
  }

  // Check if this request has been processed before
  if (req.idempotencyKey && userId) {
    try {
      const { rows } = await query(
        `SELECT response_data, created_at 
         FROM payment_attempts 
         WHERE idempotency_key = $1 AND user_id = $2 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [req.idempotencyKey, userId]
      );

      if (rows.length > 0) {
        // Request already processed, return cached response
        console.log(`🔄 Duplicate request detected for key: ${req.idempotencyKey}`);
        return res.json(rows[0].response_data);
      }
    } catch (error) {
      console.error('Error checking idempotency:', error.message);
      // Continue without idempotency check if there's an error
    }
  }

  // Store original json method
  const originalJson = res.json.bind(res);
  const responseData = {};

  // Override res.json to capture response
  res.json = (data) => {
    Object.assign(responseData, data);
    
    // If we have an idempotency key and this is a successful payment request
    if (req.idempotencyKey && userId && req.path.includes('/payments/')) {
      // Store the response for future duplicate detection
      query(
        `INSERT INTO payment_attempts (idempotency_key, user_id, response_data, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [req.idempotencyKey, userId, JSON.stringify(data)]
      ).catch(err => console.error('Failed to cache idempotency response:', err.message));
    }

    return originalJson(data);
  };

  next();
}

/**
 * Generate idempotency key for payment requests
 */
function generateIdempotencyKey({ userId, listingId, type, timestamp = Date.now() }) {
  const crypto = require('crypto');
  const data = `${userId}:${listingId}:${type}:${timestamp}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate payment amount matches expected value
 */
async function validatePaymentAmount(listingId, expectedAmount, type = 'unlock') {
  const UNLOCK_FEE = parseInt(process.env.UNLOCK_FEE_KES || "260");
  
  if (type === 'unlock') {
    if (expectedAmount !== UNLOCK_FEE) {
      throw new Error(`Invalid unlock fee. Expected: ${UNLOCK_FEE}, Got: ${expectedAmount}`);
    }
  }
  
  // For escrow, validate against listing price
  if (type === 'escrow') {
    const { rows } = await query(
      `SELECT price FROM listings WHERE id = $1`,
      [listingId]
    );
    
    if (!rows.length) {
      throw new Error('Listing not found');
    }
    
    const listingPrice = parseFloat(rows[0].price);
    const escrowFeePct = parseFloat(process.env.ESCROW_FEE_PERCENT || "5.5") / 100;
    const expectedTotal = Math.round(listingPrice + (listingPrice * escrowFeePct));
    
    if (Math.abs(expectedAmount - expectedTotal) > 0.01) {
      throw new Error(`Invalid escrow amount. Expected: ${expectedTotal}, Got: ${expectedAmount}`);
    }
  }
  
  return true;
}

module.exports = {
  idempotencyMiddleware,
  generateIdempotencyKey,
  validatePaymentAmount
};
