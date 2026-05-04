/**
 * Weka Soko - Promoter Agent
 * Social Media & Marketing Agent
 * 
 * Responsibilities:
 * - Auto-generate social media content for featured listings
 * - Schedule posts to WhatsApp, Instagram, TikTok
 * - Track engagement
 * - Create promotional campaigns
 * - A/B test messaging
 */

const BaseAgent = require('../base.agent');
const { pool } = require('../../db/pool');

class PromoterAgent extends BaseAgent {
  constructor() {
    super('Promoter');
    
    // Platform configurations
    this.platforms = {
      whatsapp: {
        enabled: true,
        maxLength: 500,
        supportsImages: true
      },
      instagram: {
        enabled: true,
        maxLength: 2200,
        supportsImages: true,
        supportsStories: true
      },
      tiktok: {
        enabled: true,
        maxLength: 2200,
        supportsVideo: true
      }
    };

    // Content templates
    this.templates = {
      standard: {
        whatsapp: '🛒 *{{title}}*\n\n💰 *Price:* {{price}}\n📍 *Location:* {{location}}\n\n{{description}}\n\n👆 Tap to view on Weka Soko',
        instagram: '🔥 {{title}}\n\n💰 {{price}}\n📍 {{location}}\n✨ {{condition}} condition\n\n{{hashtags}}\n\n👆 Link in bio to view & message seller'
      }
    };
  }

  async process(eventType, payload) {
    switch (eventType) {
      case 'listing:featured':
      case 'promotion:purchased':
        return await this.createSocialCampaign(payload);
      
      case 'listing:approved':
        if (payload.price > 50000) { // Auto-promote high-value items
          return await this.createSocialCampaign(payload);
        }
        return { action: 'SKIP', reason: 'Below promotion threshold' };
      
      case 'campaign:schedule':
        return await this.scheduleCampaign(payload);
      
      case 'engagement:track':
        return await this.trackEngagement(payload);
      
      default:
        return { action: 'IGNORE', reason: 'Unknown event type' };
    }
  }

  /**
   * Create social media campaign for a listing
   * @param {Object} listing - Featured listing
   * @returns {Promise<Object>} Campaign data
   */
  async createSocialCampaign(listing) {
    console.log(`[Promoter] Creating campaign for: ${listing.title}`);

    // Generate content
    const content = await this.generateContent(listing);

    // Select best photo
    const bestPhoto = await this.selectBestPhoto(listing.photos);

    // Create campaign
    const campaign = {
      listingId: listing.id,
      sellerId: listing.user_id,
      platforms: [],
      content: {},
      schedule: this.calculateBestTime(),
      status: 'pending'
    };

    // Generate platform-specific content
    for (const [platform, config] of Object.entries(this.platforms)) {
      if (!config.enabled) continue;

      const platformContent = await this.generatePlatformContent(listing, platform);
      
      campaign.platforms.push(platform);
      campaign.content[platform] = platformContent;
    }

    // Store campaign
    await this.storeCampaign(campaign);

    // Schedule for immediate posting
    const scheduled = await this.scheduleCampaign(campaign);

    return {
      action: 'CAMPAIGN_CREATED',
      campaignId: campaign.id,
      platforms: campaign.platforms,
      content: campaign.content,
      scheduledFor: campaign.schedule,
      recommendations: [
        {
          type: 'BOOST_CAMPAIGN',
          condition: listing.price > 100000,
          message: 'Consider paid boost for high-value item'
        },
        {
          type: 'SELLER_NOTIFICATION',
          message: 'Your listing is being promoted on our social channels!'
        }
      ]
    };
  }

