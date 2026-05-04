/**
 * Weka Soko - Sentinel Agent
 * Quality & Testing Agent
 * 
 * Responsibilities:
 * - Photo quality verification
 * - Price anomaly detection
 * - Seller responsiveness monitoring
 * - Listing completeness checks
 * - Ghost listing detection
 */

const BaseAgent = require('../base.agent');
const { pool } = require('../../db/pool');

class SentinelAgent extends BaseAgent {
  constructor() {
    super('Sentinel');
    
    // Price benchmarks by category (KSh)
    this.priceBenchmarks = {
      'Electronics': {
        'iPhone': { min: 15000, max: 200000, models: ['iphone'] },
        'Samsung': { min: 10000, max: 150000, models: ['samsung', 'galaxy'] },
        'Laptop': { min: 15000, max: 500000, models: ['laptop', 'hp', 'dell', 'lenovo', 'macbook'] },
        'TV': { min: 10000, max: 300000, models: ['tv', 'television', 'samsung', 'lg', 'sony'] }
      },
      'Vehicles': {
        'Car': { min: 100000, max: 5000000, models: ['toyota', 'honda', 'mazda', 'nissan', 'subaru'] },
        'Motorcycle': { min: 20000, max: 500000, models: ['boxer', 'honda', 'yamaha', 'suzuki'] }
      },
      'Property': {
        'House': { min: 500000, max: 50000000, models: ['house', 'apartment', 'rent'] },
        'Land': { min: 100000, max: 100000000, models: ['plot', 'land', 'acre'] }
      },
      'Clothing': {
        'Shoes': { min: 500, max: 50000, models: ['nike', 'adidas', 'jordan', 'shoes'] },
        'Clothes': { min: 200, max: 20000, models: ['dress', 'shirt', 'jeans', 'suit'] }
      }
    };

    // Quality thresholds
    this.thresholds = {
      photoMinCount: 2,
      photoMinResolution: 800, // pixels
      descriptionMinLength: 50,
      titleMinLength: 10,
      sellerResponseTimeMax: 3600 // 1 hour in seconds
    };
  }

  async process(eventType, payload) {
    switch (eventType) {
      case 'listing:created':
      case 'listing:updated':
        return await this.assessListingQuality(payload);
      
      case 'listing:photo_uploaded':
        return await this.verifyPhotoQuality(payload);
      
      case 'seller:metrics_updated':
        return await this.checkSellerHealth(payload);
      
      case 'listing:check_ghost':
        return await this.detectGhostListings();
      
      default:
        return { action: 'IGNORE', reason: 'Unknown event type' };
    }
  }

  /**
   * Assess overall listing quality
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Quality assessment
   */
  async assessListingQuality(listing) {
    const checks = await Promise.all([
      this.checkPhotoQuality(listing),
      this.checkDescriptionQuality(listing),
      this.checkPriceAnomaly(listing),
      this.checkTitleOptimization(listing),
      this.checkCategoryAccuracy(listing)
    ]);

    const [photos, description, price, title, category] = checks;

    // Calculate overall quality score
    const qualityScore = Math.round(
      (photos.score * 0.25) +
      (description.score * 0.25) +
      (price.score * 0.25) +
      (title.score * 0.15) +
      (category.score * 0.10)
    );

    const issues = [
      ...photos.issues,
      ...description.issues,
      ...price.issues,
      ...title.issues,
      ...category.issues
    ];

    const recommendations = [
      ...photos.recommendations,
      ...description.recommendations,
      ...price.recommendations,
      ...title.recommendations,
      ...category.recommendations
    ];

    // Generate quality report
    const report = {
      qualityScore,
      grade: this.getQualityGrade(qualityScore),
      status: qualityScore >= 70 ? 'GOOD' : qualityScore >= 50 ? 'NEEDS_IMPROVEMENT' : 'POOR',
      checks: { photos, description, price, title, category },
      issues,
      recommendations,
      searchable: qualityScore >= 50 // Only searchable if decent quality
    };

    // Store quality metrics
    await this.storeQualityMetrics(listing.id, report);

    return {
      action: qualityScore >= 50 ? 'APPROVE' : 'FLAG_FOR_IMPROVEMENT',
      qualityScore,
      issues,
      recommendations,
      report
    };
  }

