import { initAdmin } from '../_firebaseAdmin.js';

/**
 * Append an immutable admin audit record to `adminAuditLogs`.
 *
 * Captures WHO performed WHAT action against WHOM and WHEN. Logging is
 * best-effort: a failure here must never roll back or fail the admin action
 * that already succeeded, so all errors are swallowed (and surfaced to logs).
 *
 * @param {object} entry
 * @param {string} entry.action          machine action name (e.g. 'unblock-user')
 * @param {string} entry.actorUid        uid of the staff member performing the action
 * @param {string} [entry.actorRole]     normalized role of the actor
 * @param {string} [entry.targetUid]     uid of the affected user
 * @param {string} [entry.targetUsername] username of the affected user
 * @param {object} [entry.details]       action-specific metadata (serializable)
 */
export async function writeAuditLog(entry = {}) {
    try {
        const { adminDb, FieldValue } = initAdmin();

        await adminDb.collection('adminAuditLogs').add({
            action: String(entry.action || 'unknown'),
            actorUid: entry.actorUid || null,
            actorRole: entry.actorRole || null,
            targetUid: entry.targetUid || null,
            targetUsername: entry.targetUsername || null,
            details: entry.details && typeof entry.details === 'object' ? entry.details : {},
            createdAt: FieldValue.serverTimestamp()
        });
    } catch (error) {
        // Never let an audit-log failure break a completed admin action.
        console.error('[AUDIT_LOG_FAILED]', entry?.action || 'unknown', error?.message || error);
    }
}
