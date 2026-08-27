/**
 * _cdp_driver.cjs — a real Chrome, driven over the real DevTools Protocol.
 *
 * WHY THIS EXISTS. Every earlier "mobile" check in this repo measured a JSDOM
 * document or a div constrained to 360px and called it a phone. Neither has a
 * layout viewport, so neither can produce a horizontal overflow, a clipped
 * fixed element, or a tap target that is genuinely too small — the three
 * things a mobile audit is FOR. A constrained div cannot fail the test it is
 * supposed to fail, which makes it worse than no test at all.
 *
 * So this launches the actual Google Chrome that is installed on the machine,
 * attaches over ws:// to its DevTools endpoint, and sets device metrics with
 * Emulation.setDeviceMetricsOverride — the same call Chrome's own device
 * toolbar makes. The pages under test then report window.innerWidth === 360
 * because they really are 360 CSS pixels wide.
 *
 * No puppeteer: Node 22+ ships a global WebSocket, and the protocol is JSON.
 * A dependency that only wraps a WebSocket is a dependency that can rot.
 *
 * IT REFUSES TO PRETEND. If Chrome is missing, if the endpoint never answers,
 * or if the metric override does not actually change the page's own idea of
 * its width, this throws. It never falls back to a fake viewport, because a
 * silent fallback is how the previous suites came to be trusted wrongly.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

/** Where Chrome actually lives. First hit wins; no download, no bundling. */
const CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];

function findChrome() {
    const explicit = process.env.CHROME_PATH;
    if (explicit && fs.existsSync(explicit)) return explicit;
    for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
    return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

/**
 * Serve the repository as-is. The pages use absolute paths like
 * /paid-courses/speech.js, so file:// cannot host them; this is the smallest
 * thing that can. Missing files answer 404 on purpose — a core 404 is one of
 * the defects the smoke pass is looking for.
 */
function serveRepo() {
    const missing = [];
    const server = http.createServer((req, res) => {
        let rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
        if (rel.endsWith('/')) rel += 'index.html';
        const abs = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
        if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            missing.push(rel);
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('not found');
            return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(abs).pipe(res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, port: server.address().port, missing,
                      close: () => new Promise((r) => server.close(r)) });
        });
    });
}

/** One attached page: send(), evaluate(), and the console/error it produced. */
class Page {
    constructor(browser, sessionId, targetId) {
        this.browser = browser;
        this.sessionId = sessionId;
        this.targetId = targetId;
        this.console = [];
        this.exceptions = [];
        this.failedRequests = [];
        this.width = null;
    }

    send(method, params) { return this.browser.send(method, params, this.sessionId); }

    async evaluate(expression) {
        const r = await this.send('Runtime.evaluate', {
            expression: `(function(){${expression}})()`,
            returnByValue: true, awaitPromise: true
        });
        if (r.exceptionDetails) {
            throw new Error('evaluate: ' + (r.exceptionDetails.exception
                ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
        }
        return r.result.value;
    }

    /**
     * Become a phone. deviceScaleFactor and mobile are set because a layout
     * viewport only behaves like a phone's when the page is told it is one —
     * that is what makes width=device-width resolve to 360 rather than 980.
     */
    async setDevice(width, height, mobile) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: mobile ? 3 : 1, mobile: !!mobile,
            screenWidth: width, screenHeight: height, positionX: 0, positionY: 0,
            screenOrientation: mobile
                ? { angle: 0, type: 'portraitPrimary' }
                : { angle: 0, type: 'landscapePrimary' }
        });
        await this.send('Emulation.setTouchEmulationEnabled',
            mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
        this.width = width;

        /* CONFIRM THE OVERRIDE LANDED, DO NOT ASSUME IT.
           setDeviceMetricsOverride returns success even when Chrome quietly
           declines to apply it — which is what happens once too many browser
           instances are alive. A driver that reports a width it never achieved
           is the exact failure this whole suite exists to rule out, so verify
           against the page itself and retry once before giving up. */
        for (let attempt = 0; attempt < 2; attempt++) {
            const got = await this.send('Runtime.evaluate', {
                expression: 'window.screen.width', returnByValue: true
            }).then((r) => r.result && r.result.value).catch(() => null);
            if (got === width) return;
            await sleep(150);
            await this.send('Emulation.setDeviceMetricsOverride', {
                width, height, deviceScaleFactor: mobile ? 3 : 1, mobile: !!mobile,
                screenWidth: width, screenHeight: height, positionX: 0, positionY: 0,
                screenOrientation: mobile
                    ? { angle: 0, type: 'portraitPrimary' }
                    : { angle: 0, type: 'landscapePrimary' }
            });
        }
    }