  /**
   * Check photo quality
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Photo quality report
   */
  async checkPhotoQuality(listing) {
    const issues = [];
    const recommendations = [];
    let score = 100;

    const photoCount = listing.photos?.length || 0;

    // Check count
    if (photoCount === 0) {
      issues.push('no_photos');
      score -= 40;
      recommendations.push('Add at least 3 photos to increase trust and visibility');
    } else if (photoCount < 2) {
      issues.push('too_few_photos');
      score -= 20;
      recommendations.push(`You have ${photoCount} photo. Add ${3 - photoCount} more for better results`);
    }

    // Check for common photo problems (we'll analyze actual photos if possible)
    if (photoCount > 0) {
      const photoAnalysis = await this.analyzePhotos(listing.photos);
      
      if (photoAnalysis.hasStockPhoto) {
        issues.push('stock_photo_detected');
        score -= 30;
        recommendations.push('Use your own photos, not stock images');
      }

      if (photoAnalysis.isScreenshot) {
        issues.push('screenshot_detected');
        score -= 25;
        recommendations.push('Avoid screenshots - take clear photos of the actual item');
      }

      if (photoAnalysis.blurryCount > 0) {
        issues.push('blurry_photos');
        score -= 15;
        recommendations.push('Retake blurry photos in good lighting');
      }
    }

    return {
      score: Math.max(score, 0),
      photoCount,
      issues,
      recommendations
    };
  }

  /**
   * Analyze actual photo content (using HF or simple checks)
   * @param {Array} photos - Photo URLs
   * @returns {Promise<Object>} Analysis
   */
  async analyzePhotos(photos) {
    // This would use HF image analysis in production
    // For now, return mock analysis based on metadata
    
    return {
      hasStockPhoto: false, // Would check via HF
      isScreenshot: false,
      blurryCount: 0,
      averageSize: 'unknown'
    };
  }

  /**
   * Check description quality
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Description quality
   */
  async checkDescriptionQuality(listing) {
    const issues = [];
    const recommendations = [];
    let score = 100;

    const description = listing.description || '';
    const wordCount = description.split(/\s+/).length;
    const hasDetails = description.length > this.thresholds.descriptionMinLength;

    if (wordCount < 10) {
      issues.push('description_too_short');
      score -= 30;
      recommendations.push('Write at least 30 words describing your item');
    } else if (wordCount < 30) {
      score -= 10;
      recommendations.push('More detailed descriptions sell faster - aim for 50+ words');
    }

    // Check for key information
    const hasCondition = /\b(new|used|mint|excellent|good|fair|poor|condition)\b/i.test(description);
    const hasSpecs = /\b(gb|inch|cm|kg|year|model|size)\b/i.test(description);
    const hasReason = /\b(selling|reason|why)\b/i.test(description);
    const hasContact = /\b(contact|call|whatsapp|reach|dm)\b/i.test(description);

    if (!hasCondition) {
      issues.push('missing_condition');
      score -= 15;
      recommendations.push('Include the condition (new/used) and any defects');
    }

    if (!hasSpecs && listing.category === 'Electronics') {
      issues.push('missing_specifications');
      score -= 10;
      recommendations.push('For electronics, include specs (storage, screen size, year)');
    }

    if (hasContact) {
      // Contact info in description is discouraged
      issues.push('contact_in_description');
      score -= 10;
      recommendations.push('Buyers will message you through the platform - no need to add contact info');
    }

    // AI-enhanced description analysis
    const aiAnalysis = await this.analyzeDescriptionWithAI(description, listing);

    return {
      score: Math.max(score - (100 - aiAnalysis.score), 0),
      wordCount,
      hasCondition,
      hasSpecs,
      issues: [...issues, ...aiAnalysis.issues],
      recommendations: [...recommendations, ...aiAnalysis.recommendations]
    };
  }

  /**
   * AI-powered description analysis
   * @param {string} description - Listing description
   * @param {Object} listing - Full listing
   * @returns {Promise<Object>} AI analysis
   */
  async analyzeDescriptionWithAI(description, listing) {
    if (!description || description.length < 10) {
      return { score: 50, issues: ['description_empty'], recommendations: [] };
    }

    const prompt = `Analyze this marketplace listing description for quality and completeness.

DESCRIPTION: "${description}"
CATEGORY: ${listing.category}

Rate on:
1. Completeness (mentions condition, specs, reason for selling)
2. Clarity (easy to understand, no spelling errors)
3. Trust signals (honest tone, specific details)
4. Engagement (would make someone want to buy)

Return JSON:
{
  "score": 0-100,
  "completeness": "HIGH|MEDIUM|LOW",
  "clarity": "HIGH|MEDIUM|LOW",
  "issues": ["issue1", "issue2"],
  "recommendations": ["suggestion1", "suggestion2"]
}`;

    try {
      const result = await this.callGroq(prompt);
      return this.safeParseJSON(result.content, { score: 70, issues: [], recommendations: [] });
    } catch (error) {
      return { score: 70, issues: [], recommendations: [] };
    }
  }

