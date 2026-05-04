// Per-user rate limiting middleware
const rateLimit = require('express-rate-limit');
const { query } = require('../db/pool');

/**
 * Get user's current violation count and adjust limits accordingly
 */
async function getUserRiskLevel(userId) {
  try {
    const { rows } = await query(
      'SELECT violation_count, account_status FROM users WHERE id = $1',
      [userId]
    );
    
    if (!rows.length) return 'normal';
    
    const { violation_count, account_status } = rows[0];
    
    if (account_status === 'deleted') return 'banned';
    if (violation_count >= 3) return 'high_risk';
    if (violation_count >= 2) return 'medium_risk';
    if (violation_count >= 1) return 'low_risk';
    
    return 'normal';
  } catch (error) {
    console.error('Error getting user risk level:', error.message);
    return 'normal';
  }
}

/**
 * Create rate limiter with user-specific limits
 */
function createUserRateLimiter() {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // default limit
    keyGenerator: async (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id || `ip:${req.ip}`;
    },
    limit: async (req, res) => {
      // Adjust limits based on user risk level
      if (req.user?.id) {
        const riskLevel = await getUserRiskLevel(req.user.id);
        
        switch (riskLevel) {
          case 'banned':
            return 0; // No requests allowed
          case 'high_risk':
            return 20; // Very limited
          case 'medium_risk':
            return 50; // Limited
          case 'low_risk':
            return 80; // Slightly limited
          default:
            return 100; // Normal limit
        }
      }
      return 100; // Normal limit for non-authenticated
    },
    message: {
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      retryAfter: Math.ceil((15 * 60 * 1000) / Date.now())
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  return limiter;
}

/**
 * Stricter rate limiter for sensitive actions
 */
function createStrictLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    keyGenerator: (req) => req.user?.id || `ip:${req.ip}`,
    message: {
      error: 'Too many sensitive requests',
      code: 'STRICT_RATE_LIMITED',
      retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Payment-specific rate limiter
 */
function createPaymentLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 payments per hour
    keyGenerator: (req) => req.user?.id || `ip:${req.ip}`,
    message: {
      error: 'Too many payment attempts',
      code: 'PAYMENT_RATE_LIMITED',
      retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

module.exports = {
  createUserRateLimiter,
  createStrictLimiter,
  createPaymentLimiter,
  getUserRiskLevel,
};
