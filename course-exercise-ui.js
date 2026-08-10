/* ============================================================================
 * course-exercise-ui.js — the SHARED exercise presentation layer.
 *
 * One renderer for every course. It turns a generic exercise group
 * ({ id, type, items:[{ q, answer, options?, hint?, explanation? }] }) into
 * markup, binds its widgets, and reads answers back out as plain values.
 *
 * It is deliberately free of policy: no thresholds, no scoring, no progress,
 * no persistence, no course names. A course host supplies those. That is why
 * A2 and B2 can share it byte-for-byte and still behave completely differently.
 *
 * Supported group types (chosen by data, never by lesson number):
 *   input    a free-text answer
 *   choice   option chips or a lettered test; a `___` gap becomes a live slot
 *            the chosen word is written into
 *   builder  delegated to sentence-builder.js (word cards)
 *
 * Public API:
 *   injectStyles()
 *   renderGroup(group)            -> HTML for one exercise
 *   bindGroup(root)               -> one delegated listener set per step
 *   readAnswer(root, key, group)  -> the learner's answer as a string
 *   writeAnswer(root, key, v, g)  -> restore an answer (drafts)
 *   matchItem(item, value)        -> platform normalisation, all variants
 *   afterCheck(result, g, root)   -> per-card verdicts for builder groups
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.UzExerciseUI) return;

    /* The sentence-builder component, resolved lazily so load order is free. */
    function builder() { return global.UzSentenceBuilder || null; }

    /* The platform's normalisation. Case, ё/е, punctuation and whitespace are
       ignored; everything else must match. Shared by every course, so an answer
       accepted in one is accepted identically in another. */
    function norm(v) {
        /* The platform normaliser — one implementation, in shared-normalizer.js.
           A local fallback keeps this module usable on its own, and it is the
           same rule, not a second opinion. */
        if (global.UzNormalize) return global.UzNormalize(v);
        return String(v == null ? '' : v).toLowerCase().replace(/\u0451/g, '\u0435')
            .replace(/[.,!?;:()"'\u00ab\u00bb\u2014\u2013\-]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escAttr(s) { return escHtml(s).replace(/'/g, '&#39;'); }

    /* -------------------------------------------------------------- styles */

    /**
     * B2's visual identity: deeper indigo, warm gold accents, more air, more
     * typography. Deliberately NOT the A2 palette — B2 should read as the more
     * advanced, more considered course while staying recognisably UzdaRus.
     * CSS only: no libraries, no canvas, no runtime layout maths.
     */
    function injectStyles() {
        if (document.getElementById('b2h-styles')) return;
        var st = document.createElement('style');
        st.id = 'b2h-styles';
        st.textContent = [
            /* Design tokens. BOTH roots must carry them: the exercise UI mounts
               under .b2h and the grammar lesson under .b2g. A token declared on
               only one of them is invalid-at-computed-value-time in the other,
               which silently drops colour to `inherit` — white text on white
               tables. Every var() below also carries a literal fallback so this
               can never blank a page again. */
            '.b2h,.b2g{--b2-ink:#1a1c2e;--b2-dim:#6b7290;--b2-line:#e4e7f2;--b2-primary:#3B3F8F;',
            '--b2-accent:#6C63FF;--b2-ok:#1F8A5B;--b2-bad:#C63B4E}',

            /* ---- exercise card ---- */
            '.b2h-item{background:#fff;border:1px solid var(--b2-line);border-radius:16px;padding:22px 24px;',
            'margin-bottom:16px;box-shadow:0 1px 2px rgba(26,28,46,.04);',
            'transition:box-shadow .25s,border-color .25s,transform .25s}',
            '.b2h-item:hover{box-shadow:0 8px 26px rgba(59,63,143,.10);border-color:#cfd5ec;transform:translateY(-1px)}',
            '.b2h-item.is-filled{border-color:#c3c8ee;background:linear-gradient(180deg,#fdfdff,#fafbff)}',
            '.b2h-q{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}',
            '.b2h-num{flex:none;width:30px;height:30px;border-radius:10px;',
            'background:linear-gradient(135deg,var(--b2-accent),var(--b2-primary));color:#fff;',
            'font-weight:800;font-size:.85rem;display:flex;align-items:center;justify-content:center;',
            'box-shadow:0 2px 8px rgba(59,63,143,.28)}',
            '.b2h-text{font-size:1.08rem;color:var(--b2-ink);line-height:1.85;font-weight:500}',

            /* ---- the inline slot the chosen word drops into ---- */
            '.b2h-slot{display:inline-block;min-width:96px;padding:2px 12px;margin:0 4px;border-radius:8px;',
            'background:#F0F1FB;border-bottom:2.5px solid #b9bfe6;color:#9aa0c4;font-weight:700;',
            'text-align:center;transition:all .28s cubic-bezier(.34,1.36,.64,1)}',
            '.b2h-slot.filled{background:linear-gradient(135deg,#EEF0FF,#E4E7FF);',
            'border-bottom-color:var(--b2-accent);color:var(--b2-primary);box-shadow:0 2px 10px rgba(108,99,255,.18)}',
            '.b2h-slot.pop{animation:b2hPop .34s cubic-bezier(.34,1.36,.64,1)}',
            '@keyframes b2hPop{0%{transform:scale(.86)}55%{transform:scale(1.09)}100%{transform:scale(1)}}',
            '.b2h-blank{display:inline-block;min-width:88px;border-bottom:2.5px dashed #b9bfe6;margin:0 5px}',

            /* ---- free-text input ---- */
            '.b2h-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:1.02rem;',
            'padding:14px 16px;border:2px solid var(--b2-line);border-radius:12px;background:#fff;',
            'color:var(--b2-ink);transition:border-color .2s,box-shadow .2s,background .2s}',
            '.b2h-input::placeholder{color:#a8aec8}',
            '.b2h-input:hover{border-color:#cfd5ec}',
            '.b2h-input:focus{outline:none;border-color:var(--b2-accent);background:#fcfcff;',
            'box-shadow:0 0 0 4px rgba(108,99,255,.12)}',
            '.b2h-hint{margin-top:9px;font-size:.86rem;color:var(--b2-dim);font-style:italic}',

            /* ---- options ---- */
            '.b2h-opts{display:flex;gap:10px;flex-wrap:wrap}',
            '.b2h-opts-test,.b2h-opts-tf{flex-direction:column;gap:9px}',
            '.b2h-opt{position:relative;font-family:inherit;cursor:pointer;border-radius:12px;',
            'border:2px solid var(--b2-line);background:#fff;color:#3c4260;font-size:1rem;font-weight:600;',
            'padding:12px 20px;display:flex;align-items:center;gap:11px;',
            'transition:transform .18s,border-color .18s,background .18s,box-shadow .18s}',
            '.b2h-opts-test .b2h-opt,.b2h-opts-tf .b2h-opt{width:100%;text-align:left}',
            '.b2h-opt:hover{border-color:var(--b2-accent);background:#FAFAFF;transform:translateY(-2px);',
            'box-shadow:0 6px 18px rgba(108,99,255,.14)}',
            '.b2h-opt:active{transform:translateY(0) scale(.98)}',
            '.b2h-opt.selected{border-color:var(--b2-accent);color:var(--b2-primary);',
            'background:linear-gradient(135deg,#EEF0FF,#E6E9FF);box-shadow:0 4px 16px rgba(108,99,255,.22)}',
            '.b2h-opt.selected::after{content:"\\2713";margin-left:auto;font-weight:900;color:var(--b2-accent)}',
            '.b2h-key{width:26px;height:26px;flex:none;border-radius:8px;background:#F0F1F8;color:#7d84a6;',
            'font-weight:800;font-size:.8rem;display:flex;align-items:center;justify-content:center;transition:all .18s}',
            '.b2h-opt.selected .b2h-key{background:var(--b2-accent);color:#fff}',

            /* ---- "how to do it" briefing -----------------------------
               Rendered for any group that supplies `howTo`. Purely presentational:
               it never participates in grading, scoring or progress. Generic, so
               every future exercise in every course gets it for free. */
            '.b2h-howto{background:#F7F9FC;border:1px solid #E6EAF2;border-left:3px solid #2563EB;',
            'border-radius:14px;padding:18px 20px 16px;margin-bottom:20px}',
            '.b2h-howto-h{display:flex;align-items:center;gap:9px;margin-bottom:10px;',
            'font-weight:700;font-size:.95rem;color:#1D4ED8;letter-spacing:.01em}',
            '.b2h-howto-h::before{content:"\\1F4A1";font-size:1.05rem}',
            '.b2h-howto p{margin:0 0 9px;color:#4A5468;font-size:.97rem;line-height:1.72;',
            'word-break:normal;overflow-wrap:break-word;hyphens:none;max-width:70ch}',
            '.b2h-howto p:last-child{margin-bottom:0}',
            '.b2h-howto-t{font-weight:700;color:#1F2430;font-size:1.02rem;margin-bottom:6px}',
            '@media(max-width:640px){.b2h-howto{padding:15px 16px 14px}}',

            /* ---- audio ---- */
            '.b2h-audio{background:linear-gradient(135deg,#EEF0FF,#F6F7FF);border:1px solid #dfe3f7;',
            'border-radius:16px;padding:20px 22px;margin-bottom:20px}',
            '.b2h-audio b{display:block;color:var(--b2-primary);font-size:1.02rem;margin-bottom:6px}',
            '.b2h-audio small{color:var(--b2-dim)}',
            '.b2h-audio audio{width:100%;margin-top:12px}',

            /* ---- grammar lesson --------------------------------------
               A small design system, not a pile of one-off rules. Restraint
               over decoration: one accent colour, one neutral ramp, a 4px
               spacing rhythm, fluid type. Every component below is generic —
               topics 2-16 inherit it with no new CSS. */
            '.b2g{--g-ink:#1F2430;--g-ink-2:#4A5468;--g-mute:#6B7688;--g-line:#E6EAF2;',
            '--g-line-2:#F0F3F9;--g-surface:#FFFFFF;--g-tint:#F7F9FC;--g-accent:#2563EB;',
            '--g-accent-soft:#EFF4FF;--g-accent-line:#C7D9FF;--g-warn:#B45309;',
            '--g-warn-soft:#FFF9EC;--g-warn-line:#FCE3B4;--g-ok:#047857;--g-ok-soft:#EFFAF4;',
            '--g-ok-line:#BCE9D4;--g-bad:#BE2E45;--g-bad-soft:#FEF2F3;--g-bad-line:#F8CDD3}',

            /* base rhythm + honest wrapping (never mid-word, never hyphenated) */
            '.b2g{color:var(--g-ink,#1F2430);font-size:clamp(15px,.4vw + 14.4px,17px);',
            'line-height:1.75;word-break:normal;overflow-wrap:break-word;hyphens:none;',
            '-webkit-hyphens:none;text-rendering:optimizeLegibility}',
            '.b2g *{word-break:normal;hyphens:none;-webkit-hyphens:none}',
            '.b2g p{margin:0 0 14px;color:var(--g-ink-2,#4A5468);max-width:68ch}',
            '.b2g b,.b2g strong{color:var(--g-ink,#1F2430);font-weight:650}',
            '.b2g i{color:inherit}',
            '.b2g s{color:var(--g-bad,#BE2E45);text-decoration-thickness:2px}',
            '.b2g u{text-decoration-color:var(--g-accent,#2563EB);text-underline-offset:3px}',

            /* section heading: number-free, quiet rule above, generous air */
            '.b2g h4{margin:40px 0 16px;font-size:clamp(17px,.5vw + 16px,20px);line-height:1.35;',
            'font-weight:700;color:var(--g-ink,#1F2430);letter-spacing:-.011em;',
            'padding-top:22px;border-top:1px solid var(--g-line-2,#F0F3F9)}',
            '.b2g h4:first-child,.b2g-lead h4{margin-top:0;padding-top:0;border-top:0}',

            /* opening panel */
            '.b2g-lead{background:var(--g-tint,#F7F9FC);border:1px solid var(--g-line,#E6EAF2);',
            'border-radius:16px;padding:clamp(18px,3vw,26px);margin-bottom:8px}',

            /* sentence schema */
            '.b2g-scheme{display:flex;flex-wrap:wrap;align-items:center;gap:6px;',
            'margin:18px 0;padding:16px 18px;background:var(--g-surface,#fff);',
            'border:1px solid var(--g-line,#E6EAF2);border-radius:14px;line-height:2.1}',
            '.b2g-main{background:var(--g-accent-soft,#EFF4FF);color:#1D4ED8;padding:5px 12px;',
            'border-radius:8px;font-weight:650}',
            '.b2g-sub{background:var(--g-warn-soft,#FFF9EC);color:var(--g-warn,#B45309);',
            'padding:5px 12px;border-radius:8px;font-weight:650}',
            '.b2g-link{color:var(--g-accent,#2563EB);font-weight:750}',
            '.b2g-scheme-note{font-size:.92em;color:var(--g-mute,#6B7688);margin:0}',

            /* ---- tables: rounded, hairline, tinted header, row hover ---- */
            '.b2g-t{width:100%;margin:16px 0 26px;border-collapse:separate;border-spacing:0;',
            'background:var(--g-surface,#fff);border:1px solid var(--g-line,#E6EAF2);',
            'border-radius:14px;overflow:hidden;font-size:.96em;',
            'box-shadow:0 1px 2px rgba(16,24,40,.03)}',
            '.b2g-t th{background:var(--g-tint,#F7F9FC);color:var(--g-ink,#1F2430);text-align:left;',
            'font-weight:650;font-size:.86em;letter-spacing:.02em;text-transform:uppercase;',
            'padding:13px 16px;border-bottom:1px solid var(--g-line,#E6EAF2);white-space:nowrap}',
            '.b2g-t td{padding:14px 16px;color:var(--g-ink-2,#4A5468);background:var(--g-surface,#fff);',
            'border-top:1px solid var(--g-line-2,#F0F3F9);vertical-align:top;line-height:1.65}',
            '.b2g-t tbody tr:first-child td,.b2g-t tr:first-child td{border-top:0}',
            '.b2g-t td:first-child{color:var(--g-ink,#1F2430);font-weight:600}',
            '@media(hover:hover){.b2g-t tr:hover td{background:#FBFCFE}}',
            '.b2g-t.b2g-err td:first-child{color:var(--g-bad,#BE2E45);font-weight:600}',
            '.b2g-t.b2g-err td:nth-child(2){color:var(--g-ok,#047857);font-weight:600}',

            /* two-up comparison */
            '.b2g-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));',
            'gap:14px;margin:18px 0 26px}',
            '.b2g-half{background:var(--g-surface,#fff);border:1px solid var(--g-line,#E6EAF2);',
            'border-radius:14px;padding:18px 20px;transition:border-color .2s,box-shadow .2s}',
            '@media(hover:hover){.b2g-half:hover{border-color:var(--g-accent-line,#C7D9FF);',
            'box-shadow:0 6px 20px rgba(37,99,235,.07)}}',
            '.b2g-half>b{display:block;color:var(--g-accent,#2563EB);font-size:.94em;',
            'letter-spacing:.02em;margin-bottom:8px}',
            '.b2g-half p{margin:0;font-size:.96em}',
            '.b2g-ex{background:var(--g-tint,#F7F9FC);border-radius:10px;padding:12px 14px;',
            'margin-top:12px!important}',
            '.b2g-ex small{display:block;margin-top:6px;color:var(--g-mute,#6B7688);font-size:.86em}',

            /* ---- lists with a branded check marker ---- */
            '.b2g-list{list-style:none;margin:12px 0 24px;padding:0}',
            '.b2g-list li{position:relative;padding-left:30px;margin:10px 0;',
            'color:var(--g-ink-2,#4A5468);max-width:68ch}',
            '.b2g-list li::before{content:"";position:absolute;left:0;top:.55em;width:18px;height:18px;',
            'border-radius:50%;background:var(--g-accent-soft,#EFF4FF);',
            'box-shadow:inset 0 0 0 1px var(--g-accent-line,#C7D9FF)}',
            '.b2g-list li::after{content:"";position:absolute;left:6px;top:calc(.55em + 5px);',
            'width:5px;height:8px;border:solid var(--g-accent,#2563EB);border-width:0 2px 2px 0;',
            'transform:rotate(45deg)}',

            /* ---- callouts: one component, three tones ---- */
            '.b2g-tip,.b2g-warn{position:relative;margin:18px 0 26px;padding:16px 20px 16px 52px;',
            'border-radius:14px;border:1px solid;line-height:1.7;font-size:.97em}',
            '.b2g-tip::before,.b2g-warn::before{position:absolute;left:18px;top:15px;font-size:1.15em;',
            'line-height:1.4}',
            '.b2g-tip{background:var(--g-ok-soft,#EFFAF4);border-color:var(--g-ok-line,#BCE9D4);',
            'color:#0B5D46}',
            '.b2g-tip::before{content:"\\1F4A1"}',
            '.b2g-warn{background:var(--g-warn-soft,#FFF9EC);border-color:var(--g-warn-line,#FCE3B4);',
            'color:#8A5A08}',
            '.b2g-warn::before{content:"\\26A0\\FE0F"}',
            '.b2g-tip b,.b2g-warn b{color:inherit}',

            /* ---- phrase chips ---- */
            '.b2g-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 26px}',
            '.b2g-chips span{background:var(--g-surface,#fff);color:#1D4ED8;',
            'border:1px solid var(--g-accent-line,#C7D9FF);border-radius:999px;padding:8px 16px;',
            'font-weight:600;font-size:.92em;transition:background .18s,transform .18s}',
            '@media(hover:hover){.b2g-chips span:hover{background:var(--g-accent-soft,#EFF4FF);',
            'transform:translateY(-1px)}}',

            /* ---- closing checklist ---- */
            '.b2g-check{background:var(--g-accent-soft,#EFF4FF);border:1px solid var(--g-accent-line,#C7D9FF);',
            'border-radius:16px;padding:clamp(18px,3vw,26px);margin-top:32px}',
            '.b2g-check h4{margin-top:0;padding-top:0;border-top:0;color:#1D4ED8}',
            '.b2g-check .b2g-list li{color:#24324A}',
            '.b2g-check .b2g-list li::before{background:#fff}',

            /* ---- mobile: tables scroll inside themselves, page never does ---- */
            '@media(max-width:640px){',
            '.b2g h4{margin:30px 0 12px;padding-top:18px}',
            '.b2g-scheme{line-height:2.3;padding:14px}',
            '.b2g-t{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;',
            'white-space:normal;font-size:.94em}',
            '.b2g-t th,.b2g-t td{padding:11px 13px;min-width:104px}',
            '.b2g-t td:last-child{min-width:180px}',
            '.b2g-tip,.b2g-warn{padding:14px 16px 14px 46px}',
            '.b2g-tip::before,.b2g-warn::before{left:15px}',
            '.b2g-list li{padding-left:27px}',
            '}',
            /* ---- topic vocabulary card (shared by every course) ---- */
            '.b2-vocab-card{background:linear-gradient(135deg,#FF9800,#F57C00);padding:30px;',
            'border-radius:15px;text-align:center;margin:24px 0;',
            'box-shadow:0 8px 25px rgba(255,152,0,.3)}',
            '.b2-vocab-card .b2-vocab-ico{font-size:4rem;margin-bottom:15px}',
            '.b2-vocab-card h3{color:#fff;margin-bottom:12px;font-size:1.8rem}',
            '.b2-vocab-card p{color:rgba(255,255,255,.92);margin-bottom:24px;font-size:1.1rem}',
            '.b2-vocab-card button{background:#fff;color:#F57C00;border:none;padding:15px 40px;',
            'border-radius:50px;font-size:1.15rem;font-weight:700;cursor:pointer;font-family:inherit;',
            'box-shadow:0 4px 15px rgba(0,0,0,.2);transition:transform .25s ease,box-shadow .25s ease}',
            '.b2-vocab-card button:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.3)}',
            '@media(max-width:640px){.b2-vocab-card{padding:24px 18px}',
            '.b2-vocab-card h3{font-size:1.4rem}',
            '.b2-vocab-card button{width:100%;padding:14px 20px}}',

            /* ---- grammar: structures migrated from A2's legacy blocks ----
               Same component family, so both courses render grammar through one
               design system instead of two. Content is untouched; only the
               markup that carries it now shares B2's structure. */
            '.b2g-h{margin:34px 0 14px;font-size:clamp(16px,.45vw + 15px,19px);line-height:1.4;',
            'font-weight:700;color:var(--g-ink,#1F2430);padding-top:20px;',
            'border-top:1px solid var(--g-line-2,#F0F3F9)}',
            '.b2g-lead .b2g-h:first-child,.b2g>.b2g-h:first-child{margin-top:0;padding-top:0;border-top:0}',
            '.b2g-lead-badge{display:inline-flex;align-items:center;gap:7px;background:#fff;',
            'border:1px solid var(--g-accent-line,#C7D9FF);color:#1D4ED8;border-radius:999px;',
            'padding:6px 14px;font-weight:700;font-size:.86em;margin-bottom:12px}',
            '.b2g-lead-title{font-size:clamp(18px,.6vw + 17px,22px);font-weight:800;',
            'color:var(--g-ink,#1F2430);line-height:1.3;margin-bottom:8px}',
            '.b2g-lead-sub{color:var(--g-ink-2,#4A5468);line-height:1.7;max-width:68ch}',

            '.b2g-ex{background:var(--g-tint,#F7F9FC);border-radius:10px;padding:12px 14px;margin:10px 0}',
            '.b2g-ex-ru{color:var(--g-ink,#1F2430);font-weight:600;line-height:1.7}',
            '.b2g-ex-uz{display:block;margin-top:4px;color:var(--g-mute,#6B7688);font-size:.94em}',

            '.b2g-tip-head{display:flex;align-items:center;gap:8px;font-weight:800;margin-bottom:8px}',

            '.b2g-list-item{position:relative;padding-left:30px;margin:10px 0;',
            'color:var(--g-ink-2,#4A5468)}',
            '.b2g-list-ico{position:absolute;left:0;top:.1em;font-size:1.05em}',
            '.b2g-list-uz{display:block;font-weight:650;color:var(--g-ink,#1F2430)}',
            '.b2g-list-ru{display:block;color:var(--g-ink-2,#4A5468);font-size:.96em}',

            '.b2g-card-uz,.b2g-card-sv,.b2g-card-nsv{background:var(--g-surface,#fff);',
            'border:1px solid var(--g-line,#E6EAF2);border-radius:14px;padding:16px 18px;margin:10px 0}',
            '.b2g-card-sv{border-left:4px solid var(--g-ok,#047857)}',
            '.b2g-card-nsv{border-left:4px solid var(--g-accent,#2563EB)}',
            '.b2g-tone-sv{color:var(--g-ok,#047857);font-weight:700}',
            '.b2g-tone-nsv{color:var(--g-accent,#2563EB);font-weight:700}',

            /* ---- results screen ---- */
            '.b2h-res{max-width:840px;margin:0 auto;padding:8px 0 28px;color:var(--b2-ink)}',
            '.b2h-res-hero{text-align:center;padding:34px 22px;border-radius:22px;margin-bottom:22px;',
            'background:linear-gradient(140deg,#2E3170,#4A4FA8 58%,#6C63FF);color:#fff;',
            'box-shadow:0 16px 42px rgba(46,49,112,.32)}',
            '.b2h-res-hero.fail{background:linear-gradient(140deg,#6A2436,#A33B4F 60%,#C63B4E);',
            'box-shadow:0 16px 42px rgba(106,36,54,.3)}',
            '.b2h-res-pct{font-size:4.4rem;font-weight:900;line-height:1}',
            '.b2h-res-title{font-size:1.5rem;font-weight:800;margin:12px 0 6px}',
            '.b2h-res-sub{opacity:.92;font-size:1.02rem;line-height:1.6;max-width:520px;margin:0 auto}',
            '.b2h-res-ring{height:10px;border-radius:6px;background:rgba(255,255,255,.24);',
            'overflow:hidden;max-width:420px;margin:20px auto 0}',
            '.b2h-res-ring i{display:block;height:100%;border-radius:6px;background:#fff;',
            'transition:width .8s cubic-bezier(.22,1,.36,1)}',
            '.b2h-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:14px;margin-bottom:24px}',
            '.b2h-stat{background:#fff;border:1px solid var(--b2-line);border-radius:16px;padding:18px;text-align:center}',
            '.b2h-stat b{display:block;font-size:2rem;font-weight:900;line-height:1.15}',
            '.b2h-stat span{display:block;font-size:.84rem;color:var(--b2-dim);margin-top:4px;font-weight:600}',
            '.b2h-stat.ok b{color:var(--b2-ok)}.b2h-stat.bad b{color:var(--b2-bad)}',
            '.b2h-stat.neutral b{color:var(--b2-primary)}',
            '.b2h-sec{font-size:1.12rem;font-weight:800;margin:0 0 14px;color:var(--b2-primary)}',
            '.b2h-brk{background:#fff;border:1px solid var(--b2-line);border-radius:16px;overflow:hidden;margin-bottom:24px}',
            '.b2h-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #f0f2f8}',
            '.b2h-row:last-child{border-bottom:0}',
            '.b2h-row-name{flex:1;font-weight:600;font-size:.97rem}',
            '.b2h-row-bar{flex:none;width:110px;height:8px;border-radius:5px;background:#eef0f7;overflow:hidden}',
            '.b2h-row-bar i{display:block;height:100%;border-radius:5px;background:var(--b2-ok)}',
            '.b2h-row-bar.bad i{background:var(--b2-bad)}',
            '.b2h-row-val{flex:none;width:74px;text-align:right;font-weight:800;font-size:.94rem}',
            '.b2h-tips{background:linear-gradient(135deg,#FFFBF0,#FFF7E4);border:1px solid #F0E0B8;',
            'border-radius:16px;padding:20px 24px;margin-bottom:24px}',
            '.b2h-tips h4{margin:0 0 10px;color:#8A6D0B;font-size:1.04rem}',
            '.b2h-tips ul{margin:0;padding-left:20px;line-height:1.85;color:#5f5330}',
            '.b2h-res-acts{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}',
            '.b2h-cta{border:none;border-radius:12px;padding:15px 34px;font-size:1.04rem;font-weight:800;',
            'cursor:pointer;font-family:inherit;transition:transform .18s,box-shadow .18s,filter .18s}',
            '.b2h-cta:hover{transform:translateY(-2px);filter:brightness(1.06)}',
            '.b2h-cta[disabled]{opacity:.6;cursor:default;transform:none}',
            '.b2h-cta-done{background:linear-gradient(135deg,#1F8A5B,#15704A);color:#fff;',
            'box-shadow:0 6px 20px rgba(31,138,91,.32)}',
            '.b2h-cta-retry{background:linear-gradient(135deg,var(--b2-accent),var(--b2-primary));color:#fff;',
            'box-shadow:0 6px 20px rgba(108,99,255,.3)}',
            '.b2h-done-note{text-align:center;margin-top:16px;color:var(--b2-ok);font-weight:700}',
            '@media(max-width:640px){.b2h-res-pct{font-size:3.4rem}.b2h-item{padding:18px 16px}',
            '.b2h-row-bar{width:64px}.b2h-cta{width:100%}}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    /* --------------------------------------------------------- prompt HTML */

    /**
     * Render a prompt. When the group is a word choice with a `___` gap, the
     * first gap becomes a live slot the chosen word is written into, so the
     * learner reads a finished sentence instead of a blank line.
     */
    function renderPrompt(q, key, slotted) {
        var html = escHtml(q).replace(/\n/g, '<br>');
        if (!slotted) return html.replace(/_{3,}/g, '<span class="b2h-blank">______</span>');
        var used = false;
        return html.replace(/_{3,}/g, function () {
            if (used) return '<span class="b2h-blank">______</span>';
            used = true;
            return '<span class="b2h-slot" data-b2h-slot="' + escAttr(key) + '">______</span>';
        });
    }

    /** Shape-driven, never per-lesson: a choice group whose prompts carry a
     *  gap gets the inline-fill treatment. */
    function isSlotted(g) {
        return g.type === 'choice' && (g.items || []).some(function (it) {
            return /_{3,}/.test(String(it.q || ''));
        });
    }

    /* ------------------------------------------------------- rendering */

    function renderGroup(g) {
        var html = '<div class="b2h">';

        /* Tell the learner what this exercise asks of them BEFORE the first
           question. Content only — nothing here is graded or stored. */
        if (g.howTo) {
            var lines = Array.isArray(g.howTo) ? g.howTo : [g.howTo];
            html += '<div class="b2h-howto">' +
                    (g.title ? '<div class="b2h-howto-t">' + escHtml(g.title) + '</div>' : '') +
                    '<div class="b2h-howto-h">Как выполнять</div>' +
                    lines.map(function (t) { return '<p>' + escHtml(t) + '</p>'; }).join('') +
                    '</div>';
        }

        if (g.audioSrc) {
            var src = String(g.audioSrc);
            /* b2-course.html lives in /paid-courses/, b2-demo.html at the
               root — resolve relative to wherever the page actually is. */
            if (src.indexOf('http') !== 0 && src.indexOf('../') !== 0 &&
                location.pathname.indexOf('/paid-courses/') !== -1) {
                src = '../' + src;
            }
            html += '<div class="b2h-audio"><b>&#127911; Tinglab tushunish</b>' +
                    '<small>Audioni tinglang va savollarga javob bering.</small>' +
                    '<audio controls preload="metadata"><source src="' + escAttr(src) +
                    '" type="audio/mpeg"></audio></div>';
        }
        var slotted = isSlotted(g);
        (g.items || []).forEach(function (item, i) {
            var key = g.id + '-' + i;
            var cell;
            if (g.type === 'choice') {
                var style = g.style || 'chips';
                var opts = (item.options || []).map(function (o, oi) {
                    var lbl = style === 'test'
                        ? '<span class="b2h-key">' + String.fromCharCode(65 + oi) + '</span>' : '';
                    return '<button type="button" class="b2h-opt" data-value="' + escAttr(o) + '">' +
                           lbl + '<span>' + escHtml(o) + '</span></button>';
                }).join('');
                cell = '<div class="b2h-opts b2h-opts-' + style + '" data-b2h-row="' + escAttr(key) + '">' +
                       opts + '</div>';
            } else if (g.type === 'builder') {
                /* Delegated wholesale to the standalone component. */
                cell = builder() ? builder().renderItem(key, item, g) : '';
                if (item.hint) cell += '<div class="b2h-hint">' + escHtml(item.hint) + '</div>';
            } else {
                cell = '<input type="text" class="b2h-input" data-b2h-input="' + escAttr(key) + '" ' +
                       'placeholder="' + escAttr(item.placeholder || 'Javobingizni yozing...') + '" ' +
                       'autocomplete="off" spellcheck="false">';
                if (item.hint) cell += '<div class="b2h-hint">' + escHtml(item.hint) + '</div>';
            }
            html += '<div class="b2h-item" data-b2h-item="' + escAttr(key) + '">' +
                    '<div class="b2h-q"><span class="b2h-num">' + (i + 1) + '</span>' +
                    '<span class="b2h-text">' + renderPrompt(item.q, key, slotted) + '</span></div>' +
                    cell + '</div>';
        });
        return html + '</div>';
    }


    /** Put the chosen word into the sentence (and swap it on re-selection). */
    function fillSlot(root, key, value) {
        var slot = root.querySelector('[data-b2h-slot="' + key + '"]');
        if (!slot) return;
        var has = value != null && String(value).trim() !== '';
        slot.textContent = has ? value : '______';
        slot.classList.toggle('filled', has);
        if (has) {
            slot.classList.remove('pop');
            void slot.offsetWidth;         // reflow, so the animation replays
            slot.classList.add('pop');
        }
    }

    function markFilled(root, key, filled) {
        var card = root.querySelector('[data-b2h-item="' + key + '"]');
        if (card) card.classList.toggle('is-filled', !!filled);
    }

    /** One delegated listener pair for the whole step, not one per widget. */
    function bindGroup(root) {
        if (builder()) builder().bind(root);

        root.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.b2h-opt') : null;
            if (!btn || !root.contains(btn)) return;
            var row = btn.closest('.b2h-opts');
            if (!row) return;
            row.querySelectorAll('.b2h-opt').forEach(function (o) { o.classList.remove('selected'); });
            btn.classList.add('selected');
            var key = row.getAttribute('data-b2h-row');
            fillSlot(root, key, btn.getAttribute('data-value'));
            markFilled(root, key, true);
        });
        root.addEventListener('input', function (e) {
            var inp = e.target && e.target.closest ? e.target.closest('.b2h-input') : null;
            if (!inp) return;
            markFilled(root, inp.getAttribute('data-b2h-input'), inp.value.trim() !== '');
        });
    }

    function readAnswer(root, key, g) {
        if (g.type === 'builder') {
            return builder() ? builder().read(root, key) : '';
        }
        if (g.type === 'choice') {
            var sel = root.querySelector('[data-b2h-row="' + key + '"] .b2h-opt.selected');
            return sel ? (sel.getAttribute('data-value') || '') : '';
        }
        var inp = root.querySelector('[data-b2h-input="' + key + '"]');
        return inp ? inp.value : '';
    }

    function writeAnswer(root, key, value, g) {
        if (g.type === 'builder') {
            if (builder()) builder().write(root, key, value);
            return;
        }
        if (g.type === 'choice') {
            var row = root.querySelector('[data-b2h-row="' + key + '"]');
            if (!row) return;
            row.querySelectorAll('.b2h-opt').forEach(function (o) {
                o.classList.toggle('selected', o.getAttribute('data-value') === value);
            });
            fillSlot(root, key, value);
            markFilled(root, key, value != null && String(value).trim() !== '');
            return;
        }
        var inp = root.querySelector('[data-b2h-input="' + key + '"]');
        if (inp) {
            inp.value = (value == null ? '' : value);
            markFilled(root, key, inp.value.trim() !== '');
        }
    }

    function matchItem(item, value) {
        var nv = norm(value);
        if (!nv) return false;
        var expected = Array.isArray(item.answer) ? item.answer : [item.answer];
        return expected.some(function (e) { return norm(e) === nv; });
    }


    /**
     * The engine has just graded a step. Give every builder on it a
     * per-card verdict — correct words green, wrong words red, plus a
     * message — so the learner can see and fix the mistake. Presentation
     * only: the score was already decided and is not touched here.
     */
    function afterCheck(result, g, root) {
        var b = builder();
        if (!b || !g || g.type !== 'builder' || !root) return;
        var wrongIdx = {};
        (result && result.wrong || []).forEach(function (w) { wrongIdx[w.n - 1] = true; });
        (g.items || []).forEach(function (item, i) {
            b.markResult(root, g.id + '-' + i, item, g, !wrongIdx[i]);
        });
    }


    /* ---------------------------------------------------------------------
     * RESULTS SCREEN. One implementation, used by every course, so a finished
     * topic looks the same everywhere. The caller supplies the scored result;
     * this never decides anything about passing or progression.
     *   r = { score, total, errors, percent, passed, passPercent,
     *         breakdown:[{ id, title, correct, total, percent }], wrong:[…] }
     * ------------------------------------------------------------------- */
        /** Advice derived from the attempt itself, not canned filler. */
    function recommendations(r) {
        var out = [];
        var weak = r.breakdown
            .filter(function (b) { return b.total && b.percent < r.passPercent; })
            .sort(function (a, b) { return a.percent - b.percent; });
        if (weak.length) {
            out.push('Слабые упражнения: ' + weak.slice(0, 3).map(function (b) {
                return b.title + ' (' + b.percent + '%)';
            }).join(', ') + ' — повторите их в первую очередь.');
        }
        var explained = r.wrong.filter(function (w) { return w.explanation; });
        if (explained.length) {
            out.push('В ' + explained.length + ' ошибках есть разбор — прочитайте пояснения к ним.');
        }
        var blank = r.wrong.filter(function (w) { return w.given == null; }).length;
        if (blank) {
            out.push('Без ответа осталось: ' + blank +
                     '. Не оставляйте пропуски — отвечайте даже при сомнении.');
        }
        if (r.passed) {
            out.push('Порог ' + r.passPercent + '% пройден. Закрепите тему на словаре и переходите дальше.');
        } else {
            out.push('До порога ' + r.passPercent + '% не хватает ' + (r.passPercent - r.percent) +
                     '%. Разберите грамматику темы и пройдите упражнения заново.');
        }
        return out;
    }

    /**
     * ONE results builder. Its HTML is mounted in the modal (the screen the
     * learner sees at the end) and written into the page's existing
     * #quizResults block (so a finished topic can be reopened to it).
     * One generator, two mount points — not two result screens.
     */
    function renderResults(r, opts) {
        opts = opts || {};
        var passed = !!r.passed;

        var rows = (r.breakdown || []).map(function (b) {
            var good = b.percent >= r.passPercent;
            return '<div class="b2h-row">' +
                   '<span class="b2h-row-name">' + escHtml(b.title) + '</span>' +
                   '<span class="b2h-row-bar' + (good ? '' : ' bad') + '">' +
                   '<i style="width:' + b.percent + '%"></i></span>' +
                   '<span class="b2h-row-val" style="color:' +
                   (good ? 'var(--b2-ok)' : 'var(--b2-bad)') + '">' +
                   b.correct + '/' + b.total + '</span></div>';
        }).join('');

        var tips = recommendations(r).map(function (t) {
            return '<li>' + escHtml(t) + '</li>';
        }).join('');

        var acts;
        if (opts.archived) {
            acts = '<div class="b2h-done-note">&#10004; Тема завершена. ' +
                   'Это результат вашей последней попытки.</div>';
        } else if (passed) {
            acts = '<div class="b2h-res-acts">' +
                   '<button type="button" class="b2h-cta b2h-cta-done" data-b2h-act="complete">' +
                   'Завершить тему</button></div>';
        } else {
            acts = '<div class="b2h-res-acts">' +
                   '<button type="button" class="b2h-cta b2h-cta-retry" data-b2h-act="restart">' +
                   'Пройти тему заново</button></div>' +
                   '<div class="b2h-done-note" style="color:var(--b2-bad)">' +
                   'Тема не засчитана: нужно минимум ' + r.passPercent + '%.</div>';
        }

        return '<div class="b2h"><div class="b2h-res">' +
            '<div class="b2h-res-hero' + (passed ? '' : ' fail') + '">' +
                '<div class="b2h-res-pct">' + r.percent + '%</div>' +
                '<div class="b2h-res-title">' +
                (passed ? 'Тема пройдена' : 'Тема не пройдена') + '</div>' +
                '<div class="b2h-res-sub">' + (passed
                    ? 'Отличная работа — вы уверенно владеете материалом темы.'
                    : 'Проходной балл — ' + r.passPercent + '%. Разберите ошибки и попробуйте ещё раз.') +
                '</div>' +
                '<div class="b2h-res-ring"><i style="width:' + r.percent + '%"></i></div>' +
            '</div>' +
            '<div class="b2h-stats">' +
                '<div class="b2h-stat neutral"><b>' + r.score + '/' + r.total + '</b><span>Общий балл</span></div>' +
                '<div class="b2h-stat ok"><b>' + r.score + '</b><span>Правильных</span></div>' +
                '<div class="b2h-stat bad"><b>' + r.errors + '</b><span>Ошибок</span></div>' +
                '<div class="b2h-stat neutral"><b>' + (r.breakdown || []).length +
                '</b><span>Упражнений</span></div>' +
            '</div>' +
            '<h3 class="b2h-sec">Статистика по упражнениям</h3>' +
            '<div class="b2h-brk">' + rows + '</div>' +
            '<div class="b2h-tips"><h4>Рекомендации</h4><ul>' + tips + '</ul></div>' +
            acts +
        '</div></div>';
    }

    /* ---------------------------------------------------------------------
     * VOCABULARY CARD. One component for every course.
     *
     * `count` is optional and shown only when a course actually knows how many
     * words a topic has. A2 has always shown it and must keep doing so; B2 has
     * never had the figure, and simply omits the line. Neither course loses
     * anything, and there is still exactly one card implementation.
     *
     *   href   where the vocabulary lives, topic id already applied
     *   count  words in this topic, or falsy to omit the line
     *   icon / title / lead / cta  optional overrides
     * ------------------------------------------------------------------- */
    function renderVocabCard(opts) {
        opts = opts || {};
        var count = Number(opts.count);
        var lead = opts.lead || (count > 0
            ? 'Ushbu mavzuda <strong>' + count + ' ta so\'z</strong> o\'rganasiz'
            : 'Ushbu mavzuning lug\'atini o\'rganing va so\'z boyligingizni mustahkamlang.');
        return '<div class="b2-vocab-card">' +
               '<div class="b2-vocab-ico">' + (opts.icon || '\uD83C\uDF93') + '</div>' +
               '<h3>' + escHtml(opts.title || 'So\'zlar lug\'ati') + '</h3>' +
               '<p>' + lead + '</p>' +
               '<button type="button" onclick="window.location.href=\'' +
               escAttr(opts.href || '#') + '\'">' +
               '<i class="fas fa-book-open"></i> ' + escHtml(opts.cta || 'Lug\'atni ochish') +
               '</button></div>';
    }

    global.UzExerciseUI = {
        VERSION: 1,
        injectStyles: injectStyles,
        renderGroup: renderGroup,
        bindGroup: bindGroup,
        readAnswer: readAnswer,
        writeAnswer: writeAnswer,
        matchItem: matchItem,
        afterCheck: afterCheck,
        renderResults: renderResults,
        renderVocabCard: renderVocabCard,
        norm: norm,
        escHtml: escHtml
    };
})(typeof window !== 'undefined' ? window : this);
