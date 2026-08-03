/**
 * Minimal in-memory Firestore fake — just enough of the Admin SDK surface used
 * by api/_lib/analytics-store.js (collection/doc/get/batch/orderBy/limit).
 * Lets the analytics write + read paths be tested without any Firebase.
 */

let autoSeq = 0;
export const SERVER_TS = '<serverTimestamp>';

/* Sentinels — mirror the Admin SDK's FieldValue.increment()/delete(), which the
   analytics ingest path now uses for the platform counter documents. Without
   them the mock silently stored the sentinel OBJECT and every global-aggregate
   assertion would have been vacuously true. */
const INCREMENT = Symbol('increment');
const DELETE = Symbol('delete');

function isSentinel(v, kind) {
    return Boolean(v && typeof v === 'object' && v.__sentinel === kind);
}

function resolveTimestamps(value) {
    if (value === SERVER_TS) return Date.now();
    if (Array.isArray(value)) return value.map(resolveTimestamps);
    if (value && typeof value === 'object') {
        if (isSentinel(value, INCREMENT) || isSentinel(value, DELETE)) return value;
        const out = {};
        for (const k of Object.keys(value)) out[k] = resolveTimestamps(value[k]);
        return out;
    }
    return value;
}

function isPlainObject(v) {
    return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
        && !isSentinel(v, INCREMENT) && !isSentinel(v, DELETE);
}

/**
 * set(..., { merge: true }) in real Firestore merges NESTED maps and applies
 * field sentinels. The old shallow spread would have thrown away every day
 * bucket except the newest.
 */
function deepMerge(target, patch) {
    const out = { ...(target || {}) };
    for (const [k, v] of Object.entries(patch || {})) {
        if (isSentinel(v, DELETE)) { delete out[k]; continue; }
        if (isSentinel(v, INCREMENT)) {
            out[k] = (Number(out[k]) || 0) + Number(v.value || 0);
            continue;
        }
        if (isPlainObject(v)) { out[k] = deepMerge(isPlainObject(out[k]) ? out[k] : {}, v); continue; }
        out[k] = v;
    }
    return out;
}

/** Strip any sentinel that survived a non-merge write (Firestore rejects those;
 *  the mock just resolves them against an empty base so tests stay readable). */
function materialize(data) {
    return deepMerge({}, data);
}

class DocRef {
    constructor(store, path) { this.store = store; this.path = path; this.id = path.split('/').pop(); }
    collection(name) { return new CollectionRef(this.store, `${this.path}/${name}`); }
    async get() {
        const has = this.store.docs.has(this.path);
        const data = this.store.docs.get(this.path);
        return { exists: has, id: this.id, data: () => (data ? { ...data } : undefined) };
    }
    _write(data, merge) {
        const resolved = resolveTimestamps(data);
        if (merge) {
            this.store.docs.set(this.path, deepMerge(this.store.docs.get(this.path), resolved));
        } else {
            this.store.docs.set(this.path, materialize(resolved));
        }
    }
    async set(data, opts) { this._write(data, Boolean(opts && opts.merge)); }
    async delete() { this.store.docs.delete(this.path); }
}

class Query {
    constructor(store, colPath, ops = {}) { this.store = store; this.colPath = colPath; this.ops = ops; }
    orderBy(field, dir = 'asc') { return new Query(this.store, this.colPath, { ...this.ops, orderBy: [field, dir] }); }
    limit(n) { return new Query(this.store, this.colPath, { ...this.ops, limit: n }); }
    async get() {
        const prefix = this.colPath + '/';
        let docs = [];
        for (const [path, data] of this.store.docs.entries()) {
            if (!path.startsWith(prefix)) continue;
            const rest = path.slice(prefix.length);
            if (rest.includes('/')) continue; // only direct children (not sub-subcollections)
            docs.push({ id: rest, data: () => ({ ...data }), _raw: data });
        }
        if (this.ops.orderBy) {
            const [f, dir] = this.ops.orderBy;
            docs.sort((a, b) => ((a._raw[f] || 0) - (b._raw[f] || 0)) * (dir === 'desc' ? -1 : 1));
        }
        if (this.ops.limit) docs = docs.slice(0, this.ops.limit);
        return { docs, size: docs.length };
    }
}

class CollectionRef extends Query {
    constructor(store, path) { super(store, path, {}); this.path = path; }
    doc(id) { return new DocRef(this.store, `${this.path}/${id || `auto_${++autoSeq}`}`); }
}

class Batch {
    constructor() { this.ops = []; }
    set(ref, data, opts) { this.ops.push({ op: 'set', ref, data, merge: Boolean(opts && opts.merge) }); return this; }
    delete(ref) { this.ops.push({ op: 'delete', ref }); return this; }
    async commit() {
        for (const op of this.ops) {
            if (op.op === 'delete') op.ref.store.docs.delete(op.ref.path);
            else op.ref._write(op.data, op.merge);
        }
    }
}

export class MockFirestore {
    constructor() { this.docs = new Map(); }
    collection(name) { return new CollectionRef(this, name); }
    doc(path) { return new DocRef(this, path); }
    batch() { return new Batch(); }
    /** test helper: seed a doc at an absolute path */
    seed(path, data) { this.docs.set(path, data); return this; }
    /** test helper: list docs under a collection path */
    list(colPath) {
        const prefix = colPath + '/';
        const out = [];
        for (const [p, d] of this.docs.entries()) {
            if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) out.push({ path: p, data: d });
        }
        return out;
    }
}

/** The `admin` object shape that analytics-store expects. */
export function makeAdmin() {
    const db = new MockFirestore();
    return {
        admin: {
            adminDb: db,
            FieldValue: {
                serverTimestamp: () => SERVER_TS,
                increment: (value) => ({ __sentinel: INCREMENT, value }),
                delete: () => ({ __sentinel: DELETE }),
            },
        },
        db,
    };
}