  /**
   * Generate marketing content
   * @param {Object} listing - Listing data
   * @returns {Promise<Object>} Generated content
   */
  async generateContent(listing) {
    const prompt = `Create an engaging social media post for this Kenyan marketplace listing.

ITEM: ${listing.title}
PRICE: KSh ${listing.price}
CATEGORY: ${listing.category}
CONDITION: ${listing.condition}
DESCRIPTION: ${listing.description}

Create content for:
1. Instagram caption (engaging, emojis, hashtags)
2. WhatsApp status (concise, direct)
3. Brief tagline for stories

Rules:
- Use Kenyan slang/tone where appropriate
- Include price prominently
- Add urgency without being pushy
- Include call-to-action
- Make it shareable

Return JSON:
{
  "instagram": {
    "caption": "full caption with hashtags",
    "hashtags": ["tag1", "tag2", "tag3"],
    "cta": "call to action"
  },
  "whatsapp": {
    "text": "status text",
    "emoji": "main emoji"
  },
  "tagline": "one line hook",
  "keywords": ["word1", "word2"]
}`;

    try {
      const result = await this.callGroq(prompt);
      return this.safeParseJSON(result.content);
    } catch (error) {
      // Fallback content
      return {
        instagram: {
          caption: `🔥 ${listing.title}\n\n💰 ${this.formatPrice(listing.price)}\n✨ ${listing.condition} condition\n\nPerfect deal! DM for details\n\n#WekaSokoKenya #${listing.category} #NairobiDeals`,
          hashtags: ['#WekaSokoKenya', `#${listing.category}`, '#NairobiDeals', '#KenyaMarketplace'],
          cta: 'Link in bio to view'
        },
        whatsapp: {
          text: `🛒 ${listing.title} - ${this.formatPrice(listing.price)}. Tap to view!`,
          emoji: '🛒'
        },
        tagline: `${listing.title} - ${this.formatPrice(listing.price)}`,
        keywords: [listing.category, listing.condition, 'deal']
      };
    }
  }

  /**
   * Generate platform-specific content
   * @param {Object} listing - Listing data
   * @param {string} platform - Platform name
   * @returns {Promise<Object>} Platform content
   */
  async generatePlatformContent(listing, platform) {
    const baseContent = await this.generateContent(listing);

    switch (platform) {
      case 'whatsapp':
        return {
          text: baseContent.whatsapp.text,
          photo: listing.photos?.[0],
          link: `https://weka-soko-nextjs.vercel.app/listings/${listing.id}`
        };

      case 'instagram':
        return {
          caption: baseContent.instagram.caption,
          hashtags: baseContent.instagram.hashtags.join(' '),
          photo: listing.photos?.[0],
          storyText: baseContent.tagline,
          cta: baseContent.instagram.cta
        };

      case 'tiktok':
        return {
          caption: baseContent.tagline,
          hashtags: '#WekaSokoKenya #KenyaTikTok',
          link: `https://weka-soko-nextjs.vercel.app/listings/${listing.id}`
        };

      default:
        return baseContent;
    }
  }

  /**
   * Select best photo for promotion
   * @param {Array} photos - Photo URLs
   * @returns {Promise<string|null>} Best photo URL
   */
  async selectBestPhoto(photos) {
    if (!photos || photos.length === 0) return null;
    if (photos.length === 1) return photos[0];

    // In production, would analyze photo quality
    // For now, return first photo
    return photos[0];
  }

  /**
   * Calculate best posting time
   * @returns {Date} Scheduled time
   */
  calculateBestTime() {
    const now = new Date();
    const hour = now.getHours();
    
    // Best times for Kenyan audience: 8-9 AM, 12-1 PM, 6-8 PM
    let targetHour;
    if (hour < 8) targetHour = 8;
    else if (hour < 12) targetHour = 12;
    else if (hour < 18) targetHour = 18;
    else targetHour = 8 + 24; // Tomorrow morning

    const schedule = new Date(now);
    schedule.setHours(targetHour, 0, 0, 0);
    
    return schedule;
  }

  /**
   * Schedule campaign
   * @param {Object} campaign - Campaign data
   * @returns {Promise<Object>} Scheduled campaign
   */
  async scheduleCampaign(campaign) {
    // Store in queue for processing
    await pool.query(`
      INSERT INTO promotional_campaigns 
      (listing_id, seller_id, platforms, content, scheduled_at, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW())
      ON CONFLICT (listing_id)
      DO UPDATE SET 
        platforms = $3,
        content = $4,
        scheduled_at = $5,
        status = 'scheduled',
        updated_at = NOW()
    `, [
      campaign.listingId,
      campaign.sellerId,
      JSON.stringify(campaign.platforms),
      JSON.stringify(campaign.content),
      campaign.schedule
    ]);

    return {
      action: 'SCHEDULED',
      scheduledFor: campaign.schedule,
      platforms: campaign.platforms
    };
  }

