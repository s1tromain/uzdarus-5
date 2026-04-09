#!/usr/bin/env node
/**
 * generate-audio.js
 *
 * Pre-generates TTS mp3 files for every Russian word/phrase
 * across all vocabulary courses (A1, A2, B1, B2).
 *
 * Output structure:
 *   /audio/{level}/lesson{topicId}/{sanitized-word}.mp3
 *
 * Usage:
 *   AZURE_SPEECH_KEY=xxx AZURE_REGION=eastus node scripts/generate-audio.js
 *
 * Options (env):
 *   CONCURRENCY   — parallel requests (default: 5)
 *   FORCE         — "1" to overwrite existing files
 *   LEVELS        — comma-separated filter, e.g. "a1,b2"
 */

import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */
const SPEECH_KEY  = process.env.AZURE_SPEECH_KEY;
const REGION      = process.env.AZURE_REGION || 'eastus';
const CONCURRENCY = parseInt(process.env.CONCURRENCY, 10) || 5;
const FORCE       = process.env.FORCE === '1';
const LEVEL_FILTER = process.env.LEVELS
    ? process.env.LEVELS.split(',').map(l => l.trim().toLowerCase())
    : null;

const MAX_RETRIES    = 3;
const RETRY_BASE_MS  = 1000;   // exponential back-off base
const VOICE_NAME     = 'ru-RU-DmitryNeural';
const OUTPUT_FORMAT  = 'audio-16khz-128kbitrate-mono-mp3';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = resolve(__dirname, '..');
const AUDIO_DIR = join(ROOT, 'audio');

/* Source files — paid versions are canonical */
const SOURCES = [
    { level: 'a1', file: 'paid-courses/a1-vocabulary.html' },
    { level: 'a2', file: 'paid-courses/a2-vocabulary.html' },
    { level: 'b1', file: 'paid-courses/b1-vocabulary.html' },
    { level: 'b2', file: 'paid-courses/b2-vocabulary.html' },
];

/* ------------------------------------------------------------------ */
/*  Logging                                                           */
/* ------------------------------------------------------------------ */
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN  = '\x1b[36m';
const DIM   = '\x1b[2m';

function log(msg)  { console.log(`${DIM}[${ts()}]${RESET} ${msg}`); }
function ok(msg)   { console.log(`${DIM}[${ts()}]${RESET} ${GREEN}✔${RESET} ${msg}`); }
function warn(msg) { console.warn(`${DIM}[${ts()}]${RESET} ${YELLOW}⚠${RESET} ${msg}`); }
function err(msg)  { console.error(`${DIM}[${ts()}]${RESET} ${RED}✖${RESET} ${msg}`); }
function ts() {
    return new Date().toISOString().slice(11, 19);
}

/* ------------------------------------------------------------------ */
/*  Extract vocabularyData from HTML                                  */
/* ------------------------------------------------------------------ */
function extractVocabulary(html) {
    // Grab everything between `const vocabularyData = {` and the matching close `};`
    const startMarker = 'const vocabularyData = {';
    const idx = html.indexOf(startMarker);
    if (idx === -1) throw new Error('vocabularyData not found in HTML');

    let braceDepth = 0;
    let startPos = idx + startMarker.length - 1; // the opening `{`
    let endPos = -1;

    for (let i = startPos; i < html.length; i++) {
        if (html[i] === '{') braceDepth++;
        else if (html[i] === '}') {
            braceDepth--;
            if (braceDepth === 0) { endPos = i; break; }
        }
    }

    if (endPos === -1) throw new Error('Could not find end of vocabularyData object');

    const raw = html.slice(startPos, endPos + 1);

    // The object uses unquoted keys and single-quotes — normalise for JSON.parse
    // Strategy: use a Function constructor in a safe way (data is our own HTML)
    const fn = new Function(`return (${raw})`);
    return fn();
}

/* ------------------------------------------------------------------ */
/*  Azure TTS                                                         */
/* ------------------------------------------------------------------ */
function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildSsml(text) {
    return [
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">',
        `  <voice name="${VOICE_NAME}">`,
        `    ${escapeXml(text)}`,
        '  </voice>',
        '</speak>',
    ].join('\n');
}

