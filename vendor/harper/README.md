# Harper grammar checker (vendored)

Unmodified browser build of [harper.js](https://github.com/Automattic/harper) version 3.2.0, copied from npm by `.github/workflows/vendor-harper.yml`. Licensed under the Apache License 2.0 (see `LICENSE`).

Used by `grammar.js` for the "Check wording" button. It runs on the device in a background worker; no text is sent anywhere.

Only the files the site needs are kept: `index.js`, `binary.js`, `BinaryModule-*.js` and `harper_wasm_bg.wasm`.
