# ED History Studio — version 49

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
