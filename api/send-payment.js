import { handleCors, sendJson, readBody } from './_lib/request.js';
import { rateLimit } from './_lib/rate-limit.js';

/* Public form — keep the abuse window tight (5 requests / minute / IP). */
const limiter = rateLimit({ max: 5, windowSec: 60, prefix: 'send-payment' });

/* Telegram legacy-Markdown breaks on unbalanced * _ ` [ in user text, which
 * silently fails delivery. Strip those chars from dynamic fields only. */
function sanitize(value) {
    return String(value).replace(/[*_`\[\]]/g, '').trim();
}

function getTariffPrice(tariff) {
    switch (tariff) {
        case 'START': return '780,000 so\'m';
        case 'TURBO': return '1,300,000 so\'m';
        case 'PREMIUM': return '1,900,000 so\'m';
        default: return 'Noma\'lum';
    }
}

/**
 * POST /api/send-payment
 *
 * Delivers the tolov.html payment request to Telegram. Tokens stay on the
 * server (Vercel env vars), never in the client.
 *
 * Env vars: TELEGRAM_PAYMENT_TOKEN, TELEGRAM_CHAT_ID
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, message: 'Method not allowed' });
    }

    if (limiter(req, res)) return;

    const token = process.env.TELEGRAM_PAYMENT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.error('send-payment: missing TELEGRAM_PAYMENT_TOKEN or TELEGRAM_CHAT_ID');
        return sendJson(res, 500, { success: false, message: 'Payment bot credentials are not configured' });
    }

    let body;
    try {
        body = await readBody(req);
    } catch {
        return sendJson(res, 400, { success: false, message: 'Invalid request body' });
    }

    const name = sanitize(body.name || '');
    const phone = sanitize(body.phone || '');
    const email = sanitize(body.email || '');
    const telegram = sanitize(body.telegram || '');
    const tariff = sanitize(body.tariff || '');
    const course = sanitize(body.course || '');

    if (!name || !phone || !email || !telegram || !tariff || !course) {
        return sendJson(res, 400, { success: false, message: 'Barcha maydonlar majburiy' });
    }

    const text = `🔄 *YANGI TO'LOV SO'ROVI* 🔄\n\n` +
        `👤 *Ism-Familiya:* ${name}\n` +
        `📱 *Telefon:* ${phone}\n` +
        `📧 *Email:* ${email}\n` +
        `✈️ *Telegram:* ${telegram}\n` +
        `👑 *Tarif:* ${tariff}\n` +
        `🎓 *Kurs:* ${course}\n\n` +
        `⏰ *Vaqt:* ${new Date().toLocaleString('uz-UZ')}\n` +
        `💰 *To'lov summasi:* ${getTariffPrice(tariff)}\n` +
        `🆔 *ID:* ${Date.now()}`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            console.error(`send-payment Telegram error ${response.status}: ${detail}`);
            return sendJson(res, 502, { success: false, message: 'Xatolik yuz berdi' });
        }

        return sendJson(res, 200, { success: true, message: 'To\'lov so\'rovi yuborildi' });
    } catch (error) {
        console.error('send-payment fetch error:', error);
        return sendJson(res, 502, { success: false, message: 'Xatolik yuz berdi' });
    }
}
