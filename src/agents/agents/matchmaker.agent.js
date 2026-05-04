/**
 * Weka Soko - Matchmaker Agent
 * Growth & Discovery Agent
 * 
 * Responsibilities:
 * - Match buyer requests to listings
 * - Recommend listings to buyers
 * - Notify sellers of potential buyers
 * - Cross-sell recommendations
 * - User onboarding personalization
 */

const BaseAgent = require('../base.agent');
const { pool } = require('../../db/pool');

class MatchmakerAgent extends BaseAgent {
  constructor() {
    super('Matchmaker');
    
    // Match configuration
    this.config = {
      minSimilarity: 0.7,      // Minimum 70% similarity for match
      maxMatches: 5,           // Max matches to return
      notificationCooldown: 24, // Hours between notifications
      priceFlexibility: 0.25    // ±25% price difference acceptable
    };
  }

  async process(eventType, payload) {
    switch (eventType) {
      case 'listing:approved':
        return await this.findBuyersForListing(payload);
      
      case 'buyer_request:created':
        return await this.findListingsForRequest(payload);
      
      case 'user:preferences_updated':
        return await this.updateUserRecommendations(payload);
      
      case 'user:registered':
        return await this.onboardNewUser(payload);
      
      case 'listing:viewed':
        return await this.generateRecommendations(payload);
      
      default:
        return { action: 'IGNORE', reason: 'Unknown event type' };
    }
  }

  /**
   * Find buyers for a newly approved listing
   * @param {Object} listing - Approved listing
   * @returns {Promise<Object>} Matches found
   */
  async findBuyersForListing(listing) {
    console.log(`[Matchmaker] Finding buyers for: ${listing.title}`);

    // Method 1: Match against active buyer requests
    const requestMatches = await this.matchAgainstBuyerRequests(listing);
    
    // Method 2: Find users who viewed similar items
    const viewerMatches = await this.matchAgainstViewHistory(listing);
    
    // Method 3: Find users with saved searches
    const searchMatches = await this.matchAgainstSavedSearches(listing);

    // Combine and deduplicate matches
    const allMatches = this.combineMatches([
      ...requestMatches,
      ...viewerMatches,
      ...searchMatches
    ]);

    // Score and rank matches
    const rankedMatches = this.rankMatches(allMatches, listing);

    // Send notifications (respecting cooldown)
    const notifications = await this.sendMatchNotifications(rankedMatches, listing);

    // Store matches
    await this.storeMatches(listing.id, rankedMatches);

    return {
      action: 'NOTIFY_BUYERS',
      listingId: listing.id,
      matchesFound: rankedMatches.length,
      matches: rankedMatches.slice(0, 10),
      notificationsSent: notifications.sent,
      notificationsSkipped: notifications.skipped,
      recommendations: [
        {
          type: 'BOOST_VISIBILITY',
          message: `Listing matched with ${rankedMatches.length} potential buyers`
        },
        ...rankedMatches.slice(0, 3).map(m => ({
          type: 'SUGGEST_PRICE',
          toUser: m.buyerId,
          message: `Buyer willing to pay around KSh ${m.preferredPrice}` 
        }))
      ]
    };
  }

  /**
   * Match listing against active buyer requests
   * @param {Object} listing - The listing
   * @returns {Promise<Array>} Matching requests
   */
  async matchAgainstBuyerRequests(listing) {
    const matches = await pool.query(`
      SELECT 
        br.id as request_id,
        br.user_id as buyer_id,
        br.title as request_title,
        br.description as request_description,
        br.budget_min,
        br.budget_max,
        br.category,
        br.condition_preference,
        br.created_at,
        u.username,
        u.email
      FROM buyer_requests br
      JOIN users u ON br.user_id = u.id
      WHERE br.status = 'active'
        AND br.category = $1
        AND ($2 BETWEEN br.budget_min * 0.8 AND br.budget_max * 1.2 OR br.budget_max IS NULL)
        AND br.created_at > NOW() - INTERVAL '30 days'
        AND br.user_id != $3
      ORDER BY br.created_at DESC
      LIMIT 20
    `, [listing.category, listing.price, listing.user_id]);

    const results = [];

    for (const request of matches.rows) {
      // Calculate similarity score
      const similarity = await this.calculateSimilarity(
        `${listing.title} ${listing.description}`,
        `${request.request_title} ${request.request_description}`
      );

      if (similarity >= this.config.minSimilarity) {
        results.push({
          buyerId: request.buyer_id,
          buyerName: request.username,
          matchType: 'BUYER_REQUEST',
          matchSource: request.request_id,
          similarity: Math.round(similarity * 100),
          preferredPrice: request.budget_max || request.budget_min,
          urgency: this.calculateUrgency(request.created_at),
          contactMethod: 'platform_message'
        });
      }
    }

    return results;
  }

