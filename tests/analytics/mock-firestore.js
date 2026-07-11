/**
 * Minimal in-memory Firestore fake — just enough of the Admin SDK surface used
 * by api/_lib/analytics-store.js (collection/doc/get/batch/orderBy/limit).
 * Lets the analytics write + read paths be tested without any Firebase.
 */

let autoSeq = 0;
export const SERVER_TS = '<serverTimestamp>';

function resolveTimestamps(value) {
    if (value === SERVER_TS) return Date.now();
    if (Array.isArray(value)) return value.map(resolveTimestamps);
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = resolveTimestamps(value[k]);
        return out;
    }
    return value;
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
        if (merge && this.store.docs.has(this.path)) {
            this.store.docs.set(this.path, { ...this.store.docs.get(this.path), ...resolved });
        } else {
            this.store.docs.set(this.path, { ...resolved });
        }
    }
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
    set(ref, data, opts) { this.ops.push({ ref, data, merge: Boolean(opts && opts.merge) }); return this; }
    async commit() { for (const op of this.ops) op.ref._write(op.data, op.merge); }
}

export class MockFirestore {
    constructor() { this.docs = new Map(); }
    collection(name) { return new CollectionRef(this, name); }
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
        admin: { adminDb: db, FieldValue: { serverTimestamp: () => SERVER_TS } },
        db,
    };
}