    /** Run before any page script on the next navigation — seeds session state. */
    async onNewDocument(source) {
        return this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    }

    /**
     * Replace ONE network boundary and nothing else.
     *
     * The pages under audit are shipped bytes and stay that way. What cannot
     * stay real in a test harness is Firebase auth: paid-platform.js asks a
     * live Google endpoint who the learner is, gets "nobody", and sends the
     * browser to the login page — so the page we came to measure never
     * renders. Interception swaps that ONE module for a stub with the same
     * exported surface. Everything the audit actually looks at — the HTML,
     * the CSS, the inline page script, the deck, the exercise engine — is
     * still the shipped file, byte for byte.
     *
     * handler(url) returns a string body to fulfil with, or null to let the
     * real request through untouched.
     */
    async route(handler) {
        await this.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
        this.browser.on('Fetch.requestPaused', this.sessionId, async (p) => {
            let body = null;
            try { body = handler(p.request.url); } catch (e) { body = null; }
            try {
                if (body == null) {
                    await this.send('Fetch.continueRequest', { requestId: p.requestId });
                } else {
                    await this.send('Fetch.fulfillRequest', {
                        requestId: p.requestId, responseCode: 200,
                        responseHeaders: [{ name: 'content-type', value: 'text/javascript; charset=utf-8' },
                                          { name: 'access-control-allow-origin', value: '*' }],
                        body: Buffer.from(body, 'utf8').toString('base64')
                    });
                }
            } catch (e) { /* the target may already be gone */ }
        });
    }

    async goto(url, { waitMs = 900 } = {}) {
        this.console.length = 0;
        this.exceptions.length = 0;
        this.failedRequests.length = 0;
        await this.send('Page.navigate', { url });
        await this.waitForLoad();
        await sleep(waitMs);
    }

    waitForLoad(timeout = 20000) {
        return new Promise((resolve) => {
            const t = setTimeout(resolve, timeout);
            const off = this.browser.on('Page.loadEventFired', this.sessionId, () => {
                clearTimeout(t); off(); resolve();
            });
        });
    }

    /** The single number the whole mobile audit turns on. */
    async metrics() {
        return this.evaluate(`
            var d = document.documentElement, b = document.body;
            return {
                innerWidth: window.innerWidth,
                clientWidth: d.clientWidth,
                scrollWidth: Math.max(d.scrollWidth, b ? b.scrollWidth : 0),
                dpr: window.devicePixelRatio,
                touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
                overflow: Math.max(0, Math.max(d.scrollWidth, b ? b.scrollWidth : 0) - d.clientWidth)
            };`);
    }

    async close() {
        try { await this.browser.send('Target.closeTarget', { targetId: this.targetId }); } catch (e) {}
    }
}

class Browser {
    constructor(child, ws, profile) {
        this.child = child; this.ws = ws; this.profile = profile;
        this._id = 0; this._pending = new Map(); this._handlers = [];
        ws.onmessage = (e) => this._dispatch(JSON.parse(e.data));
    }

    _dispatch(m) {
        if (m.id && this._pending.has(m.id)) {
            const p = this._pending.get(m.id);
            this._pending.delete(m.id);
            return m.error ? p.rej(new Error(m.error.message + ' (' + p.method + ')')) : p.res(m.result);
        }
        if (m.method) for (const h of this._handlers.slice()) {
            if (h.method === m.method && (!h.sessionId || h.sessionId === m.sessionId)) h.fn(m.params, m.sessionId);
        }
    }

    on(method, sessionId, fn) {
        const h = { method, sessionId, fn };
        this._handlers.push(h);
        return () => { const i = this._handlers.indexOf(h); if (i >= 0) this._handlers.splice(i, 1); };
    }

