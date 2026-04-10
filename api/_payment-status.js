import { handleCors, sendJson, requireSession } from './_lib/request.js';
import { rateLimit } from './_lib/rate-limit.js';
import { initAdmin } from './_firebaseAdmin.js';

const limiter = rateLimit({ max: 10, windowSec: 60, prefix: 'pay-status' });

const ORDERS_COLLECTION = 'payment_orders';

/**
 * GET /api/payment-status?orderId=xxx
 *
 * Check the status of a payment order.
 * Auth: required (user can only see their own orders).
 *
 * Response: { ok, status, paidAt?, subscriptionEndAt? }
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;

    if (limiter(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    let session;
    try {
        session = await requireSession(req);
    } catch (err) {
        return sendJson(res, err.statusCode || 401, { error: err.message });
    }

    const orderId = (req.query?.orderId || '').trim();
    if (!orderId || orderId.length > 100) {
        return sendJson(res, 400, { error: 'orderId required' });
    }

    try {
        const { adminDb } = initAdmin();
        const snap = await adminDb.collection(ORDERS_COLLECTION).doc(orderId).get();

        if (!snap.exists) {
            return sendJson(res, 404, { error: 'Order not found' });
        }

        const order = snap.data();

        /* users can only see their own orders */
        if (order.userId !== session.uid) {
            return sendJson(res, 404, { error: 'Order not found' });
        }

        return sendJson(res, 200, {
            ok: true,
            status: order.status,
            paidAt: order.paidAt || null,
            subscriptionEndAt: order.subscriptionEndAt || null,
        });
    } catch (err) {
        console.error('payment-status error:', err);
        return sendJson(res, 500, { error: 'Failed to check payment status' });
    }
}
