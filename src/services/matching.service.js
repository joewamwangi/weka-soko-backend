const { query } = require("../db/pool");

/**
 * Calculate relevance score between a listing and a buyer request
 * Score is 0-100 based on:
 * - Category match (40 points)
 * - Keywords match (35 points)
 * - Price range match (25 points)
 */
function calculateRelevanceScore(listing, request) {
  let score = 0;

  // Category match (40 points)
  if (request.category && listing.category === request.category) {
    score += 40;
  } else if (request.category && listing.category) {
    // Partial credit for same category
    score += 20;
  }

  // Keywords match (35 points)
  if (request.keywords) {
    const keywords = request.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    const listingText = `${listing.title} ${listing.description}`.toLowerCase();
    const matches = keywords.filter(k => listingText.includes(k)).length;
    if (keywords.length > 0) {
      score += Math.round((matches / keywords.length) * 35);
    }
  }

  // Price range match (25 points)
  if (request.min_price || request.max_price) {
    const listingPrice = parseFloat(listing.price);
    let priceMatch = false;

    if (request.min_price && request.max_price) {
      if (listingPrice >= request.min_price && listingPrice <= request.max_price) {
        score += 25;
        priceMatch = true;
      }
    } else if (request.min_price && listingPrice >= request.min_price) {
      score += 25;
      priceMatch = true;
    } else if (request.max_price && listingPrice <= request.max_price) {
      score += 25;
      priceMatch = true;
    }

    // Partial credit if close to range
    if (!priceMatch) {
      if (request.min_price && listingPrice >= request.min_price * 0.9) {
        score += 10;
      } else if (request.max_price && listingPrice <= request.max_price * 1.1) {
        score += 10;
      }
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Find all listings that match a buyer request
 */
async function findMatchingListings(requestId) {
  try {
    // Get the buyer request
    const { rows: requestRows } = await query(
      `SELECT * FROM buyer_requests WHERE id = $1`,
      [requestId]
    );

    if (!requestRows.length) {
      throw new Error("Request not found");
    }

    const request = requestRows[0];

    // Find active listings that match
    const conditions = ["l.status = 'active'", "l.expires_at > NOW()"];
    const params = [];

    // Category match
    if (request.category) {
      params.push(request.category);
      conditions.push(`l.category = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: listings } = await query(
      `SELECT l.id, l.title, l.description, l.category, l.price, l.seller_id, l.created_at
       FROM listings l
       ${where}
       ORDER BY l.created_at DESC
       LIMIT 100`,
      params
    );

    // Calculate relevance scores
    const matches = listings
      .map(listing => ({
        ...listing,
        relevance_score: calculateRelevanceScore(listing, request),
      }))
      .filter(m => m.relevance_score >= 30) // Only include matches with score >= 30
      .sort((a, b) => b.relevance_score - a.relevance_score);

    return matches;
  } catch (err) {
    console.error("[Matching Service] Error finding matches:", err);
    throw err;
  }
}

/**
 * Find all buyer requests that match a listing
 */
async function findMatchingRequests(listingId) {
  try {
    // Get the listing
    const { rows: listingRows } = await query(
      `SELECT * FROM listings WHERE id = $1`,
      [listingId]
    );

    if (!listingRows.length) {
      throw new Error("Listing not found");
    }

    const listing = listingRows[0];

    // Find active requests that match
    const conditions = ["r.status = 'active'"];
    const params = [];

    // Category match
    if (listing.category) {
      params.push(listing.category);
      conditions.push(`r.category = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const { rows: requests } = await query(
      `SELECT r.id, r.user_id, r.title, r.description, r.category, r.keywords, r.min_price, r.max_price, r.created_at
       FROM buyer_requests r
       ${where}
       ORDER BY r.created_at DESC
       LIMIT 100`,
      params
    );

    // Calculate relevance scores
    const matches = requests
      .map(request => ({
        ...request,
        relevance_score: calculateRelevanceScore(listing, request),
      }))
      .filter(m => m.relevance_score >= 30) // Only include matches with score >= 30
      .sort((a, b) => b.relevance_score - a.relevance_score);

    return matches;
  } catch (err) {
    console.error("[Matching Service] Error finding matching requests:", err);
    throw err;
  }
}

/**
 * Notify buyer about matching listings
 */
async function notifyBuyerOfMatches(requestId, matches, io) {
  try {
    const { rows: requestRows } = await query(
      `SELECT user_id FROM buyer_requests WHERE id = $1`,
      [requestId]
    );

    if (!requestRows.length) return;

    const buyerId = requestRows[0].user_id;

    for (const match of matches.slice(0, 3)) {
      // Only notify about top 3 matches
      await query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'listing_match', 'New listing matches your request!', $2, $3)`,
        [
          buyerId,
          `"${match.title}" matches your request. Relevance: ${match.relevance_score}%`,
          JSON.stringify({
            listing_id: match.id,
            request_id: requestId,
            relevance_score: match.relevance_score,
          }),
        ]
      );

      // Real-time notification
      if (io) {
        io.to(`user:${buyerId}`).emit("notification", {
          type: "listing_match",
          title: "New listing matches your request!",
          body: `"${match.title}" matches your request.`,
          data: {
            listing_id: match.id,
            request_id: requestId,
            relevance_score: match.relevance_score,
          },
        });
      }
    }
  } catch (err) {
    console.error("[Matching Service] Error notifying buyer:", err);
  }
}

/**
 * Notify sellers about matching buyer requests
 */
async function notifySellerOfMatches(listingId, matches, io) {
  try {
    const { rows: listingRows } = await query(
      `SELECT seller_id FROM listings WHERE id = $1`,
      [listingId]
    );

    if (!listingRows.length) return;

    const sellerId = listingRows[0].seller_id;

    for (const match of matches.slice(0, 3)) {
      // Only notify about top 3 matches
      await query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'request_match', 'Your listing matches a buyer request!', $2, $3)`,
        [
          sellerId,
          `A buyer is looking for "${match.title}". Your listing matches ${match.relevance_score}%.`,
          JSON.stringify({
            listing_id: listingId,
            request_id: match.id,
            relevance_score: match.relevance_score,
          }),
        ]
      );

      // Real-time notification
      if (io) {
        io.to(`user:${sellerId}`).emit("notification", {
          type: "request_match",
          title: "Your listing matches a buyer request!",
          body: `A buyer is looking for "${match.title}".`,
          data: {
            listing_id: listingId,
            request_id: match.id,
            relevance_score: match.relevance_score,
          },
        });
      }
    }
  } catch (err) {
    console.error("[Matching Service] Error notifying seller:", err);
  }
}

module.exports = {
  calculateRelevanceScore,
  findMatchingListings,
  findMatchingRequests,
  notifyBuyerOfMatches,
  notifySellerOfMatches,
};
