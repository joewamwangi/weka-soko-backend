/**
 * Weka Soko - Listing Hooks
 * Automatically triggers agents on listing events
 */

const orchestrator = require('../orchestrator');
const { pool } = require('../../db/pool');

async function onListingCreated(listing) {
  console.log(`[Hooks] Listing created: ${listing.id}`);
  
  try {
    const result = await orchestrator.processEvent('listing:created', listing, {
      parallel: true,
      cache: true
    });

    // Auto-actions from Gatekeeper
    if (result.results?.agents?.gatekeeper) {
      const gatekeeper = result.results.agents.gatekeeper;
      
      if (gatekeeper.result?.action === 'REJECT') {
        await pool.query(
          "UPDATE listings SET status = 'rejected' WHERE id = $1",
          [listing.id]
        );
        console.log(`[Hooks] Auto-rejected listing ${listing.id}`);
      } else if (gatekeeper.result?.action === 'REVIEW') {
        await pool.query(`
          INSERT INTO flagged_content_queue (target_id, target_type, reason, risk_score)
          VALUES ($1, 'listing', $2, $3)
        `, [listing.id, gatekeeper.result.flags.join(', '), gatekeeper.result.riskScore]);
      }
    }

    return result;
  } catch (error) {
    console.error('[Hooks] Listing created hook error:', error);
    return { error: error.message };
  }
}

async function onListingApproved(listing) {
  console.log(`[Hooks] Listing approved: ${listing.id}`);
  
  try {
    const result = await orchestrator.processEvent('listing:approved', listing);

    if (listing.price > 50000 || listing.featured) {
      await orchestrator.processEvent('listing:featured', listing);
    }

    return result;
  } catch (error) {
    console.error('[Hooks] Listing approved hook error:', error);
  }
}

async function onListingUpdated(listing) {
  console.log(`[Hooks] Listing updated: ${listing.id}`);
  try {
    return await orchestrator.processEvent('listing:updated', listing);
  } catch (error) {
    console.error('[Hooks] Listing updated hook error:', error);
  }
}

async function onListingViewed(listingId, userId) {
  const event = { listingId, userId, timestamp: new Date().toISOString() };
  orchestrator.processEvent('listing:viewed', event).catch(console.error);
}

module.exports = {
  onListingCreated,
  onListingApproved,
  onListingUpdated,
  onListingViewed
};
