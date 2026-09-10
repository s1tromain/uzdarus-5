#!/usr/bin/env node
/**
 * migrate_tariffs.cjs — bring every stored tariff to the one plan the platform
 * sells.
 *
 *     STARTER | START | STANDART | STANDARD | TURBO | GOLD | PLATINUM  →  PREMIUM
 *
 * WHAT IT TOUCHES
 *   One field: users/{uid}.subscription.tariff. Nothing else. Not accessPacks,
 *   not endAt, not startAt, not progress, not role, not blocked, not devices —
 *   the write is a field-path update, so a document is never re-created and
 *   nothing outside that path can be lost.
 *
 * WHY IT IS SAFE TO RUN TWICE
 *   It only writes a document whose tariff is a legacy value. A second run
 *   finds none and writes nothing. Interrupt it halfway and run it again: the
 *   accounts already done are skipped.
 *
 * WHY IT IS NOT URGENT
 *   The read path already treats every legacy value as PREMIUM
 *   (api/_lib/user-helpers.js, tariff-display.js), so nobody sees an old name
 *   or loses a plan while this is pending. The migration settles the storage.
 *
 *   node scripts/migrate_tariffs.cjs              dry run — counts only
 *   node scripts/migrate_tariffs.cjs --apply      writes
 *
 * Needs FIREBASE_SERVICE_ACCOUNT_KEY in the environment, the same credential
 * the serverless endpoints use.
 */
'use strict';

const LEGACY = new Set([
    'STARTER', 'START', 'STANDART', 'STANDARD', 'TURBO', 'GOLD', 'PLATINUM'
]);
const CANONICAL = 'PREMIUM';
const BATCH = 400;

const APPLY = process.argv.includes('--apply');

/**
 * The slice of Firestore this migration needs, over REST.
 *
 * Only three calls: page through users, read one field, patch one field. The
 * value shapes are Firestore's typed JSON, so `{stringValue: 'PREMIUM'}` is
 * what a string looks like on the wire.
 */
/** The OAuth client the installed Firebase CLI uses to refresh its own token. */
function readCliOAuthClient() {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    try {
        const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const file = path.join(root, 'firebase-tools', 'lib', 'api.js');
        if (!fs.existsSync(file)) return null;
        /* the module exports them as accessors, not as plain strings */
        const api = require(file);
        const clientId = typeof api.clientId === 'function' ? api.clientId() : api.clientId;
        const clientSecret = typeof api.clientSecret === 'function' ? api.clientSecret() : api.clientSecret;
        if (clientId && clientSecret) return { clientId, clientSecret };
    } catch (e) { /* the CLI is not installed globally */ }
    return null;
}

function makeRest(projectId, accessToken) {
    const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}`
        + '/databases/(default)/documents';
    const auth = { Authorization: `Bearer ${accessToken}` };

    async function call(url, init) {
        const res = await fetch(url, Object.assign({ headers: auth }, init || {}));
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
        }
        return res.json();
    }

    return {
        async page(pageToken) {
            const url = new URL(`${BASE}/users`);
            url.searchParams.set('pageSize', '300');
            /* only the field this migration reads leaves the database */
            url.searchParams.append('mask.fieldPaths', 'subscription');
            if (pageToken) url.searchParams.set('pageToken', pageToken);
            const j = await call(url.toString());
            return { docs: j.documents || [], next: j.nextPageToken || null };
        },
        tariffOf(doc) {
            const sub = doc.fields && doc.fields.subscription;
            const map = sub && sub.mapValue && sub.mapValue.fields;
            const t = map && map.tariff;
            if (!t) return null;
            if (typeof t.stringValue === 'string') return t.stringValue;
            if ('nullValue' in t) return null;
            return null;
        },
        async setTariff(name, value) {
            const url = new URL(`https://firestore.googleapis.com/v1/${name}`);
            url.searchParams.append('updateMask.fieldPaths', 'subscription.tariff');
            await call(url.toString(), {
                method: 'PATCH',
                headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
                body: JSON.stringify({
                    fields: { subscription: { mapValue: { fields: {
                        tariff: { stringValue: value }
                    } } } }
                })
            });
        }
    };
}

