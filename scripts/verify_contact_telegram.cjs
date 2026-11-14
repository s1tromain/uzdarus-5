#!/usr/bin/env node
/**
 * verify_contact_telegram.cjs — the «Qayta aloqa» form carries an optional
 * Telegram username all the way to the admins' Telegram chat.
 *
 * Three layers, checked separately, because each can be right while another
 * is wrong:
 *
 *   the SERVER   api/send-contact.js driven with forged requests — what it
 *                accepts, what it refuses, and the exact notification it
 *                would send (the Bot API call is captured, never sent)
 *   the PAGE     real Chrome, the shipped index.html: where the field sits,
 *                that it looks and focuses exactly like its neighbours, and
 *                that nothing spills sideways from 320px up
 *   the CHAIN    real input and a real click in that page, through the real
 *                handler, to the captured notification — and the page's rule
 *                and the server's rule run over the same inputs and compared
 *
 *   UI_SUITE_FAST=1   one width for the visual checks
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const { launch, sleep } = require('./_cdp_driver.cjs');

const ROOT = path.join(__dirname, '..');
const FAST = process.env.UI_SUITE_FAST === '1';
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const WIDTHS = FAST ? [[320, 640, true]]
    : [[320, 640, true], [360, 740, true], [375, 812, true], [390, 844, true],
       [412, 915, true], [425, 900, true], [768, 1024, false], [1440, 900, false]];

/* Every Bot API call the handler makes lands here instead of on the network. */
const sent = [];
process.env.TELEGRAM_CONTACT_TOKEN = 'TEST-TOKEN';
process.env.TELEGRAM_CHAT_ID = 'TEST-CHAT';
globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.telegram.org/')) {
        throw new Error('unexpected outbound request: ' + url);
    }
    sent.push({ url: String(url), payload: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => '{"ok":true}', json: async () => ({ ok: true }) };
};

/* a fresh client address per request: the 5/minute limiter is not under test */
let ipSeq = 0;
const nextIp = () => `10.77.${(++ipSeq >> 8) & 255}.${ipSeq & 255}`;

/** Call the handler the way Vercel does: parsed body, res.status().json(). */
function invoke(handler, body) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            setHeader() {},
            status(c) { this.statusCode = c; return this; },
            json(p) { resolve({ status: this.statusCode, body: p }); return this; },
            end() { resolve({ status: this.statusCode, body: null }); }
        };
        const req = { method: 'POST', body, headers: { 'x-forwarded-for': nextIp() }, socket: {} };
        Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 'threw', body: String(e) }));
    });
}

const VALID = { name: 'Ali Valiyev', phone: '+998901234567', email: 'ali@example.uz', message: 'Salom!' };
const TG_REFUSED = 'Telegram username noto‘g‘ri';
const NOT_GIVEN = '✈️ <b>Telegram:</b> ko‘rsatilmagan';
const tgLine = (text) => String(text || '').split('\n').filter((l) => l.includes('<b>Telegram:</b>'));
const line = (u) => `✈️ <b>Telegram:</b> ${u}`;

/* one table for both rules: [raw input, what the admins should read | null] */
const CASES = [
    ['', null], ['   ', null],
    ['user_name1', '@user_name1'], ['@user_name1', '@user_name1'],
    ['@User_Name', '@User_Name'], ['  @padded_name  ', '@padded_name'],
    ['abcde', '@abcde'], ['a'.repeat(32), '@' + 'a'.repeat(32)],
    ['abcd', 'REFUSED'], ['@abcd', 'REFUSED'], ['a'.repeat(33), 'REFUSED'],
    ['@', 'REFUSED'], ['@@username', 'REFUSED'], ['user name', 'REFUSED'],
    ['user-name', 'REFUSED'], ['user.name', 'REFUSED'], ['юзернейм', 'REFUSED'],
    ['t.me/username', 'REFUSED'], ['<b>bold</b>', 'REFUSED']
];

console.log('\n=== CONTACT FORM — Telegram username ===' + (FAST ? '  [FAST subset]' : ''));