  /**
   * Execute scheduled campaigns (called by cron)
   * @returns {Promise<Object>} Execution results
   */
  async executeScheduledCampaigns() {
    // Get campaigns ready to post
    const campaigns = await pool.query(`
      SELECT * FROM promotional_campaigns
      WHERE status = 'scheduled'
        AND scheduled_at <= NOW()
      LIMIT 10
    `);

    const results = [];

    for (const campaign of campaigns.rows) {
      const content = JSON.parse(campaign.content);
      const platforms = JSON.parse(campaign.platforms);

      const postResults = [];

      for (const platform of platforms) {
        try {
          const result = await this.postToPlatform(platform, content[platform]);
          postResults.push({ platform, success: result.success });
        } catch (error) {
          postResults.push({ platform, success: false, error: error.message });
        }
      }

      // Update status
      const allSuccess = postResults.every(r => r.success);
      await pool.query(`
        UPDATE promotional_campaigns
        SET status = $1, executed_at = NOW(), results = $2
        WHERE id = $3
      `, [allSuccess ? 'completed' : 'partial', JSON.stringify(postResults), campaign.id]);

      results.push({
        campaignId: campaign.id,
        listingId: campaign.listing_id,
        results: postResults
      });
    }

    return {
      action: 'CAMPAIGNS_EXECUTED',
      count: results.length,
      results
    };
  }

  /**
   * Post to specific platform
   * @param {string} platform - Platform name
   * @param {Object} content - Content to post
   * @returns {Promise<Object>} Post result
   */
  async postToPlatform(platform, content) {
    // This would integrate with actual social APIs
    // For now, log and return success

    console.log(`[Promoter] Would post to ${platform}:`, content.text?.substring(0, 100));

    // In production:
    // - Instagram: Use Instagram Graph API
    // - WhatsApp: Use WhatsApp Business API
    // - TikTok: Use TikTok API (requires approval)

    return {
      success: true,
      platform,
      timestamp: new Date().toISOString(),
      note: 'Posted to queue (requires social API integration)'
    };
  }

  /**
   * Track engagement
   * @param {Object} event - Engagement event
   * @returns {Promise<Object>} Engagement data
   */
  async trackEngagement(event) {
    const { campaignId, platform, metric, value } = event;

    await pool.query(`
      INSERT INTO campaign_engagement
      (campaign_id, platform, metric, value, recorded_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [campaignId, platform, metric, value]);

    return {
      action: 'ENGAGEMENT_TRACKED',
      campaignId,
      metric,
      value
    };
  }

  /**
   * Get campaign performance
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} Performance metrics
   */
  async getCampaignPerformance(campaignId) {
    const metrics = await pool.query(`
      SELECT 
        platform,
        metric,
        SUM(value) as total,
        COUNT(*) as count
      FROM campaign_engagement
      WHERE campaign_id = $1
      GROUP BY platform, metric
    `, [campaignId]);

    const campaign = await pool.query(`
      SELECT * FROM promotional_campaigns WHERE id = $1
    `, [campaignId]);

    return {
      campaign: campaign.rows[0],
      metrics: metrics.rows,
      summary: {
        totalImpressions: this.getMetric(metrics.rows, 'impression'),
        totalClicks: this.getMetric(metrics.rows, 'click'),
        totalShares: this.getMetric(metrics.rows, 'share')
      }
    };
  }

  /**
   * Get metric from results
   * @param {Array} metrics - Metrics array
   * @param {string} type - Metric type
   * @returns {number} Total value
   */
  getMetric(metrics, type) {
    return metrics
      .filter(m => m.metric === type)
      .reduce((sum, m) => sum + parseInt(m.total), 0);
  }

  /**
   * Store campaign
   * @param {Object} campaign - Campaign data
   */
  async storeCampaign(campaign) {
    // Campaign is stored in scheduleCampaign
    // This is a placeholder for any additional storage
  }

  /**
   * Generate hashtags
   * @param {Object} listing - Listing data
   * @returns {Array} Hashtags
   */
  generateHashtags(listing) {
    const baseTags = ['#WekaSokoKenya', '#KenyaMarketplace', '#NairobiDeals'];
    
    const categoryTags = {
      'Electronics': ['#TechDealsKE', '#ElectronicsKenya', '#GadgetsKE'],
      'Vehicles': ['#CarsKenya', '#NairobiCars', '#AutoKE'],
      'Property': ['#PropertyKE', '#RentalsNairobi', '#HousingKenya'],
      'Clothing': ['#FashionKE', '#NairobiFashion', '#StyleKenya']
    };

    return [
      ...baseTags,
      ...(categoryTags[listing.category] || []),
      `#${listing.condition.replace(' ', '')}`,
      '#ForSale'
    ];
  }
}

module.exports = PromoterAgent;
