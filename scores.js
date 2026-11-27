// Bedside scores: published criteria and bands only. The clinician answers every item; values from the
// observations and age are filled in for checking. A score reaches the note only when "Add to note" is pressed.
// Nothing is saved or sent. Each score cites the paper or guideline it comes from.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const num = v => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const added = [];            // {key, text}
  const state = {};            // per score: {values:{}, touched:Set}
  let openKey = '';

  // What the page already knows. Observations come from the first observation set.
  function context() {
    const v = k => { const e = document.querySelector('#obs-slot [id$="-v-' + k + '"]'); return e ? e.value : ''; };
    const a = num($('age') && $('age').value), unit = $('ageunit') ? $('ageunit').value : 'years';
    const years = a == null || a < 0 ? null : unit === 'years' ? a : unit === 'months' ? a / 12 : unit === 'weeks' ? a / 52.18 : a / 365.25;
    const ox = v('oxygen');
    const ticked = sel => new Set([...document.querySelectorAll(sel)].filter(l => l.querySelector('input:checked')).map(l => l.textContent.trim()));
    const hist = ticked('#fields label'), exam = ticked('#exam label');
    const syms = {}; document.querySelectorAll('#symptoms .rapid-row').forEach(r => { const n = r.querySelector('span'), st = r.querySelector('input[type=hidden]'); if (n && st) syms[n.textContent.trim()] = st.value; });
    const yn = name => syms[name] === 'present' ? true : syms[name] === 'absent' ? false : null;
    const lab = k => (window.edLabs ? window.edLabs.get(k) : null);
    return { lab, yn, hist: t => hist.has(t), exam: t => exam.has(t), age: years, hr: num(v('hr')), rr: num(v('rr')), sbp: num(v('sbp')), dbp: num(v('dbp')), spo2: num(v('spo2')), temp: num(v('temp')),
      oxygen: ox === 'Room air' ? 'air' : ox ? 'oxygen' : null, sex: $('sex') ? $('sex').value : '' };
  }

  // Item kinds: choice (one answer required), check (tick if present), num (value required).
  // auto(ctx) proposes an answer from the page; the clinician can change it.
  const SCORES = {
    news2: {
      name: 'NEWS2', title: 'NEWS2 (National Early Warning Score 2)',
      source: 'Royal College of Physicians, National Early Warning Score 2, 2017',
      items: [
        { k: 'rr', label: 'Respiratory rate', kind: 'num', unit: '/min', min: 1, max: 150, auto: c => c.rr, pts: v => v < 9 ? 3 : v < 12 ? 1 : v < 21 ? 0 : v < 25 ? 2 : 3, show: 'RR' },
        { k: 'scale', label: 'SpO₂ scale', kind: 'choice', opts: [['Scale 1', 0], ['Scale 2: confirmed hypercapnic respiratory failure with a prescribed target of 88–92%', 0]], auto: () => 0, show: null },
        { k: 'o2', label: 'Air or oxygen', kind: 'choice', opts: [['Air', 0], ['Oxygen', 2]], auto: c => c.oxygen === 'air' ? 0 : c.oxygen === 'oxygen' ? 1 : null, show: 'air or oxygen' },
        { k: 'spo2', label: 'SpO₂', kind: 'num', unit: '%', min: 1, max: 100, auto: c => c.spo2, show: 'SpO₂',
          pts: (v, s) => {
            if (s.scale !== 1) return v < 92 ? 3 : v < 94 ? 2 : v < 96 ? 1 : 0;
            if (s.o2 !== 1) return v < 84 ? 3 : v < 86 ? 2 : v < 88 ? 1 : 0;
            return v < 84 ? 3 : v < 86 ? 2 : v < 88 ? 1 : v < 93 ? 0 : v < 95 ? 1 : v < 97 ? 2 : 3;
          } },
        { k: 'sbp', label: 'Systolic BP', kind: 'num', unit: 'mmHg', min: 1, max: 400, auto: c => c.sbp, pts: v => v < 91 ? 3 : v < 101 ? 2 : v < 111 ? 1 : v < 220 ? 0 : 3, show: 'SBP' },
        { k: 'hr', label: 'Pulse', kind: 'num', unit: '/min', min: 1, max: 400, auto: c => c.hr, pts: v => v < 41 ? 3 : v < 51 ? 1 : v < 91 ? 0 : v < 111 ? 1 : v < 131 ? 2 : 3, show: 'pulse' },
        { k: 'acvpu', label: 'Consciousness', kind: 'choice', opts: [['Alert', 0], ['New confusion, or responds only to voice or pain, or unresponsive', 3]], show: 'consciousness',
          auto: c => c.exam('Drowsy') || c.exam('Confused') || c.yn('New confusion') ? 1 : c.exam('Alert') ? 0 : null },
        { k: 'temp', label: 'Temperature', kind: 'num', unit: '°C', min: 20, max: 45, auto: c => c.temp, pts: v => v <= 35 ? 3 : v <= 36 ? 1 : v <= 38 ? 0 : v <= 39 ? 1 : 2, show: 'temperature' }
      ],
      band: (t, p) => t >= 7 ? 'high clinical risk band (7 or more)' : t >= 5 ? 'medium clinical risk band (5–6)'
        : Object.values(p).some(x => x === 3) ? 'low–medium clinical risk band (a score of 3 in one parameter)' : 'low clinical risk band (0–4)'
    },
    qsofa: {
      name: 'qSOFA', title: 'qSOFA (quick Sequential Organ Failure Assessment)',
      source: 'Seymour et al., JAMA 2016 (Sepsis-3)',
      items: [
        { k: 'rr', label: 'Respiratory rate', kind: 'num', unit: '/min', min: 1, max: 150, auto: c => c.rr, pts: v => v >= 22 ? 1 : 0, show: 'RR' },
        { k: 'mental', label: 'Altered mentation (GCS below 15)', kind: 'choice', opts: [['No', 0], ['Yes', 1]], show: 'altered mentation',
          auto: c => c.exam('Drowsy') || c.exam('Confused') || c.yn('New confusion') ? 1 : c.exam('Alert') && c.exam('Orientated to person, place and time') ? 0 : null },
        { k: 'sbp', label: 'Systolic BP', kind: 'num', unit: 'mmHg', min: 1, max: 400, auto: c => c.sbp, pts: v => v <= 100 ? 1 : 0, show: 'SBP' }
      ],
      max: 3,
      band: t => t >= 2 ? '2 or more: the published threshold for a higher risk of poor outcome in suspected infection' : 'below the published threshold of 2'
    },
    gcs: {
      name: 'GCS', title: 'Glasgow Coma Scale',
      source: 'Teasdale and Jennett, Lancet 1974; Teasdale et al., Lancet Neurol 2014',
      items: [
        { k: 'e', label: 'Eye opening', kind: 'choice', opts: [['4 Spontaneous', 4], ['3 To sound', 3], ['2 To pressure', 2], ['1 None', 1], ['Not testable', 'NT']], show: 'E' },
        { k: 'v', label: 'Verbal response', kind: 'choice', opts: [['5 Orientated', 5], ['4 Confused', 4], ['3 Words', 3], ['2 Sounds', 2], ['1 None', 1], ['Not testable', 'NT']], show: 'V' },
        { k: 'm', label: 'Motor response', kind: 'choice', opts: [['6 Obeys commands', 6], ['5 Localising', 5], ['4 Normal flexion', 4], ['3 Abnormal flexion', 3], ['2 Extension', 2], ['1 None', 1], ['Not testable', 'NT']], show: 'M' }
      ],
      max: 15, custom: true
    },
    heart: {
      name: 'HEART', title: 'HEART score for chest pain',
      source: 'Six et al., Neth Heart J 2008; Backus et al., Int J Cardiol 2013',
      items: [
        { k: 'h', label: 'History', kind: 'choice', opts: [['Slightly suspicious', 0], ['Moderately suspicious', 1], ['Highly suspicious', 2]], show: 'history' },
        { k: 'e', label: 'ECG', kind: 'choice', opts: [['Normal', 0], ['Non-specific repolarisation disturbance (including LBBB, LVH, paced rhythm, digoxin effect)', 1], ['Significant ST deviation', 2]], show: 'ECG' },
        { k: 'a', label: 'Age', kind: 'num', unit: 'years', min: 0, max: 130, auto: c => c.age == null ? null : Math.floor(c.age), pts: v => v < 45 ? 0 : v < 65 ? 1 : 2, show: 'age' },
        { k: 'r', label: 'Risk factors', kind: 'choice', hint: 'Risk factors: hypercholesterolaemia, hypertension, diabetes, smoking (current or stopped within 3 months), obesity (BMI over 30), family history of premature coronary disease. Atherosclerotic disease: previous MI, PCI or CABG, stroke or TIA, peripheral arterial disease.',
          opts: [['No known risk factors', 0], ['1 or 2 risk factors', 1], ['3 or more risk factors, or known atherosclerotic disease', 2]], show: 'risk factors' },
        { k: 't', label: 'Initial troponin', kind: 'choice', opts: [['At or below the normal limit', 0], ['1 to 3 times the normal limit', 1], ['More than 3 times the normal limit', 2]], show: 'troponin',
          hint: 'Filled from Investigations only when the report gives the assay upper limit.',
          auto: c => { const t = c.lab('trop'); if (!t || !t.uln) return null; const r = t.value / t.uln; return r <= 1 ? 0 : r <= 3 ? 1 : 2; } }
      ],
      max: 10,
      band: t => t <= 3 ? 'low risk band (0–3)' : t <= 6 ? 'moderate risk band (4–6)' : 'high risk band (7–10)'
    },
    wellspe: {
      name: 'Wells PE', title: 'Wells score for pulmonary embolism (two-level)',
      source: 'Wells et al., Thromb Haemost 2000; two-level interpretation as in NICE NG158',
      items: [
        { k: 'dvt', label: 'Clinical signs and symptoms of DVT (leg swelling and pain on palpation of the deep veins)', kind: 'check', pts: 3 },
        { k: 'alt', label: 'PE is the most likely diagnosis, or equally likely', kind: 'check', pts: 3 },
        { k: 'hr', label: 'Heart rate over 100', kind: 'check', pts: 1.5, auto: c => c.hr == null ? null : c.hr > 100 },
        { k: 'imm', label: 'Immobilisation for 3 days or more, or surgery in the previous 4 weeks', kind: 'check', pts: 1.5 },
        { k: 'prev', label: 'Previous DVT or PE', kind: 'check', pts: 1.5, auto: c => c.hist('Previous DVT or PE') || null },
        { k: 'haem', label: 'Haemoptysis', kind: 'check', pts: 1, auto: c => c.yn('Haemoptysis') },
        { k: 'ca', label: 'Malignancy (treatment within 6 months, or palliative)', kind: 'check', pts: 1, auto: c => c.hist('Active cancer') || null }
      ],
      max: 12.5,
      band: t => t > 4 ? 'PE likely (more than 4)' : 'PE unlikely (4 or less)'
    },
    perc: {
      name: 'PERC', title: 'PERC rule (pulmonary embolism rule-out criteria)',
      source: 'Kline et al., J Thromb Haemost 2004 and 2008',
      note: 'PERC applies only when the clinical pre-test probability of PE is already low (below 15%). Tick each criterion that is present.',
      items: [
        { k: 'age', label: 'Age 50 or over', kind: 'check', pts: 1, auto: c => c.age == null ? null : c.age >= 50 },
        { k: 'hr', label: 'Heart rate 100 or more', kind: 'check', pts: 1, auto: c => c.hr == null ? null : c.hr >= 100 },
        { k: 'sat', label: 'SpO₂ below 95% on room air', kind: 'check', pts: 1, auto: c => c.spo2 == null || c.oxygen !== 'air' ? null : c.spo2 < 95 },
        { k: 'leg', label: 'Unilateral leg swelling', kind: 'check', pts: 1, auto: c => c.yn('Unilateral leg swelling') },
        { k: 'haem', label: 'Haemoptysis', kind: 'check', pts: 1, auto: c => c.yn('Haemoptysis') },
        { k: 'surg', label: 'Surgery or trauma needing hospital treatment in the previous 4 weeks', kind: 'check', pts: 1 },
        { k: 'prev', label: 'Previous PE or DVT', kind: 'check', pts: 1, auto: c => c.hist('Previous DVT or PE') || null },
        { k: 'horm', label: 'Hormone use (oral contraceptive, hormone replacement or oestrogen)', kind: 'check', pts: 1, auto: c => c.hist('Oestrogen therapy') || null }
      ],
      custom: true
    },
    wellsdvt: {
      name: 'Wells DVT', title: 'Wells score for deep vein thrombosis (two-level)',
      source: 'Wells et al., N Engl J Med 2003; two-level interpretation as in NICE NG158',
      items: [
        { k: 'ca', label: 'Active cancer (treatment ongoing, within 6 months, or palliative)', kind: 'check', pts: 1 },
        { k: 'par', label: 'Paralysis, paresis or recent plaster immobilisation of the leg', kind: 'check', pts: 1 },
        { k: 'bed', label: 'Bedridden for 3 days or more, or major surgery within 12 weeks needing general or regional anaesthesia', kind: 'check', pts: 1 },
        { k: 'tend', label: 'Localised tenderness along the deep venous system', kind: 'check', pts: 1 },
        { k: 'leg', label: 'Entire leg swollen', kind: 'check', pts: 1 },
        { k: 'calf', label: 'Calf swelling 3 cm or more than the other side (10 cm below the tibial tuberosity)', kind: 'check', pts: 1 },
        { k: 'pit', label: 'Pitting oedema confined to the symptomatic leg', kind: 'check', pts: 1 },
        { k: 'vein', label: 'Collateral superficial veins (not varicose)', kind: 'check', pts: 1 },
        { k: 'prev', label: 'Previously documented DVT', kind: 'check', pts: 1 },
        { k: 'alt', label: 'An alternative diagnosis is at least as likely as DVT', kind: 'check', pts: -2 }
      ],
      max: 9,
      band: t => t >= 2 ? 'DVT likely (2 or more)' : 'DVT unlikely (1 or less)'
    },
    curb65: {
      name: 'CURB-65', title: 'CURB-65 for community-acquired pneumonia',
      source: 'Lim et al., Thorax 2003; British Thoracic Society CAP guideline 2009',
      items: [
        { k: 'c', label: 'New confusion', kind: 'check', pts: 1, auto: c => c.exam('Confused') || c.yn('New confusion') },
        { k: 'u', label: 'Urea', kind: 'choice', opts: [['Not available: score as CRB-65', 'NA'], ['7 mmol/L or less', 0], ['Over 7 mmol/L (BUN over 19 mg/dL)', 1]], show: 'urea',
          auto: c => { const u = c.lab('urea'); return u ? (u.si > 7 ? 2 : 1) : null; } },
        { k: 'r', label: 'Respiratory rate 30 or more', kind: 'check', pts: 1, auto: c => c.rr == null ? null : c.rr >= 30 },
        { k: 'b', label: 'Systolic BP below 90 or diastolic 60 or less', kind: 'check', pts: 1, auto: c => c.sbp == null || c.dbp == null ? null : (c.sbp < 90 || c.dbp <= 60) },
        { k: 'a', label: 'Age 65 or over', kind: 'check', pts: 1, auto: c => c.age == null ? null : c.age >= 65 }
      ],
      custom: true
    },
    mcisaac: {
      name: 'McIsaac', title: 'Centor score with McIsaac age adjustment (sore throat)',
      source: 'Centor et al., Med Decis Making 1981; McIsaac et al., CMAJ 1998 and JAMA 2004',
      items: [
        { k: 'ex', label: 'Tonsillar exudate or swelling', kind: 'check', pts: 1 },
        { k: 'node', label: 'Tender or swollen anterior cervical nodes', kind: 'check', pts: 1 },
        { k: 'temp', label: 'Temperature over 38 °C', kind: 'check', pts: 1, auto: c => c.temp == null ? null : c.temp > 38 },
        { k: 'cough', label: 'Cough absent', kind: 'check', pts: 1, auto: c => { const y = c.yn('Cough'); return y == null ? null : !y; } },
        { k: 'age', label: 'Age', kind: 'num', unit: 'years', min: 0, max: 130, auto: c => c.age == null ? null : Math.floor(c.age), pts: v => v < 15 ? 1 : v < 45 ? 0 : -1, show: 'age' }
      ],
      custom: true
    },
    gbs: {
      name: 'Glasgow-Blatchford', title: 'Glasgow-Blatchford score (upper GI bleeding)',
      source: 'Blatchford et al., Lancet 2000; ESGE guideline 2021',
      items: [
        { k: 'urea', label: 'Urea', kind: 'num', units: [['mmol/L', 1], ['BUN mg/dL', 1 / 2.8]], min: 0, max: 150, show: 'urea',
          auto: c => { const u = c.lab('urea'); return u ? Math.round(u.si * 10) / 10 : null; },
          pts: v => v < 6.5 ? 0 : v < 8 ? 2 : v < 10 ? 3 : v < 25 ? 4 : 6 },
        { k: 'sex', label: 'Sex (for haemoglobin points)', kind: 'choice', opts: [['Male', 'M'], ['Female', 'F']], auto: c => c.sex === 'Male' ? 0 : c.sex === 'Female' ? 1 : null, show: null },
        { k: 'hb', label: 'Haemoglobin', kind: 'num', units: [['g/dL', 1], ['g/L', 0.1]], min: 1, max: 25, show: 'Hb',
          auto: c => { const h = c.lab('hb'); return h ? Math.round(h.si * 10) / 10 : null; },
          pts: (v, s) => s.sex === 1 ? (v >= 12 ? 0 : v >= 10 ? 1 : 6) : (v >= 13 ? 0 : v >= 12 ? 1 : v >= 10 ? 3 : 6) },
        { k: 'sbp', label: 'Systolic BP', kind: 'num', unit: 'mmHg', min: 1, max: 400, auto: c => c.sbp, pts: v => v < 90 ? 3 : v < 100 ? 2 : v < 110 ? 1 : 0, show: 'SBP' },
        { k: 'hr', label: 'Pulse 100 or more', kind: 'check', pts: 1, auto: c => c.hr == null ? null : c.hr >= 100 },
        { k: 'mel', label: 'Melaena', kind: 'check', pts: 1, auto: c => c.yn('Melaena') },
        { k: 'sync', label: 'Presented with syncope', kind: 'check', pts: 2, auto: c => c.yn('Syncope') },
        { k: 'liver', label: 'Hepatic disease (known history, or clinical or laboratory evidence)', kind: 'check', pts: 2 },
        { k: 'cf', label: 'Cardiac failure', kind: 'check', pts: 2 }
      ],
      max: 23,
      band: t => t <= 1 ? 'very low risk group (1 or less, the ESGE 2021 threshold)' : 'not in the very low risk group (2 or more)'
    },
    fourat: {
      name: '4AT', title: '4AT (delirium and cognitive impairment)',
      source: 'the4at.com; Bellelli et al., Age Ageing 2014',
      items: [
        { k: 'alert', label: 'Alertness', kind: 'choice', opts: [['Normal, or mild sleepiness for under 10 seconds after waking', 0], ['Clearly abnormal', 4]], show: 'alertness' },
        { k: 'amt', label: 'AMT4 (age, date of birth, place, current year)', kind: 'choice', opts: [['No mistakes', 0], ['1 mistake', 1], ['2 or more mistakes, or untestable', 2]], show: 'AMT4' },
        { k: 'att', label: 'Attention (months of the year backwards)', kind: 'choice', opts: [['7 months or more correct', 0], ['Starts but fewer than 7 correct, or refuses', 1], ['Untestable (cannot start because unwell, drowsy or inattentive)', 2]], show: 'attention' },
        { k: 'acute', label: 'Acute change or fluctuating course', kind: 'choice', opts: [['No', 0], ['Yes', 4]], show: 'acute change' }
      ],
      max: 12,
      band: t => t >= 4 ? 'possible delirium, with or without cognitive impairment (4 or more)' : t >= 1 ? 'possible cognitive impairment (1–3)'
        : 'delirium or severe cognitive impairment unlikely (0); delirium is still possible if information for item 4 is incomplete'
    }
  };

  const ORDER = ['news2', 'qsofa', 'gcs', 'heart', 'wellspe', 'perc', 'wellsdvt', 'curb65', 'mcisaac', 'gbs', 'fourat'];
  const SUGGEST = {
    'Chest pain': ['heart', 'wellspe', 'perc'], 'Hypoxia': ['news2', 'wellspe', 'perc', 'curb65'],
    'SOB / Shortness of breath': ['news2', 'wellspe', 'perc', 'curb65'], 'Asthma': ['news2'], 'Cough / Cold / Flu': ['curb65', 'mcisaac', 'news2'],
    'Difficulty swallowing': ['mcisaac'], 'Fever': ['news2', 'qsofa'], 'UTI / Dysuria': ['news2', 'qsofa'], 'Surgical site infection': ['news2', 'qsofa'],
    'Rash': ['news2', 'qsofa'], 'Anaphylaxis': ['news2', 'gcs'], 'DKA': ['news2', 'gcs'], 'Vomiting & diarrhoea': ['news2'],
    'Suspected DVT': ['wellsdvt', 'wellspe'], 'Leg swelling': ['wellsdvt'], 'Upper GI bleed': ['gbs', 'news2'],
    'Decreased responsiveness — elderly': ['gcs', 'fourat', 'news2'], 'Acute confusional state': ['fourat', 'gcs', 'news2'], 'Dementia': ['fourat', 'news2', 'gcs'],
    'Unwitnessed fall': ['gcs', 'fourat'], 'Fall from height': ['gcs'], 'Motor vehicle / motorbike collision': ['gcs'], 'Physical assault': ['gcs'],
    'Seizure': ['gcs'], 'Toxic ingestion': ['gcs', 'news2'], 'Behavioural change': ['fourat', 'gcs'], 'Suspected stroke': ['gcs'], 'Syncope': ['news2']
  };

  const lowerFirst = t => /^[A-Z][a-z]+$/.test(t.split(/[\s(]/)[0]) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  const st = key => state[key] || (state[key] = { values: {}, touched: new Set() });

  // Fill untouched items from the page, then work out points.
  function evaluate(key) {
    const def = SCORES[key], s = st(key), c = context(), sel = {}, pts = {}, missing = [];
    for (const it of def.items) {
      if (!s.touched.has(it.k) && it.auto) {
        const a = it.auto(c);
        if (a == null) delete s.values[it.k];
        else if (it.kind === 'check') s.values[it.k] = !!a;
        else s.values[it.k] = it.kind === 'num' ? String(a) : a;
        if (a != null && it.units && !s.touched.has(it.k)) s.values[it.k + '_unit'] = 0;
      }
      const val = s.values[it.k];
      if (it.kind === 'check') { if (val == null) { missing.push(lowerFirst(it.label)); continue; } pts[it.k] = val === true ? it.pts : 0; sel[it.k] = val === true; continue; }
      if (it.kind === 'choice') { if (val == null) { missing.push(it.label); continue; } sel[it.k] = val; pts[it.k] = it.opts[val][1]; continue; }
      const n = num(val), factor = it.units ? it.units[s.values[it.k + '_unit'] || 0][1] : 1;
      if (n == null) { missing.push(it.label); continue; }
      const v = n * factor;
      if (v < it.min || v > it.max) { missing.push(it.label + ' (outside ' + it.min + '–' + it.max + ')'); continue; }
      sel[it.k] = v;
    }
    for (const it of def.items) if (it.kind === 'num' && sel[it.k] != null) pts[it.k] = it.pts(sel[it.k], s.values);
    return { def, s, sel, pts, missing };
  }

  const fmt = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

  // Result sentence for the panel and the note. Returns {text, complete}.
  function result(key) {
    const r = evaluate(key), { def, s, pts } = r;
    if (r.missing.length) return { complete: false, missing: r.missing.length, text: r.missing.length <= 2 ? 'Still to answer: ' + r.missing.join('; ') + '.' : r.missing.length + ' items still to answer.' };
    const total = Object.values(pts).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    const parts = def.items.filter(it => it.show).map(it => it.show + ' ' + fmt(pts[it.k]));
    if (key === 'gcs') {
      const e = r.sel.e, v = r.sel.v, m = r.sel.m, lab = x => def.items.find(i => i.k === x).opts;
      const E = lab('e')[e][1], V = lab('v')[v][1], M = lab('m')[m][1];
      const comp = 'E' + E + ' V' + V + ' M' + M;
      return { complete: true, text: [E, V, M].includes('NT') ? 'GCS not totalled (' + comp + '): a component was not testable.' : 'GCS ' + (E + V + M) + '/15 (' + comp + ').' };
    }
    if (key === 'perc') {
      const present = def.items.filter(it => r.sel[it.k]).map(it => lowerFirst(it.label));
      return { complete: true, text: present.length ? 'PERC positive: ' + present.length + ' of 8 criteria present (' + present.join('; ') + '). PE is not excluded by PERC.'
        : 'PERC negative: all 8 criteria absent. Valid only when the clinical pre-test probability of PE is below 15%.' };
    }
    if (key === 'curb65') {
      const crb = s.values.u != null && def.items[1].opts[s.values.u][1] === 'NA';
      const t = ['c', 'r', 'b', 'a'].reduce((a, k) => a + pts[k], 0) + (crb ? 0 : pts.u);
      const comps = 'confusion ' + pts.c + (crb ? '' : ', urea ' + pts.u) + ', RR ' + pts.r + ', BP ' + pts.b + ', age ' + pts.a;
      const band = crb ? (t === 0 ? 'low risk band (0)' : t <= 2 ? 'intermediate risk band (1–2)' : 'high risk band (3–4)')
        : (t <= 1 ? 'low severity band (0–1)' : t === 2 ? 'moderate severity band (2)' : 'high severity band (3–5)');
      return { complete: true, text: (crb ? 'CRB-65 ' + t + '/4' : 'CURB-65 ' + t + '/5') + ' (' + comps + '): ' + band + '.' };
    }
    if (key === 'mcisaac') {
      if (r.sel.age < 3) return { complete: false, text: 'The McIsaac score is not validated under 3 years of age.' };
      const t = total, comps = 'exudate or swelling ' + pts.ex + ', nodes ' + pts.node + ', temperature ' + pts.temp + ', no cough ' + pts.cough + ', age ' + signed(pts.age);
      const band = t <= 0 ? '1–2.5%' : t === 1 ? '5–10%' : t === 2 ? '11–17%' : t === 3 ? '28–35%' : '51–53%';
      return { complete: true, text: 'McIsaac score ' + fmt(t) + ' (' + comps + '): reported likelihood of group A streptococcus ' + band + '.' };
    }
    const checks = def.items.filter(it => it.kind === 'check' && r.sel[it.k]).map(it => lowerFirst(it.label) + ' ' + signed(it.pts));
    const detail = [...parts, ...checks];
    return { complete: true, text: def.name + ' ' + fmt(total) + (def.max ? '/' + fmt(def.max) : '') + (detail.length ? ' (' + detail.join(', ') + ')' : ' (no criteria present)') + ': ' + def.band(total, pts) + '.' };
  }

  // ---------- Interface ----------
  // A score is in the note when it was added by hand, or (with automatic scores on) when it is suggested for the
  // current presentation and has not been removed. Either way it appears only once every item is answered, and
  // its line is rebuilt with the note, so it always matches the current answers.
  const card = $('scores-card');
  if (!card) return;
  const pick = $('score-pick'), panel = $('score-panel'), suggest = $('score-suggest'), list = $('score-added'), autoBox = $('score-auto');
  ORDER.forEach(k => pick.add(new Option(SCORES[k].title, k)));
  const manual = new Set(), removed = new Set();
  const suggested = () => SUGGEST[$('condition').value] || ['news2'];
  const automatic = () => !autoBox || autoBox.checked;
  const included = () => ORDER.filter(k => manual.has(k) || (automatic() && suggested().includes(k) && !removed.has(k)));
  const fromPageTag = () => { const t = document.createElement('span'); t.className = 'score-from'; t.textContent = 'Filled from the page; check it'; return t; };

  function renderSuggest() {
    const cond = $('condition').value, keys = suggested();
    suggest.replaceChildren();
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.id = 'score-suggest-lbl'; lbl.textContent = 'Suggested for ' + cond;
    const row = document.createElement('div'); row.className = 'quick-options'; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', lbl.id);
    keys.forEach(k => { const b = document.createElement('button'); b.type = 'button'; b.textContent = SCORES[k].name; b.dataset.score = k;
      b.setAttribute('aria-pressed', String(openKey === k)); b.onclick = () => open(openKey === k ? '' : k); row.append(b); });
    suggest.append(lbl, row);
  }

  function open(key) { openKey = key; pick.value = key; renderSuggest(); renderPanel(); }

  function renderPanel() {
    panel.replaceChildren();
    if (!openKey) return;
    const def = SCORES[openKey], s = st(openKey);
    evaluate(openKey);
    const h = document.createElement('h3'); h.className = 'score-title'; h.textContent = def.title; panel.append(h);
    if (def.note) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = def.note; panel.append(p); }
    const checks = def.items.filter(it => it.kind === 'check');
    def.items.forEach(it => {
      if (it.kind === 'check') return;
      const wrap = document.createElement('div'); wrap.className = 'score-item';
      const id = 'sc-' + openKey + '-' + it.k;
      if (it.kind === 'choice') {
        const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.id = id + '-lbl'; lbl.textContent = it.label;
        const row = document.createElement('div'); row.className = 'quick-options'; row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-labelledby', lbl.id);
        it.opts.forEach(([text], i) => {
          const l = document.createElement('label'), inp = document.createElement('input');
          inp.type = 'radio'; inp.name = id; inp.value = String(i); inp.checked = s.values[it.k] === i;
          inp.onchange = () => { s.values[it.k] = i; s.touched.add(it.k); changed(); };
          l.append(inp, text); row.append(l);
        });
        wrap.append(lbl, row);
        if (it.auto) wrap.append(fromPageTag());
        if (it.hint) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = it.hint; wrap.append(p); }
      } else {
        const l = document.createElement('label'); l.className = 'score-num'; l.textContent = it.label + (it.unit ? ' (' + it.unit + ')' : '');
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.id = id; inp.value = s.values[it.k] ?? '';
        inp.oninput = () => { s.values[it.k] = inp.value; s.touched.add(it.k); changed(); };
        l.append(inp);
        if (it.units) {
          const u = document.createElement('select'); u.setAttribute('aria-label', it.label + ' unit');
          it.units.forEach(([t], i) => u.add(new Option(t, String(i)))); u.value = String(s.values[it.k + '_unit'] || 0);
          u.onchange = () => { s.values[it.k + '_unit'] = Number(u.value); changed(); };
          l.append(u);
        }
        if (it.auto) l.append(fromPageTag());
        wrap.append(l);
      }
      panel.append(wrap);
    });
    if (checks.length) {
      const head = document.createElement('div'); head.className = 'score-checkhead';
      const t = document.createElement('span'); t.className = 'lbl'; t.textContent = 'Criteria: Y, N or N/A for each';
      const rest = document.createElement('button'); rest.type = 'button'; rest.className = 'secondary'; rest.id = 'score-rest'; rest.textContent = 'Mark the rest N';
      rest.onclick = () => { checks.forEach(it => { if (s.values[it.k] == null) { s.values[it.k] = false; s.touched.add(it.k); } }); syncChecks(); changed(); };
      head.append(t, rest); panel.append(head);
      if (checks.some(it => it.auto)) { const n = fromPageTag(); n.textContent = 'Some answers follow your symptoms, history and observations; check them.'; panel.append(n); }
      checks.forEach(it => {
        // One row per criterion: Y (present), N (absent), N/A (not applicable, scores 0).
        const id = 'sc-' + openKey + '-' + it.k;
        const row = document.createElement('div'); row.className = 'rapid-row score-yn'; row.id = id;
        const t = document.createElement('span'); t.textContent = it.label + (openKey === 'perc' ? '' : ' (' + signed(it.pts) + ')');
        row.append(t);
        [[true, 'Y', 'present'], [false, 'N', 'absent'], ['na', 'N/A', 'not applicable']].forEach(([v, text, long]) => {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
          b.dataset.value = v === true ? 'present' : v === false ? 'absent' : 'na'; b.dataset.v = String(v);
          b.setAttribute('aria-label', it.label + ' — ' + long); b.setAttribute('aria-pressed', String(s.values[it.k] === v));
          b.onclick = () => { s.values[it.k] = s.values[it.k] === v ? undefined : v; s.touched.add(it.k); syncChecks(); changed(); };
          row.append(b);
        });
        panel.append(row);
      });
      panel.lastChild.classList.add('score-yn-last');
    }
    const out = document.createElement('p'); out.className = 'score-result'; out.id = 'score-result'; out.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'actions';
    const add = document.createElement('button'); add.type = 'button'; add.id = 'score-add';
    add.onclick = () => {
      if (included().includes(openKey)) { manual.delete(openKey); removed.add(openKey); }
      else { manual.add(openKey); removed.delete(openKey); }
      changed();
    };
    const src = document.createElement('p'); src.className = 'hint'; src.textContent = 'Source: ' + def.source + '. The band is the published one; it is not a recommendation.';
    actions.append(add); panel.append(out, actions, src);
    update();
  }

  // Refresh values filled from the page without rebuilding the panel, so a tap in progress still lands.
  function syncPanel() {
    renderStatus();
    if (!openKey) return;
    const def = SCORES[openKey], s = st(openKey);
    evaluate(openKey);
    def.items.forEach(it => {
      if (!it.auto || s.touched.has(it.k)) return;
      const id = 'sc-' + openKey + '-' + it.k;
      if (it.kind === 'num') { const e = $(id); if (e) e.value = s.values[it.k] ?? ''; }
      else if (it.kind === 'choice') document.querySelectorAll('input[name="' + id + '"]').forEach(r => { r.checked = s.values[it.k] === Number(r.value); });
    });
    syncChecks();
    update();
  }

  function syncChecks() {
    if (!openKey) return;
    const s = st(openKey);
    SCORES[openKey].items.filter(it => it.kind === 'check').forEach(it =>
      document.querySelectorAll('#sc-' + openKey + '-' + it.k + ' button').forEach(b => b.setAttribute('aria-pressed', String(String(s.values[it.k]) === b.dataset.v))));
  }

  function update() {
    const out = $('score-result'), add = $('score-add');
    if (!out) return;
    const r = result(openKey), inNote = included().includes(openKey);
    out.textContent = r.text + (inNote ? (r.complete ? ' In the note.' : ' It goes into the note once every item is answered.') : '');
    out.classList.toggle('incomplete', !r.complete);
    add.disabled = false;
    add.textContent = inNote ? 'Remove from note' : 'Add to note';
  }

  function renderStatus() {
    list.replaceChildren();
    const keys = included();
    if (!keys.length) return;
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = 'Scores for the note';
    const ul = document.createElement('ul'); ul.className = 'score-list';
    keys.forEach(k => {
      const r = result(k), li = document.createElement('li'), t = document.createElement('span');
      t.textContent = r.complete ? r.text : SCORES[k].name + ': not in the note yet. ' + r.text;
      if (!r.complete) li.className = 'waiting';
      const btns = document.createElement('span'); btns.className = 'score-list-actions';
      if (!r.complete) { const o = document.createElement('button'); o.type = 'button'; o.className = 'secondary'; o.textContent = 'Answer';
        o.setAttribute('aria-label', 'Answer ' + SCORES[k].name); o.onclick = () => { open(k); panel.scrollIntoView({ block: 'start' }); }; btns.append(o); }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = 'Remove';
      b.setAttribute('aria-label', 'Remove ' + SCORES[k].name + ' from the note');
      b.onclick = () => { manual.delete(k); removed.add(k); changed(); };
      btns.append(b); li.append(t, btns); ul.append(li);
    });
    list.append(lbl, ul);
  }

  // Any change to the scores: refresh the card and tell the page, so the live note rebuilds.
  function changed() { renderStatus(); update(); card.dispatchEvent(new Event('change', { bubbles: true })); }

  pick.onchange = () => open(pick.value);
  if (autoBox) autoBox.onchange = () => { renderStatus(); update(); };
  $('condition').addEventListener('change', () => setTimeout(() => { renderSuggest(); renderStatus(); update(); }, 0));
  // Answers elsewhere on the page (observations, age, symptoms, history and exam chips) feed the scores.
  const outside = e => e.target && e.target.closest && !e.target.closest('#scores-card') && e.target.closest('main');
  let queued = false;
  const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; syncPanel(); }, 0); };
  document.addEventListener('input', e => { if (outside(e)) later(); });
  document.addEventListener('change', e => { if (outside(e)) later(); });
  document.addEventListener('click', e => { if (outside(e)) later(); });

  window.edScoreLines = () => included().map(result).filter(r => r.complete).map(r => r.text);
  window.edScoresClear = () => { manual.clear(); removed.clear(); for (const k in state) delete state[k]; if (autoBox) autoBox.checked = true; open(''); renderStatus(); };
  window.edScores = { SCORES, result, evaluate, state, context, included };
  renderSuggest(); renderStatus();
})();
