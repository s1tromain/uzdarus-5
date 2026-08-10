/* ============================================================================
 * shared-normalizer.js — THE answer normaliser for the whole platform.
 *
 * Every course grades free-text answers by comparing normalised strings. Until
 * this file existed each course carried its own copy of that function; they
 * agreed by luck, not by construction, and one had already drifted (A1's
 * topic-6 variant did not strip the em dash, so "Я — был" was judged
 * differently there than anywhere else).
 *
 * One implementation now serves A1, A2, B1, B2, the shared exercise UI and the
 * sentence builder. If the rule ever needs to change it changes once, and every
 * course changes with it.
 *
 * THE RULE — what a learner may vary without being marked wrong:
 *   case                "Был"      == "был"
 *   ё / е               "ёлка"     == "елка"
 *   punctuation         "был."     == "был"      . , ! ? ; : ( ) " ' « » — – -
 *   spacing             "  был  "  == "был"
 * Everything else must match exactly.
 *
 *   UzNormalize(value)            -> normalised string
 *   UzNormalize.matches(a, b)     -> boolean
 *   UzNormalize.VERSION
 *
 * Changing this rule changes grading for every course at once. Do not fork it.
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.UzNormalize) return;

    var PUNCT = /[.,!?;:()"'«»—–\-]/g;

    function normalize(value) {
        return String(value == null ? '' : value)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(PUNCT, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** True when two answers are equivalent under the rule above. */
    normalize.matches = function (a, b) {
        return normalize(a) === normalize(b);
    };

    normalize.VERSION = 1;

    global.UzNormalize = normalize;

    /* CommonJS too, so tests can require it without a DOM. */
    if (typeof module !== 'undefined' && module.exports) module.exports = normalize;
})(typeof window !== 'undefined' ? window : this);
