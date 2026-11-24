// Read laboratory results from a photo, an uploaded file, a pasted screenshot or pasted text.
// Images are read on this device by the same text reader as the observations (photo.js); nothing is uploaded or saved.
// The clinician checks every value before it goes into the note under INVESTIGATIONS.
// Ranges: the laboratory's own range printed on the report is used when it is found; otherwise a typical adult range,
// which the review always labels as such. Assay-specific tests (troponin, D-dimer, BNP, lipase, coagulation) are only
// flagged against the range printed on the report.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('labs-card');
  if (!card) return;

  // k, name in the note, group, alias pattern, units [[label, test, factor to SI, typical range in that unit]]
  // The first unit is the default (SI). A unit applies when its label text follows the value, or when test(value) is true.
  const U = (label, test, toSI, range) => ({ label, test, toSI, range });
  const A = [
    ['nt', 'NT-proBNP', 'Cardiac', /\bNT[-\s]?pro[-\s]?BNP\b/i, [U('ng/L', null, 1, null), U('pg/mL', null, 1, null)]],
    ['bnp', 'BNP', 'Cardiac', /\bBNP\b/i, [U('ng/L', null, 1, null), U('pg/mL', null, 1, null)]],
    ['trop', 'troponin', 'Cardiac', /\b(?:hs[-\s]?)?(?:c?Tn[IT]|troponin(?:\s*[IT])?)\b/i, [U('ng/L', null, 1, null), U('ng/mL', v => v < 5 && v % 1 !== 0, 1000, null)]],
    ['hba1c', 'HbA1c', 'Other', /\bHb\s?A1c\b/i, [U('mmol/mol', v => v > 20, 1, [20, 41]), U('%', v => v <= 20, 1, [4, 6])]],
    ['hb', 'Hb', 'FBC', /\b(?:ha?emoglobin|Hb|HGB)\b(?!\s?A1c)/i, [U('g/dL', v => v <= 30, 1, [12, 17]), U('g/L', v => v > 30, 0.1, [120, 170])]],
    ['wcc', 'WCC', 'FBC', /\b(?:WBC|WCC|white\s*(?:blood\s*)?(?:cell|count)s?(?:\s*count)?|leu[ck]ocytes)\b/i, [U('×10⁹/L', v => v < 300, 1, [4, 11]), U('/µL', v => v >= 300, 0.001, [4000, 11000])]],
    ['neut', 'neutrophils', 'FBC', /\b(?:neutrophils?|neut|ANC)\b(?!\s*%)/i, [U('×10⁹/L', v => v < 100, 1, [2, 7.5]), U('/µL', v => v >= 100, 0.001, [2000, 7500])]],
    ['lymph', 'lymphocytes', 'FBC', /\b(?:lymphocytes?|lymphs?)\b(?!\s*%)/i, [U('×10⁹/L', v => v < 100, 1, [1, 4]), U('/µL', v => v >= 100, 0.001, [1000, 4000])]],
    ['plt', 'platelets', 'FBC', /\b(?:platelets?|PLT|plt\s*count)\b/i, [U('×10⁹/L', v => v < 5000, 1, [150, 400]), U('/µL', v => v >= 5000, 0.001, [150000, 400000])]],
    ['mcv', 'MCV', 'FBC', /\bMCV\b/i, [U('fL', null, 1, [80, 100])]],
    ['hct', 'haematocrit', 'FBC', [/\bha?ematocrit\b/i, /\b(?:HCT|Hct|PCV)\b/], [U('L/L', v => v <= 1, 1, [0.36, 0.5]), U('%', v => v > 1, 0.01, [36, 50])]],
    ['na', 'Na', 'U&E', [/\bsodium\b/i, /\bNa\+?(?=[^A-Za-z]|$)/], [U('mmol/L', null, 1, [135, 145])]],
    ['k', 'K', 'U&E', [/\bpotassium\b/i, /\bK\+?(?=[^A-Za-z]|$)/], [U('mmol/L', null, 1, [3.5, 5.3])]],
    ['cl', 'Cl', 'U&E', [/\bchloride\b/i, /\bCl-?(?=[^A-Za-z]|$)/], [U('mmol/L', null, 1, [98, 107])]],
    ['bun', 'BUN', 'U&E', /\bBUN\b/i, [U('mg/dL', null, 1 / 2.8, [7, 20])]],
    ['urea', 'urea', 'U&E', /\burea\b(?!\s*nitrogen)/i, [U('mmol/L', v => v < 40, 1, [2.5, 7.8]), U('mg/dL', v => v >= 40, 1 / 6, [15, 47])]],
    ['egfr', 'eGFR', 'U&E', /\beGFR\b/i, [U('mL/min/1.73m²', null, 1, null)]],
    ['creat', 'creatinine', 'U&E', [/\b(?:creatinine|creat)\b/i, /\bCr\b/], [U('µmol/L', v => v >= 20, 1, [45, 110]), U('mg/dL', v => v < 20, 88.4, [0.5, 1.25])]],
    ['adjca', 'adjusted calcium', 'Bone', /\b(?:adjusted|corrected|adj\.?|corr\.?)\s*(?:calcium|Ca)\b/i, [U('mmol/L', v => v < 4, 1, [2.2, 2.6]), U('mg/dL', v => v >= 4, 0.25, [8.8, 10.4])]],
    ['ca', 'calcium', 'Bone', [/\bcalcium\b/i, /\bCa\+?\+?(?=[^A-Za-z]|$)/], [U('mmol/L', v => v < 4, 1, [2.2, 2.6]), U('mg/dL', v => v >= 4, 0.25, [8.8, 10.4])]],
    ['mg', 'magnesium', 'Bone', [/\bmagnesium\b/i, /\bMg\+?\+?(?=[^A-Za-z/]|$)/], [U('mmol/L', v => v < 1.6, 1, [0.7, 1]), U('mg/dL', v => v >= 1.6, 0.41, [1.7, 2.4])]],
    ['phos', 'phosphate', 'Bone', /\b(?:phosphate|phos|PO4)\b/i, [U('mmol/L', v => v < 2.2, 1, [0.8, 1.5]), U('mg/dL', v => v >= 2.2, 0.32, [2.5, 4.5])]],
    ['glu', 'glucose', 'Other', /\b(?:glucose|GLU|CBG|RBS|blood\s*sugar)\b/i, [U('mmol/L', v => v < 35, 1, [3.9, 7.8]), U('mg/dL', v => v >= 35, 1 / 18, [70, 140])]],
    ['crp', 'CRP', 'Inflammation', /\b(?:CRP|C[-\s]?reactive\s*protein)\b/i, [U('mg/L', null, 1, [0, 5])]],
    ['esr', 'ESR', 'Inflammation', /\bESR\b/i, [U('mm/h', null, 1, null)]],
    ['lact', 'lactate', 'Gas', /\b(?:lactate|lactic\s*acid|lac)\b/i, [U('mmol/L', null, 1, [0.5, 2])]],
    ['ph', 'pH', 'Gas', /\bpH\b/, [U('', null, 1, [7.35, 7.45])]],
    ['pco2', 'pCO₂', 'Gas', /\b(?:p[av]?\s?CO2|Pa\s?CO2|Pv\s?CO2|pCO₂)\b/i, [U('kPa', v => v < 20, 1, [4.7, 6]), U('mmHg', v => v >= 20, 0.133, [35, 45])]],
    ['po2', 'pO₂', 'Gas', /\b(?:p[av]?\s?O2|Pa\s?O2|Pv\s?O2|pO₂)\b/i, [U('kPa', v => v < 40, 1, null), U('mmHg', v => v >= 40, 0.133, null)]],
    ['hco3', 'HCO₃', 'Gas', [/\b(?:HCO3-?|bicarbonate|bicarb|TCO2|total\s*CO2)\b/i, /(?<![pP][aAvV]?\s?)\bCO2\b/], [U('mmol/L', null, 1, [22, 29])]],
    ['be', 'base excess', 'Gas', [/\bbase\s*excess\b/i, /\bBE(?:\s*\(?(?:ecf|b)\)?)?\b/], [U('mmol/L', null, 1, [-2, 2])]],
    ['ket', 'ketones', 'Other', /\b(?:ketones?|beta[-\s]?hydroxybutyrate|β[-\s]?hydroxybutyrate|BHB)\b/i, [U('mmol/L', null, 1, [0, 0.6])]],
    ['bili', 'bilirubin', 'LFT', /\b(?:(?:total\s*)?bilirubin(?:\s*total)?|T\.?\s?bili|TBIL)\b(?!\s*(?:direct|conj|indirect))/i, [U('µmol/L', v => v >= 3, 1, [3, 21]), U('mg/dL', v => v < 3, 17.1, [0.2, 1.2])]],
    ['alt', 'ALT', 'LFT', /\b(?:ALT|SGPT|alanine\s*(?:amino)?transferase)\b/i, [U('U/L', null, 1, [0, 40])]],
    ['ast', 'AST', 'LFT', /\b(?:AST|SGOT|aspartate\s*(?:amino)?transferase)\b/i, [U('U/L', null, 1, [0, 40])]],
    ['alp', 'ALP', 'LFT', /\b(?:ALP|alk(?:aline)?\s*phos(?:phatase)?)\b/i, [U('U/L', null, 1, [30, 130])]],
    ['ggt', 'GGT', 'LFT', /\b(?:GGT|gamma[-\s]?GT|γ[-\s]?GT)\b/i, [U('U/L', null, 1, [0, 60])]],
    ['alb', 'albumin', 'LFT', [/\balbumin\b/i, /\bALB\b/], [U('g/L', v => v >= 10, 1, [35, 50]), U('g/dL', v => v < 10, 10, [3.5, 5])]],
    ['amyl', 'amylase', 'Other', /\bamylase\b/i, [U('U/L', null, 1, [30, 110])]],
    ['lip', 'lipase', 'Other', /\blipase\b/i, [U('U/L', null, 1, null)]],
    ['ck', 'CK', 'Other', /\b(?:CK|CPK|creatine\s*(?:phospho)?kinase)\b/i, [U('U/L', null, 1, null)]],
    ['inr', 'INR', 'Coagulation', /\bINR\b/i, [U('', null, 1, [0.8, 1.2])]],
    ['pt', 'PT', 'Coagulation', [/\bprothrombin\s*time\b/i, /\bPT\b/], [U('s', null, 1, null)]],
    ['aptt', 'APTT', 'Coagulation', /\b(?:a?PTT|APTT|activated\s*partial\s*thromboplastin\s*time)\b/i, [U('s', null, 1, null)]],
    ['ddim', 'D-dimer', 'Coagulation', /\bD[-\s]?dimer\b/i, [U('', null, 1, null), U('mg/L FEU', null, 1, null), U('ng/mL FEU', null, 1, null), U('µg/mL FEU', null, 1, null), U('ng/mL DDU', null, 1, null)]],
    ['hcg', 'β-hCG', 'Other', /\b(?:β|beta|b)[-\s]?hCG\b|\bhCG\b/i, [U('IU/L', null, 1, null)]]
  ].map(([k, name, group, rx, units]) => ({ k, name, group, rx, units }));
  const BY = Object.fromEntries(A.map(a => [a.k, a]));
  // Values outside these limits (in SI units) are almost certainly misread; they are left unticked.
  const PLAUSIBLE = { hb: [3, 25], wcc: [0.1, 300], neut: [0, 250], lymph: [0, 250], plt: [1, 2500], mcv: [50, 140], hct: [0.08, 0.8], na: [100, 185], k: [1.5, 9.5], cl: [60, 140],
    urea: [0.3, 70], bun: [1, 200], creat: [15, 3000], adjca: [1, 5], ca: [1, 5], mg: [0.1, 4], phos: [0.1, 6], glu: [0.5, 80], crp: [0, 700], lact: [0, 30], ph: [6.6, 7.9],
    pco2: [1, 25], hco3: [2, 60], be: [-35, 35], ket: [0, 15], bili: [1, 1000], alt: [1, 20000], ast: [1, 20000], alp: [5, 5000], ggt: [1, 5000], alb: [5, 70], inr: [0.5, 15], egfr: [1, 200] };
  const GROUPS = ['FBC', 'U&E', 'LFT', 'Bone', 'Inflammation', 'Cardiac', 'Coagulation', 'Gas', 'Other'];
  const NUM = '([<>≤≥]?\\s?-?\\d+(?:\\.\\d+)?)';

  // ---------- Parsing ----------
  function clean(text) {
    return text.replace(/(\d)[oO](?=\d)/g, '$10').replace(/(\d),(\d)/g, '$1.$2').replace(/[ \t]+/g, ' ').replace(/[–—]/g, '-');
  }
  function unitFor(a, value, after) {
    const t = after.toLowerCase().replace(/\s/g, '');
    for (const u of a.units) if (u.label && t.startsWith(u.label.toLowerCase().replace(/\s/g, ''))) return u;
    if (/^(?:x?10\^?9|10\*9|10e9|k\/[uµ]l|x?10\^?3\/[uµ]l)/.test(t) && a.units[0].label.includes('10⁹')) return a.units[0];
    if (/^mg\/dl/.test(t)) return a.units.find(u => u.label === 'mg/dL') || a.units[0];
    if (/^mmol\/l/.test(t)) return a.units.find(u => u.label === 'mmol/L') || a.units[0];
    if (/^g\/l/.test(t)) return a.units.find(u => u.label === 'g/L') || a.units[0];
    if (/^g\/dl/.test(t)) return a.units.find(u => u.label === 'g/dL') || a.units[0];
    return a.units.find(u => u.test && u.test(value)) || a.units[0];
  }

  function parse(raw) {
    const out = {}, lines = clean(raw).split('\n');
    for (let line of lines) {
      for (const a of A) {
        if (out[a.k]) continue;
        const m = (Array.isArray(a.rx) ? a.rx : [a.rx]).map(rx => line.match(rx)).filter(Boolean).sort((x, y) => x.index - y.index)[0];
        if (!m) continue;
        const rest = line.slice(m.index + m[0].length);
        const v = rest.match(new RegExp('^[^\\d<>≤≥\\n-]{0,14}?' + NUM + '\\s*(\\*|H{1,2}(?![\\/\\w])|L{1,2}(?![\\/\\w])|high\\b|low\\b)?'));
        if (!v) continue;
        const rawVal = v[1].replace(/\s/g, ''), cmp = rawVal.match(/^[<>≤≥]/) ? rawVal[0] : '', value = Number(rawVal.replace(/^[<>≤≥]/, ''));
        if (!Number.isFinite(value)) continue;
        if (a.k === 'ph' && (value < 6.5 || value > 8)) continue;
        const after = rest.slice(v.index + v[0].length);
        const unit = unitFor(a, value, after.trim());
        // The laboratory's range: "13.0 - 17.0", "(3.5-5.3)", "<14" or "< 5" after the value.
        let range = null, rangeFrom = '';
        const near = after.slice(0, 28).split(/\s(?=[A-Za-z]{2,}(?![\w/]*\/))(?!mmol|umol|µmol|mg|g\/|U\/|IU|ng|pg|fL|kPa|mmHg|mm\/|s\b|L\/|x10|×10|10\^|FEU|DDU)/)[0];
        const rr = near.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*\)?/);
        const ru = near.match(/(?:^|\s|\()(?:<|≤|up\s*to)\s*(\d+(?:\.\d+)?)/i);
        if (rr && Number(rr[1]) < Number(rr[2])) { range = [Number(rr[1]), Number(rr[2])]; rangeFrom = 'report'; }
        else if (ru) { range = [null, Number(ru[1])]; rangeFrom = 'report'; }
        else if (unit.range) { range = unit.range.slice(); rangeFrom = 'typical'; }
        // A range with its decimal points lost by the reader ("20-75" for "2.0-7.5") is ten times the typical one.
        let repaired = false;
        if (range && rangeFrom === 'report' && unit.range && range[0] != null) {
          const mid = (range[0] + range[1]) / 2, tmid = (unit.range[0] + unit.range[1]) / 2;
          if (tmid > 0 && mid / tmid > 6 && mid / tmid < 16) { range = range.map(x => x / 10); repaired = true; }
        }
        const tail = after.match(/(?:^|\s)(HH|LL|H|L|\*|high|low|critical)\s*$/i);
        const flagText = (v[2] || (tail ? tail[1] : '')).toUpperCase();
        out[a.k] = { k: a.k, value, cmp, unit: unit.label, toSI: unit.toSI, range, rangeFrom, reportFlag: flagText.startsWith('H') ? 'high' : flagText.startsWith('L') ? 'low' : flagText === '*' || flagText === 'CRITICAL' ? 'flagged' : '', repaired };
        line = line.slice(0, m.index) + ' ' + after;   // the rest of the line can hold the next result
      }
    }
    return out;
  }

  function flagOf(r) {
    if (r.range) {
      const [lo, hi] = r.range;
      if (lo != null && r.value < lo && r.cmp !== '>') return 'low';
      if (hi != null && r.value > hi && r.cmp !== '<') return 'high';
      if (r.rangeFrom === 'report') return '';
    }
    return r.reportFlag || '';
  }
  const fmt = n => String(Math.round(n * 1000) / 1000);
  const show = r => r.cmp + fmt(r.value) + (r.unit ? ' ' + r.unit : '');
  const rangeText = r => !r.range ? 'no range: compare with your laboratory' : (r.range[0] == null ? '<' + r.range[1] : r.range[0] + '–' + r.range[1]) + (r.rangeFrom === 'report' ? ' (report)' : ' (typical adult)');

  // ---------- Results kept for this encounter ----------
  const kept = {};   // k -> result
  function lines() {
    const groups = {};
    Object.values(kept).forEach(r => { const a = BY[r.k]; (groups[a.group] = groups[a.group] || []).push(r); });
    return GROUPS.filter(g => groups[g]).map(g => g + ': ' + groups[g].sort((x, y) => A.indexOf(BY[x.k]) - A.indexOf(BY[y.k])).map(r => {
      const f = flagOf(r), a = BY[r.k];
      const lim = r.k === 'trop' && r.range && r.range[1] != null ? ' (assay upper limit ' + r.range[1] + ')' : '';
      return a.name + ' ' + show(r) + (f ? ' (' + f + ')' : '') + lim;
    }).join(', ') + '.');
  }
  // For the scores: value in SI units, and the troponin upper limit from the report.
  function get(k) {
    const r = kept[k];
    if (!r) { if (k === 'urea' && kept.bun) return { si: kept.bun.value / 2.8, value: kept.bun.value, unit: 'mg/dL BUN' }; return null; }
    return { si: r.value * r.toSI, value: r.value, unit: r.unit, cmp: r.cmp, uln: r.rangeFrom === 'report' && r.range ? r.range[1] : null };
  }

  // ---------- Interface ----------
  const panel = $('labs-panel'), msg = $('labs-msg'), file = $('labs-file'), list = $('labs-kept');
  let photoURL = '';
  function closePanel() { if (photoURL) URL.revokeObjectURL(photoURL); photoURL = ''; file.value = ''; panel.replaceChildren(); }
  function changed() { renderKept(); card.dispatchEvent(new Event('change', { bubbles: true })); }

  async function fromImage(blob) {
    closePanel(); msg.textContent = '';
    photoURL = URL.createObjectURL(blob);
    const wrap = document.createElement('div'); wrap.className = 'photo-wrap';
    const a = document.createElement('a'); a.href = photoURL; a.target = '_blank'; a.rel = 'noopener'; a.className = 'photo-thumb'; a.setAttribute('aria-label', 'Open the image full size to compare');
    const img = document.createElement('img'); img.src = photoURL; img.alt = 'The lab results being read'; a.append(img);
    const body = document.createElement('div'); body.className = 'photo-body';
    const status = document.createElement('p'); status.className = 'hint'; status.id = 'labs-status'; status.setAttribute('role', 'status'); status.textContent = 'Preparing the text reader on this device…';
    body.append(status); wrap.append(a, body); panel.append(wrap);
    let text = '';
    try { text = await window.edOCR.recognise(blob, t => { status.textContent = t; }); }
    catch (e) { status.textContent = (e && e.message) || 'The image could not be read.'; body.append(btn('Close', closePanel, 'secondary')); return; }
    review(parse(text), text, body, status, window.edOCR.unsure ? window.edOCR.unsure() : null);
  }
  function fromText(text) {
    closePanel(); msg.textContent = '';
    const body = document.createElement('div'); body.className = 'photo-body';
    const status = document.createElement('p'); status.className = 'hint'; status.id = 'labs-status'; status.setAttribute('role', 'status');
    body.append(status); panel.append(body);
    review(parse(text), text, body, status);
  }
  function btn(text, fn, cls, id) { const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; if (id) b.id = id; b.textContent = text; b.onclick = fn; return b; }

  function review(found, text, body, status, unsure) {
    unsure = unsure || new Set();
    const keys = A.map(a => a.k).filter(k => found[k]);
    status.textContent = keys.length ? 'Check each result against the report. Only ticked results go into the note; anything unclear is left unticked.' : 'No results were recognised. Try a sharper, straight-on image, or paste the results as text.';
    const table = document.createElement('div'); table.className = 'labs-review';
    keys.forEach(k => {
      const r = found[k], a = BY[k], row = document.createElement('div'); row.className = 'photo-row';
      const lab = document.createElement('label'); lab.className = 'photo-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.k = k; lab.append(cb, a.name);
      const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.inputMode = 'decimal'; inp.value = fmt(r.value); inp.dataset.k = k;
      inp.setAttribute('aria-label', a.name + ' value read from the report');
      const u = document.createElement('span'); u.className = 'photo-unit'; u.textContent = (r.cmp ? r.cmp + ' ' : '') + r.unit;
      const flag = document.createElement('span'); flag.className = 'labs-flag';
      const note = document.createElement('span'); note.className = 'labs-range'; note.textContent = 'Range ' + rangeText(r);
      const warn = document.createElement('span'); warn.className = 'photo-note';
      const paint = () => {
        const val = Number(inp.value), f = flagOf({ ...r, value: val }); flag.textContent = f ? f.charAt(0).toUpperCase() + f.slice(1) : ''; flag.dataset.flag = f;
        const w = [], lim = PLAUSIBLE[k], si = val * r.toSI;
        if (lim && (si < lim[0] || si > lim[1])) w.push('unusual value: check it against the report');
        if (r.reportFlag && (r.reportFlag === 'high' || r.reportFlag === 'low') && f && f !== r.reportFlag) w.push('the report flags it ' + r.reportFlag + ': check the value and range');
        if (r.reportFlag && (r.reportFlag === 'high' || r.reportFlag === 'low') && !f && r.range) w.push('the report flags it ' + r.reportFlag + ' but it is inside the range read: check');
        if (r.repaired) w.push('range read without decimal points; corrected to ' + r.range.join('–'));
        if (unsure.has(String(r.value)) && val === r.value) w.push('unclear in the image: check it, then tick');
        warn.textContent = w.join('; '); return w.length && !(w.length === 1 && r.repaired);
      };
      inp.oninput = () => { paint(); cb.checked = inp.value !== ''; };
      if (paint()) cb.checked = false;
      row.append(lab, inp, u, flag, note, warn); table.append(row);
    });
    body.append(table);
    const raw = document.createElement('details'); raw.className = 'photo-raw';
    const sum = document.createElement('summary'); sum.textContent = 'Text read from the report';
    const pre = document.createElement('pre'); pre.textContent = text.split('\n').filter(l => l.trim()).slice(0, 80).join('\n');
    raw.append(sum, pre); body.append(raw);
    const actions = document.createElement('div'); actions.className = 'actions';
    if (keys.length) actions.append(btn('Add to note', () => {
      table.querySelectorAll('input[type=checkbox]').forEach(cb => {
        if (!cb.checked) return;
        const k = cb.dataset.k, v = Number(table.querySelector('input[type=number][data-k="' + k + '"]').value);
        if (Number.isFinite(v)) kept[k] = { ...found[k], value: v };
      });
      closePanel(); msg.textContent = 'Results added to the note. The image has been discarded.'; changed();
    }, '', 'labs-add'));
    actions.append(btn(keys.length ? 'Discard' : 'Close', () => { closePanel(); }, 'secondary'));
    body.append(actions);
  }

  function renderKept() {
    list.replaceChildren();
    const ks = A.map(a => a.k).filter(k => kept[k]);
    if (!ks.length) return;
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = 'Results in the note';
    const ul = document.createElement('ul'); ul.className = 'score-list';
    ks.forEach(k => {
      const r = kept[k], f = flagOf(r), li = document.createElement('li'), t = document.createElement('span');
      t.textContent = BY[k].name + ' ' + show(r) + (f ? ' (' + f + ')' : '') + ' · range ' + rangeText(r);
      if (f) li.className = 'labs-abn';
      li.append(t, btn('Remove', () => { delete kept[k]; changed(); }, 'secondary'));
      li.lastChild.setAttribute('aria-label', 'Remove ' + BY[k].name + ' from the note');
      ul.append(li);
    });
    list.append(lbl, ul);
  }

  $('labs-btn').onclick = () => { msg.textContent = ''; file.click(); };
  file.onchange = () => { const f = file.files && file.files[0]; if (f) fromImage(f); };
  window.edOCR.pasteSupport($('labs-paste'), $('labs-paste-zone'), msg, blob => { $('labs-paste-zone').hidden = true; fromImage(blob); }, text => { $('labs-paste-zone').hidden = true; fromText(text); });
  $('labs-textbtn').onclick = () => { const t = $('labs-text').value; if (t.trim()) { fromText(t); $('labs-text').value = ''; } };

  window.edLabLines = lines;
  window.edLabs = { parse, get, kept, flagOf, fromText };
  window.edLabsClear = () => { for (const k in kept) delete kept[k]; closePanel(); msg.textContent = ''; renderKept(); };
})();
