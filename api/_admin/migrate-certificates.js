import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { CAPABILITIES } from '../_lib/roles.js';
import { issueCertificate, CERT_COURSES } from '../_lib/certificates.js';

/**
 * POST /api/admin?action=migrate-certificates  (developer only)
 *
 * Back-fills the certificate registry for every existing user who has already
 * passed a final exam (`courses.<COURSE>.finalExamPassed === true`) but has no
 * issued certificate yet. Idempotent — re-running never creates duplicates,
 * and it never touches user/subscription/progress data (additive writes only).
 *
 * Lazy migration (auto-issue on next login) covers active users; this endpoint
 * covers everyone, including users who never log in again.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;
    if (!assertMethod(req, res, 'POST')) return;

    try {
        const session = await requireSession(req);
        requireCapability(session, CAPABILITIES.CERTIFICATES_MIGRATE);

        const { adminDb } = initAdmin();
        const courses = Object.keys(CERT_COURSES);

        const usersSnap = await adminDb.collection('users').get();

        let scanned = 0;
        let issued = 0;
        let skipped = 0;
        let errors = 0;
        const issuedNumbers = [];

        for (const docSnap of usersSnap.docs) {
            scanned += 1;
            const data = docSnap.data() || {};
            const userCourses = data.courses || {};

            for (const course of courses) {
                const cp = userCourses[course] || {};
                if (cp.finalExamPassed !== true) {
                    continue;
                }

                if (cp.certificateNumber) {
                    skipped += 1;
                    continue;
                }

                try {
                    const result = await issueCertificate({
                        uid: docSnap.id,
                        course,
                        profile: data,
                        isPrivileged: false
                    });
                    if (result.alreadyIssued) {
                        skipped += 1;
                    } else {
                        issued += 1;
                        issuedNumbers.push(result.number);
                    }
                } catch (err) {
                    errors += 1;
                    console.error(`migrate-certificates: ${docSnap.id}/${course} failed:`, err?.message || err);
                }
            }
        }

        sendJson(res, 200, {
            ok: true,
            summary: { scanned, issued, skipped, errors },
            issuedNumbers
        });
    } catch (error) {
        safeError(res, error);
    }
}
