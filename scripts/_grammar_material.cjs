/**
 * The grammar a topic teaches, read from where it now lives.
 *
 * The material used to be a string inside each course page and was asserted by
 * rendering the lesson pane. It now lives in grammar-data/<course>/<id>.js and
 * is shown by the shared reader, so the per-topic suites read it from here and
 * keep asserting the same content at its new address.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const cache = {};

function materialOf(course, id) {
    const code = String(course).toUpperCase();
    const key = code + '/' + id;
    if (cache[key]) return cache[key];
    const file = path.join(ROOT, 'grammar-data', code.toLowerCase(), id + '.js');
    if (!fs.existsSync(file)) throw new Error('no grammar material for ' + key);
    const sandbox = {};
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
    const topic = ((sandbox.UzGrammarData || {})[code] || {})[id];
    if (!topic) throw new Error('material file registers nothing for ' + key);
    const body = String(topic.body || '');
    cache[key] = {
        title: topic.title, objective: topic.objective, summary: topic.summary,
        body: body,
        images: topic.images || [],
        /* the readable text, tags stripped and whitespace collapsed */
        text: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    };
    return cache[key];
}

module.exports = { materialOf };