(async () => {
const { default: handler } = await import(pathToFileURL(path.join(ROOT, 'api/send-contact.js')).href);

async function submit(body) {
    const before = sent.length;
    const r = await invoke(handler, body);
    const calls = sent.slice(before);
    return { status: r.status, body: r.body, calls, text: calls.length === 1 ? calls[0].payload.text : null };
}

/* ================================================================ *
 * 1. THE SERVER
 * ================================================================ */
{
    /* optional: absent, empty, blank or null all mean "not given" */
    for (const [label, extra] of [['no telegram key (an old cached page)', {}],
        ['empty', { telegram: '' }], ['blank', { telegram: '   ' }], ['null', { telegram: null }]]) {
        const r = await submit({ ...VALID, ...extra });
        eq(`${label}: accepted`, r.status, 200);
        eq(`${label}: one notification`, r.calls.length, 1);
        eq(`${label}: it says the username was not given`, tgLine(r.text).join(''), NOT_GIVEN);
    }

    for (const [raw, want] of CASES.filter(([, w]) => w && w !== 'REFUSED')) {
        const r = await submit({ ...VALID, telegram: raw });
        eq(`"${raw}" is accepted`, r.status, 200);
        eq(`"${raw}" reaches the admins as ${want}`, tgLine(r.text).join(''), line(want));
    }

    for (const [raw] of CASES.filter(([, w]) => w === 'REFUSED')) {
        const r = await submit({ ...VALID, telegram: raw });
        eq(`"${raw}" is refused`, r.status, 400);
        eq(`"${raw}": with a reason`, r.body && r.body.error, TG_REFUSED);
        eq(`"${raw}": and nothing is sent`, r.calls.length, 0);
    }

    /* the notification itself */
    {
        const r = await submit({ ...VALID, telegram: '@user_name1' });
        const call = r.calls[0] || { url: '', payload: {} };
        eq('it goes to the contact bot', call.url, 'https://api.telegram.org/botTEST-TOKEN/sendMessage');
        eq('in the configured chat', call.payload.chat_id, 'TEST-CHAT');
        eq('as HTML, where "_" is plain text', call.payload.parse_mode, 'HTML');
        eq('the username has exactly one line', tgLine(r.text).length, 1);
        const at = (label) => String(r.text).indexOf(`<b>${label}:</b>`);
        ok(at('Ism') >= 0 && at('Ism') < at('Telefon') && at('Telefon') < at('Email')
            && at('Email') < at('Telegram') && at('Telegram') < at('Xabar'),
            'lines read Ism → Telefon → Email → Telegram → Xabar, as on the form');
        const t = String(r.text);
        ok(t.includes('<b>Ism:</b> Ali Valiyev') && t.includes('<b>Telefon:</b> +998901234567')
            && t.includes('<b>Email:</b> ali@example.uz') && t.includes('<b>Xabar:</b> Salom!'),
            'name, phone, email and message are still in it');
    }

    /* what the form did before is untouched */
    for (const [label, body, error] of [
        ['no name, even with a username', { ...VALID, name: '', telegram: 'user_name1' }, 'Barcha maydonlar majburiy'],
        ['no message', { ...VALID, message: '' }, 'Barcha maydonlar majburiy'],
        ['a wrong phone', { ...VALID, phone: '12345' }, 'Telefon raqami noto‘g‘ri'],
        ['a wrong email', { ...VALID, email: 'ali@' }, 'Email manzili noto‘g‘ri']]) {
        const r = await submit(body);
        eq(`${label}: still refused`, r.status, 400);
        eq(`${label}: with the same reason`, r.body && r.body.error, error);
        eq(`${label}: nothing sent`, r.calls.length, 0);
    }
    {
        const r = await submit({ ...VALID, phone: '998 90 123-45-67' });
        ok(r.status === 200 && String(r.text).includes('<b>Telefon:</b> +998901234567'),
            'a phone typed with spaces is still normalized to +998901234567');
    }
}

/* ================================================================ *
 * 2 + 3. THE PAGE, AND THE CHAIN THROUGH IT
 * ================================================================ */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.gif': 'image/gif', '.ico': 'image/x-icon' };
const posts = [];
const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/api/maintenance') {   /* the gate must see a working platform */
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, maintenance: { active: false, version: 1, reason: '', startedAt: null, currentMs: 0 } }));
        return;
    }
    if (url === '/api/send-contact') {  /* the real handler, Vercel-shaped */
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
            let body = raw;
            try { body = JSON.parse(raw); } catch (e) { /* the handler answers 400 */ }
            const entry = { body };
            posts.push(entry);
            req.body = body;
            req.headers['x-forwarded-for'] = nextIp();
            res.status = function (c) { this.statusCode = c; entry.status = c; return this; };
            res.json = function (p) {
                entry.reply = p;
                this.setHeader('content-type', 'application/json');
                this.end(JSON.stringify(p));
                return this;
            };
            Promise.resolve(handler(req, res)).catch((e) => { res.statusCode = 500; res.end(String(e)); });
        });
        return;
    }
    const abs = path.join(ROOT, path.normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, ''));
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(abs).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const U = (x) => `http://127.0.0.1:${server.address().port}${x}`;
const browser = await launch();
console.log(`  driver: ${browser.version} · rendered DOM at ${WIDTHS.length} width(s)`);

