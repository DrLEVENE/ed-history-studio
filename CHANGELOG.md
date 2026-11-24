# Changelog

## Version 54 — 24 November 2026
- New Investigations card. It reads blood results from a photo, a saved image, a pasted screenshot (Paste button, or tap the box and paste) or pasted text. Images are read on this device by the same reader as the observations; nothing is uploaded or saved. It recognises about 45 tests: FBC, U&E, LFTs, bone profile, CRP, troponin, BNP, lactate and blood gas, coagulation, D-dimer, glucose, ketones and more, in SI or US units. High and low flags use the laboratory's range printed on the report when it is found; otherwise a typical adult range, labelled as such. Assay-specific tests are flagged only against the report's range.
- Safeguards for misreads: values the reader was unsure of, implausible values, and values whose flag disagrees with the report's own H or L are left unticked, each with the reason. Ranges read without their decimal points are corrected and labelled. Checked results go into the note under INVESTIGATIONS, grouped by panel. Tested on a fictional report image and a blurred phone photo of it.
- Lab results feed the scores: urea (CURB-65, Glasgow-Blatchford), haemoglobin (Glasgow-Blatchford), and troponin (HEART, only when the report gives the assay's upper limit).
- The observations photo reader also accepts a pasted screenshot, and leaves values it was unsure of unticked.
- New Diagnosis support card. It asks Claude (Anthropic) for the three most likely diagnoses from the current note: what fits, what argues against, and what would help distinguish them, plus must-not-miss diagnoses and missing information. This is the only feature that sends anything off the device. It needs the doctor's own Anthropic API key (kept for the session, or remembered on this device if chosen) and sends only after Send is tapped, showing first the exact text to be sent, with likely identifiers (names after a title, phone numbers, record numbers, emails, dates) removed and editable. Only diagnoses the doctor ticks go into the note under IMPRESSION. If the note changes afterwards, the card says the suggestions may be out of date. No treatment advice is requested.
- 15 new automated checks (84 in total). Diagnosis support is tested against a mocked API, not a live one.

## Version 53 — 24 November 2026
- Scores now go into the note automatically. The suggested scores for the presentation (for example HEART, Wells PE and PERC for chest pain, or Glasgow-Blatchford and NEWS2 for an upper GI bleed) appear under SCORES once every item is answered, and stay up to date as answers change. "Add the suggested scores to the note automatically" in the Scores card turns this off. A score removed from the note stays out for the encounter.
- Scores use answers given elsewhere on the page, shown for checking: observations and age; symptoms marked present or denied (haemoptysis, unilateral leg swelling, cough, new confusion, melaena, syncope); history chips (previous DVT or PE, active cancer, oestrogen therapy); and exam chips (Alert, Orientated, Drowsy, Confused) for NEWS2 consciousness, qSOFA mentation and CURB-65 confusion.
- Safety: each criterion of Wells PE, PERC, Wells DVT, CURB-65, McIsaac and Glasgow-Blatchford now needs an explicit Present or Absent. An unanswered criterion is never counted as absent, so no score reaches the note on assumptions. "Mark the rest absent" answers the remaining ones in one tap once reviewed.
- The Scores card lists each suggested score with how many items are left, and an Answer button.
- 8 new automated checks replace the earlier score interface checks (69 in total).

## Version 52 — 24 November 2026
- New presentation: Hypoxia. History (how the low SpO₂ was found, onset, usual SpO₂ or target range, home oxygen or ventilation, lung and heart disease, previous CO₂ retention, VTE risk factors, exposures including indoor fuel-burning heaters), 21 associated symptoms, and examination prompts for confirming the oximeter reading, work of breathing, colour, CO₂ retention, and heart failure and VTE signs. The bedside reminder covers the BTS oxygen targets (94–98%, or 88–92% if at risk of CO₂ retention) and oximeter limits (darker skin, carbon monoxide). Needs clinical review.
- New Scores card with 11 published scores: NEWS2, qSOFA, GCS, HEART, Wells PE, PERC, Wells DVT, CURB-65 (CRB-65 when urea is not available), Centor with McIsaac age adjustment, Glasgow-Blatchford, and 4AT. Suggested scores change with the presentation. Age and observations are filled in for checking. A score cannot be added until every item is answered, and goes into the note under SCORES only when added. If an input changes afterwards, the card says the note has an earlier version. Each score shows its published band and source, and says the band is not a recommendation. The calculations were checked against 41 worked cases, including every NEWS2 boundary.
- New "Read obs from a photo" in Observations. A photo or screenshot of the triage observations is read on this device by Tesseract.js (Apache-2.0, copied into vendor/tesseract; about 7 MB, downloaded on first use). Nothing is uploaded or saved, and the photo is discarded when the panel closes. Every value is shown beside the photo to check, and only ticked values fill the observations. It reads labelled values and flowsheet tables, °F (converted to °C), room air and oxygen devices. When a photo holds several sets of readings, one switch moves every value to the same set. GCS, glucose, pain and weight are listed but not filled. Tested on fictional screenshots, a dark-mode screen, a skewed and blurred phone photo, and a flowsheet table. Not tested on handwriting, which it is unlikely to read reliably.
- Copy section now includes Scores.
- 13 new automated checks (65 in total).

## Version 51 — 24 November 2026
Phone feel, checked against Emil Kowalski's skills (mobile-native, review-animations, break-ui; MIT licence). The look at rest is unchanged: the phone view is pixel-identical to version 50.
- Pulling down at the top of the page no longer triggers the browser's pull-to-refresh, which reloaded the page and wiped the encounter.
- Tapping a chip no longer leaves it stuck in its hover colour on phones and tablets. Hover colours now apply only with a mouse.
- No grey flash when tapping; buttons and chips respond as soon as the finger lands (no double-tap-zoom delay) and shrink slightly while pressed.
- Long-pressing a chip or button no longer selects its text. The note and all typed text stay selectable.
- Fields no longer zoom the page on landscape phones and tablets (16 px text on touch screens, not only on narrow ones).
- Removed the fade-in on cards while scrolling, and section jumps are now instant. Both repeat many times per encounter; the fade could leave a card half-visible after a jump.
- With very large phone text settings, "View note" no longer squeezes "Jump to section" to a sliver.
- Worst-case data (a 103-year-old with a long medication list, a long complaint and a long unbroken string) at 320 px, landscape and large text: nothing overflows or is clipped.
- Needs a real phone to confirm: pull-to-refresh, tap delay and long-press behaviour cannot be reproduced in a desktop browser.

## Version 50 — 23 November 2026
(Version 49, a new colour theme, was withdrawn; this builds on version 48.) Checked against the ui-ux-pro-max accessibility and form guidelines. No change to how the page looks or to clinical content.
- Privacy: the browser no longer keeps form history of what is typed. Before, Chrome and Safari could remember names, complaints and medicines and offer them as suggestions on the next patient.
- An out-of-range age or observation (for example HR 999) is now flagged in orange right under that field and announced to screen readers. Before, the note silently stopped updating and the only message sat under the note.
- On phones, a field reached with the keyboard or the "next field" arrows is no longer hidden behind the bottom bar (7 of the first 40 fields were).
- Number fields open the decimal keypad on phones.
- Each "Add detail" button now tells screen readers which question it belongs to.
- Already met before this version: text contrast, visible focus rings, labels on every field, 44 px touch targets on phones, reduced motion, no sideways scrolling.
- Five new automated checks (52 in total).

## Version 48 — 23 November 2026
Faster at the bedside. No change to clinical content.
- Observations moved to the top, under Patient, with an optional "Time seen" and a Now button. Vital signs now carry over when the presentation is changed. "TIME SEEN: hh:mm" heads the note when set.
- Copy by section: PC, HPC, Examination and Plan can each be copied on their own, beside "Copy all".
- Keyboard: each chip group and the symptom list is a single Tab stop, with arrow keys inside. Age to Complaint fell from 26 Tab presses to 8.
- After "My quick normal exam", a non-blocking prompt appears when the observations or symptoms sit oddly with the normal findings (heart rate of 100 or more or 50 or less, systolic BP under 90, respiratory rate of 22 or more, SpO₂ under 94 %, temperature of 38 °C or more, or reported breathlessness).
- "Mark the rest as asked and denied" only ever applies to symptoms on screen.
- Tried and withdrawn: showing only the first history items and symptoms. The lists are not in clinical priority order, and it hid red flags (for example fever, loin pain and new confusion in UTI / Dysuria).
- Nine new automated checks (47 in total).

## Version 47 — 21 November 2026
(Version 46 was withdrawn; this builds on version 45.)
- New "My quick normal exam" button in the examination section. One tap ticks Dr Levene's usual normal findings for general appearance, abdomen, respiratory and cardiovascular systems; a second tap removes them. It is applied only when tapped.
- General, abdominal, respiratory and cardiovascular sections now appear on every presentation, so the button works everywhere.
- "Air entry equal bilaterally" added as a respiratory normal finding.
- The button never overrides a real finding: if a contradicting abnormal finding is already ticked (for example Wheeze), the matching normal ("No wheeze") is skipped and the skipped items are listed. Ticking an abnormal finding now clears any normal finding it contradicts, in these four systems.
- Four new automated checks.

## Version 45 — 19 November 2026
Smoother pertinent positives and negatives. Still built only from what was selected.
- Positives: "Associated symptoms include dysuria, frequency and suprapubic pain." (was "The patient reports …").
- Negatives: "She denies fever, loin pain, or vaginal discharge." (was "Patient denies: fever, loin pain, and vaginal discharge."). "She" or "He" is used only when sex is entered; otherwise "The patient".
- History from someone else stays attributed: "According to the family member, associated symptoms include …" and "The family member reports no …".
- Uncertain and declined symptoms follow the negatives; the closing line also uses "She" or "He" when sex is entered.

## Version 44 — 19 November 2026
- New "Check wording" button under the note. It checks the HPC for spelling, grammar and wording (for example "She have" → "has", "Their was" → "There was", "too the back", repeated words, missing apostrophes, double spaces) and offers one-tap fixes, Ignore, and Add to dictionary.
- Uses Harper (https://github.com/Automattic/harper, Apache-2.0), served from this site and run on the device in a background worker. Nothing is sent. The first check downloads about 20 MB; later checks are near-instant and work offline.
- British English. Every word used in the site's own presentations, plus a list of common ED terms, drugs and abbreviations, is treated as correctly spelt.
- Applying a fix counts as editing the note, so automatic updates pause in the usual way. Suggestions clear when the note changes.
- Four new automated checks (33 in total).

## Version 43 — 19 November 2026
- New presentation: UTI / Dysuria, with bedside history, symptoms, examination by system (including urine dipstick and samples sent, renal angles, catheter findings and bladder scan) and a bedside reminder. 45 presentations in total.
- Ticking an examination finding now clears every finding it conflicts with, not only the first. For example, "No renal angle tenderness" clears both left and right.

## Version 42 — 14 November 2026
- Footer added: "Created by Dr. J. Levene", alongside the version number.

## Version 41 — 14 November 2026
Authorised by Dr J. Levene. No change to clinical content, note wording or safeguards.
- Works offline after the first visit and can be added to a phone's home screen. Only the page files are kept on the device, never anything entered.
- Page split into index.html, styles.css and app.js; the duplicate dist folder is removed.
- Phones: examination systems start collapsed (each shows how many items are recorded), and every button and field is at least 44 px tall. Median length per presentation on an iPhone fell from 15 screens to 12.
- Icon, page description and theme colour added.
- 28 automated checks with fictional entries (tests/run.js) run on every push to GitHub.

## Version 40 — 12 November 2026
- Every typed history box shows, in grey, the sentence it becomes in the note ("Note reads: The patient was found …"), so answers can be phrased to fit.
- The complaint box shows an example for the selected presentation, with a reminder that it reads after "presents with". The PC line is capitalised and drops a leading "a", "an" or "the".
- New "How the history was obtained" options (in person, by telephone, via an interpreter, from ambulance handover, from medical records, limited by the patient's condition). The note states who gave the history and how. "Family member" and "Bystander" added as history sources.
- Typed answers in the presentations added since version 35 now read as "Label: answer" instead of being forced into a sentence.
- Examination items where side matters have Right / Left / Bilateral chips.
- Examination lines made only of tapped findings no longer repeat the item label ("Pulse irregular." instead of "Pulse rhythm / heart sounds after fall — Pulse irregular."). Labels stay before typed text and Normal / Deferred / Declined.

## Version 39 — 12 November 2026
- New presentations: Unwitnessed fall and Surgical site infection, each with bedside history, symptoms, examination by system and a bedside reminder. 44 presentations in total.
- Anaphylaxis: "Conscious level" now offers its tick options (Alert, Confused, Drowsy, Unresponsive); it was showing as a plain text box.
- Examination section counts no longer count a ticked finding twice.

## Version 38 — 11 November 2026
Interface redesign aimed at fewer taps and less on-screen clutter. No change to clinical content, note wording or safeguards.
- The note builds itself as you enter findings; there is no Generate step. Typing in the note pauses automatic updates so edits are never overwritten without asking. "Update note" rebuilds it.
- Dropdowns with short lists are now one-tap chips (sex, age unit, history source, compliance, progression, site, character, severity 0–10, body habitus, general appearance). The duplicate dropdown under each chip row is gone.
- Each examination item has Normal / Deferred / Declined chips in place of a six-option dropdown.
- Optional "specify" boxes are tucked behind an "Add detail" chip until needed.
- One slim bar holds the presentation, section links and Clear encounter. The large banner is removed.
- Sections renamed in plain words (Patient, History, Symptoms, Examination, Plan); "Other relevant history" now sits inside History.
- Symptoms show present in teal and denied in slate; each examination system shows how many items are recorded.
- Instructions shortened to one line per section.

## Version 37 — 11 November 2026
- New presentations: Anaphylaxis, Itching, and Pain and aches, each with bedside history, symptoms, examination by system and a bedside reminder. 42 presentations in total.
- Interface: smooth scrolling; on desktop the presentation bar stays at the top with section pills (History, Details, Context, Symptoms, Examination, Plan) that highlight the current section; a thin bar at the top of the screen shows position in the form; cards fade in as they come into view; softer card shadows and hover, press and focus feedback on buttons and fields.
- Motion is switched off for anyone whose device is set to reduce motion.

## Version 36 — 11 November 2026
- Vital signs outside each field's limits (for example SpO₂ 150 %, a negative heart rate, or a Fahrenheit temperature) are refused with a message instead of being written into the note.
- "Mark all remaining symptoms as asked and denied" now asks for confirmation and states how many symptoms it will record.
- Generating again, or switching presentation, asks before replacing text typed directly into the note.
- The browser warns before a refresh or tab close discards an encounter in progress.
- Durations written as /24 are read as hours.
- Phones and tablets: a bar fixed to the bottom of the screen offers "Jump to section" and "Generate & view note"; input text is 16 px on phones so iPhones no longer zoom on every field.
- The note box has a screen-reader label.

## Version 35 — 11 November 2026
- New presentation: Foreign body (ear, nose, throat, airway, swallowed, eye, soft tissue, rectal, vaginal, urethral) with bedside history, symptoms, examination by system and a bedside reminder. 39 presentations in total.

## Version 34 — 10 November 2026
- Symptom hint now matches behaviour: only symptoms marked − are recorded as denied; unselected symptoms are omitted.
- Changing any entry after generating marks the note as out of date, and Copy is blocked until it is regenerated.
- Negative or implausible ages are rejected before a note is generated.
- Medication orders use the same rounding as the calculator (no more values such as 1.2300000000000002 mg).
- The calculator warns when the entered weight exceeds 150 kg.
- Clear encounter also unticks and closes the paediatric medication panel.
- Version and date shown at the foot of the page.
- No change to the 38 presentations, their history or examination content, or the consent checks.

## Version 33
Imported as published at levene-ed-history.jlevene1997.chatgpt.site (source commit 98012a08428574b60a7db80f51445b5d947b8d97).
