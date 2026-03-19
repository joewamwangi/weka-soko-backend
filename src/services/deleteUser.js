// src/services/deleteUser.js
// Shared utility — completely purges a user and all their data.
// Used by both self-delete (auth.js) and admin delete (admin.js).

const { query, withTransaction } = require("../db/pool");

async function deleteUserCompletely(uid) {
  // ── Step 1: Collect Cloudinary public_ids for all listing photos ──────────
  // We need these BEFORE deleting DB rows (CASCADE will wipe listing_photos)
  const { rows: photoRows } = await query(
    `SELECT lp.public_id
     FROM listing_photos lp
     JOIN listings l ON l.id = lp.listing_id
     WHERE l.seller_id = $1 AND lp.public_id IS NOT NULL`,
    [uid]
  ).catch(() => ({ rows: [] }));

  // ── Step 2: Delete everything in the correct FK order ─────────────────────
  await withTransaction(async (client) => {

    // Nullify FK references that must stay (payments audit trail etc.)
    await client.query(`UPDATE payments SET payer_id=NULL WHERE payer_id=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE escrows SET approved_by=NULL WHERE approved_by=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE escrows SET released_by=NULL WHERE released_by=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE disputes SET resolved_by=NULL WHERE resolved_by=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE listings SET locked_buyer_id=NULL, locked_at=NULL WHERE locked_buyer_id=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE listings SET reviewed_by=NULL WHERE reviewed_by=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE chat_violations SET reviewed_by=NULL WHERE reviewed_by=$1`, [uid]).catch(()=>{});
    await client.query(`UPDATE vouchers SET created_by=NULL WHERE created_by=$1`, [uid]).catch(()=>{});

    // Delete escrows where user is buyer or seller
    // (payments linked to these escrows first)
    await client.query(
      `DELETE FROM payments WHERE listing_id IN (
         SELECT id FROM listings WHERE seller_id=$1
       )`, [uid]
    ).catch(()=>{});
    await client.query(
      `DELETE FROM disputes WHERE escrow_id IN (
         SELECT id FROM escrows WHERE buyer_id=$1 OR seller_id=$1
       )`, [uid]
    ).catch(()=>{});
    await client.query(`DELETE FROM escrows WHERE buyer_id=$1 OR seller_id=$1`, [uid]).catch(()=>{});

    // Delete all reviews written by or about this user
    await client.query(`DELETE FROM reviews WHERE reviewer_id=$1 OR reviewee_id=$1`, [uid]).catch(()=>{});

    // Delete seller pitches
    await client.query(`DELETE FROM seller_pitches WHERE seller_id=$1`, [uid]).catch(()=>{});

    // Delete buyer requests (and any pitches on those requests)
    await client.query(
      `DELETE FROM seller_pitches WHERE request_id IN (
         SELECT id FROM buyer_requests WHERE user_id=$1
       )`, [uid]
    ).catch(()=>{});
    await client.query(`DELETE FROM buyer_requests WHERE user_id=$1`, [uid]).catch(()=>{});

    // Delete listing reports (both as reporter and reports ON their listings)
    await client.query(`DELETE FROM listing_reports WHERE reporter_id=$1`, [uid]).catch(()=>{});
    await client.query(
      `DELETE FROM listing_reports WHERE listing_id IN (
         SELECT id FROM listings WHERE seller_id=$1
       )`, [uid]
    ).catch(()=>{});

    // Delete chat messages & violations
    await client.query(`DELETE FROM chat_messages WHERE sender_id=$1 OR receiver_id=$1`, [uid]).catch(()=>{});
    await client.query(`DELETE FROM chat_violations WHERE user_id=$1`, [uid]).catch(()=>{});

    // Delete listing photos rows (Cloudinary files purged separately below)
    await client.query(
      `DELETE FROM listing_photos WHERE listing_id IN (
         SELECT id FROM listings WHERE seller_id=$1
       )`, [uid]
    ).catch(()=>{});

    // Delete listings
    await client.query(`DELETE FROM listings WHERE seller_id=$1`, [uid]).catch(()=>{});

    // Delete notifications
    await client.query(`DELETE FROM notifications WHERE user_id=$1`, [uid]).catch(()=>{});

    // Delete password history & resets
    await client.query(`DELETE FROM password_history WHERE user_id=$1`, [uid]).catch(()=>{});
    await client.query(`DELETE FROM password_resets WHERE user_id=$1`, [uid]).catch(()=>{});

    // Finally delete the user
    await client.query(`DELETE FROM users WHERE id=$1`, [uid]);
  });

  // ── Step 3: Purge Cloudinary images (outside transaction — non-fatal) ──────
  if (photoRows.length > 0) {
    try {
      const { deleteByPublicId } = require("./cloudinary.service");
      await Promise.allSettled(
        photoRows.map(r => deleteByPublicId(r.public_id))
      );
    } catch (e) {
      console.warn(`[deleteUser] Cloudinary cleanup partial for user ${uid}:`, e.message);
    }
  }
}

module.exports = { deleteUserCompletely };