const LOOK = `
  var $ = function (id) { return document.getElementById(id); };
  var tg = $('telegram');
  if (!tg) return JSON.stringify({ missing: true });
  var grp = function (id) { return $(id).closest('.input-icon-group'); };
  function look(el) {
    var cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height,
      border: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor, cs.borderRightWidth,
               cs.borderBottomWidth, cs.borderLeftWidth].join(' '),
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius,
               cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
      font: cs.fontSize + ' ' + cs.fontWeight + ' ' + cs.fontFamily,
      bg: cs.backgroundColor, ellipsis: cs.textOverflow, shadow: cs.boxShadow };
  }
  function icon(id) {
    var g = grp(id), i = g.querySelector('i'), cs = getComputedStyle(i);
    var r = i.getBoundingClientRect(), gr = g.getBoundingClientRect();
    var c = getComputedStyle(i, '::before').content;
    return { cls: i.className, color: cs.color, size: cs.fontSize, left: Math.round(r.left - gr.left),
      mid: Math.round((r.top + r.bottom) / 2 - (gr.top + gr.bottom) / 2),
      glyph: c && c !== 'none' && c !== 'normal' ? c : '' };
  }
  var d = document.documentElement, card = document.querySelector('.contact-card').getBoundingClientRect();
  var ph = grp('phone').getBoundingClientRect(), em = grp('email').getBoundingClientRect(),
      tgr = grp('telegram').getBoundingClientRect();
  return JSON.stringify({
    shown: !d.classList.contains('uzm-checking'),
    order: grp('email').nextElementSibling === grp('telegram')
        && grp('telegram').nextElementSibling === grp('message'),
    type: tg.type, placeholder: tg.placeholder, required: tg.required || tg.hasAttribute('aria-required'),
    keyboard: [tg.getAttribute('autocapitalize'), tg.getAttribute('autocorrect'), String(tg.spellcheck)].join(' '),
    tg: look(tg), email: look($('email')), tgIcon: icon('telegram'), emailIcon: icon('email'),
    gapAbove: Math.round((tgr.top - em.bottom) * 10) / 10, gapRef: Math.round((em.top - ph.bottom) * 10) / 10,
    inCard: tgr.left >= card.left && tgr.right <= card.right,
    inView: tgr.left >= 0 && tgr.right <= window.innerWidth,
    sideways: Math.max(d.scrollWidth, document.body.scrollWidth) > d.clientWidth,
    width: window.innerWidth });`;

