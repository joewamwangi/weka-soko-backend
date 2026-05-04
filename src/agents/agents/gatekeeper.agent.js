/**
 * Weka Soko - Gatekeeper Agent
 * Moderation & Trust Agent
 * 
 * Responsibilities:
 * - Content moderation (listings, messages, user profiles)
 * - Fraud detection
 * - Policy enforcement
 * - Trust & safety scoring
 * - Scam pattern detection
 */

const BaseAgent = require('../base.agent');
const { pool } = require('../../db/pool');

class GatekeeperAgent extends BaseAgent {
  constructor() {
    super('Gatekeeper');
    
    // Scam/fraud patterns
    this.fraudPatterns = {
      priceAnomalies: {
        // Category: [min, max] expected prices in KSh
        'Electronics': { iphone: [30000, 200000], laptop: [15000, 500000] },
        'Vehicles': { car: [100000, 5000000], motorcycle: [20000, 500000] },
        'Property': { house: [500000, 50000000], land: [100000, 100000000] }
      },
      suspiciousPhrases: [
        'urgent sale', 'quick sale', 'need money fast',
        'contact via whatsapp only', 'no calls',
        'send money first', 'pay before seeing',
        'too good to be true', '50% off', '90% off',
        'original price 100k selling for 10k',
        'bank transfer only', 'no refunds',
        'nairobi cbd only', 'dont waste my time'
      ],
      redFlags: {
        noPhotos: 20,
        whatsappOnly: 30,
        tooCheap: 50,
        suspiciousLanguage: 40,
        newAccountHighValue: 25,
        multipleListingsSamePhoto: 35
      }
    };
  }

  async process(eventType, payload) {
    switch (eventType) {
      case 'listing:created':
      case 'listing:updated':
        return await this.moderateListing(payload);
      
      case 'message:reported':
        return await this.moderateMessage(payload);
      
      case 'user:reported':
        return await this.assessUserRisk(payload);
      
      case 'user:registered':
        return await this.assessNewUser(payload);
      
      default:
        return { action: 'IGNORE', reason: 'Unknown event type' };
    }
  }

  /**
   * Moderate a listing
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Moderation result
   */
  async moderateListing(listing) {
    const { title, description, price, category, photos, user_id, id } = listing;
    
    // Build analysis prompt
    const prompt = `Analyze this Kenyan marketplace listing for fraud and policy violations.

LISTING DATA:
Title: ${title}
Description: ${description}
Price: KSh ${price}
Category: ${category}
Has Photos: ${photos?.length > 0 ? 'Yes (' + photos.length + ')' : 'No'}

FRAUD CHECKLIST:
1. Price Analysis: Is KSh ${price} suspiciously low for ${category}?
2. Description Red Flags: Look for scam language
3. Photo Analysis: ${photos?.length === 0 ? 'NO PHOTOS - HIGH RISK' : 'Photos present'}
4. Contact Method: Check for "WhatsApp only" or avoiding platform
5. Urgency Tactics: "Quick sale", "urgent", "need money"
6. Too Good To Be True: Unrealistic deals

KENYAN MARKET CONTEXT:
- Common scams: Fake electronics, rental scams, "send deposit first"
- Legitimate sellers provide details, meet in person
- Suspicious: Wants payment before meeting, no photos, too cheap

Return JSON:
{
  "approved": boolean,
  "riskScore": 0-100,
  "flags": ["specific_reason_1", "specific_reason_2"],
  "action": "APPROVE|REVIEW|REJECT",
  "confidence": 0.0-1.0,
  "suggestedCategory": "if miscategorized",
  "requiresHumanReview": boolean,
  "notes": "explanation for admin"
}`;

    const groqResult = await this.callGroq(prompt);
    const analysis = this.safeParseJSON(groqResult.content, {
      approved: true,
      riskScore: 50,
      flags: [],
      action: 'REVIEW',
      confidence: 0.5
    });

    // Enrich with rule-based checks
    const ruleBasedChecks = await this.runRuleBasedChecks(listing);
    
    // Combine AI + rule-based
    const finalRiskScore = Math.max(analysis.riskScore, ruleBasedChecks.riskScore);
    const finalFlags = [...new Set([...analysis.flags, ...ruleBasedChecks.flags])];
    
    // Determine final action
    let finalAction = analysis.action;
    if (finalRiskScore > 80) finalAction = 'REJECT';
    else if (finalRiskScore > 50) finalAction = 'REVIEW';
    else if (finalRiskScore < 30) finalAction = 'APPROVE';

    // Auto-actions
    const recommendations = [];
    
    if (finalAction === 'REJECT') {
      recommendations.push({
        type: 'AUTO_ACTION',
        action: 'reject_listing',
        listingId: id,
        reason: finalFlags.join(', ')
      });
    } else if (finalAction === 'REVIEW') {
      recommendations.push({
        type: 'QUEUE_FOR_REVIEW',
        priority: finalRiskScore > 70 ? 'HIGH' : 'NORMAL',
        listingId: id
      });
    }

    // Check if seller needs verification
    if (finalRiskScore > 40) {
      const sellerRisk = await this.checkSellerRisk(user_id);
      if (sellerRisk.isNew && price > 50000) {
        recommendations.push({
          type: 'REQUIRE_VERIFICATION',
          userId: user_id,
          reason: 'High-value listing from new account'
        });
      }
    }

    // Store moderation result
    await this.storeModerationResult(id, 'listing', finalRiskScore, finalFlags);

    return {
      action: finalAction,
      riskScore: finalRiskScore,
      flags: finalFlags,
      confidence: analysis.confidence,
      aiAnalysis: analysis,
      ruleBasedChecks,
      recommendations,
      requiresHumanReview: finalRiskScore > 50
    };
  }

