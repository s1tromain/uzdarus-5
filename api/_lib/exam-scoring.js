import { EXAM_CANON } from './course-canon.js';

/**
 * exam-scoring.js — the server's own grading of a final exam.
 *
 * The client used to decide `passed` and `score` and simply write them into its
 * own Firestore document. Both are now computed here, from the canonical answer
 * key, against the answers the learner submitted. Whatever score the browser
 * shows is a preview; this is the number that is recorded.
 *
 * The grading rule is not re-invented — it is the exam page's own
 * `examIsCorrect`, reproduced exactly:
 *   - lowercase, ё → е, strip that exam's punctuation class, collapse spaces
 *   - an empty answer is never correct
 *   - an `answer` array means "any of these", each normalised the same way
 * The punctuation class is captured per exam because A1 and B1 differ (B1 also
 * strips the em and en dash). scripts/verify_progress_security.cjs re-derives
 * both from the pages and fails on drift, so this cannot silently diverge.
 */

/** Build the exam's normaliser from its captured punctuation class. */
function normaliserFor(course) {
    const canon = EXAM_CANON[course];
    if (!canon) return null;
    /* The class is stored exactly as it appears inside [...] on the page. */
    const punctuation = new RegExp('[' + canon.punctuation + ']', 'g');
    return function normalizeExamText(value) {
        return String(value == null ? '' : value)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(punctuation, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };
}

export function isExamCourse(course) {
    return Object.prototype.hasOwnProperty.call(EXAM_CANON, course);
}

/** Total number of gradable items in an exam. */
export function examTotal(course) {
    const canon = EXAM_CANON[course];
    if (!canon) return 0;
    return canon.groups.reduce((sum, g) => sum + g.items.length, 0);
}

/**
 * Grade a submission.
 *
 * @param {string} course  'A1' | 'B1'
 * @param {Array<Array<string>>|Object} answers  per-group arrays of the
 *        learner's answers, positionally aligned with the canonical items.
 * @returns {{correct:number,total:number,score:number,passed:boolean,passMark:number}}
 */
export function gradeExam(course, answers) {
    const canon = EXAM_CANON[course];
    if (!canon) {
        throw Object.assign(new Error('Bu kurs uchun imtihon mavjud emas'), { statusCode: 400 });
    }
    const normalize = normaliserFor(course);

    /* Accept either an array of group arrays or a { "0": [...] } map, and treat
       anything missing as unanswered. A submission can only ever LOSE marks by
       being malformed — it can never gain one. */
    const groupAnswers = (index) => {
        const raw = Array.isArray(answers) ? answers[index] : (answers && answers[index]);
        return Array.isArray(raw) ? raw : [];
    };

    let correct = 0;
    let total = 0;

    canon.groups.forEach((group, gi) => {
        const given = groupAnswers(gi);
        group.items.forEach((item, ii) => {
            total++;
            const value = normalize(given[ii]);
            if (!value) return;                    // blank is never correct
            const expected = item.answer;
            const ok = Array.isArray(expected)
                ? expected.some((variant) => normalize(variant) === value)
                : normalize(expected) === value;
            if (ok) correct++;
        });
    });

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return {
        correct,
        total,
        score,
        passMark: canon.passMark,
        passed: score >= canon.passMark
    };
}

/**
 * Reject a submission whose shape could not have come from the exam page,
 * before any grading work is done. Keeps a hostile payload cheap to refuse.
 */
export function assertSubmissionShape(course, answers) {
    const canon = EXAM_CANON[course];
    if (!canon) {
        throw Object.assign(new Error('Bu kurs uchun imtihon mavjud emas'), { statusCode: 400 });
    }
    if (answers === null || typeof answers !== 'object') {
        throw Object.assign(new Error('Javoblar noto‘g‘ri formatda'), { statusCode: 400 });
    }
    const groups = canon.groups.length;
    const keys = Array.isArray(answers)
        ? answers.map((_, i) => String(i))
        : Object.keys(answers);
    if (keys.length > groups) {
        throw Object.assign(new Error('Javoblar noto‘g‘ri formatda'), { statusCode: 400 });
    }
    for (const key of keys) {
        /* Anything that is not a plain group index is a payload probing for a
           prototype or a field name, not a learner's answers. */
        if (!/^\d+$/.test(key) || Number(key) >= groups) {
            throw Object.assign(new Error('Javoblar noto‘g‘ri formatda'), { statusCode: 400 });
        }
        const list = Array.isArray(answers) ? answers[Number(key)] : answers[key];
        if (list == null) continue;
        if (!Array.isArray(list)) {
            throw Object.assign(new Error('Javoblar noto‘g‘ri formatda'), { statusCode: 400 });
        }
        if (list.length > canon.groups[Number(key)].items.length) {
            throw Object.assign(new Error('Javoblar noto‘g‘ri formatda'), { statusCode: 400 });
        }
        for (const entry of list) {
            if (entry == null) continue;
            if (typeof entry !== 'string' && typeof entry !== 'number') {
                throw Object.assign(new Error('Javoblar noto‘g‘ri formatda'), { statusCode: 400 });
            }
            if (String(entry).length > 400) {
                throw Object.assign(new Error('Javob juda uzun'), { statusCode: 400 });
            }
        }
    }
}
