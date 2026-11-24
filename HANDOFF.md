# ED History Studio — version 54

Open index.html directly in a browser, or use the live site. No build or dependency installation is needed to run it.

Files:
- index.html: page markup only.
- styles.css: all styling.
- app.js: all presentation content and behaviour.
- grammar.js: the "Check wording" button. It uses Harper (vendor/harper, Apache-2.0, fetched from npm by .github/workflows/vendor-harper.yml), which runs on the device in a background worker and sends nothing. Words used anywhere in the site's presentations, plus the clinical word list in grammar.js, count as correct spellings.
- sw.js, manifest.webmanifest and the PNG icons: offline use and "add to home screen". sw.js keeps a copy of these page files only, never anything entered. Change the CACHE name in sw.js when releasing a new version.
- tests/run.js: automated checks with fictional entries. Run `npm install` once, then `npm test`. They also run on GitHub for every push (.github/workflows/test.yml).

For Claude: edit app.js and styles.css. Preserve the 45 alphabetical complaints, complaint-specific history and examination systems, and the PC × duration section before the HPC. The HPC opens with demographics, chronic illnesses and maintenance medication. Additional context comes before associated symptoms. Only explicitly denied symptoms enter the negatives; symptomSentences() writes the positives and negatives. Keep patient entries in browser memory and preserve consent checks for intimate findings. Keep the page free of external fonts, scripts and network requests.

The note rebuilds itself after every entry (liveUpdate) and pauses once the clinician types in the note. Short dropdowns are shown as chips by chipify(); the original select stays in the page as the stored value, so read and write values through the select, not the chips.

Run `npm test` before publishing, and add a check to tests/run.js for any new safeguard.

Bedside reminders added from version 35 onwards (Foreign body, Anaphylaxis, Itching, Pain and aches, Unwitnessed fall, Surgical site infection, UTI / Dysuria) have not yet had clinical review.

My quick normal exam (version 47): Dr Levene's usual normal general, abdominal, respiratory and cardiovascular findings, applied with one tap and removed with a second. These four systems appear on every presentation. normalClashes lists which abnormal findings contradict each normal one; the button skips any normal finding whose abnormal is already ticked, and ticking an abnormal finding clears the contradicted normal.

Version 48: observations (vital signs) live in the Observations card at the top and belong to the patient, not the presentation (obsValues, moveObservations). Each chip group and the symptom list is one Tab stop with arrow keys inside (rove). Copy by section uses noteSection(). quickNormalCheck() shows non-blocking prompts. Do not hide history or symptom items by position: the lists are not ordered by clinical priority, and folding them hid red flags (tried and withdrawn in version 48).

Version 50: an IIFE at the end of app.js sets autocomplete="off" and inputmode="decimal" on every field (a MutationObserver reapplies it to fields built later), names each "Add detail" button, and shows inline .fielderr messages with aria-invalid for out-of-range age and vital signs (the note still pauses, as before). styles.css adds scroll-padding-bottom on phones so focused fields clear the fixed bottom bar. Version 49 (blue glass theme) was withdrawn at Dr Levene's request; keep the current look unless he asks for a change.

Version 51: phone feel per Emil Kowalski's mobile-native and animation rules. Every :hover rule is wrapped in @media(hover:hover) and (pointer:fine) in place (not moved, so selected-state rules after it still win). html has overscroll-behavior-y:none (stops pull-to-refresh wiping an encounter), no tap highlight, no smooth scrolling; jumps use behavior 'auto'; the card reveal was removed. Press feedback is scale(.97) with a 120 ms strong ease-out. Keep new hover rules inside that media query.

Version 52:
- Hypoxia uses addBedsideChecklist like the other newer presentations (app.js, before complaintExamSystems).
- scores.js holds the 11 scores as data: items are choice, check or num, with optional auto() from the page. result() builds the note line. window.edScoreLines() feeds a SCORES section in generate(), and window.edScoresClear() is called from Clear encounter. Values filled from the page update in place (syncPanel), never by rebuilding the panel: a rebuild on blur swallowed taps on "Update in note".
- photo.js loads vendor/tesseract on demand (fetched by .github/workflows/vendor-tesseract.yml) and runs two passes (sparse and block). parse() handles labelled values, flowsheet tables, °F and oxygen. The test images in tests/fixtures are fictional.
- Clinical content for Hypoxia, and the choice and wording of score bands, still need clinical review.

Version 53: scores are live. included() = scores added by hand, plus (when #score-auto is ticked) SUGGEST[presentation] minus any the clinician removed. window.edScoreLines() returns only complete results, recomputed at every note build. context() exposes yn(symptom), hist(chip) and exam(chip) for item auto() functions. Check items are tri-state (true, false, unanswered); unanswered blocks completion. Keep it that way: an unticked box must never be read as "absent" in the note.

Version 54:
- labs.js: the analyte table A (aliases; units with SI factor and typical range), parse() line by line, consuming each match so several results can share a line. Short symbols (Na, K, Ca, Mg, Cr, PT, BE, CO2) are case-sensitive on purpose: "mg/dL" must not read as magnesium. PLAUSIBLE limits, report-flag disagreement, decimal repair of ranges, and Tesseract's word confidence (edOCR.unsure()) all leave a result unticked. kept{} feeds edLabLines() (INVESTIGATIONS) and edLabs.get() (scores).
- ai.js: the only network call the site makes (api.anthropic.com, direct browser access with the doctor's own key). It forces the report_differential tool for structured output. deidentify() runs before the preview and the preview is editable. edImpression() feeds IMPRESSION with ticked names only.
- Privacy statements now say "nothing leaves the device except Diagnosis support, when you send it". Keep the tests that assert no outside requests for every other feature.
