# ED History Studio

A bedside tool for drafting emergency department histories and examination notes. Everything runs in the browser: no patient entries are stored or sent anywhere.

Live site: https://drlevene.github.io/ed-history-studio/

- Works offline after the first visit, and can be added to a phone's home screen.
- No build step. Edit `app.js` (content and behaviour) and `styles.css` (appearance).
- Automated checks: `npm install`, then `npm test`. They run on GitHub for every push.

See `HANDOFF.md` for the rules to preserve when editing and `CHANGELOG.md` for version history.

This tool documents the clinician's own entries. It does not assess severity, recommend treatment, or select or validate doses.
