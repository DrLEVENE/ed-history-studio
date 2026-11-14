# ED History Studio — version 42

Open index.html directly in a browser, or use the live site. No build or dependency installation is needed to run it.

Files:
- index.html: page markup only.
- styles.css: all styling.
- app.js: all presentation content and behaviour.
- sw.js, manifest.webmanifest and the PNG icons: offline use and "add to home screen". sw.js keeps a copy of these page files only, never anything entered. Change the CACHE name in sw.js when releasing a new version.
- tests/run.js: automated checks with fictional entries. Run `npm install` once, then `npm test`. They also run on GitHub for every push (.github/workflows/test.yml).

For Claude: edit app.js and styles.css. Preserve the 44 alphabetical complaints, complaint-specific history and examination systems, and the PC × duration section before the HPC. The HPC opens with demographics, chronic illnesses and maintenance medication. Additional context comes before associated symptoms. Only explicitly denied symptoms enter the negatives. Keep patient entries in browser memory and preserve consent checks for intimate findings. Keep the page free of external fonts, scripts and network requests.

The note rebuilds itself after every entry (liveUpdate) and pauses once the clinician types in the note. Short dropdowns are shown as chips by chipify(); the original select stays in the page as the stored value, so read and write values through the select, not the chips.

Run `npm test` before publishing, and add a check to tests/run.js for any new safeguard.

Bedside reminders added from version 35 onwards (Foreign body, Anaphylaxis, Itching, Pain and aches, Unwitnessed fall, Surgical site infection) have not yet had clinical review.
