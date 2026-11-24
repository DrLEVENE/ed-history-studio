// Read vital signs from a photo or screenshot of the triage observations.
// Text recognition runs on this device with Tesseract.js (Apache-2.0, https://github.com/naptha/tesseract.js),
// copied into vendor/tesseract. The photo is never uploaded or saved: it stays in memory until the panel closes.
// Every value is shown beside the photo for the clinician to check before it fills the observations.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const btn = $('photo-btn'), file = $('photo-file'), panel = $('photo-panel');
  if (!btn || !file || !panel) return;

  // ---------- Parsing (also exported for tests) ----------
  const VITALS = [
    ['sbp', 'SBP', 'mmHg'], ['dbp', 'DBP', 'mmHg'], ['hr', 'HR', '/min'], ['rr', 'RR', '/min'], ['spo2', 'SpO₂', '%'], ['temp', 'Temperature', '°C']
  ];
  const LIMITS = { sbp: [1, 400], dbp: [1, 300], hr: [1, 400], rr: [1, 150], spo2: [1, 100], temp: [20, 45] };

  function clean(text) {
    return text
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/(\d)[oO](?=\d)/g, '$10').replace(/(?<=\d)[oO]\b/g, '0')         // O read in place of 0
      .replace(/(\d),(\d)\b/g, '$1.$2')                                         // decimal comma
      .replace(/[ \t]+/g, ' ');
  }

  const RX = {
    bp: /\b(?:N?I?BP|B\.\s?P\.?|blood\s*pressure|ABP)\b[^\d\n]{0,15}(?<![A-Za-z])(\d{2,3})\s*(?:\/|\\|\||over)\s*(\d{2,3})/gi,
    sbp: /\b(?:SBP|systolic(?:\s*BP)?|sys)\b[^\d\n]{0,12}(?<![A-Za-z])(\d{2,3})\b/gi,
    dbp: /\b(?:DBP|diastolic(?:\s*BP)?|dia)\b[^\d\n]{0,12}(?<![A-Za-z])(\d{2,3})\b/gi,
    hr: /\b(?:HR|H\.R\.?|heart\s*rate|pulse(?:\s*rate)?|PR|P(?=\s*[:=]))\b[^\d\n]{0,12}(?<![A-Za-z])(\d{2,3})\b/gi,
    rr: /\b(?:RR|R\.R\.?|resp(?:iratory)?\.?(?:\s*rate)?|resps|R(?=\s*[:=]))\b[^\d\n]{0,12}(?<![A-Za-z])(\d{1,2})\b/gi,
    spo2: /(?:\bSp\s?[O0o]{1,2}\s?[2z₂]|\bSa\s?[O0o]{1,2}\s?[2z₂]|\b[O0]2\s*sat(?:uration)?s?|\bsats?\b|\boxygen\s*sat(?:uration)?s?|\bpulse\s*ox(?:imetry)?)[^\d\n]{0,12}(?<![A-Za-z])(\d{2,3})\b/gi,
    temp: /\b(?:temp(?:erature)?|tympanic|T(?=\s*[:=]))\b\.?[^\d\n]{0,12}(?<![A-Za-z])(\d{2,3}(?:\.\d{1,2})?)\s*(°?\s*[CF])?/gi,
    gcs: /\bGCS\b[^\d\n]{0,10}(?<![A-Za-z])(\d{1,2})\b/gi,
    glucose: /\b(?:CBG|RBS|BGL|BM|glucose|blood\s*sugar|sugar)\b[^\d\n]{0,12}(?<![A-Za-z])(\d{1,3}(?:\.\d)?)\b/gi,
    pain: /\bpain(?:\s*score)?\b[^\d\n]{0,10}(?<![A-Za-z])(\d{1,2})\s*\/\s*10/gi,
    weight: /\b(?:weight|wt)\b[^\d\n]{0,10}(?<![A-Za-z])(\d{1,3}(?:\.\d)?)\s*kg/gi
  };

  function all(rx, text, map) { rx.lastIndex = 0; const out = []; let m; while ((m = rx.exec(text))) out.push(map(m)); return out; }

  // Flowsheet layout: a header row of labels with the values on the row(s) below, in the same order.
  const HEAD = [['bp', /^(?:N?I?BP|B\/P)$/i], ['sbp', /^(?:SBP|sys(?:tolic)?)$/i], ['dbp', /^(?:DBP|dia(?:stolic)?)$/i], ['hr', /^(?:HR|pulse|P)$/i],
    ['rr', /^(?:RR|resp(?:s|irations?)?|R)$/i], ['spo2', /^(?:Sp[O0o]{0,2}[2z₂]|SpO₂|sats?|[O0]2sat|Sa[O0o]{1,2}2)$/i], ['temp', /^(?:temp|T|temperature)$/i],
    ['time', /^time$/i], ['gcs', /^GCS$/i], ['pain', /^pain$/i], ['skip', /^(?:date|mmHg|bpm|%|°C|°F|C|F|\/min)$/i]];
  function table(text, add) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      const toks = lines[i].split(/\s*\|\s*|\s+/).map(t => t.replace(/[:%()]/g, '')).filter(Boolean);
      const keys = toks.map(t => (HEAD.find(([, rx]) => rx.test(t)) || [null])[0]);
      const cols = keys.filter(k => k !== 'skip');          // unrecognised headings still take a column
      const real = cols.filter(Boolean);
      if (real.length < 3 || real.length < cols.length * 0.6) continue;
      for (let j = i + 1; j < lines.length; j++) {
        const vals = lines[j].split(/\s*\|\s*|\s+/).filter(t => /^\d{1,3}(?:[.:\/]\d{1,3})?%?$/.test(t)).map(t => t.replace('%', ''));
        if (vals.length < cols.length - 1) break;
        if (vals.length !== cols.length) continue;
        cols.forEach((k, n) => {
          const v = vals[n];
          if (k === 'bp') { const m = v.match(/^(\d{2,3})\/(\d{2,3})$/); if (m && +m[1] > +m[2]) { add('sbp', +m[1]); add('dbp', +m[2]); } }
          else if (['sbp', 'dbp', 'hr', 'rr', 'spo2'].includes(k) && /^\d+$/.test(v)) add(k, +v);
          else if (k === 'temp' && /^\d{2,3}(\.\d)?$/.test(v)) { const x = +v; if (x >= 90 && x <= 110) add('temp', Math.round((x - 32) * 5 / 9 * 10) / 10, 'converted from °F'); else add('temp', x); }
        });
      }
    }
  }

  function parse(raw) {
    const text = clean(raw), found = {}, notes = {};
    const add = (k, v, note) => { if (v == null || !Number.isFinite(v)) return; (found[k] = found[k] || []); if (!found[k].includes(v)) found[k].push(v); if (note) notes[k] = note; };
    table(text, add);
    all(RX.bp, text, m => [Number(m[1]), Number(m[2])]).forEach(([s, d]) => { if (s > d) { add('sbp', s); add('dbp', d); } });
    if (!found.sbp) {
      all(RX.sbp, text, m => Number(m[1])).forEach(v => add('sbp', v));
      all(RX.dbp, text, m => Number(m[1])).forEach(v => add('dbp', v));
    }
    if (!found.sbp) {   // an unlabelled "128/76" that looks like a blood pressure
      all(/(?<![\d./])(\d{2,3})\s*\/\s*(\d{2,3})(?![\d/])/g, text, m => [Number(m[1]), Number(m[2])])
        .filter(([s, d]) => s >= 60 && s <= 260 && d >= 30 && d <= 160 && s > d)
        .forEach(([s, d]) => { add('sbp', s, 'found without a BP label'); add('dbp', d, 'found without a BP label'); });
    }
    all(RX.hr, text, m => Number(m[1])).forEach(v => add('hr', v));
    all(RX.rr, text, m => Number(m[1])).forEach(v => add('rr', v));
    all(RX.spo2, text, m => Number(m[1])).forEach(v => add('spo2', v));
    all(RX.temp, text, m => [Number(m[1]), (m[2] || '').replace(/[°\s]/g, '').toUpperCase()]).forEach(([v, u]) => {
      if (u === 'F' || (!u && v >= 90 && v <= 110)) add('temp', Math.round((v - 32) * 5 / 9 * 10) / 10, 'converted from °F');
      else add('temp', v);
    });
    const extra = [];
    all(RX.gcs, text, m => Number(m[1])).filter(v => v >= 3 && v <= 15).forEach(v => extra.push('GCS ' + v));
    all(RX.glucose, text, m => m[1]).forEach(v => extra.push('glucose ' + v));
    all(RX.pain, text, m => m[1]).forEach(v => extra.push('pain ' + v + '/10'));
    all(RX.weight, text, m => m[1]).forEach(v => extra.push('weight ' + v + ' kg'));
    let oxygen = '', flow = '';
    if (/\b(?:room\s*air|on\s*air|R\/A|RA)\b/i.test(text)) oxygen = 'Room air';
    else if (/\b(?:non[-\s]?rebreather|NRB(?:M)?|reservoir\s*mask)\b/i.test(text)) oxygen = 'Non-rebreather mask';
    else if (/\b(?:nasal\s*(?:cannula|prongs)|NC|NP)\b/i.test(text)) oxygen = 'Nasal cannula';
    else if (/\b(?:face\s*mask|venturi|FM|simple\s*mask)\b/i.test(text)) oxygen = 'Face mask';
    else if (/\b(?:NIV|BiPAP|CPAP)\b/i.test(text)) oxygen = 'NIV';
    const l = text.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:L|litres?|liters?)\s*(?:\/\s*min|pm|per\s*min)?\b/i);
    if (l && oxygen !== 'Room air') { flow = l[1] + ' L/min'; if (!oxygen) oxygen = 'Other'; }
    if (/\bFi\s?O2\b[^\d\n]{0,8}(\d{2,3})\s*%/i.test(text)) { const f = text.match(/\bFi\s?O2\b[^\d\n]{0,8}(\d{2,3})\s*%/i); flow = (flow ? flow + ', ' : '') + 'FiO₂ ' + f[1] + '%'; if (!oxygen) oxygen = 'Other'; }
    return { found, notes, extra: [...new Set(extra)], oxygen, flow };
  }

  // ---------- Recognition ----------
  let loading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (loading) return loading;
    loading = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = 'vendor/tesseract/tesseract.min.js';
      s.onload = () => ok(window.Tesseract); s.onerror = () => { loading = null; fail(new Error('The text reader could not load. Reload the page while online once, then try again.')); };
      document.head.append(s);
    });
    return loading;
  }

  // Greyscale and scale so small screenshots are large enough to read and big photos stay fast.
  async function prepare(blob) {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const longest = Math.max(bmp.width, bmp.height);
    const scale = longest < 1400 ? Math.min(2, 2000 / longest) : longest > 2600 ? 2600 / longest : 1;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = y; if (y < 110) dark++; }
    if (dark > d.length / 4 * 0.5) for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255 - d[i]; }   // dark-mode screens
    g.putImageData(img, 0, 0);
    return c;
  }

  async function recognise(blob, progress) {
    const T = await loadTesseract();
    const base = new URL('vendor/tesseract/', location.href).href;
    const worker = await T.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core/', langPath: base + 'lang', gzip: true,
      cacheMethod: 'none', workerBlobURL: false,
      logger: m => { if (m.status === 'recognizing text') progress('Reading the text… ' + Math.round(m.progress * 100) + '%'); else if (/load/.test(m.status)) progress('Preparing the text reader on this device…'); }
    });
    try {
      const canvas = await prepare(blob);
      await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
      const sparse = (await worker.recognize(canvas)).data.text;
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
      const block = (await worker.recognize(canvas)).data.text;
      return block + '\n' + sparse;
    } finally { await worker.terminate(); }
  }

  // ---------- Panel ----------
  let photoURL = '';
  function close() {
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = ''; file.value = ''; panel.replaceChildren(); btn.disabled = false; btn.focus();
  }
  const obsField = k => document.querySelector('#obs-slot [id$="-v-' + k + '"]');

  function show(blob) {
    photoURL = URL.createObjectURL(blob);
    panel.replaceChildren();
    const wrap = document.createElement('div'); wrap.className = 'photo-wrap';
    const fig = document.createElement('a'); fig.href = photoURL; fig.target = '_blank'; fig.rel = 'noopener'; fig.className = 'photo-thumb';
    fig.setAttribute('aria-label', 'Open the photo full size to compare');
    const img = document.createElement('img'); img.src = photoURL; img.alt = 'The photo being read'; fig.append(img);
    const body = document.createElement('div'); body.className = 'photo-body';
    const status = document.createElement('p'); status.className = 'hint'; status.id = 'photo-status'; status.setAttribute('role', 'status');
    status.textContent = 'Preparing the text reader on this device…';
    body.append(status); wrap.append(fig, body); panel.append(wrap);
    return { body, status };
  }

  async function run(blob) {
    btn.disabled = true;
    const { body, status } = show(blob);
    let text = '';
    try { text = await recognise(blob, t => { status.textContent = t; }); }
    catch (e) { status.textContent = (e && e.message) || 'The photo could not be read.'; body.append(closeButton('Close')); btn.disabled = false; return; }
    review(parse(text), text, body, status);
  }

  function closeButton(label) { const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = label; b.onclick = close; return b; }

  function review(r, text, body, status) {
    const keys = VITALS.filter(([k]) => r.found[k]);
    status.textContent = keys.length
      ? 'Check each value against the photo. Only ticked values fill the observations.'
      : 'No observations were recognised. Try a sharper, straight-on photo in good light, or enter them by hand.';
    const list = document.createElement('div'); list.className = 'photo-list';
    const sets = Math.max(0, ...keys.map(([k]) => r.found[k].length));
    if (sets > 1) {   // several readings (e.g. a flowsheet): switch them together so one set is never mixed with another
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.id = 'photo-set-lbl'; lbl.textContent = 'This photo has ' + sets + ' sets of readings. Use:';
      const row = document.createElement('div'); row.className = 'quick-options'; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', lbl.id);
      for (let n = 0; n < sets; n++) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = ['1st', '2nd', '3rd'][n] || (n + 1) + 'th'; b.setAttribute('aria-pressed', String(n === 0));
        b.onclick = () => {
          row.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
          keys.forEach(([k]) => { const x = r.found[k][n], [lo, hi] = LIMITS[k]; const alt = list.querySelector('.photo-alt[data-k="' + k + '"]');
            const btn = alt && [...alt.querySelectorAll('button')].find(o => o.textContent === String(x));
            if (btn) btn.click(); else if (x == null) { const cb = list.querySelector('input[type=checkbox][data-k="' + k + '"]'); if (cb) cb.checked = false; } });
        };
        row.append(b);
      }
      const box = document.createElement('div'); box.className = 'photo-sets'; box.append(lbl, row); body.append(box);
    }
    keys.forEach(([k, name, unit]) => {
      const vals = r.found[k], [lo, hi] = LIMITS[k], v = vals[0], ok = v >= lo && v <= hi;
      const current = obsField(k) ? obsField(k).value : '';
      const row = document.createElement('div'); row.className = 'photo-row';
      const lab = document.createElement('label'); lab.className = 'photo-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = ok; cb.dataset.k = k;
      lab.append(cb, name);
      const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.inputMode = 'decimal'; inp.value = String(v); inp.dataset.k = k;
      inp.setAttribute('aria-label', name + ' (' + unit + ') read from the photo');
      inp.oninput = () => { cb.checked = inp.value !== ''; };
      const u = document.createElement('span'); u.className = 'photo-unit'; u.textContent = unit;
      const notes = [];
      if (!ok) notes.push('outside ' + lo + '–' + hi + ', not ticked');
      if (r.notes[k]) notes.push(r.notes[k]);
      if (current && current !== String(v)) notes.push('replaces ' + current);
      row.append(lab, inp, u);
      if (vals.length > 1) {
        const alt = document.createElement('span'); alt.className = 'photo-alt'; alt.dataset.k = k; alt.append('Also read: ');
        vals.forEach(x => { const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = String(x);
          b.setAttribute('aria-label', 'Use ' + x + ' for ' + name); b.setAttribute('aria-pressed', String(x === v));
          b.onclick = () => { inp.value = String(x); cb.checked = x >= lo && x <= hi; alt.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', String(o === b))); };
          alt.append(b); });
        row.append(alt);
      }
      if (notes.length) { const n = document.createElement('span'); n.className = 'photo-note'; n.textContent = notes.join('; '); row.append(n); }
      list.append(row);
    });
    if (r.oxygen && obsField('oxygen')) {
      const row = document.createElement('div'); row.className = 'photo-row';
      const lab = document.createElement('label'); lab.className = 'photo-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.k = 'oxygen'; cb.dataset.value = r.oxygen; cb.dataset.flow = r.flow;
      lab.append(cb, 'Oxygen'); const t = document.createElement('span'); t.className = 'photo-unit'; t.textContent = r.oxygen + (r.flow ? ', ' + r.flow : '');
      row.append(lab, t); list.append(row);
    }
    body.append(list);
    if (r.extra.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Also seen, not filled (enter where needed): ' + r.extra.join(', ') + '.'; body.append(p); }
    const raw = document.createElement('details'); raw.className = 'photo-raw';
    const sum = document.createElement('summary'); sum.textContent = 'Text read from the photo';
    const pre = document.createElement('pre'); pre.textContent = text.split('\n').filter(l => l.trim()).slice(0, 60).join('\n');
    raw.append(sum, pre); body.append(raw);
    const actions = document.createElement('div'); actions.className = 'actions';
    if (keys.length || r.oxygen) {
      const fill = document.createElement('button'); fill.type = 'button'; fill.id = 'photo-fill'; fill.textContent = 'Fill observations';
      fill.onclick = () => { apply(list); close(); $('photo-done').textContent = 'Observations filled from the photo. The photo has been discarded.'; };
      actions.append(fill);
    }
    actions.append(closeButton(keys.length ? 'Discard' : 'Close'));
    body.append(actions);
    btn.disabled = false;
  }

  function apply(list) {
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (!cb.checked) return;
      const k = cb.dataset.k, target = obsField(k);
      if (!target) return;
      if (k === 'oxygen') {
        target.value = cb.dataset.value; target.dispatchEvent(new Event('change', { bubbles: true }));
        const flow = obsField('flow'); if (flow && cb.dataset.flow) { flow.value = cb.dataset.flow; flow.dispatchEvent(new Event('input', { bubbles: true })); }
        return;
      }
      const inp = list.querySelector('input[type=number][data-k="' + k + '"]');
      target.value = inp.value; target.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  btn.onclick = () => { $('photo-done').textContent = ''; file.click(); };
  file.onchange = () => { const f = file.files && file.files[0]; if (f) run(f); };
  $('reset').addEventListener('click', () => setTimeout(() => { if (!panel.children.length) return; close(); }, 0));

  window.edPhoto = { parse, run };
})();
