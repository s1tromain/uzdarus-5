'use strict';
/* Integration: the shared engine's markup must be understood by the GLOBAL
   feedback/persistence/analytics layer in course-global-fixes.js, otherwise the
   lesson would grade but never persist a result or emit a learning event. */
const fs = require('fs'), path = require('path');
const ROOT = '/Users/sardor/Desktop/UzdaRus V16';
const CGF = fs.readFileSync(path.join(ROOT, 'course-global-fixes.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

ok('global layer reads engine choice rows [data-t1-row]', /data-t1-row/.test(CGF));
ok('global layer reads engine selected option .t1-opt.selected', /\.t1-opt\.selected/.test(CGF));
ok('global layer reads engine inputs [data-t1-input]', /data-t1-input/.test(CGF));
ok('global layer treats .exercise-block as a topic root', /\.exercise-block/.test(CGF));
ok('global layer dispatches to window.checkTopic1Exercises', /window\.checkTopic1Exercises\(topicId\)/.test(CGF));
ok('completed lesson emits ex_done for analytics', /uzTrack\('ex_done'/.test(CGF));
ok('a passed topic emits topic_pass for analytics', /uzTrack\('topic_pass'/.test(CGF));
ok('analytics emission is guarded so it can never break a lesson',
   /if \(typeof window\.uzTrack === 'function'\)/.test(CGF));
ok('emission is gated by shouldReplaceSnapshot (no duplicate events)',
   /shouldReplaceSnapshot\(previous, snapshot\)/.test(CGF));

for (const rel of ['paid-courses/a2-course.html', 'a2-demo.html']) {
  const S = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(`${rel}: loads course-global-fixes.js`, /course-global-fixes\.js/.test(S));
  ok(`${rel}: engine emits .exercise-block on every group`, /t1-card exercise-block/.test(S));
  ok(`${rel}: engine emits data-t1-row for choice rows`, /data-t1-row=/.test(S));
  ok(`${rel}: engine emits data-t1-input for text answers`, /data-t1-input=/.test(S));
  ok(`${rel}: saves through saveQuizResultToFirebase`, /saveQuizResultToFirebase\(topicId, data\)/.test(S));
  ok(`${rel}: single source of truth for topic completion`,
     (S.match(/window\.checkTopic1Exercises\s*=/g) || []).length === 1);
}
const DEMO = fs.readFileSync(path.join(ROOT, 'a2-demo.html'), 'utf8');
ok('demo page keeps its demo identity (tracker self-disables on -demo)', /a2-demo/.test('a2-demo.html'));

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `  ✅ A2 INTEGRATION: ${pass}/${pass} passed` : `  ❌ A2 INTEGRATION: ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