async function synthesize(text) {
    const url = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = buildSsml(text);

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': SPEECH_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
            'User-Agent': 'UzdaRusTTS-Generator',
        },
        body: ssml,
    });

    if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        const e = new Error(`Rate limited (429)`);
        e.retryAfterMs = retryAfter * 1000;
        throw e;
    }

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Azure ${res.status}: ${detail.slice(0, 200)}`);
    }

    return Buffer.from(await res.arrayBuffer());
}

async function synthesizeWithRetry(text) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await synthesize(text);
        } catch (e) {
            if (attempt === MAX_RETRIES) throw e;

            const delayMs = e.retryAfterMs || RETRY_BASE_MS * Math.pow(2, attempt - 1);
            warn(`Retry ${attempt}/${MAX_RETRIES} for "${text}" in ${delayMs}ms — ${e.message}`);
            await sleep(delayMs);
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Filesystem helpers                                                */
/* ------------------------------------------------------------------ */
function sanitizeFilename(text) {
    return text
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 120);
}

async function fileExists(path) {
    try { await access(path); return true; } catch { return false; }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/*  Concurrency pool                                                  */
/* ------------------------------------------------------------------ */
async function runPool(tasks, concurrency) {
    let idx = 0;
    const total = tasks.length;
    const results = { ok: 0, skipped: 0, failed: 0, errors: [] };

    async function worker() {
        while (idx < total) {
            const i = idx++;
            const task = tasks[i];
            try {
                const res = await task();
                if (res === 'skipped') results.skipped++;
                else results.ok++;
            } catch (e) {
                results.failed++;
                results.errors.push({ index: i, error: e.message });
                err(e.message);
            }
            // progress every 25 items
            if ((results.ok + results.skipped + results.failed) % 25 === 0) {
                const done = results.ok + results.skipped + results.failed;
                log(`${CYAN}Progress: ${done}/${total}${RESET}  ✔${results.ok}  ⏭${results.skipped}  ✖${results.failed}`);
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
    await Promise.all(workers);
    return results;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */
async function main() {
    /* ---- preflight ---- */
    if (!SPEECH_KEY) {
        err('AZURE_SPEECH_KEY not set. Export it and re-run.');
        process.exit(1);
    }

    log(`Azure region:    ${CYAN}${REGION}${RESET}`);
    log(`Concurrency:     ${CYAN}${CONCURRENCY}${RESET}`);
    log(`Output dir:      ${CYAN}${AUDIO_DIR}${RESET}`);
    log(`Force overwrite: ${CYAN}${FORCE}${RESET}`);
    if (LEVEL_FILTER) log(`Level filter:    ${CYAN}${LEVEL_FILTER.join(', ')}${RESET}`);
    log('');

    const allTasks = [];
    let totalWords = 0;

    /* ---- parse each source ---- */
    for (const src of SOURCES) {
        if (LEVEL_FILTER && !LEVEL_FILTER.includes(src.level)) {
            log(`Skipping ${src.level.toUpperCase()} (filtered out)`);
            continue;
        }

        const htmlPath = join(ROOT, src.file);
        log(`Parsing ${CYAN}${src.file}${RESET} …`);

        let html;
        try {
            html = await readFile(htmlPath, 'utf-8');
        } catch (e) {
            err(`Cannot read ${htmlPath}: ${e.message}`);
            continue;
        }

        let data;
        try {
            data = extractVocabulary(html);
        } catch (e) {
            err(`Cannot parse vocabulary from ${src.file}: ${e.message}`);
            continue;
        }

        const topics = data.topics || [];
        log(`  Found ${topics.length} topic(s)`);

        for (const topic of topics) {
            const lessonDir = join(AUDIO_DIR, src.level, `lesson${topic.id}`);
            const words = topic.words || [];

            for (let wi = 0; wi < words.length; wi++) {
                const word = words[wi];
                const ruText = (word.ru || '').trim();
                if (!ruText) continue;

                totalWords++;
                const filename = sanitizeFilename(ruText) + '.mp3';
                const outPath = join(lessonDir, filename);

                allTasks.push(async () => {
                    /* Skip existing unless FORCE */
                    if (!FORCE && await fileExists(outPath)) return 'skipped';

                    /* Ensure directory */
                    await mkdir(lessonDir, { recursive: true });

                    /* Synthesize */
                    const mp3 = await synthesizeWithRetry(ruText);
                    await writeFile(outPath, mp3);
                    ok(`${src.level}/lesson${topic.id}/${filename}  (${mp3.length} bytes)`);
                    return 'ok';
                });
            }
        }
    }

    log('');
    log(`Total words to process: ${CYAN}${totalWords}${RESET}`);
    log(`Starting generation with ${CONCURRENCY} workers …`);
    log('');

    const t0 = Date.now();
    const results = await runPool(allTasks, CONCURRENCY);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    /* ---- summary ---- */
    log('');
    log('═══════════════════════════════════════');
    log(`  ${GREEN}Generated${RESET}:  ${results.ok}`);
    log(`  ${YELLOW}Skipped${RESET}:    ${results.skipped}`);
    log(`  ${RED}Failed${RESET}:     ${results.failed}`);
    log(`  Time:        ${elapsed}s`);
    log('═══════════════════════════════════════');

    if (results.errors.length > 0) {
        log('');
        err('Failed items:');
        for (const e of results.errors) {
            err(`  ${e.error}`);
        }
        process.exit(1);
    }
}

main().catch(e => {
    err(`Fatal: ${e.message}`);
    process.exit(1);
});