  /**
   * Check for price anomalies
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Price analysis
   */
  async checkPriceAnomaly(listing) {
    const issues = [];
    const recommendations = [];
    let score = 100;

    const { price, title, category } = listing;
    const content = (title + ' ' + listing.description).toLowerCase();

    // Find matching benchmark
    let benchmark = null;
    const categoryData = this.priceBenchmarks[category];
    
    if (categoryData) {
      for (const [itemType, data] of Object.entries(categoryData)) {
        if (data.models.some(m => content.includes(m))) {
          benchmark = data;
          break;
        }
      }
    }

    // AI-powered price analysis
    const prompt = `Analyze this listing price for the Kenyan market.

ITEM: ${title}
CATEGORY: ${category}
PRICE: KSh ${price}

KENYAN CONTEXT:
- Prices in Nairobi market
- Consider depreciation for used items
- Factor in urgency vs. scam pricing

Is this price:
- Reasonable for the item?
- Suspiciously low (scam indicator)?
- Too high (won't sell)?

Return JSON:
{
  "assessment": "REASONABLE|TOO_LOW|SUSPICIOUS|TOO_HIGH",
  "confidence": 0.0-1.0,
  "marketRange": "KSh XXXX - KSh YYYY",
  "recommendation": "suggested price or 'OK'",
  "reasoning": "brief explanation"
}`;

    let aiAnalysis;
    try {
      const result = await this.callGroq(prompt);
      aiAnalysis = this.safeParseJSON(result.content);
    } catch (error) {
      aiAnalysis = { assessment: 'UNKNOWN', confidence: 0 };
    }

    // Apply analysis
    if (aiAnalysis.assessment === 'TOO_LOW' && aiAnalysis.confidence > 0.7) {
      issues.push('price_suspiciously_low');
      score -= 40;
      recommendations.push(`Price seems too low. Consider KSh ${aiAnalysis.recommendation} for faster sale`);
    } else if (aiAnalysis.assessment === 'TOO_HIGH') {
      issues.push('price_above_market');
      score -= 20;
      recommendations.push(`Price above market range (${aiAnalysis.marketRange}). May take longer to sell`);
    } else if (aiAnalysis.assessment === 'SUSPICIOUS') {
      issues.push('price_suspicious');
      score -= 30;
      recommendations.push('Unusual pricing pattern - please verify item details');
    }

    // Rule-based checks as backup
    if (benchmark && price < benchmark.min * 0.3) {
      issues.push('price_extremely_low');
      score -= 35;
    }

    return {
      score: Math.max(score, 0),
      aiAssessment: aiAnalysis.assessment,
      confidence: aiAnalysis.confidence,
      issues,
      recommendations
    };
  }

  /**
   * Check title optimization
   * @param {Object} listing - Listing data
   * @returns {Object} Title analysis
   */
  async checkTitleOptimization(listing) {
    const issues = [];
    const recommendations = [];
    let score = 100;

    const title = listing.title || '';
    const words = title.split(/\s+/);

    // Length check
    if (words.length < 3) {
      issues.push('title_too_short');
      score -= 30;
      recommendations.push('Add more details to your title (e.g., "iPhone 14 Pro 256GB Purple")');
    } else if (words.length > 15) {
      issues.push('title_too_long');
      score -= 10;
      recommendations.push('Shorten your title for better search results');
    }

    // Check for ALL CAPS
    if (title === title.toUpperCase() && title.length > 5) {
      issues.push('all_caps_title');
      score -= 15;
      recommendations.push('Avoid ALL CAPS - looks spammy');
    }

    // Check for excessive punctuation
    const excessivePunct = (title.match(/[!]{2,}/g) || []).length;
    if (excessivePunct > 0) {
      issues.push('excessive_punctuation');
      score -= 10;
      recommendations.push('Remove excessive exclamation marks');
    }

    // Check for brand/model in title (good for search)
    const hasBrand = /\b(iphone|samsung|sony|nike|adidas|toyota|honda)\b/i.test(title);
    if (!hasBrand && listing.category === 'Electronics') {
      recommendations.push('Include brand and model in title for better search visibility');
    }

    return {
      score: Math.max(score, 0),
      wordCount: words.length,
      issues,
      recommendations
    };
  }

  /**
   * Check category accuracy
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Category check
   */
  async checkCategoryAccuracy(listing) {
    const issues = [];
    const recommendations = [];
    let score = 100;

    const prompt = `Check if this item is in the correct category.

TITLE: ${listing.title}
DESCRIPTION: ${listing.description}
CURRENT CATEGORY: ${listing.category}

Is this correct? If not, what category should it be?

Return JSON:
{
  "isCorrect": boolean,
  "suggestedCategory": "correct category if wrong",
  "confidence": 0.0-1.0
}`;

    try {
      const result = await this.callGroq(prompt);
      const analysis = this.safeParseJSON(result.content);

      if (!analysis.isCorrect && analysis.confidence > 0.7) {
        issues.push('wrong_category');
        score -= 20;
        recommendations.push(`Consider moving to "${analysis.suggestedCategory}" category for better visibility`);
      }

      return {
        score,
        isCorrect: analysis.isCorrect,
        suggestedCategory: analysis.suggestedCategory,
        issues,
        recommendations
      };
    } catch (error) {
      return { score: 100, isCorrect: true, issues: [], recommendations: [] };
    }
  }

