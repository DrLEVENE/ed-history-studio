# ED History Studio

A bedside tool for drafting emergency department histories and examination notes. Everything runs in the browser: no patient entries are stored or sent anywhere.

Live site: https://drlevene.github.io/ed-history-studio/

- Works offline after the first visit, and can be added to a phone's home screen.
- "Check wording" suggests spelling, grammar and wording fixes for the HPC using [Harper](https://github.com/Automattic/harper) (Apache-2.0), which runs on the device. The note is never sent anywhere.
- "Read obs from a photo" reads a photo or screenshot of triage observations with [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0), on the device. The photo is never uploaded or saved, and every value is checked by the clinician before it fills the form.
- The Scores card has 11 published scores (NEWS2, qSOFA, GCS, HEART, Wells PE, PERC, Wells DVT, CURB-65, McIsaac, Glasgow-Blatchford, 4AT). The definitions are in `scores.js`, each with its source.
- No build step. Edit `app.js` (content and behaviour), `scores.js` (scores), `photo.js` (photo reading) and `styles.css` (appearance).
- Automated checks: `npm install`, then `npm test`. They run on GitHub for every push.

See `HANDOFF.md` for the rules to preserve when editing and `CHANGELOG.md` for version history.

This tool documents the clinician's own entries. It does not assess severity, recommend treatment, or select or validate doses.
