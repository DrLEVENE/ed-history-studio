# Changelog

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
