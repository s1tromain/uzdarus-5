/**
 * payment.js — Click.uz Merchant API helpers.
 *
 * Environment variables (set in Vercel):
 *   CLICK_MERCHANT_ID     – Merchant ID from Click Dashboard
 *   CLICK_SERVICE_ID      – Service ID from Click Dashboard
 *   CLICK_SECRET_KEY      – Secret key for signature verification
 *
 * Click flow:
 *   1. Frontend builds a Click payment URL and redirects user
 *   2. Click sends Prepare request (action=0) → we create order in Firestore
 *   3. Click sends Complete request (action=1) → we activate subscription
 */
import { createHash } from 'node:crypto';
import { initAdmin } from '../_firebaseAdmin.js';

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */
const PLAN = {
    id: 'monthly_99k',
    name: 'UzdaRus Premium',
    amount: 99_000,          // so'm
    durationDays: 30,
    packs: ['A1A2', 'B1B2'],
    tariff: 'PREMIUM',
};

export function getPlan() {
    return { ...PLAN };
}

export function getClickConfig() {
    const merchantId = process.env.CLICK_MERCHANT_ID;
    const serviceId = process.env.CLICK_SERVICE_ID;
    const secretKey = process.env.CLICK_SECRET_KEY;

    if (!merchantId || !serviceId || !secretKey) {
        throw Object.assign(
            new Error('Click payment not configured (missing env vars)'),
            { statusCode: 500 }
        );
    }

    return { merchantId, serviceId, secretKey };
}

/* ------------------------------------------------------------------ */
/*  Click signature verification                                      */
/* ------------------------------------------------------------------ */

/**
 * Verify Click's request signature.
 *
 * Click signs: md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
 * For Complete (action=1), merchant_prepare_id is also included after secret_key.
 */
export function verifyClickSign(params) {
    const { secretKey } = getClickConfig();

    const {
        click_trans_id,
        service_id,
        merchant_trans_id,
        merchant_prepare_id,
        amount,
        action,
        sign_time,
        sign_string,
    } = params;

    let data;
    if (Number(action) === 0) {
        // Prepare
        data = `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${amount}${action}${sign_time}`;
    } else {
        // Complete
        data = `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`;
    }

    const expected = createHash('md5').update(data).digest('hex');
    return expected === sign_string;
}

/* ------------------------------------------------------------------ */
/*  Firestore order helpers                                           */
/* ------------------------------------------------------------------ */
const ORDERS_COLLECTION = 'payment_orders';

/**
 * Create a pending order in Firestore.
 * merchant_trans_id = order doc ID.
 */
export async function createOrder(userId) {
    const { adminDb, FieldValue } = initAdmin();

    const ref = adminDb.collection(ORDERS_COLLECTION).doc();
    const order = {
        userId,
        planId: PLAN.id,
        amount: PLAN.amount,
        status: 'pending',          // pending → preparing → paid | cancelled | error
        clickTransId: null,
        merchantPrepareId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await ref.set(order);
    return { orderId: ref.id, ...order };
}

/**
 * Get an order by its Firestore doc ID (merchant_trans_id).
 */
export async function getOrder(orderId) {
    const { adminDb } = initAdmin();
    const snap = await adminDb.collection(ORDERS_COLLECTION).doc(orderId).get();
    if (!snap.exists) return null;
    return { orderId: snap.id, ...snap.data() };
}

/**
 * Update order fields.
 */
export async function updateOrder(orderId, fields) {
    const { adminDb, FieldValue } = initAdmin();
    await adminDb.collection(ORDERS_COLLECTION).doc(orderId).update({
        ...fields,
        updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Activate subscription after successful payment.
 */
export async function activateSubscription(userId) {
    const { adminDb, Timestamp, FieldValue } = initAdmin();

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + PLAN.durationDays);

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
        throw new Error('User not found: ' + userId);
    }

    // Extend if already active
    const current = snap.data()?.subscription;
    let startAt = Timestamp.now();
    let finalEnd = endDate;

    if (current?.active && current?.endAt) {
        const currentEnd = current.endAt.toDate ? current.endAt.toDate() : new Date(current.endAt);
        if (currentEnd > new Date()) {
            // Extend from current end date
            finalEnd = new Date(currentEnd);
            finalEnd.setDate(finalEnd.getDate() + PLAN.durationDays);
            startAt = current.startAt || Timestamp.now();
        }
    }

    await userRef.update({
        'subscription.active': true,
        'subscription.tariff': PLAN.tariff,
        'subscription.startAt': startAt,
        'subscription.endAt': Timestamp.fromDate(finalEnd),
        'subscription.updatedAt': Timestamp.now(),
        'accessPacks': PLAN.packs,
        'updatedAt': FieldValue.serverTimestamp(),
    });

    return {
        active: true,
        tariff: PLAN.tariff,
        endAt: finalEnd.toISOString(),
    };
}

/* ------------------------------------------------------------------ */
/*  Click error codes                                                 */
/* ------------------------------------------------------------------ */
export const CLICK_ERROR = {
    SUCCESS: 0,
    SIGN_CHECK_FAILED: -1,
    INCORRECT_AMOUNT: -2,
    ACTION_NOT_FOUND: -3,
    ALREADY_PAID: -4,
    ORDER_NOT_FOUND: -5,
    TRANSACTION_ERROR: -6,
    ORDER_CANCELLED: -9,
};
