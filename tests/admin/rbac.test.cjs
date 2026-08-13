/* ============================================================================
 * ADMIN RBAC — capability model, teacher read-only matrix, privilege escalation
 * ----------------------------------------------------------------------------
 * Everything here exercises the REAL authorization primitives imported from
 * api/_lib/request.js and api/_lib/roles.js. Nothing is re-implemented: the
 * endpoint guards are read out of the endpoint source files themselves, so a
 * guard that is weakened or removed fails these tests.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
function eq(name, a, b) {
    ok(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

/* Every role in the system. */
const ROLES = ['customer', 'teacher', 'moderator', 'admin', 'developer'];

(async function run() {

const roles = await import('../../api/_lib/roles.js');
const request = await import('../../api/_lib/request.js');
const client = await import('../../admin-roles.js');
const {
    CAPABILITIES, ROLE_CAPABILITIES, normalizeRole, roleHasCapability,
    capabilitiesForRole, canManageRole, canViewUser, isStaffRole, ROLE_LEVEL
} = roles;
const { requireCapability, sessionCapabilities } = request;

const session = (role, extra = {}) => ({ uid: 'u1', role: normalizeRole(role), blocked: false, ...extra });
function denied(role, capability, extra) {
    try { requireCapability(session(role, extra), capability); return null; }
    catch (e) { return e.statusCode; }
}
function allowed(role, capability, extra) {
    try { requireCapability(session(role, extra), capability); return true; }
    catch (e) { return false; }
}

/* ------------------------------------------------------------------ */
console.log('\n[R1] Role normalization + staff set');
{
    eq('unknown role falls back to customer', normalizeRole('hacker'), 'customer');
    eq('"user" alias -> customer', normalizeRole('user'), 'customer');
    eq('teacher is canonical', normalizeRole('Teacher'), 'teacher');
    eq('empty -> customer', normalizeRole(''), 'customer');
    eq('null -> customer', normalizeRole(null), 'customer');
    ok('teacher is staff', isStaffRole('teacher'));
    ok('customer is NOT staff', !isStaffRole('customer'));
    ok('moderator/admin/developer remain staff',
       isStaffRole('moderator') && isStaffRole('admin') && isStaffRole('developer'));
    ok('teacher ranks below moderator in the management ladder',
       ROLE_LEVEL.teacher < ROLE_LEVEL.moderator && ROLE_LEVEL.teacher > ROLE_LEVEL.customer);
}

/* ------------------------------------------------------------------ */
console.log('\n[R2] TEACHER — the complete ALLOW list (and nothing else)');
{
    const TEACHER_ALLOWED = [CAPABILITIES.PANEL_ACCESS, CAPABILITIES.STUDENTS_READ];
    TEACHER_ALLOWED.forEach(cap => ok(`teacher ALLOW ${cap}`, allowed('teacher', cap)));

    const everything = Object.values(CAPABILITIES);
    const shouldDeny = everything.filter(c => !TEACHER_ALLOWED.includes(c));
    eq('teacher holds exactly 2 capabilities', capabilitiesForRole('teacher').length, 2);
    shouldDeny.forEach(cap => eq(`teacher DENY ${cap} -> 403`, denied('teacher', cap), 403));
}

/* ------------------------------------------------------------------ */
console.log('\n[R3] TEACHER security matrix (the mutations from the spec)');
{
    const MUTATIONS = [
        ['create user',          CAPABILITIES.USERS_CREATE],
        ['delete user',          CAPABILITIES.USERS_DELETE],
        ['block/unblock user',   CAPABILITIES.USERS_BLOCK],
        ['edit user password',   CAPABILITIES.USERS_PASSWORD],
        ['clear devices',        CAPABILITIES.USERS_DEVICES],
        ['modify subscription',  CAPABILITIES.SUBSCRIPTION_WRITE],
        ['modify access packs',  CAPABILITIES.SUBSCRIPTION_WRITE],
        ['change role',          CAPABILITIES.ROLE_WRITE],
        ['create admin',         CAPABILITIES.ROLE_WRITE],
        ['create teacher',       CAPABILITIES.ROLE_WRITE],
        ['delete staff',         CAPABILITIES.USERS_DELETE],
        ['read user management', CAPABILITIES.USERS_READ],
        ['read global stats',    CAPABILITIES.STATS_READ],
        ['migrate certificates', CAPABILITIES.CERTIFICATES_MIGRATE],
    ];
    MUTATIONS.forEach(([label, cap]) => eq(`teacher -> ${label}: DENY 403`, denied('teacher', cap), 403));

    const READS = [
        ['read student list',      CAPABILITIES.STUDENTS_READ],
        ['read student analytics', CAPABILITIES.STUDENTS_READ],
        ['read lesson results',    CAPABILITIES.STUDENTS_READ],
        ['read vocabulary progress', CAPABILITIES.STUDENTS_READ],
        ['open the panel',         CAPABILITIES.PANEL_ACCESS],
    ];
    READS.forEach(([label, cap]) => ok(`teacher -> ${label}: ALLOW`, allowed('teacher', cap)));
}

/* ------------------------------------------------------------------ */
console.log('\n[R4] Existing roles keep EXACTLY their previous powers');
{
    /* Pre-change ladder: moderator(1) reached every 'moderator' guard,
       admin(2) added set-role/set-subscription, developer(3) added migrate. */
    const EXPECTED = {
        customer: [],
        teacher: ['panel:access', 'students:read'],
        moderator: ['panel:access', 'students:read', 'stats:read', 'users:read',
                    'users:create', 'users:delete', 'users:block', 'users:password',
                    'users:devices', 'certificates:read'],
        admin: ['panel:access', 'students:read', 'stats:read', 'users:read',
                'users:create', 'users:delete', 'users:block', 'users:password',
                'users:devices', 'certificates:read', 'subscription:write', 'role:write'],
        developer: ['panel:access', 'students:read', 'stats:read', 'users:read',
                    'users:create', 'users:delete', 'users:block', 'users:password',
                    'users:devices', 'certificates:read', 'subscription:write',
                    'role:write', 'certificates:migrate'],
    };
    ROLES.forEach((role) => {
        const actual = capabilitiesForRole(role).slice().sort();
        const expect = EXPECTED[role].slice().sort();
        eq(`${role} capability set is exact`, JSON.stringify(actual), JSON.stringify(expect));
    });
    ok('developer is a strict superset of admin',
       capabilitiesForRole('admin').every(c => roleHasCapability('developer', c)));
    ok('admin is a strict superset of moderator',
       capabilitiesForRole('moderator').every(c => roleHasCapability('admin', c)));
    ok('moderator is a strict superset of teacher',
       capabilitiesForRole('teacher').every(c => roleHasCapability('moderator', c)));
    ok('teacher is NOT equivalent to moderator',
       capabilitiesForRole('moderator').length > capabilitiesForRole('teacher').length);
    eq('customer has no admin capability at all', capabilitiesForRole('customer').length, 0);
    Object.values(CAPABILITIES).forEach(cap =>
        eq(`customer DENY ${cap}`, denied('customer', cap), 403));
}

/* ------------------------------------------------------------------ */
console.log('\n[R5] Blocked accounts lose the admin surface immediately');
{
    ROLES.forEach((role) => {
        Object.values(CAPABILITIES).forEach((cap) => {
            const code = denied(role, cap, { blocked: true });
            if (code !== 403) {
                fail++; console.log(`  ✗ blocked ${role} still had ${cap}`);
                return;
            }
        });
    });
    pass++; console.log('  ✓ every role × every capability denied while blocked');
    eq('blocked session exposes no capabilities',
       sessionCapabilities({ role: 'developer', blocked: true }).length, 0);
    ok('unblocked developer still has capabilities',
       sessionCapabilities({ role: 'developer', blocked: false }).length > 0);
}

/* ------------------------------------------------------------------ */
console.log('\n[R6] Management hierarchy (who may act upon whom)');
{
    eq('developer manages developer', canManageRole('developer', 'developer'), true);
    eq('developer manages admin', canManageRole('developer', 'admin'), true);
    eq('developer manages teacher', canManageRole('developer', 'teacher'), true);
    eq('admin manages teacher (new)', canManageRole('admin', 'teacher'), true);
    eq('admin manages moderator', canManageRole('admin', 'moderator'), true);
    eq('admin manages customer', canManageRole('admin', 'customer'), true);
    eq('admin CANNOT manage admin', canManageRole('admin', 'admin'), false);
    eq('admin CANNOT manage developer', canManageRole('admin', 'developer'), false);
    eq('moderator manages customer only', canManageRole('moderator', 'customer'), true);
    eq('moderator CANNOT manage teacher', canManageRole('moderator', 'teacher'), false);
    eq('moderator CANNOT manage moderator', canManageRole('moderator', 'moderator'), false);
    ROLES.forEach(r => eq(`teacher CANNOT manage ${r}`, canManageRole('teacher', r), false));
    ROLES.forEach(r => eq(`customer CANNOT manage ${r}`, canManageRole('customer', r), false));
}

/* ------------------------------------------------------------------ */
console.log('\n[R7] Visibility — a teacher sees learners, never staff');
{
    eq('teacher sees customers', canViewUser('teacher', 'a', 'b', 'customer'), true);
    eq('teacher CANNOT see moderators', canViewUser('teacher', 'a', 'b', 'moderator'), false);
    eq('teacher CANNOT see admins', canViewUser('teacher', 'a', 'b', 'admin'), false);
    eq('teacher CANNOT see developers', canViewUser('teacher', 'a', 'b', 'developer'), false);
    eq('teacher CANNOT see other teachers', canViewUser('teacher', 'a', 'b', 'teacher'), false);
    // pre-existing behaviour preserved verbatim
    eq('developer sees everyone', canViewUser('developer', 'a', 'b', 'developer'), true);
    eq('admin sees all but developer', canViewUser('admin', 'a', 'b', 'admin'), true);
    eq('admin cannot see developer', canViewUser('admin', 'a', 'b', 'developer'), false);
    eq('moderator sees customers', canViewUser('moderator', 'a', 'b', 'customer'), true);
    eq('moderator sees moderators', canViewUser('moderator', 'a', 'b', 'moderator'), true);
    eq('moderator cannot see admin', canViewUser('moderator', 'a', 'b', 'admin'), false);
    eq('moderator sees self', canViewUser('moderator', 'x', 'x', 'admin'), true);
    eq('customer sees nobody', canViewUser('customer', 'a', 'b', 'customer'), false);
}

/* ------------------------------------------------------------------ */
console.log('\n[R8] Endpoint guards — read from the real source files');
{
    /* The capability each endpoint MUST require. If a guard is deleted,
       weakened, or swapped for a role check, this fails. */
    const EXPECTED_GUARD = {
        'adjust-subscription-days.js': 'SUBSCRIPTION_WRITE',
        'list-users.js':             'USERS_READ',
        'stats.js':                  'STATS_READ',
        'students-overview.js':      'STUDENTS_READ',
        'student-analytics.js':      'STUDENTS_READ',
        'global-analytics.js':       'STUDENTS_READ',
        'create-user.js':            'USERS_CREATE',
        'delete-user.js':            'USERS_DELETE',
        /* Freezing pauses the paid period and unfreezing MOVES the subscription
           end date, so both are governed by the capability that already owns
           subscription duration — not by USERS_BLOCK, which would hand
           moderators the ability to shift dates. */
        'freeze-account.js':         'SUBSCRIPTION_WRITE',
        'unfreeze-account.js':       'SUBSCRIPTION_WRITE',
        'reset-password.js':         'USERS_PASSWORD',
        'unblock-user.js':           'USERS_BLOCK',
        'clear-devices.js':          'USERS_DEVICES',
        'list-user-certificates.js': 'CERTIFICATES_READ',
        'search-certificates.js':    'CERTIFICATES_READ',
        'set-subscription.js':       'SUBSCRIPTION_WRITE',
        'set-role.js':               'ROLE_WRITE',
        'migrate-certificates.js':   'CERTIFICATES_MIGRATE',
    };

    const dir = path.join(ROOT, 'api', '_admin');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    eq('every admin endpoint is covered by this test', files.length, Object.keys(EXPECTED_GUARD).length);

    files.forEach((f) => {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const expected = EXPECTED_GUARD[f];
        ok(`${f}: known endpoint`, !!expected);
        if (!expected) return;
        ok(`${f}: guarded by CAPABILITIES.${expected}`,
           new RegExp(`requireCapability\\(\\s*session\\s*,\\s*CAPABILITIES\\.${expected}\\s*\\)`).test(src));
        ok(`${f}: no legacy role-ladder guard remains`,
           !/requireRole\(session\s*,/.test(src));
        ok(`${f}: requires a verified session first`, src.includes('await requireSession(req)'));
    });

    /* Teacher must reach exactly the read-only analytics endpoints, no other. */
    const TEACHER_ENDPOINTS = new Set([
        'students-overview.js', 'student-analytics.js', 'global-analytics.js',
    ]);
    Object.entries(EXPECTED_GUARD).forEach(([file, capName]) => {
        const cap = CAPABILITIES[capName];
        const teacherReaches = roleHasCapability('teacher', cap);
        const isAnalytics = TEACHER_ENDPOINTS.has(file);
        eq(`teacher reaches ${file}: ${isAnalytics}`, teacherReaches, isAnalytics);
    });

    /* Every teacher-reachable endpoint must be a READ. A mutation that ever
       lands behind students:read would silently hand a teacher write access. */
    TEACHER_ENDPOINTS.forEach((file) => {
        const src = fs.readFileSync(path.join(dir, file), 'utf8');
        ok(`${file}: GET only (teacher surface is read-only)`,
           /assertMethod\(req,\s*res,\s*'GET'\)/.test(src) && !/assertMethod\(req,\s*res,\s*'POST'\)/.test(src));
        ok(`${file}: performs no Firestore writes`,
           !/\.(set|update|delete|add|create)\(/.test(src.replace(/^import[\s\S]*?;$/gm, '')));
    });
}

/* ------------------------------------------------------------------ */
console.log('\n[R9] Privilege escalation attempts');
{
    /* A capability guard reads ONLY session.role, which requireSession derives
       from the Firestore profile. Client-supplied data is structurally unable
       to reach it. */
    const forged = {
        uid: 'u1', role: 'teacher', blocked: false,
        // things an attacker controls or might try to inject:
        claimsRole: 'developer',
        decoded: { role: 'developer', admin: true },
        profile: { role: 'developer' },
        isAdmin: true, capabilities: Object.values(CAPABILITIES),
    };
    eq('forged claimsRole does not grant role:write', denied('teacher', CAPABILITIES.ROLE_WRITE, forged), 403);
    eq('forged decoded.role does not grant users:delete', denied('teacher', CAPABILITIES.USERS_DELETE, forged), 403);
    eq('forged capabilities array is ignored', denied('teacher', CAPABILITIES.USERS_CREATE, forged), 403);
    eq('forged isAdmin flag is ignored', denied('teacher', CAPABILITIES.SUBSCRIPTION_WRITE, forged), 403);

    /* Role strings an attacker might submit. */
    /* Case/whitespace variants of a REAL role legitimately normalize to that
       role (that is what trim+lowercase is for). Anything that is not a real
       role must collapse to `customer`, which holds no capability. */
    [['Developer', 'developer'], ['DEVELOPER', 'developer'], [' developer ', 'developer'],
     ['admin\n', 'admin'], ['  Teacher  ', 'teacher'],
     ['teacher;admin', 'customer'], ['developer--', 'customer'], ['admin OR 1=1', 'customer'],
     ['__proto__', 'customer'], ['constructor', 'customer'], ['toString', 'customer'],
     ['', 'customer'], ['null', 'customer']].forEach(([raw, expected]) => {
        eq(`role input ${JSON.stringify(raw)} -> ${expected}`, normalizeRole(raw), expected);
    });
    /* And no injected/garbage role may ever reach a privileged capability. */
    ['teacher;admin', 'developer--', '__proto__', 'constructor', 'toString', 'admin OR 1=1']
        .forEach((raw) => {
            eq(`garbage role ${JSON.stringify(raw)} cannot write roles`,
               denied(raw, CAPABILITIES.ROLE_WRITE), 403);
            eq(`garbage role ${JSON.stringify(raw)} cannot open the panel`,
               denied(raw, CAPABILITIES.PANEL_ACCESS), 403);
        });
    eq('__proto__ normalizes to customer', normalizeRole('__proto__'), 'customer');
    eq('constructor normalizes to customer', normalizeRole('constructor'), 'customer');
    eq('prototype-pollution role has no capability',
       denied('__proto__', CAPABILITIES.PANEL_ACCESS), 403);

    /* A typo'd capability must throw loudly, never silently allow. */
    let threw = false;
    try { requireCapability(session('developer'), 'users:destroy'); } catch (e) { threw = /Unknown capability/.test(e.message); }
    ok('unknown capability in a guard throws instead of allowing', threw);

    /* The capability sets are frozen — cannot be mutated at runtime. */
    let mutated = false;
    try {
        ROLE_CAPABILITIES.teacher.push(CAPABILITIES.USERS_DELETE);
        mutated = ROLE_CAPABILITIES.teacher.includes(CAPABILITIES.USERS_DELETE);
    } catch (e) { mutated = false; }
    ok('teacher capability table cannot be mutated at runtime', !mutated);
    let replaced = false;
    try { ROLE_CAPABILITIES.teacher = [CAPABILITIES.USERS_DELETE]; replaced = roleHasCapability('teacher', CAPABILITIES.USERS_DELETE); }
    catch (e) { replaced = false; }
    ok('teacher capability table cannot be REPLACED at runtime', !replaced);
    eq('teacher still denied after mutation attempt', denied('teacher', CAPABILITIES.USERS_DELETE), 403);
}

/* ------------------------------------------------------------------ */
console.log('\n[R10] Stale-claim / role-downgrade security');
{
    /* requireSession resolves role from the PROFILE. Reproduce its decision
       with the real source so the precedence cannot silently regress. */
    const src = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'request.js'), 'utf8');
    ok('role is derived from the profile, not the claim', /const role = profileRole;/.test(src));
    ok('the old claim-wins precedence is gone', !/const role = claimsRole \|\| profileRole;/.test(src));
    ok('token revocation is checked on verify', /verifyIdToken\(token,\s*true\)/.test(src));
    ok('a claim/profile mismatch is surfaced', /roleClaimStale/.test(src));

    const setRole = fs.readFileSync(path.join(ROOT, 'api', '_admin', 'set-role.js'), 'utf8');
    ok('set-role revokes existing refresh tokens', /revokeRefreshTokens\(userId\)/.test(setRole));
    ok('revocation failure does not abort the demotion', /sessionsRevoked = false/.test(setRole));

    /* admin -> teacher: token still says admin, profile says teacher. */
    const downgraded = { uid: 'u9', role: 'teacher', blocked: false, claimsRole: 'admin' };
    eq('demoted admin CANNOT change roles', (() => { try { requireCapability(downgraded, CAPABILITIES.ROLE_WRITE); return 'ALLOWED'; } catch (e) { return e.statusCode; } })(), 403);
    eq('demoted admin CANNOT delete users', (() => { try { requireCapability(downgraded, CAPABILITIES.USERS_DELETE); return 'ALLOWED'; } catch (e) { return e.statusCode; } })(), 403);
    ok('demoted admin RETAINS analytics read (they are a teacher now)',
       (() => { try { requireCapability(downgraded, CAPABILITIES.STUDENTS_READ); return true; } catch (e) { return false; } })());

    /* teacher -> customer: loses the panel entirely. */
    const removed = { uid: 'u9', role: 'customer', blocked: false, claimsRole: 'teacher' };
    eq('demoted teacher loses panel access', (() => { try { requireCapability(removed, CAPABILITIES.PANEL_ACCESS); return 'ALLOWED'; } catch (e) { return e.statusCode; } })(), 403);
    eq('demoted teacher loses analytics', (() => { try { requireCapability(removed, CAPABILITIES.STUDENTS_READ); return 'ALLOWED'; } catch (e) { return e.statusCode; } })(), 403);
}

/* ------------------------------------------------------------------ */
console.log('\n[R11] Client mirror cannot drift from the server model');
{
    ROLES.forEach((role) => {
        const server = capabilitiesForRole(role).slice().sort();
        const browser = client.capabilitiesForRole(role).slice().sort();
        eq(`${role}: browser mirror matches server`, JSON.stringify(browser), JSON.stringify(server));
    });
    eq('capability name lists identical',
       JSON.stringify(Object.values(client.CAPABILITIES).sort()),
       JSON.stringify(Object.values(CAPABILITIES).sort()));
    eq('ROLE_LEVEL identical', JSON.stringify(client.ROLE_LEVEL), JSON.stringify(ROLE_LEVEL));
    ROLES.forEach(a => ROLES.forEach(b =>
        eq(`canManageRole(${a},${b}) identical`, client.canManageRole(a, b), canManageRole(a, b))));
    ROLES.forEach(r => eq(`isStaffRole(${r}) identical`, client.isStaffRole(r), isStaffRole(r)));
    eq('teacher Uzbek label', client.roleLabel('teacher'), 'O‘qituvchi');
    eq('admin Uzbek label', client.roleLabel('admin'), 'Administrator');
    ok('every role has a label', ROLES.every(r => typeof client.roleLabel(r) === 'string' && client.roleLabel(r).length));
}

/* ------------------------------------------------------------------ */
console.log('\n[R12] Admin panel UI is capability-driven, not role-name-driven');
{
    const ui = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
    ok('panel imports the shared contract', /from '\.\/admin-roles\.js'/.test(ui));
    ok('no local ADMIN_ROLES set survives', !/const ADMIN_ROLES\s*=/.test(ui));
    ok('no local SUBSCRIPTION_EDIT_ROLES set survives', !/const SUBSCRIPTION_EDIT_ROLES\s*=/.test(ui));
    ok('panel access uses the capability', /roleHasCapability\(role, CAPABILITIES\.PANEL_ACCESS\)/.test(ui));
    ok('subscription editing uses the capability', /can\(CAPABILITIES\.SUBSCRIPTION_WRITE\)/.test(ui));
    ok('row actions are capability-gated', /ACTION_CAPABILITY/.test(ui));
    ok('teacher gets a reduced surface', /role-teacher/.test(ui));
    ok('data loading is capability-gated', /can\(CAPABILITIES\.USERS_READ\)/.test(ui));

    const html = fs.readFileSync(path.join(ROOT, 'adminpanel.html'), 'utf8');
    ok('staff role select offers Teacher', /value="teacher"/.test(html));
    ok('teacher option carries the Uzbek label', /O‘qituvchi/.test(html));
}

/* ------------------------------------------------------------------ */
console.log('\n[R13] Deletion is capability + hierarchy driven, not role-name driven');
{
    const ui = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');

    ok('the developer-only hard-coded delete gate is gone',
       !/USERS_DELETE\)\s*&&\s*state\.role\s*===\s*'developer'/.test(ui));
    ok('a single canDeleteUser() decides both tables', /function canDeleteUser\(/.test(ui));
    ok('it consults the capability', /can\(CAPABILITIES\.USERS_DELETE\)/.test(ui));
    ok('it consults the management hierarchy', /canManageRole\(state\.role,\s*user\.role\)/.test(ui));
    ok('it refuses self-deletion (the server returns 400)',
       /user\.uid === state\.user\.uid/.test(ui));
    ok('destructive deletion requires typing the login back',
       /confirmUsername/.test(ui));

    /* Reproduce canDeleteUser()'s decision with the REAL shared model, for
       every actor x target pair, and compare against the server's answer. */
    const serverAllows = (actor, target) =>
        roleHasCapability(actor, CAPABILITIES.USERS_DELETE) && canManageRole(actor, target);

    const EXPECT = {
        developer: { customer: true, teacher: true, moderator: true, admin: true, developer: true },
        admin:     { customer: true, teacher: true, moderator: true, admin: false, developer: false },
        moderator: { customer: true, teacher: false, moderator: false, admin: false, developer: false },
        teacher:   { customer: false, teacher: false, moderator: false, admin: false, developer: false },
        customer:  { customer: false, teacher: false, moderator: false, admin: false, developer: false },
    };

    ROLES.forEach((actor) => ROLES.forEach((target) => {
        eq(`${actor} may delete ${target}: ${EXPECT[actor][target]}`,
           serverAllows(actor, target), EXPECT[actor][target]);
    }));

    /* The specification's headline requirement. */
    ok('ADMINISTRATOR can delete user accounts', serverAllows('admin', 'customer'));
    ok('ADMINISTRATOR can delete staff below them', serverAllows('admin', 'moderator'));
    ok('ADMINISTRATOR still cannot delete a developer', !serverAllows('admin', 'developer'));
    ok('DEVELOPER retains full access', ROLES.every(r => serverAllows('developer', r)));
    ROLES.forEach(r => ok(`TEACHER cannot delete ${r}`, !serverAllows('teacher', r)));
}

/* ------------------------------------------------------------------ */
console.log('\n[R14] Teacher read-only surface is complete in the UI');
{
    const ui = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'adminpanel.html'), 'utf8');

    /* Every tab in the markup must be covered by the capability map — the map
       previously named two tabs that do not exist and omitted `admin`, so the
       whole Administration tab was visible to a teacher. */
    const tabs = Array.from(html.matchAll(/data-tab="([a-z-]+)"/g)).map(m => m[1]);
    const uniqueTabs = Array.from(new Set(tabs));
    const mapBlock = (ui.match(/const tabCapability = \{[\s\S]*?\};/) || [''])[0];
    uniqueTabs.forEach((tab) => {
        ok(`tab "${tab}" is capability-gated`, new RegExp(`\\b${tab}:\\s*CAPABILITIES\\.`).test(mapBlock));
    });
    ok('the Administration tab is gated by users:read',
       /admin:\s*CAPABILITIES\.USERS_READ/.test(mapBlock));
    ok('no phantom tab names remain in the map',
       !/\bstaff:\s*CAPABILITIES\./.test(mapBlock) && !/\bcreate:\s*CAPABILITIES\./.test(mapBlock));

    ok('the create-customer form is gated by users:create',
       /createCustomerCard[\s\S]{0,220}can\(CAPABILITIES\.USERS_CREATE\)/.test(ui));
    ok('the create-staff form needs users:create AND role:write',
       /createStaffCard[\s\S]{0,260}can\(CAPABILITIES\.USERS_CREATE\)\s*&&\s*can\(CAPABILITIES\.ROLE_WRITE\)/.test(ui));

    /* A teacher cannot call list-users, so the student table must be able to
       render from the students-overview rows they ARE entitled to. */
    ok('the student list falls back to the overview rows without users:read',
       /function getCustomerSource\(/.test(ui));
    ok('and fields requiring users:read are omitted, not fabricated',
       /accessPacks: null/.test(ui) && /deviceCount: null/.test(ui));
}

/* ------------------------------------------------------------------ */
console.log('\n[R15] Realtime + global analytics respect the same boundary');
{
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

    ok('studentPulse is readable by panel staff only', /match \/studentPulse\/\{userId\}[\s\S]*?allow read: if isPanelStaff\(\);/.test(rules));
    ok('studentPulse is NEVER client-writable', /match \/studentPulse\/\{userId\}[\s\S]*?allow write: if false;/.test(rules));
    ok('analyticsGlobal is readable by panel staff only', /match \/analyticsGlobal\/\{docId\}[\s\S]*?allow read: if isPanelStaff\(\);/.test(rules));
    ok('analyticsGlobal is NEVER client-writable', /match \/analyticsGlobal\/\{docId\}[\s\S]*?allow write: if false;/.test(rules));
    ok('isPanelStaff excludes customers', /function isPanelStaff\(\)[\s\S]*?\["teacher", "moderator", "admin", "developer"\]/.test(rules));
    ok('the catch-all deny is still last', /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}\s*\}\s*\}\s*$/.test(rules.trim() + '\n'));

    /* activityLogs could previously be forged under anyone's identity. */
    ok('activityLogs may only be filed under the caller\'s own identity',
       /request\.resource\.data\.userEmail == request\.auth\.token\.email/.test(rules));
    ok('activityLogs action strings are bounded',
       /request\.resource\.data\.action\.size\(\) <= 500/.test(rules));

    /* The startup optimisation folds the header counters into students-overview.
       Those counters are stats:read data, which a teacher does NOT hold — the
       fold must not become a side door around that. */
    const overview = fs.readFileSync(path.join(ROOT, 'api', '_admin', 'students-overview.js'), 'utf8');
    ok('folded counters stay behind the stats:read capability',
       /roleHasCapability\(session\.role,\s*CAPABILITIES\.STATS_READ\)/.test(overview));
    ok('and the counter computation is the SAME code the stats endpoint runs',
       /computePlatformStats/.test(overview)
       && /computePlatformStats/.test(fs.readFileSync(path.join(ROOT, 'api', '_admin', 'stats.js'), 'utf8')));
    eq('a teacher does not hold stats:read', roleHasCapability('teacher', CAPABILITIES.STATS_READ), false);
    ['moderator', 'admin', 'developer'].forEach(r =>
        ok(`${r} still receives the folded counters`, roleHasCapability(r, CAPABILITIES.STATS_READ)));

    const store = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'analytics-store.js'), 'utf8');
    ok('only learners are ever projected into studentPulse',
       /if \(role !== 'customer'\) \{\s*\n\s*return false;/.test(store));
    ok('deleting a user retracts their projection',
       /syncPulse\([\s\S]{0,80}\{ deleted: true \}\)/.test(
           fs.readFileSync(path.join(ROOT, 'api', '_admin', 'delete-user.js'), 'utf8')));
}

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(64));
console.log(fail === 0
    ? `  ✅ ADMIN RBAC: ${pass}/${pass} assertions passed`
    : `  ❌ ADMIN RBAC: ${fail} failed, ${pass} passed`);
console.log('─'.repeat(64) + '\n');
process.exit(fail === 0 ? 0 : 1);

})().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
