import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

let cached = null;

function configurationError(message) {
    return Object.assign(new Error(message), { statusCode: 500 });
}

function parseServiceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!raw) {
        throw configurationError('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(raw);
    } catch (error) {
        throw configurationError('Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON');
    }

    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
        throw configurationError('FIREBASE_SERVICE_ACCOUNT_KEY must include client_email and private_key');
    }

    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    return serviceAccount;
}

export function initAdmin() {
    if (cached) {
        return cached;
    }

    const serviceAccount = parseServiceAccount();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;

    if (!projectId) {
        throw configurationError('Missing FIREBASE_PROJECT_ID');
    }

    const app = admin.apps.length
        ? admin.app()
        : admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
              projectId
          });

    cached = {
        admin,
        app,
        adminAuth: admin.auth(app),
        adminDb: admin.firestore(app),
        FieldValue: admin.firestore.FieldValue,
        Timestamp: admin.firestore.Timestamp
    };

    return cached;
}

const cjsExports = { initAdmin };

if (typeof module !== 'undefined' && module?.exports) {
    module.exports = cjsExports;
}

export default cjsExports;