let glyphChecked = false;
try {
    const p = await browser.newPage();
    try { await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { /* older Chrome */ }

    async function focused(id) {
        await p.evaluate(`document.getElementById('${id}').focus(); return 1;`);
        await sleep(400);   /* the fields animate their focus ring over 0.25s */
        const s = JSON.parse(await p.evaluate(`var el = document.getElementById('${id}'), cs = getComputedStyle(el);
            return JSON.stringify({ on: el.matches(':focus'), border: cs.borderTopColor, shadow: cs.boxShadow, bg: cs.backgroundColor });`));
        await p.evaluate('document.activeElement.blur(); return 1;');
        await sleep(400);
        return s;
    }

    for (const [w, h, mob] of WIDTHS) {
        const N = `${w}px`;
        await p.setDevice(w, h, mob);
        await p.goto(U('/index.html'), { waitMs: 1500 });
        const s = JSON.parse(await p.evaluate(LOOK));
        if (s.missing) { ok(false, `${N}: #telegram field exists`); continue; }
        eq(`${N}: the page is really shown at ${w}px`, s.shown && s.width, w);
        ok(s.order, `${N}: the field sits after Email and before Xabaringiz`);
        eq(`${N}: placeholder`, s.placeholder, 'Telegram username (@username)');
        eq(`${N}: a plain text field`, s.type, 'text');
        eq(`${N}: optional`, s.required, false);
        eq(`${N}: phone keyboards do not capitalise or "correct" a username`, s.keyboard, 'none off false');
        for (const k of ['left', 'right', 'width', 'height', 'border', 'radius', 'padding', 'font', 'bg', 'ellipsis', 'shadow']) {
            eq(`${N}: ${k} same as the Email field`, s.tg[k], s.email[k]);
        }
        eq(`${N}: the same gap above it as between Telefon and Email`, s.gapAbove, s.gapRef);
        ok(/\bfab\b/.test(s.tgIcon.cls) && /\bfa-telegram\b/.test(s.tgIcon.cls), `${N}: a Telegram icon (${s.tgIcon.cls})`);
        eq(`${N}: icon in the form's orange`, s.tgIcon.color, 'rgb(255, 152, 0)');
        for (const k of ['color', 'size', 'left', 'mid']) {
            eq(`${N}: icon ${k} same as the Email icon`, s.tgIcon[k], s.emailIcon[k]);
        }
        if (s.emailIcon.glyph) {
            glyphChecked = true;
            ok(s.tgIcon.glyph && s.tgIcon.glyph !== s.emailIcon.glyph, `${N}: the Telegram glyph renders`);
        }
        ok(s.inView && s.inCard, `${N}: the field stays inside the card and the screen`);
        eq(`${N}: no horizontal scroll`, s.sideways, false);

        const fe = await focused('email');
        const ft = await focused('telegram');
        ok(fe.on && ft.on, `${N}: both fields really take focus`);
        eq(`${N}: focused border same as Email`, ft.border, fe.border);
        eq(`${N}: focused ring same as Email`, ft.shadow, fe.shadow);
        eq(`${N}: focused background same as Email`, ft.bg, fe.bg);
        ok(ft.border !== s.tg.border.split(' ').slice(2, 5).join(' '), `${N}: focus visibly changes the border`);
    }
    if (!glyphChecked) console.log('  ⚠ Font Awesome did not load (offline?) — glyph rendering not checked');

    /* ------------------------------ the chain, at a phone's width ---- */
    await p.setDevice(375, 812, true);
    await p.goto(U('/index.html'), { waitMs: 1500 });

    const FORM = { name: 'Ali Valiyev', phone: '+998 90 123 45 67', email: 'ali@example.uz',
                   message: 'Salom, kurs haqida savolim bor.' };
    async function send(values) {
        const before = { posts: posts.length, sent: sent.length };
        await p.evaluate(`document.getElementById('contactMessage').className = 'form-message'; return 1;`);
        for (const id of ['name', 'phone', 'email', 'telegram', 'message']) {
            await p.evaluate(`var el = document.getElementById('${id}'); el.value = ''; el.focus(); return 1;`);
            if (values[id]) await p.send('Input.insertText', { text: values[id] });
        }
        await p.evaluate(`document.activeElement.blur(); document.getElementById('contactSubmit').click(); return 1;`);
        let st = null;
        for (let i = 0; i < 50; i++) {
            await sleep(100);
            st = JSON.parse(await p.evaluate(`var m = document.getElementById('contactMessage'),
                b = document.getElementById('contactSubmit'), v = {};
              ['name', 'phone', 'email', 'telegram', 'message'].forEach(function (k) { v[k] = document.getElementById(k).value; });
              return JSON.stringify({ cls: m.className, text: m.textContent, busy: b.disabled, values: v });`));
            if (/\bshow\b/.test(st.cls) && !st.busy) break;
        }
        return { st, posts: posts.slice(before.posts), calls: sent.slice(before.sent) };
    }

    for (const [typed, want] of [['', null], ['my_user_1', '@my_user_1'],
        ['@Another_User', '@Another_User'], ['  @padded_name ', '@padded_name']]) {
        const L = `typed "${typed}"`;
        const r = await send({ ...FORM, telegram: typed });
        ok(/\bsuccess\b/.test(r.st.cls), `${L}: the visitor is told it was sent (${r.st.text})`);
        eq(`${L}: one request`, r.posts.length, 1);
        const body = (r.posts[0] || {}).body || {};
        eq(`${L}: the request carries the username`, body.telegram, want || '');
        eq(`${L}: next to the normalized phone`, body.phone, '+998901234567');
        eq(`${L}: the admins read it`, tgLine((r.calls[0] || { payload: {} }).payload.text).join(''),
            want ? line(want) : NOT_GIVEN);
        eq(`${L}: the form is cleared, the username too`, Object.values(r.st.values).join(''), '');
    }

    for (const [typed, says] of [['abc', '5 tadan 32 tagacha'], ['a'.repeat(33), '5 tadan 32 tagacha'],
        ['@', '5 tadan 32 tagacha'], ['юзернейм', 'lotin harflari'], ['user name', 'lotin harflari']]) {
        const L = `typed "${typed}"`;
        const r = await send({ ...FORM, telegram: typed });
        ok(/\berror\b/.test(r.st.cls) && r.st.text.includes(says), `${L}: a clear error (${r.st.text})`);
        eq(`${L}: nothing is sent`, r.posts.length, 0);
        eq(`${L}: what the visitor typed is kept`, r.st.values.telegram, typed);
    }
    {
        const r = await send({ ...FORM, name: '', telegram: 'my_user_1' });
        ok(/\berror\b/.test(r.st.cls) && /barcha maydonlarni/i.test(r.st.text),
            `a missing name is still reported as before (${r.st.text})`);
        eq('and nothing is sent', r.posts.length, 0);
    }

    /* the page's rule and the server's rule are the same rule */
    const page = JSON.parse(await p.evaluate(`return JSON.stringify(${JSON.stringify(CASES.map((c) => c[0]))}
        .map(function (v) { var n = normalizeTelegramUsername(v); return { n: n, err: telegramUsernameError(n) }; }));`));
    for (let i = 0; i < CASES.length; i++) {
        const [raw, want] = CASES[i];
        const srv = await submit({ ...VALID, telegram: raw });
        eq(`"${raw}": page and server agree`, page[i].err === '', srv.status === 200);
        eq(`"${raw}": the page's verdict is the expected one`, page[i].err === '', want !== 'REFUSED');
        if (page[i].err === '' && srv.status === 200) {
            eq(`"${raw}": and normalize it the same way`, tgLine(srv.text).join(''), page[i].n ? line(page[i].n) : NOT_GIVEN);
        }
    }
    eq('no script errors on the page', p.exceptions.join(' | '), '');
} catch (e) {
    fail++; failures.push('harness: ' + (e && e.message));
} finally {
    await browser.close();
    server.close();
}

console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ CONTACT TELEGRAM: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
} else {
    console.log(`  ✅ CONTACT TELEGRAM: ${pass}/${pass} passed`);
}
console.log('='.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
})();