function classify(raw) {
    if (raw == null) return 'none';
    const value = String(raw).trim().toUpperCase();
    if (!value) return 'none';
    if (value === CANONICAL) return 'already';
    if (LEGACY.has(value)) return 'legacy';
    return 'other';
}

(async () => {
    let admin;
    try {
        admin = require('firebase-admin');
    } catch (e) {
        console.error('firebase-admin is not installed here. npm i firebase-admin');
        process.exit(2);
    }

    /* THREE WAYS IN, IN ORDER OF HOW DELIBERATE THEY ARE.
       A service-account key is what the deployed endpoints use and what CI
       would set. Application Default Credentials are what a workstation with
       gcloud has. The Firebase CLI's own refresh token is what a workstation
       that has only ever run `firebase login` has — which is the common case,
       and refusing it would report a blocker that is not really there. */
    let projectId = process.env.FIREBASE_PROJECT_ID || null;
    let credential = null;
    let how = null;

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (raw) {
        let serviceAccount;
        try {
            serviceAccount = JSON.parse(raw);
        } catch (e) {
            console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.');
            process.exit(2);
        }
        credential = admin.credential.cert(serviceAccount);
        projectId = projectId || serviceAccount.project_id;
        how = 'service account key';
    }

    if (!credential) {
        try {
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const store = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
            const saved = JSON.parse(fs.readFileSync(store, 'utf8'));
            const refreshToken = saved && saved.tokens && saved.tokens.refresh_token;
            if (refreshToken) {
                /* THE OAUTH CLIENT IS READ FROM THE INSTALLED CLI, NOT PINNED.
                   A refresh token can only be exchanged by the client that
                   issued it, and that client id and secret are the Firebase
                   CLI's own — they rotate with its releases, so hardcoding a
                   pair here means this script starts failing on someone's
                   machine for no visible reason. They are not a secret of this
                   project and nothing about them is written down. */
                const oauth = readCliOAuthClient();
                if (!oauth) throw new Error('cannot read the CLI OAuth client');
                credential = admin.credential.refreshToken({
                    type: 'authorized_user',
                    client_id: oauth.clientId,
                    client_secret: oauth.clientSecret,
                    refresh_token: refreshToken
                });
                const active = saved.activeProjects || {};
                projectId = projectId
                    || active[process.cwd()]
                    || Object.values(active)[0]
                    || null;
                how = 'firebase CLI login';
            }
        } catch (e) { /* not signed in with the CLI either */ }
    }

    if (!credential) {
        try {
            credential = admin.credential.applicationDefault();
            how = 'application default credentials';
        } catch (e) { /* nothing left to try */ }
    }

    if (!credential || !projectId) {
        console.error('No usable credential.');
        console.error('');
        console.error('  BLOCKER: this environment has no way to reach Firestore as an admin.');
        console.error('  Any ONE of these fixes it:');
        console.error('    FIREBASE_SERVICE_ACCOUNT_KEY=\'<the service account JSON>\' \\');
        console.error('      node scripts/migrate_tariffs.cjs --apply');
        console.error('    firebase login                (then re-run)');
        console.error('    gcloud auth application-default login');
        if (!projectId) console.error('  and FIREBASE_PROJECT_ID if the project cannot be inferred.');
        process.exit(2);
    }

    /* THE SDK AND THE REST API DISAGREE ABOUT WHAT A CREDENTIAL IS.
       google.firestore.v1 through firebase-admin insists on a certificate or
       ADC and rejects a refresh token outright; the REST endpoint accepts the
       access token that same refresh token mints. Rather than report a blocker
       that only exists inside one client library, this talks to Firestore over
       REST when that is the credential available. The writes are identical:
       a PATCH with updateMask=subscription.tariff touches one field. */
    let db = null;
    let rest = null;

    if (how === 'service account key' || how === 'application default credentials') {
        if (!admin.apps.length) admin.initializeApp({ credential, projectId });
        db = admin.firestore();
    } else {
        const token = await credential.getAccessToken();
        rest = makeRest(projectId, token.access_token);
    }
    console.log(`  credential: ${how} · project ${projectId} · ${db ? 'sdk' : 'rest'}`);

    console.log(`\n=== TARIFF MIGRATION — ${APPLY ? 'APPLYING' : 'DRY RUN'} ===`);

    const counts = { total: 0, none: 0, already: 0, legacy: 0, other: 0 };
    const byValue = {};
    const todo = [];

    function record(tariff, ref) {
        counts.total++;
        const kind = classify(tariff);
        counts[kind]++;
        if (kind === 'legacy' || kind === 'other') {
            const key = String(tariff).trim().toUpperCase();
            byValue[key] = (byValue[key] || 0) + 1;
        }
        if (kind === 'legacy') todo.push(ref);
    }

    /* Paged rather than one big read, so a large user table does not have to
       fit in memory and an interrupted run can simply be repeated. */
    if (db) {
        let last = null;
        for (;;) {
            let q = db.collection('users').orderBy('__name__').limit(1000);
            if (last) q = q.startAfter(last);
            const snap = await q.get();
            if (snap.empty) break;
            snap.forEach((doc) => record((doc.data().subscription || {}).tariff, doc.ref));
            last = snap.docs[snap.docs.length - 1];
            if (snap.size < 1000) break;
        }
    } else {
        let token = null;
        for (;;) {
            const { docs, next } = await rest.page(token);
            docs.forEach((doc) => record(rest.tariffOf(doc), doc.name));
            if (!next) break;
            token = next;
        }
    }

    /* No usernames, no emails, no ids — a count per stored value is all this
       needs to report and all it should print. */
    console.log(`  accounts scanned .......... ${counts.total}`);
    console.log(`  no plan ................... ${counts.none}`);
    console.log(`  already PREMIUM ........... ${counts.already}`);
    console.log(`  legacy paid names ......... ${counts.legacy}`);
    console.log(`  unrecognised (left alone) . ${counts.other}`);
    if (Object.keys(byValue).length) {
        console.log('  by stored value:');
        Object.keys(byValue).sort().forEach((k) => {
            const note = LEGACY.has(k) ? '→ PREMIUM' : '(left as it is)';
            console.log(`    ${k.padEnd(12)} ${String(byValue[k]).padStart(6)}  ${note}`);
        });
    }

    if (!todo.length) {
        console.log(`\n  nothing to change.\n`);
        process.exit(0);
    }

    if (!APPLY) {
        console.log(`\n  ${todo.length} account(s) would be updated. Re-run with --apply.\n`);
        process.exit(0);
    }

    let written = 0;
    if (db) {
        for (let i = 0; i < todo.length; i += BATCH) {
            const batch = db.batch();
            todo.slice(i, i + BATCH).forEach((ref) => {
                /* A field path, not a document merge: subscription.endAt,
                   subscription.startAt, accessPacks and everything else are not
                   part of this write and cannot be disturbed by it. */
                batch.update(ref, { 'subscription.tariff': CANONICAL });
            });
            await batch.commit();
            written += Math.min(BATCH, todo.length - i);
            console.log(`  written ${written}/${todo.length}`);
        }
    } else {
        for (const name of todo) {
            await rest.setTariff(name, CANONICAL);
            written++;
            if (written % 25 === 0 || written === todo.length) {
                console.log(`  written ${written}/${todo.length}`);
            }
        }
    }

    console.log(`\n  done: ${written} account(s) now store ${CANONICAL}.`);
    console.log('  re-running this script will report nothing to change.\n');
    process.exit(0);
})().catch((e) => {
    console.error('migration failed:', e && e.message);
    process.exit(1);
});
