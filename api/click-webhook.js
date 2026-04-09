import { sendJson } from './_lib/request.js';
import {
    verifyClickSign,
    getOrder,
    updateOrder,
    activateSubscription,
    getPlan,
    CLICK_ERROR,
} from './_lib/payment.js';

/**
 * POST /api/click-webhook
 *
 * Click.uz Merchant API callback.
 *
 * Click sends two requests per payment:
 *   action=0 (Prepare) → validate order, return merchant_prepare_id
 *   action=1 (Complete) → confirm payment, activate subscription
 *
 * No CORS / no Bearer auth — Click sends form-encoded or JSON directly.
 */
export default async function handler(req, res) {
    /* Click only sends POST */
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    let params;
    try {
        params = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
        return sendJson(res, 400, { error: 'Invalid body' });
    }

    const action = Number(params.action);

    /* ---- verify signature ---- */
    if (!verifyClickSign(params)) {
        console.error('click-webhook: signature mismatch', { action, merchant_trans_id: params.merchant_trans_id });
        return clickResponse(res, {
            error: CLICK_ERROR.SIGN_CHECK_FAILED,
            error_note: 'SIGN CHECK FAILED',
        });
    }

    const merchantTransId = String(params.merchant_trans_id || '');
    const clickTransId = String(params.click_trans_id || '');
    const amount = Number(params.amount);
    const plan = getPlan();

    /* ---- Prepare (action = 0) ---- */
    if (action === 0) {
        return handlePrepare(res, { merchantTransId, clickTransId, amount, plan });
    }

    /* ---- Complete (action = 1) ---- */
    if (action === 1) {
        const merchantPrepareId = String(params.merchant_prepare_id || '');
        const error = Number(params.error) || 0;
        return handleComplete(res, { merchantTransId, clickTransId, merchantPrepareId, amount, plan, error });
    }

    return clickResponse(res, {
        error: CLICK_ERROR.ACTION_NOT_FOUND,
        error_note: 'ACTION NOT FOUND',
    });
}

/* ================================================================== */
/*  Prepare handler (action = 0)                                      */
/* ================================================================== */
async function handlePrepare(res, { merchantTransId, clickTransId, amount, plan }) {
    /* find order */
    const order = await getOrder(merchantTransId);
    if (!order) {
        return clickResponse(res, {
            error: CLICK_ERROR.ORDER_NOT_FOUND,
            error_note: 'ORDER NOT FOUND',
        });
    }

    /* already paid? */
    if (order.status === 'paid') {
        return clickResponse(res, {
            error: CLICK_ERROR.ALREADY_PAID,
            error_note: 'ALREADY PAID',
        });
    }

    /* cancelled? */
    if (order.status === 'cancelled') {
        return clickResponse(res, {
            error: CLICK_ERROR.ORDER_CANCELLED,
            error_note: 'ORDER CANCELLED',
        });
    }

    /* validate amount */
    if (Math.abs(amount - plan.amount) > 1) {
        return clickResponse(res, {
            error: CLICK_ERROR.INCORRECT_AMOUNT,
            error_note: 'INCORRECT AMOUNT',
        });
    }

    /* mark as preparing */
    try {
        await updateOrder(merchantTransId, {
            status: 'preparing',
            clickTransId,
        });
    } catch (err) {
        console.error('click-webhook prepare update error:', err);
        return clickResponse(res, {
            error: CLICK_ERROR.TRANSACTION_ERROR,
            error_note: 'DATABASE ERROR',
        });
    }

    return clickResponse(res, {
        error: CLICK_ERROR.SUCCESS,
        error_note: 'SUCCESS',
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: merchantTransId,  // use order ID as prepare ID
    });
}

/* ================================================================== */
/*  Complete handler (action = 1)                                     */
/* ================================================================== */
async function handleComplete(res, { merchantTransId, clickTransId, merchantPrepareId, amount, plan, error }) {
    /* find order */
    const order = await getOrder(merchantTransId);
    if (!order) {
        return clickResponse(res, {
            error: CLICK_ERROR.ORDER_NOT_FOUND,
            error_note: 'ORDER NOT FOUND',
        });
    }

    /* already paid? */
    if (order.status === 'paid') {
        return clickResponse(res, {
            error: CLICK_ERROR.ALREADY_PAID,
            error_note: 'ALREADY PAID',
            click_trans_id: clickTransId,
            merchant_trans_id: merchantTransId,
            merchant_prepare_id: merchantPrepareId,
        });
    }

    /* Click reports an error on their side (e.g. user cancelled) */
    if (error < 0) {
        await updateOrder(merchantTransId, {
            status: 'cancelled',
            clickTransId,
        });
        return clickResponse(res, {
            error: CLICK_ERROR.TRANSACTION_ERROR,
            error_note: 'TRANSACTION CANCELLED BY CLICK',
        });
    }

    /* validate amount */
    if (Math.abs(amount - plan.amount) > 1) {
        return clickResponse(res, {
            error: CLICK_ERROR.INCORRECT_AMOUNT,
            error_note: 'INCORRECT AMOUNT',
        });
    }

    /* ---- activate subscription ---- */
    try {
        const sub = await activateSubscription(order.userId);

        await updateOrder(merchantTransId, {
            status: 'paid',
            clickTransId,
            merchantPrepareId,
            paidAt: new Date().toISOString(),
            subscriptionEndAt: sub.endAt,
        });

        console.log('click-webhook: payment complete', {
            orderId: merchantTransId,
            userId: order.userId,
            endAt: sub.endAt,
        });
    } catch (err) {
        console.error('click-webhook complete error:', err);
        return clickResponse(res, {
            error: CLICK_ERROR.TRANSACTION_ERROR,
            error_note: 'SUBSCRIPTION ACTIVATION ERROR',
        });
    }

    return clickResponse(res, {
        error: CLICK_ERROR.SUCCESS,
        error_note: 'SUCCESS',
        click_trans_id: clickTransId,
        merchant_trans_id: merchantTransId,
        merchant_prepare_id: merchantPrepareId,
    });
}

/* ================================================================== */
/*  Response helper                                                   */
/* ================================================================== */
function clickResponse(res, body) {
    return sendJson(res, 200, body);
}