  /**
   * Run rule-based fraud detection
   * @param {Object} listing - Listing data
   * @returns {Object} Risk score and flags
   */
  async runRuleBasedChecks(listing) {
    const flags = [];
    let riskScore = 0;

    // Check 1: No photos
    if (!listing.photos || listing.photos.length === 0) {
      flags.push('no_photos');
      riskScore += this.fraudPatterns.redFlags.noPhotos;
    }

    // Check 2: Suspicious phrases in title/description
    const content = (listing.title + ' ' + listing.description).toLowerCase();
    for (const phrase of this.fraudPatterns.suspiciousPhrases) {
      if (content.includes(phrase.toLowerCase())) {
        flags.push(`suspicious_phrase: ${phrase}`);
        riskScore += 10;
      }
    }

    // Check 3: WhatsApp only contact
    if (content.includes('whatsapp only') || content.includes('whatsapp:')) {
      flags.push('whatsapp_only_contact');
      riskScore += this.fraudPatterns.redFlags.whatsappOnly;
    }

    // Check 4: Price too cheap (heuristic)
    if (listing.category === 'Electronics' && listing.price < 1000) {
      const words = content.split(' ');
      const hasPhoneWords = words.some(w => 
        ['iphone', 'samsung', 'phone', 'mobile'].includes(w)
      );
      if (hasPhoneWords && listing.price < 5000) {
        flags.push('price_too_low_for_electronics');
        riskScore += this.fraudPatterns.redFlags.tooCheap;
      }
    }

    // Check 5: New account + high value
    const sellerAge = await this.getAccountAge(listing.user_id);
    if (sellerAge < 7 && listing.price > 50000) { // Less than 7 days old
      flags.push('new_account_high_value');
      riskScore += this.fraudPatterns.redFlags.newAccountHighValue;
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    return { riskScore, flags };
  }

  /**
   * Moderate reported message
   * @param {Object} message - Message data
   * @returns {Promise<Object>} Moderation result
   */
  async moderateMessage(message) {
    const prompt = `Analyze this chat message from a Kenyan marketplace.

Message: "${message.content}"
Context: User reported this message

Check for:
1. Harassment or abuse
2. Scam attempts (off-platform deals)
3. Spam
4. Hate speech
5. Threats

Return JSON:
{
  "violationFound": boolean,
  "violationType": "HARASSMENT|SCAM|SPAM|HATE_SPEECH|THREATS|NONE",
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "action": "WARN|TIMEOUT|BAN|IGNORE",
  "confidence": 0.0-1.0,
  "explanation": "brief reason"
}`;

    const result = await this.callGroq(prompt);
    const analysis = this.safeParseJSON(result.content);

    return {
      action: analysis.action || 'IGNORE',
      violationFound: analysis.violationFound,
      severity: analysis.severity,
      recommendations: analysis.violationFound ? [{
        type: 'MESSAGE_ACTION',
        action: analysis.action,
        messageId: message.id,
        userId: message.sender_id
      }] : []
    };
  }

  /**
   * Assess user risk score
   * @param {Object} user - User data
   * @returns {Promise<Object>} Risk assessment
   */
  async assessUserRisk(user) {
    // Get user stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        AVG(response_time) as avg_response_time
      FROM listings 
      WHERE user_id = $1
    `, [user.id]);

    const reportCount = await pool.query(`
      SELECT COUNT(*) as reports
      FROM user_reports 
      WHERE reported_user_id = $1 
      AND created_at > NOW() - INTERVAL '30 days'
    `, [user.id]);

    const userStats = stats.rows[0];
    const reports = parseInt(reportCount.rows[0].reports);

    let riskScore = 0;
    const flags = [];

    if (reports > 0) {
      riskScore += reports * 20;
      flags.push(`${reports} reports in last 30 days`);
    }

    if (userStats.rejected_count > 0) {
      const rejectionRate = userStats.rejected_count / userStats.total_listings;
      if (rejectionRate > 0.5) {
        riskScore += 30;
        flags.push('high_listing_rejection_rate');
      }
    }

    const accountAge = await this.getAccountAge(user.id);
    if (accountAge < 7) {
      riskScore += 10;
      flags.push('new_account');
    }

    return {
      riskScore: Math.min(riskScore, 100),
      trustScore: 100 - Math.min(riskScore, 100),
      flags,
      accountAge: Math.floor(accountAge),
      reports,
      action: riskScore > 70 ? 'RESTRICT' : riskScore > 40 ? 'MONITOR' : 'APPROVE'
    };
  }

  /**
   * Assess new user
   * @param {Object} user - New user data
   * @returns {Promise<Object>} Assessment
   */
  async assessNewUser(user) {
    // Check for suspicious patterns
    const checks = {
      disposableEmail: this.isDisposableEmail(user.email),
      suspiciousUsername: user.username?.includes('test') || user.username?.includes('admin'),
      multipleAccounts: await this.checkMultipleAccounts(user.email, user.phone)
    };

    let riskScore = 0;
    if (checks.disposableEmail) riskScore += 30;
    if (checks.suspiciousUsername) riskScore += 20;
    if (checks.multipleAccounts) riskScore += 40;

    return {
      riskScore,
      approved: riskScore < 60,
      flags: Object.entries(checks)
        .filter(([_, val]) => val)
        .map(([key, _]) => key),
      requiresEmailVerification: riskScore > 30
    };
  }

  /**
   * Check seller risk profile
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Seller risk info
   */
  async checkSellerRisk(userId) {
    const result = await pool.query(`
      SELECT 
        created_at,
        COUNT(l.id) as listing_count,
        COALESCE(AVG(m.rating), 0) as avg_rating
      FROM users u
      LEFT JOIN listings l ON l.user_id = u.id
      LEFT JOIN reviews m ON m.seller_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, u.created_at
    `, [userId]);

    if (result.rows.length === 0) return { isNew: true, riskScore: 50 };

    const seller = result.rows[0];
    const accountAge = Math.floor((Date.now() - new Date(seller.created_at)) / (1000 * 60 * 60 * 24));
    
    return {
      isNew: accountAge < 30,
      accountAge,
      listingCount: parseInt(seller.listing_count),
      avgRating: parseFloat(seller.avg_rating),
      riskScore: accountAge < 7 ? 40 : accountAge < 30 ? 20 : 0
    };
  }

  /**
   * Get account age in days
   * @param {string} userId - User ID
   * @returns {Promise<number>} Days since registration
   */
  async getAccountAge(userId) {
    const result = await pool.query(
      'SELECT created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) return 0;
    
    return (Date.now() - new Date(result.rows[0].created_at)) / (1000 * 60 * 60 * 24);
  }

  /**
   * Check for multiple accounts
   * @param {string} email - Email
   * @param {string} phone - Phone
   * @returns {Promise<boolean>} Has multiple accounts
   */
  async checkMultipleAccounts(email, phone) {
    const domain = email.split('@')[1];
    
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE (email LIKE $1 OR phone = $2)
      AND created_at > NOW() - INTERVAL '7 days'
    `, [`%@${domain}`, phone]);

    return parseInt(result.rows[0].count) > 1;
  }

  /**
   * Check if email is disposable
   * @param {string} email - Email address
   * @returns {boolean}
   */
  isDisposableEmail(email) {
    const disposableDomains = [
      'tempmail.com', '10minutemail.com', 'guerrillamail.com',
      'mailinator.com', 'throwaway.com', 'yopmail.com'
    ];
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  /**
   * Store moderation result
   * @param {string} targetId - Target ID
   * @param {string} targetType - Type (listing, message, user)
   * @param {number} riskScore - Risk score
   * @param {Array} flags - Flags
   */
  async storeModerationResult(targetId, targetType, riskScore, flags) {
    try {
      await pool.query(`
        INSERT INTO moderation_results 
        (target_id, target_type, risk_score, flags, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (target_id, target_type) 
        DO UPDATE SET risk_score = $3, flags = $4, created_at = NOW()
      `, [targetId, targetType, riskScore, JSON.stringify(flags)]);
    } catch (error) {
      console.error('[Gatekeeper] Failed to store moderation:', error);
    }
  }
}

module.exports = GatekeeperAgent;