  /**
   * Check seller health metrics
   * @param {Object} seller - Seller data
   * @returns {Promise<Object>} Seller health report
   */
  async checkSellerHealth(seller) {
    const metrics = await pool.query(`
      SELECT 
        COUNT(DISTINCT l.id) as active_listings,
        COUNT(CASE WHEN l.status = 'sold' THEN 1 END) as sold_count,
        AVG(CASE WHEN cm.response_time IS NOT NULL THEN cm.response_time END) as avg_response_time,
        COUNT(DISTINCT cm.conversation_id) as total_conversations
      FROM users u
      LEFT JOIN listings l ON l.user_id = u.id AND l.status = 'active'
      LEFT JOIN conversations cm ON (cm.buyer_id = u.id OR cm.seller_id = u.id)
      WHERE u.id = $1
      GROUP BY u.id
    `, [seller.id]);

    const data = metrics.rows[0] || {};
    const avgResponseTime = parseInt(data.avg_response_time) || 0;

    const issues = [];
    const recommendations = [];

    // Check response time
    if (avgResponseTime > 7200) { // > 2 hours
      issues.push('slow_response_time');
      recommendations.push('Try to respond within 1 hour for better sales');
    }

    // Check active vs sold ratio
    const activeCount = parseInt(data.active_listings) || 0;
    const soldCount = parseInt(data.sold_count) || 0;
    
    if (activeCount > 20 && soldCount === 0) {
      issues.push('high_inventory_no_sales');
      recommendations.push('Consider adjusting prices - no sales despite many listings');
    }

    return {
      healthScore: issues.length === 0 ? 'GOOD' : 'NEEDS_ATTENTION',
      metrics: {
        activeListings: activeCount,
        soldCount,
        avgResponseTime: Math.round(avgResponseTime / 60) + ' minutes',
        responseRate: data.total_conversations > 0 ? 'Active' : 'No data'
      },
      issues,
      recommendations
    };
  }

  /**
   * Detect ghost listings (inactive sellers)
   * @returns {Promise<Object>} Ghost listing report
   */
  async detectGhostListings() {
    const ghosts = await pool.query(`
      SELECT 
        l.id,
        l.title,
        l.user_id,
        l.created_at,
        u.username,
        COUNT(DISTINCT m.id) as message_count
      FROM listings l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN conversations c ON c.listing_id = l.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE l.status = 'active'
        AND l.created_at < NOW() - INTERVAL '7 days'
        AND (m.created_at IS NULL OR m.created_at < NOW() - INTERVAL '3 days')
      GROUP BY l.id, l.title, l.user_id, l.created_at, u.username
      HAVING COUNT(DISTINCT m.id) = 0 OR MAX(m.created_at) < NOW() - INTERVAL '3 days'
      LIMIT 100
    `);

    const recommendations = [];

    for (const listing of ghosts.rows) {
      recommendations.push({
        type: 'GHOST_LISTING_WARNING',
        listingId: listing.id,
        userId: listing.user_id,
        action: 'NOTIFY_SELLER',
        reason: 'No activity for 7+ days'
      });
    }

    return {
      ghostListingsFound: ghosts.rows.length,
      listings: ghosts.rows.slice(0, 10),
      recommendations
    };
  }

  /**
   * Get quality grade from score
   * @param {number} score - Quality score
   * @returns {string} Grade
   */
  getQualityGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Store quality metrics
   * @param {string} listingId - Listing ID
   * @param {Object} report - Quality report
   */
  async storeQualityMetrics(listingId, report) {
    try {
      await pool.query(`
        INSERT INTO listing_quality_scores 
        (listing_id, quality_score, grade, issues, recommendations, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (listing_id) 
        DO UPDATE SET 
          quality_score = $2, 
          grade = $3, 
          issues = $4, 
          recommendations = $5,
          updated_at = NOW()
      `, [
        listingId,
        report.qualityScore,
        report.grade,
        JSON.stringify(report.issues),
        JSON.stringify(report.recommendations)
      ]);
    } catch (error) {
      console.error('[Sentinel] Failed to store quality metrics:', error);
    }
  }
}

module.exports = SentinelAgent;