    send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
            const id = ++this._id;
            this._pending.set(id, { res, rej, method });
            this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
    }

    async newPage() {
        const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
        const page = new Page(this, sessionId, targetId);
        await this.send('Page.enable', {}, sessionId);
        await this.send('Runtime.enable', {}, sessionId);
        await this.send('Log.enable', {}, sessionId);
        await this.send('Network.enable', {}, sessionId);
        this.on('Runtime.consoleAPICalled', sessionId, (p) => {
            page.console.push({
                type: p.type,
                text: (p.args || []).map((a) =>
                    a.value !== undefined ? String(a.value)
                        : (a.description !== undefined ? String(a.description) : a.type)).join(' ')
            });
        });
        this.on('Runtime.exceptionThrown', sessionId, (p) => {
            const d = p.exceptionDetails || {};
            page.exceptions.push(d.exception ? (d.exception.description || d.exception.value || d.text) : d.text);
        });
        this.on('Log.entryAdded', sessionId, (p) => {
            const e = p.entry || {};
            if (e.level === 'error') page.console.push({ type: 'error', text: e.text, url: e.url, source: e.source });
        });
        this.on('Network.loadingFailed', sessionId, (p) => {
            page.failedRequests.push({ type: p.type, error: p.errorText });
        });
        this.on('Network.responseReceived', sessionId, (p) => {
            if (p.response && p.response.status >= 400) {
                page.failedRequests.push({ type: p.type, status: p.response.status, url: p.response.url });
            }
        });
        return page;
    }

    /**
     * SHUT CHROME DOWN FOR REAL.
     *
     * child.kill() signals the browser process only. Chrome forks a renderer,
     * a GPU process and a zygote per instance, and on macOS those outlive a
     * bare SIGTERM to the parent long enough to pile up: a run of this suite
     * plus a sweep of negative controls left twenty-eight live headless
     * browsers behind. That is not merely untidy — past roughly a dozen
     * instances the next Chrome starts but SILENTLY IGNORES
     * Emulation.setDeviceMetricsOverride, so every page reports the default
     * 800x600 window and every width assertion fails at once. The suite
     * correctly refused to call that a phone, which is how the leak surfaced.
     *
     * So: ask the browser to close over the protocol, then kill the whole
     * process GROUP (spawned detached for exactly this reason), then reap.
     */
    async close() {
        try { await Promise.race([this.send('Browser.close'), sleep(1500)]); } catch (e) {}
        try { this.ws.close(); } catch (e) {}
        try { process.kill(-this.child.pid, 'SIGTERM'); } catch (e) {
            try { this.child.kill('SIGTERM'); } catch (e2) {}
        }
        await sleep(300);
        try { process.kill(-this.child.pid, 'SIGKILL'); } catch (e) {
            try { this.child.kill('SIGKILL'); } catch (e2) {}
        }
        await sleep(120);
        try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) {}
    }
}

/**
 * Launch, or refuse. The caller gets a working protocol connection or an
 * exception explaining exactly which step failed.
 */
async function launch({ headless = true } = {}) {
    const bin = findChrome();
    if (!bin) {
        throw new Error('no Chrome/Chromium binary found — real CDP cannot run. Set CHROME_PATH.');
    }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uzdarus-cdp-'));
    const args = [
        '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', '--mute-audio',
        '--disable-features=Translate,MediaRouter', '--window-size=1280,900', 'about:blank'
    ];
    if (headless) args.unshift('--headless=new');
    /* detached: its own process group, so close() can kill the whole tree */
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });

    /* Chrome prints the chosen port on stderr when asked for port 0. */
    let stderr = '';
    let wsUrl = null;
    child.stderr.on('data', (d) => {
        stderr += d.toString();
        const m = stderr.match(/ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[a-f0-9-]+/);
        if (m && !wsUrl) wsUrl = m[0];
    });
    for (let i = 0; i < 80 && !wsUrl; i++) await sleep(125);
    if (!wsUrl) {
        try { child.kill(); } catch (e) {}
        throw new Error('Chrome started but never published a DevTools endpoint: ' + stderr.slice(0, 400));
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('DevTools websocket timeout')), 15000);
        ws.onopen = () => { clearTimeout(t); res(); };
        ws.onerror = () => { clearTimeout(t); rej(new Error('DevTools websocket refused')); };
    });
    const browser = new Browser(child, ws, profile);
    const version = await browser.send('Browser.getVersion');
    browser.version = version.product;
    browser.protocol = version.protocolVersion;
    return browser;
}

module.exports = { launch, serveRepo, findChrome, sleep, ROOT };
