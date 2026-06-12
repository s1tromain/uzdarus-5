/* ============================================================================
 * PRE-LAUNCH PROGRESSION AUDIT — logic verification
 * ----------------------------------------------------------------------------
 * Pure-logic tests for the fixes applied to Issues #2–#6. These re-implement
 * the exact algorithms used in the pages (sequential unlock, race-guard union
 * merge, vocabulary resume index, seedWordProgress array shape, per-topic
 * Firestore dotted-path isolation) and assert their behaviour. They run with
 * plain `node` (no jsdom / no network), so they are deterministic.
 * ==========================================================================*/
let pass = 0, fail = 0;
function eq(actual, expected, name) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗', name, '\n      expected', e, '\n      got     ', a); }
}
function ok(cond, name) { eq(!!cond, true, name); }

/* ---- Issue #3: sequential unlock (mirrors loadTopics / renderTopics) ---- */
function isSequenceLocked(topicId, completedTopics, isPrivileged) {
    return !isPrivileged
        && topicId > 1
        && !completedTopics.includes(topicId - 1)
        && !completedTopics.includes(topicId);
}
console.log('Issue #3 — sequential unlock');
eq(isSequenceLocked(1, [], false), false, 'topic 1 always open');
eq(isSequenceLocked(2, [], false), true,  'topic 2 locked before topic 1 done');
eq(isSequenceLocked(2, [1], false), false, 'topic 2 unlocks after topic 1 done');
eq(isSequenceLocked(3, [1], false), true,  'topic 3 still locked (only 1 done)');
eq(isSequenceLocked(3, [1, 2], false), false, 'topic 3 unlocks after topic 2 done');
eq(isSequenceLocked(5, [], true), false, 'admin/developer: everything open');
eq(isSequenceLocked(4, [4], false), false, 'already-completed topic stays open even if prev missing');

/* ---- Issue #3/#5: race-guard union merge (monotonic, no regression) ---- */
function mergeCompleted(remote, local) {
    return Array.from(new Set([...(remote||[]), ...(local||[])]))
        .filter(n => Number.isFinite(n)).sort((a, b) => a - b);
}
console.log('Issue #3/#5 — race-guard union merge');
eq(mergeCompleted([1,2,3], [4]), [1,2,3,4], 'adds new completion');
eq(mergeCompleted([1,2,3], []), [1,2,3], 'empty/stale local cannot wipe remote');   // the original data-loss bug
eq(mergeCompleted([1,2,3], [2]), [1,2,3], 'stale local subset cannot regress');
eq(mergeCompleted([], [1]), [1], 'first completion on fresh remote');
eq(mergeCompleted([3,1,2], [2,5]), [1,2,3,5], 'dedupes + sorts');

/* ---- Issue #2: vocabulary resume index (mirrors startTopic/openTopic) ---- */
// savedCount = learnedWords[topic_N] (1-based count of furthest word reached).
function resume(savedCount, total) {
    if (total > 0 && savedCount >= total) return { mode: 'completed' };
    if (savedCount > 0) return { mode: 'resume', startIdx: Math.min(savedCount - 1, total - 1) };
    return { mode: 'fresh', startIdx: 0 };
}
console.log('Issue #2 — vocabulary resume index');
eq(resume(0, 20),  { mode: 'fresh', startIdx: 0 }, 'never opened -> word 1 (idx 0)');
eq(resume(10, 20), { mode: 'resume', startIdx: 9 }, 'left at word 10 -> resume word 10 (idx 9)');
eq(resume(1, 20),  { mode: 'resume', startIdx: 0 }, 'left at word 1 -> resume word 1');
eq(resume(20, 20), { mode: 'completed' }, 'all 20 done -> completed (offer replay)');
eq(resume(25, 20), { mode: 'completed' }, 'clamp: count over total -> completed');

/* ---- Issue #2: seedWordProgress unlock array shape (mirrors speech.js) ---- */
function seed(wordCount, startIdx) {
    const arr = new Array(wordCount).fill(false);
    const frontier = Math.max(0, Math.min(wordCount - 1, startIdx | 0));
    for (let i = 0; i <= frontier; i++) arr[i] = true;
    return arr;
}
// _isWordLocked: locked iff index>0 and arr[index] !== true
function isWordLocked(arr, idx) {
    if (idx <= 0) return false;
    if (idx >= arr.length) return true;
    return !arr[idx];
}
console.log('Issue #2 — seed array + word lock');
eq(seed(5, 0), [true,false,false,false,false], 'fresh: only word 0 unlocked');
eq(seed(5, 3), [true,true,true,true,false], 'resume at idx3: words 0..3 unlocked');
ok(!isWordLocked(seed(5,3), 3), 'resume word (idx3) is accessible');
ok(isWordLocked(seed(5,3), 4), 'word past frontier (idx4) stays locked');
ok(!isWordLocked(seed(5,3), 2), 'already-studied word (idx2) accessible');

/* ---- Issue #6: per-topic dotted-path isolation (mirrors saveProgress) ---- */
// paid-platform.firestoreSaveUserProgress turns {key:val} into courses.<C>.<key>=val
function buildUpdates(course, progressData) {
    const updates = { lastActivity: '<serverTimestamp>' };
    Object.keys(progressData).forEach(k => { updates[`courses.${course}.${k}`] = progressData[k]; });
    return updates;
}
function topLevelAffectedKeys(updates) {
    return Array.from(new Set(Object.keys(updates).map(k => k.split('.')[0]))).sort();
}
console.log('Issue #6 — data-model isolation + rules compatibility');
const vocabUpdates = buildUpdates('A1', {
    'vocabulary.learnedWords.topic_3': 7,
    'vocabulary.lastAccessed': '2026-06-12'
});
eq(Object.keys(vocabUpdates).sort(), [
    'courses.A1.vocabulary.lastAccessed',
    'courses.A1.vocabulary.learnedWords.topic_3',
    'lastActivity'
], 'vocab write targets only the vocabulary sub-field');
ok(!('courses.A1.completedTopics' in vocabUpdates), 'vocab write never touches completedTopics (no collision)');
const lessonUpdates = buildUpdates('A1', { completedTopics: [1,2,3], lastUpdated: 'x' });
ok(!Object.keys(lessonUpdates).some(k => k.includes('vocabulary')), 'lesson write never touches vocabulary');
// firestore.rules ownerMutableKeys
const allowed = ['courses','lastActivity','completedTopics','forcePasswordChange','lastPasswordChangeAt','updatedAt'];
ok(topLevelAffectedKeys(vocabUpdates).every(k => allowed.includes(k)), 'vocab write passes firestore.rules (only courses+lastActivity)');
ok(topLevelAffectedKeys(lessonUpdates).every(k => allowed.includes(k)), 'lesson write passes firestore.rules');

/* ---- Issue #2: monotonic learnedWords save (never regresses) ---- */
function saveCount(prev, currentIndex, total) {
    const safeCurrent = Math.min(total, Math.max(0, currentIndex + 1));
    const previous = Math.min(total, Math.max(0, Number(prev || 0)));
    return Math.max(previous, safeCurrent);
}
console.log('Issue #2 — monotonic word count');
eq(saveCount(0, 0, 20), 1, 'word 1 viewed -> count 1');
eq(saveCount(10, 4, 20), 10, 'going back (idx4) does not reduce saved count 10');
eq(saveCount(10, 14, 20), 15, 'advancing to idx14 -> count 15');
eq(saveCount(0, 19, 20), 20, 'last word -> count 20 (completed)');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
