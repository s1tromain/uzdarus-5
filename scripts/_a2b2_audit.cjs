/**
 * _a2b2_audit.cjs — drive the REAL A2 and B2 exercise runtime.
 *
 * The question this answers is not "does the source mention X" but "does the
 * learner get X". Both pages are large and both already run the shared
 * session, so what matters is which parts of the A1/B1 lifecycle their own
 * wiring actually reaches.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function lift(src, name) {
    const i = src.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
    if (i < 0) return null;
    let p = 0, b = -1;
    for (let k = src.indexOf('(', i); k < src.length; k++) {
        if (src[k] === '(') p++;
        else if (src[k] === ')') { p--; if (p === 0) { b = src.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    return null;
}

/** A window with the shared stack and the course host loaded. */
function stack(hostFile, extra) {
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://uzdarus.test/paid-courses/x.html',
        runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
    });
    const w = dom.window;
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    const proto = w.Storage.prototype;
    const writes = { draftSet: 0, draftRemove: 0 };
    const rawSet = proto.setItem, rawRemove = proto.removeItem;
    proto.setItem = function (k, v) { writes.draftSet++; return rawSet.call(this, k, v); };
    proto.removeItem = function (k) { writes.draftRemove++; return rawRemove.call(this, k); };
    ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js']
        .concat(extra || []).concat([hostFile])
        .forEach((f) => new Function('window', 'document', 'localStorage',
            read(f))(w, w.document, w.localStorage));
    return { window: w, writes };
}

module.exports = { ROOT, read, lift, stack };
