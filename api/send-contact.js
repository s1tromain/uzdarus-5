import { handleCors, sendJson, readBody } from './_lib/request.js';
import { rateLimit } from './_lib/rate-limit.js';

/* Public form — keep the abuse window tight (5 messages / minute / IP). */
const limiter = rateLimit({ max: 5, windowSec: 60, prefix: 'send-contact' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Telegram parse_mode=HTML only requires &, <, > to be escaped in text nodes.
 * Escaping these makes any user input safe and never breaks formatting. */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim();
}

/**
 * POST /api/send-contact
 *
 * Delivers the "Qayta aloqa" contact form to Telegram. Tokens stay on the
 * server (Vercel env vars), never in the client.
 *
 * Env vars (the ONLY config required on Vercel):
 *   - TELEGRAM_CONTACT_TOKEN
 *   - TELEGRAM_CHAT_ID
 *
 * Responses:
 *   success → { success: true }
 *   failure → { success: false, error: "..." }
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method not allowed' });
    }

    if (limiter(req, res)) return;

    const token = process.env.TELEGRAM_CONTACT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.error('send-contact: missing TELEGRAM_CONTACT_TOKEN or TELEGRAM_CHAT_ID');
        return sendJson(res, 500, { success: false, error: 'Aloqa xizmati sozlanmagan' });
    }

    let body;
    try {
        body = await readBody(req);
    } catch {
        return sendJson(res, 400, { success: false, error: 'Invalid request body' });
    }

    const name = escapeHtml(body.name || '');
    const email = escapeHtml(body.email || '');
    const message = escapeHtml(body.message || '');

    if (!name || !email || !message) {
        return sendJson(res, 400, { success: false, error: 'Barcha maydonlar majburiy' });
    }

    if (!EMAIL_RE.test(email)) {
        return sendJson(res, 400, { success: false, error: 'Email manzili noto‘g‘ri' });
    }

    const date = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });

    const text =
        `📩 <b>Yangi murojaat (Qayta aloqa)</b>\n\n` +
        `👤 <b>Ism:</b> ${name}\n` +
        `📧 <b>Email:</b> ${email}\n` +
        `📝 <b>Xabar:</b> ${message}\n\n` +
        `🕐 <b>Sana:</b> ${escapeHtml(date)}`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            console.error(`send-contact Telegram error ${response.status}: ${detail}`);
            return sendJson(res, 502, { success: false, error: 'Telegram xabarini yuborib bo‘lmadi' });
        }

        return sendJson(res, 200, { success: true });
    } catch (error) {
        console.error('send-contact fetch error:', error);
        return sendJson(res, 502, { success: false, error: 'Telegram xizmati vaqtincha ishlamayapti' });
    }
}