  /**
   * Match against users who viewed similar items
   * @param {Object} listing - The listing
   * @returns {Promise<Array>} Potential buyers
   */
  async matchAgainstViewHistory(listing) {
    const viewers = await pool.query(`
      SELECT DISTINCT ON (vl.user_id)
        vl.user_id as buyer_id,
        u.username,
        COUNT(vl.id) as view_count,
        MAX(vl.created_at) as last_view,
        AVG(l.price) as avg_viewed_price
      FROM view_logs vl
      JOIN listings l ON vl.listing_id = l.id
      JOIN users u ON vl.user_id = u.id
      WHERE l.category = $1
        AND l.status IN ('active', 'sold')
        AND vl.user_id != $2
        AND vl.created_at > NOW() - INTERVAL '14 days'
      GROUP BY vl.user_id, u.username
      HAVING COUNT(vl.id) >= 2
      LIMIT 20
    `, [listing.category, listing.user_id]);

    return viewers.rows.map(viewer => ({
      buyerId: viewer.buyer_id,
      buyerName: viewer.username,
      matchType: 'SIMILAR_VIEWER',
      similarity: 75, // Estimated
      preferredPrice: Math.round(viewer.avg_viewed_price),
      urgency: 'MEDIUM',
      viewCount: parseInt(viewer.view_count),
      lastView: viewer.last_view
    }));
  }

  /**
   * Match against saved searches
   * @param {Object} listing - The listing
   * @returns {Promise<Array>} Matching searches
   */
  async matchAgainstSavedSearches(listing) {
    // This would query saved_searches table
    // For now, return empty (implement when table exists)
    return [];
  }

