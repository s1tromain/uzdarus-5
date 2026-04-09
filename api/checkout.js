import { handleCors, sendJson } from './_lib/request.js';
import { initAdmin } from './_firebaseAdmin.js';
import { rateLimit } from './_lib/rate-limit.js';
import { createOrder, getPlan, getClickConfig } from './_lib/payment.js';

const limiter = rateLimit({ max: 5, windowSec: 60, prefix: 'checkout' });

/**
 * POST /api/checkout
 *
 * Creates a payment order and returns the Click payment URL.
 *
 * Auth: required (Bearer token)
 *
 * Response: { ok, paymentUrl, orderId }
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;

    if (limiter(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    /* ---- authenticate ---- */
    const header = req.headers.authorization || req.headers.Authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) {
        return sendJson(res, 401, { error: 'Authorization required' });
    }

    const token = header.slice(7).trim();
    if (!token) {
        return sendJson(res, 401, { error: 'Invalid token' });
    }

    let uid;
    try {
        const { adminAuth } = initAdmin();
        const decoded = await adminAuth.verifyIdToken(token, true);
        uid = decoded.uid;
    } catch {
        return sendJson(res, 401, { error: 'Invalid or expired token' });
    }

    try {
        const order = await createOrder(uid);
        const plan = getPlan();
        const { merchantId, serviceId } = getClickConfig();

        /* Build Click payment URL */
        const params = new URLSearchParams({
            merchant_id: merchantId,
            service_id: serviceId,
            merchant_trans_id: order.orderId,
            amount: String(plan.amount),
            transaction_param: order.orderId,
            return_url: `${getOrigin(req)}/my.cabinet/dashboard.html?payment=success`,
        });

        const paymentUrl = `https://my.click.uz/services/pay?${params.toString()}`;

        return sendJson(res, 200, {
            ok: true,
            paymentUrl,
            orderId: order.orderId,
            amount: plan.amount,
            plan: plan.name,
        });
    } catch (err) {
        console.error('checkout error:', err);
        return sendJson(res, 500, { error: 'Failed to create payment session' });
    }
}

function getOrigin(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'uzdarus.uz';
    return `${proto}://${host}`;
}
