// src/services/paystack.service.js — Paystack payment integration for Starter accounts
// Settles to M-Pesa Till number 5673935
// Version: 1.0.0 — Migrated from M-Pesa Daraja 2026-04-28

const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

if (!PAYSTACK_SECRET) {
  console.error('⚠️ PAYSTACK_SECRET_KEY is not set!');
}

/**
 * Initialize a Paystack transaction
 * @param {Object} params - Transaction parameters
 * @param {string} params.email - Customer email
 * @param {number} params.amount - Amount in KES (KES doesn't use cents - sent as-is)
 * @param {string} params.phone - Customer phone number
 * @param {string} params.reference - Unique reference (e.g., WS-UNLOCK-xxx)
 * @param {string} params.description - Payment description
 * @param {string} params.metadata - Additional metadata
 * @returns {Promise<{authorization_url: string, reference: string, access_code: string}>}
 */
async function initializeTransaction({ email, amount, phone, reference, description, metadata = {} }) {
  try {
    console.log('[Paystack] Initializing transaction:', { email, amount, reference, description });

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount: Math.round(amount), // KES doesn't use cents - amount is already in shillings
        currency: 'KES',
        reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL || `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          ...metadata,
          custom_fields: [
            { display_name: 'Phone Number', variable_name: 'phone', value: phone || '' },
            { display_name: 'Description', variable_name: 'description', value: description }
          ]
        },
        channels: ['card', 'bank', 'ussd', 'mobile_money', 'qr', 'eft']
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[Paystack] Transaction initialized:', response.data.data.reference);
    return response.data.data;
  } catch (error) {
    console.error('[Paystack] Initialize error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to initialize payment');
  }
}

/**
 * Verify a Paystack transaction
 * @param {string} reference - Transaction reference
 * @returns {Promise<{status: boolean, data: Object}>}
 */
async function verifyTransaction(reference) {
  try {
    console.log('[Paystack] Verifying transaction:', reference);
    
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`
        }
      }
    );

    return {
      status: response.data.data.status === 'success',
      data: response.data.data
    };
  } catch (error) {
    console.error('[Paystack] Verify error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to verify payment');
  }
}

/**
 * Handle Paystack webhook
 * @param {Object} body - Webhook payload
 * @param {string} signature - X-Paystack-Signature header
 * @returns {Promise<{event: string, data: Object}>}
 */
async function handleWebhook(body, signature) {
  // For production, you should verify the webhook signature
  // using your webhook secret. For now, we'll trust the payload.

  const event = body.event;
  const data = body.data;

  console.log('[Paystack] Webhook received:', event, data?.reference);

  return { event, data };
}

/**
 * Create a dedicated virtual account for a customer (optional feature)
 * @param {string} customerId - Paystack customer ID
 * @param {string} phone - Customer phone
 * @returns {Promise<Object>}
 */
async function createVirtualAccount(customerId, phone) {
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/dedicated_account`,
      {
        customer: customerId,
        preferred_bank: 'wema-bank', // or other supported bank
        phone
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data;
  } catch (error) {
    console.error('[Paystack] Virtual account error:', error.response?.data || error.message);
    throw new Error('Failed to create virtual account');
  }
}

/**
 * Process refund for escrow release
 * @param {string} transactionRef - Original transaction reference
 * @param {number} amount - Amount to refund (optional, refunds full if not specified)
 * @returns {Promise<Object>}
 */
async function processRefund(transactionRef, amount) {
  try {
    const payload = { transaction: transactionRef };
    if (amount) payload.amount = amount * 100; // Convert to cents

    console.log('[Paystack] Processing refund:', transactionRef, amount);

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/refund`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data;
  } catch (error) {
    console.error('[Paystack] Refund error:', error.response?.data || error.message);
    throw new Error('Failed to process refund');
  }
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  handleWebhook,
  createVirtualAccount,
  processRefund
};