  /**
   * Find listings for a buyer request
   * @param {Object} request - Buyer request
   * @returns {Promise<Object>} Matching listings
   */
  async findListingsForRequest(request) {
    console.log(`[Matchmaker] Finding listings for request: ${request.title}`);

    // Get potential matches
    const listings = await pool.query(`
      SELECT 
        l.id,
        l.title,
        l.description,
        l.price,
        l.condition,
        l.photos,
        l.user_id as seller_id,
        u.username as seller_name,
        u.avg_response_time,
        l.created_at
      FROM listings l
      JOIN users u ON l.user_id = u.id
      WHERE l.status = 'active'
        AND l.category = $1
        AND l.price BETWEEN $2 AND $3
        AND l.user_id != $4
      ORDER BY l.created_at DESC
      LIMIT 20
    `, [
      request.category,
      request.budget_min * (1 - this.config.priceFlexibility),
      request.budget_max * (1 + this.config.priceFlexibility),
      request.user_id
    ]);

    const matches = [];

    for (const listing of listings.rows) {
      // Check condition preference
      if (request.condition_preference && 
          listing.condition !== request.condition_preference) {
        continue;
      }

      // Calculate text similarity
      const similarity = await this.calculateSimilarity(
        `${request.title} ${request.description}`,
        `${listing.title} ${listing.description}`
      );

      if (similarity >= this.config.minSimilarity) {
        // Check seller quality
        const sellerQuality = await this.getSellerQuality(listing.seller_id);
        
        matches.push({
          listingId: listing.id,
          title: listing.title,
          price: listing.price,
          condition: listing.condition,
          photos: listing.photos,
          sellerId: listing.seller_id,
          sellerName: listing.seller_name,
          sellerQuality: sellerQuality.score,
          sellerResponseTime: sellerQuality.responseTime,
          similarity: Math.round(similarity * 100),
          priceMatch: this.calculatePriceMatch(request.budget_max, listing.price),
          isNew: this.isNewListing(listing.created_at)
        });
      }
    }

    // Sort by combined score
    const ranked = matches
      .map(m => ({
        ...m,
        combinedScore: (m.similarity * 0.4) + 
                       (m.sellerQuality * 0.3) + 
                       (m.priceMatch * 0.3)
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, this.config.maxMatches);

    // Notify buyer
    await this.notifyBuyerOfMatches(request.user_id, ranked);

    return {
      action: 'NOTIFY_BUYER',
      requestId: request.id,
      matchesFound: ranked.length,
      matches: ranked,
      recommendations: [
        {
          type: 'SUGGEST_BROADER_SEARCH',
          condition: ranked.length < 3,
          message: 'Try expanding your budget or condition preferences'
        }
      ]
    };
  }

  /**
   * Calculate text similarity using embeddings
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {Promise<number>} Similarity 0-1
   */
  async calculateSimilarity(text1, text2) {
    try {
      // Simple fallback: keyword matching
      const words1 = new Set(text1.toLowerCase().split(/\s+/));
      const words2 = new Set(text2.toLowerCase().split(/\s+/));
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      
      return intersection.size / union.size;
    } catch (error) {
      return 0.5; // Default
    }
  }

  /**
   * Calculate urgency based on request age
   * @param {Date} createdAt - Creation date
   * @returns {string} Urgency level
   */
  calculateUrgency(createdAt) {
    const days = (Date.now() - new Date(createdAt)) / (1000 * 60 * 60 * 24);
    if (days < 1) return 'HIGH';
    if (days < 7) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate how well price matches preference
   * @param {number} budget - Buyer's budget
   * @param {number} price - Listing price
   * @returns {number} Match score 0-100
   */
  calculatePriceMatch(budget, price) {
    if (!budget) return 50;
    const ratio = price / budget;
    if (ratio <= 1) return 100; // Under budget = perfect
    if (ratio <= 1.1) return 80;
    if (ratio <= 1.25) return 60;
    return 30;
  }

  /**
   * Check if listing is new
   * @param {Date} createdAt - Creation date
   * @returns {boolean}
   */
  isNewListing(createdAt) {
    const hours = (Date.now() - new Date(createdAt)) / (1000 * 60 * 60);
    return hours < 24;
  }

  /**
   * Get seller quality metrics
   * @param {string} sellerId - Seller ID
   * @returns {Promise<Object>} Quality metrics
   */
  async getSellerQuality(sellerId) {
    const result = await pool.query(`
      SELECT 
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(r.id) as review_count,
        COALESCE(AVG(cm.response_time), 0) as avg_response_time
      FROM users u
      LEFT JOIN reviews r ON r.seller_id = u.id
      LEFT JOIN conversations c ON c.seller_id = u.id
      LEFT JOIN chat_metrics cm ON cm.conversation_id = c.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [sellerId]);

    const data = result.rows[0] || {};
    
    return {
      score: Math.min(parseFloat(data.avg_rating) * 20, 100) || 50,
      responseTime: Math.round(parseFloat(data.avg_response_time) / 60) || 60
    };
  }

  /**
   * Combine and deduplicate matches
   * @param {Array} matches - All matches
   * @returns {Array} Deduplicated matches
   */
  combineMatches(matches) {
    const seen = new Map();
    
    for (const match of matches) {
      const key = match.buyerId;
      if (!seen.has(key) || seen.get(key).similarity < match.similarity) {
        seen.set(key, match);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Rank matches by relevance
   * @param {Array} matches - Matches to rank
   * @param {Object} listing - Reference listing
   * @returns {Array} Ranked matches
   */
  rankMatches(matches, listing) {
    return matches
      .map(m => ({
        ...m,
        score: (m.similarity * 0.5) + 
               (m.urgency === 'HIGH' ? 30 : m.urgency === 'MEDIUM' ? 20 : 10)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxMatches);
  }

  /**
   * Send notifications to matched buyers
   * @param {Array} matches - Matched buyers
   * @param {Object} listing - The listing
   * @returns {Promise<Object>} Notification results
   */
  async sendMatchNotifications(matches, listing) {
    const sent = [];
    const skipped = [];

    for (const match of matches) {
      // Check cooldown
      const lastNotification = await pool.query(`
        SELECT created_at 
        FROM notifications 
        WHERE user_id = $1 
        AND type = 'MATCH'
        ORDER BY created_at DESC
        LIMIT 1
      `, [match.buyerId]);

      const hoursSinceLast = lastNotification.rows[0] 
        ? (Date.now() - new Date(lastNotification.rows[0].created_at)) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceLast < this.config.notificationCooldown) {
        skipped.push({
          buyerId: match.buyerId,
          reason: 'cooldown_active',
          retryAfter: this.config.notificationCooldown - hoursSinceLast
        });
        continue;
      }

      // Generate personalized message
      const message = await this.generateMatchMessage(match, listing);

      // Create notification
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, data, created_at)
        VALUES ($1, $2, $3, 'MATCH', $4, NOW())
      `, [
        match.buyerId,
        'New Match for Your Request!',
        message,
        JSON.stringify({
          listingId: listing.id,
          listingTitle: listing.title,
          listingPrice: listing.price,
          matchType: match.matchType,
          similarity: match.similarity
        })
      ]);

      sent.push({
        buyerId: match.buyerId,
        messagePreview: message.substring(0, 100)
      });
    }

    return { sent, skipped };
  }

  /**
   * Generate personalized match message
   * @param {Object} match - Match data
   * @param {Object} listing - Listing data
   * @returns {Promise<string>} Message
   */
  async generateMatchMessage(match, listing) {
    const prompt = `Write a friendly notification message in Kenyan style.

NOTIFICATION: We found a match for a buyer looking for items

Listing: "${listing.title}"
Price: KSh ${listing.price}
Match quality: ${match.similarity}% similar

Write a message that:
- Is friendly and enthusiastic
- Mentions the match quality
- Encourages them to check it out
- Keep it under 2 sentences
- Use casual Kenyan tone (can use sheng if appropriate)`;

    try {
      const result = await this.callGroq(prompt);
      return result.content.replace(/"/g, '');
    } catch (error) {
      return `We found a ${match.similarity}% match! Check out "${listing.title}" at KSh ${listing.price}`;
    }
  }

  /**
   * Notify buyer of matches
   * @param {string} userId - Buyer ID
   * @param {Array} matches - Matching listings
   */
  async notifyBuyerOfMatches(userId, matches) {
    if (matches.length === 0) return;

    const summary = matches.length === 1
      ? `We found 1 listing that matches your request!`
      : `We found ${matches.length} listings that match your request!`;

    await pool.query(`
      INSERT INTO notifications (user_id, title, message, type, data, created_at)
      VALUES ($1, $2, $3, 'REQUEST_MATCH', $4, NOW())
    `, [
      userId,
      summary,
      `Top match: "${matches[0].title}" at KSh ${matches[0].price} from ${matches[0].sellerName}`,
      JSON.stringify({
        requestId: null, // Would be set from context
        matches: matches.slice(0, 5).map(m => ({
          listingId: m.listingId,
          title: m.title,
          price: m.price,
          sellerName: m.sellerName
        }))
      })
    ]);
  }

  /**
   * Store matches in database
   * @param {string} listingId - Listing ID
   * @param {Array} matches - Match data
   */
  async storeMatches(listingId, matches) {
    for (const match of matches) {
      await pool.query(`
        INSERT INTO listing_matches 
        (listing_id, buyer_id, match_type, similarity, matched_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (listing_id, buyer_id)
        DO UPDATE SET 
          similarity = $4,
          matched_at = NOW()
      `, [listingId, match.buyerId, match.matchType, match.similarity]);
    }
  }

  /**
   * Update user recommendations
   * @param {Object} user - User data
   * @returns {Promise<Object>} Updated recommendations
   */
  async updateUserRecommendations(user) {
    // Get user's view history
    const views = await pool.query(`
      SELECT l.category, l.price
      FROM view_logs vl
      JOIN listings l ON vl.listing_id = l.id
      WHERE vl.user_id = $1
      ORDER BY vl.created_at DESC
      LIMIT 50
    `, [user.id]);

    // Analyze preferences
    const categories = {};
    const priceRanges = [];

    for (const view of views.rows) {
      categories[view.category] = (categories[view.category] || 0) + 1;
      priceRanges.push(view.price);
    }

    // Top category
    const topCategory = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Average price range
    const avgPrice = priceRanges.reduce((a, b) => a + b, 0) / priceRanges.length;

    return {
      preferences: {
        topCategory,
        priceRange: {
          min: avgPrice * 0.7,
          max: avgPrice * 1.3
        }
      },
      recommendations: topCategory ? await this.getRecommendations(user.id, topCategory, avgPrice) : []
    };
  }

  /**
   * Get personalized recommendations
   * @param {string} userId - User ID
   * @param {string} category - Preferred category
   * @param {number} avgPrice - Average price viewed
   * @returns {Promise<Array>} Recommendations
   */
  async getRecommendations(userId, category, avgPrice) {
    const listings = await pool.query(`
      SELECT l.id, l.title, l.price, l.photos
      FROM listings l
      WHERE l.status = 'active'
        AND l.category = $1
        AND l.price BETWEEN $2 AND $3
        AND l.user_id != $4
        AND l.id NOT IN (
          SELECT listing_id FROM view_logs WHERE user_id = $4
        )
      ORDER BY l.created_at DESC
      LIMIT 10
    `, [category, avgPrice * 0.7, avgPrice * 1.3, userId]);

    return listings.rows;
  }

  /**
   * Onboard new user with personalized suggestions
   * @param {Object} user - New user
   * @returns {Promise<Object>} Onboarding data
   */
  async onboardNewUser(user) {
    // Get popular categories
    const popular = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM listings
      WHERE status = 'active'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `);

    // Get featured listings
    const featured = await pool.query(`
      SELECT l.id, l.title, l.price, l.photos
      FROM listings l
      WHERE l.status = 'active'
        AND l.featured = true
      ORDER BY l.created_at DESC
      LIMIT 5
    `);

    // Generate welcome message
    const prompt = `Write a warm welcome message for a new user joining a Kenyan marketplace.

Tone: Friendly, helpful, Kenyan
Mention: They can browse or post for free, pay only when they sell
Keep it under 3 sentences
Encouraging and welcoming`;

    let welcomeMessage;
    try {
      const result = await this.callGroq(prompt);
      welcomeMessage = result.content;
    } catch (error) {
      welcomeMessage = `Welcome to Weka Soko! Browse thousands of items or post your own for free. You only pay KSh 250 when a serious buyer is ready to buy.`;
    }

    return {
      action: 'SEND_WELCOME',
      welcomeMessage,
      popularCategories: popular.rows,
      featuredListings: featured.rows,
      nextSteps: [
        'Complete your profile',
        'Browse popular categories',
        'Post your first listing'
      ]
    };
  }

  /**
   * Generate recommendations based on view
   * @param {Object} event - View event
   * @returns {Promise<Object>} Recommendations
   */
  async generateRecommendations(event) {
    const { userId, listingId } = event;

    // Get similar items
    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (listing.rows.length === 0) return { action: 'NONE' };

    const data = listing.rows[0];

    // Find similar items
    const similar = await pool.query(`
      SELECT l.id, l.title, l.price, l.condition, l.photos
      FROM listings l
      WHERE l.status = 'active'
        AND l.category = $1
        AND l.price BETWEEN $2 AND $3
        AND l.id != $4
        AND l.id NOT IN (
          SELECT listing_id FROM view_logs WHERE user_id = $5
        )
      ORDER BY RANDOM()
      LIMIT 4
    `, [data.category, data.price * 0.7, data.price * 1.5, listingId, userId]);

    return {
      action: 'SHOW_RECOMMENDATIONS',
      similarItems: similar.rows,
      recommendations: [
        {
          type: 'SIMILAR_ITEMS',
          items: similar.rows
        }
      ]
    };
  }
}

module.exports = MatchmakerAgent;
