/**
 * Weka Soko - Arbitrator Agent
 * Escrow & Dispute Resolution Agent
 */

const BaseAgent = require('../base.agent');
const { pool } = require('../../db/pool');

class ArbitratorAgent extends BaseAgent {
  constructor() {
    super('Arbitrator');
    this.config = {
      holdPeriodHours: 48,
      autoReleaseEnabled: true,
      disputeWindowHours: 72,
      fraudThreshold: 3
    };
  }

  async process(eventType, payload) {
    switch (eventType) {
      case 'escrow:created':
        return await this.monitorEscrow(payload);
      case 'payment:received':
        return await this.initiateEscrow(payload);
      case 'dispute:opened':
        return await this.analyzeDispute(payload);
      case 'escrow:check_release':
        return await this.checkPendingReleases();
      default:
        return { action: 'IGNORE', reason: 'Unknown event type' };
    }
  }

  async initiateEscrow(payment) {
    console.log(`[Arbitrator] Initiating escrow for transaction ${payment.transaction_id}`);

    const releaseTime = new Date();
    releaseTime.setHours(releaseTime.getHours() + this.config.holdPeriodHours);

    await pool.query(`
      INSERT INTO escrow_transactions 
      (transaction_id, buyer_id, seller_id, amount, status, created_at, release_after)
      VALUES ($1, $2, $3, $4, 'held', NOW(), $5)
      ON CONFLICT (transaction_id) 
      DO UPDATE SET status = 'held', release_after = $5
    `, [
      payment.transaction_id,
      payment.buyer_id,
      payment.seller_id,
      payment.amount,
      releaseTime
    ]);

    return {
      action: 'ESCROW_INITIATED',
      transactionId: payment.transaction_id,
      holdUntil: releaseTime,
      releaseTimeHours: this.config.holdPeriodHours
    };
  }

  async checkPendingReleases() {
    const pending = await pool.query(`
      SELECT e.*, t.listing_id, t.unlock_fee
      FROM escrow_transactions e
      JOIN transactions t ON t.id = e.transaction_id
      WHERE e.status = 'held'
        AND e.release_after <= NOW()
        AND NOT EXISTS (
          SELECT 1 FROM disputes 
          WHERE transaction_id = e.transaction_id AND status = 'open'
        )
      LIMIT 50
    `);

    const releases = [];

    for (const escrow of pending.rows) {
      try {
        const escrowFee = escrow.unlock_fee || (escrow.amount * 0.075);
        const sellerAmount = escrow.amount - escrowFee;

        await pool.query(`
          UPDATE escrow_transactions
          SET status = 'released', released_at = NOW(), seller_amount = $1, platform_fee = $2
          WHERE id = $3
        `, [sellerAmount, escrowFee, escrow.id]);

        await pool.query(`
          UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE id = $1
        `, [escrow.transaction_id]);

        releases.push({
          escrowId: escrow.id,
          transactionId: escrow.transaction_id,
          sellerAmount,
          fee: escrowFee,
          success: true
        });
      } catch (error) {
        releases.push({ escrowId: escrow.id, success: false, error: error.message });
      }
    }

    return { action: 'AUTO_RELEASED', processed: releases.length, releases };
  }

  async analyzeDispute(dispute) {
    console.log(`[Arbitrator] Analyzing dispute: ${dispute.id}`);

    const prompt = `Analyze this marketplace dispute:

Buyer Claim: ${dispute.buyer_claim}
Seller Response: ${dispute.seller_response}
Amount: KSh ${dispute.amount}

Based on Kenyan marketplace norms, who is likely correct?

Return JSON:
{
  "recommendation": "BUYER|SELLER|SPLIT|ESCALATE",
  "confidence": 0.0-1.0,
  "reasoning": "explanation",
  "evidenceStrength": "STRONG|MODERATE|WEAK"
}`;

    try {
      const result = await this.callGroq(prompt);
      const analysis = this.safeParseJSON(result.content);

      return {
        action: analysis.confidence > 0.85 ? analysis.recommendation : 'ESCALATE',
        analysis,
        autoResolve: analysis.confidence > 0.85
      };
    } catch (error) {
      return { action: 'ESCALATE', error: error.message };
    }
  }

  async monitorEscrow(escrow) {
    const result = await pool.query('SELECT * FROM escrow_transactions WHERE id = $1', [escrow.id]);
    if (result.rows.length === 0) return { action: 'NOT_FOUND' };

    const data = result.rows[0];
    const hoursHeld = (Date.now() - new Date(data.created_at)) / (1000 * 60 * 60);

    return {
      action: 'STATUS_CHECK',
      escrowId: escrow.id,
      status: data.status,
      hoursHeld: Math.floor(hoursHeld),
      canRelease: hoursHeld >= this.config.holdPeriodHours
    };
  }
}

module.exports = ArbitratorAgent;
