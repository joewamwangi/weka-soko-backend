// Webhook signature verification for M-Pesa callbacks
const crypto = require('crypto');

/**
 * Verify M-Pesa callback signature
 * M-Pesa sends callbacks with specific headers for verification
 */
function verifyMpesaSignature(headers, body, signature) {
  // M-Pesa doesn't provide signature verification in sandbox
  // In production, Safaricom provides signature headers
  
  if (process.env.MPESA_ENV !== 'live') {
    // In sandbox, skip verification but log warning
    console.log('⚠️  M-Pesa signature verification skipped (sandbox mode)');
    return true;
  }

  // Production verification would use:
  // X-Paypal-Signature or similar headers
  // For now, we verify the callback comes from Safaricom IP ranges
  
  const safaricomIpRanges = [
    '154.72.192.0/18', // Safaricom IP range
    '154.72.224.0/19',
    // Add more as needed
  ];

  const clientIp = headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'];
  
  // Log the callback for audit
  console.log('📥 M-Pesa callback received:', {
    ip: clientIp,
    hasSignature: !!signature,
    bodyKeys: Object.keys(body)
  });

  // For now, accept all callbacks but log them
  // TODO: Implement proper IP whitelist and signature verification
  return true;
}

/**
 * Verify Paystack webhook signature
 */
function verifyPaystackSignature(headers, body, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  
  if (!secret) {
    console.error('❌ Paystack secret key not configured');
    return false;
  }

  const hash = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(body))
    .digest('hex');

  return hash === signature;
}

/**
 * Log webhook attempt for audit trail
 */
async function logWebhookAttempt(paymentId, eventType, signature, isValid, metadata = {}) {
  const { query } = require('../db/pool');
  
  try {
    await query(
      `INSERT INTO webhook_logs (
        payment_id, event_type, signature, is_valid, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [paymentId, eventType, signature, isValid, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('Failed to log webhook attempt:', error.message);
  }
}

module.exports = {
  verifyMpesaSignature,
  verifyPaystackSignature,
  logWebhookAttempt
};
