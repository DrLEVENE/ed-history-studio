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
    return { age: years, hr: num(v('hr')), rr: num(v('rr')), sbp: num(v('sbp')), dbp: num(v('dbp')), spo2: num(v('spo2')), temp: num(v('temp')),
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
        { k: 'acvpu', label: 'Consciousness', kind: 'choice', opts: [['Alert', 0], ['New confusion, or responds only to voice or pain, or unresponsive', 3]], show: 'consciousness' },
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
        { k: 'mental', label: 'Altered mentation (GCS below 15)', kind: 'choice', opts: [['No', 0], ['Yes', 1]], show: 'altered mentation' },
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
        { k: 't', label: 'Initial troponin', kind: 'choice', opts: [['At or below the normal limit', 0], ['1 to 3 times the normal limit', 1], ['More than 3 times the normal limit', 2]], show: 'troponin' }
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
        { k: 'prev', label: 'Previous DVT or PE', kind: 'check', pts: 1.5 },
        { k: 'haem', label: 'Haemoptysis', kind: 'check', pts: 1 },
        { k: 'ca', label: 'Malignancy (treatment within 6 months, or palliative)', kind: 'check', pts: 1 }
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
        { k: 'leg', label: 'Unilateral leg swelling', kind: 'check', pts: 1 },
        { k: 'haem', label: 'Haemoptysis', kind: 'check', pts: 1 },
        { k: 'surg', label: 'Surgery or trauma needing hospital treatment in the previous 4 weeks', kind: 'check', pts: 1 },
        { k: 'prev', label: 'Previous PE or DVT', kind: 'check', pts: 1 },
        { k: 'horm', label: 'Hormone use (oral contraceptive, hormone replacement or oestrogen)', kind: 'check', pts: 1 }
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
        { k: 'c', label: 'New confusion', kind: 'check', pts: 1 },
        { k: 'u', label: 'Urea', kind: 'choice', opts: [['Not available: score as CRB-65', 'NA'], ['7 mmol/L or less', 0], ['Over 7 mmol/L (BUN over 19 mg/dL)', 1]], show: 'urea' },
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
        { k: 'cough', label: 'Cough absent', kind: 'check', pts: 1 },
        { k: 'age', label: 'Age', kind: 'num', unit: 'years', min: 0, max: 130, auto: c => c.age == null ? null : Math.floor(c.age), pts: v => v < 15 ? 1 : v < 45 ? 0 : -1, show: 'age' }
      ],
      custom: true
    },
    gbs: {
      name: 'Glasgow-Blatchford', title: 'Glasgow-Blatchford score (upper GI bleeding)',
      source: 'Blatchford et al., Lancet 2000; ESGE guideline 2021',
      items: [
        { k: 'urea', label: 'Urea', kind: 'num', units: [['mmol/L', 1], ['BUN mg/dL', 1 / 2.8]], min: 0, max: 150, show: 'urea',
          pts: v => v < 6.5 ? 0 : v < 8 ? 2 : v < 10 ? 3 : v < 25 ? 4 : 6 },
        { k: 'sex', label: 'Sex (for haemoglobin points)', kind: 'choice', opts: [['Male', 'M'], ['Female', 'F']], auto: c => c.sex === 'Male' ? 0 : c.sex === 'Female' ? 1 : null, show: null },
        { k: 'hb', label: 'Haemoglobin', kind: 'num', units: [['g/dL', 1], ['g/L', 0.1]], min: 1, max: 25, show: 'Hb',
          pts: (v, s) => s.sex === 1 ? (v >= 12 ? 0 : v >= 10 ? 1 : 6) : (v >= 13 ? 0 : v >= 12 ? 1 : v >= 10 ? 3 : 6) },
        { k: 'sbp', label: 'Systolic BP', kind: 'num', unit: 'mmHg', min: 1, max: 400, auto: c => c.sbp, pts: v => v < 90 ? 3 : v < 100 ? 2 : v < 110 ? 1 : 0, show: 'SBP' },
        { k: 'hr', label: 'Pulse 100 or more', kind: 'check', pts: 1, auto: c => c.hr == null ? null : c.hr >= 100 },
        { k: 'mel', label: 'Melaena', kind: 'check', pts: 1 },
        { k: 'sync', label: 'Presented with syncope', kind: 'check', pts: 2 },
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
    'Decreased responsiveness — elderly': ['gcs', 'fourat', 'news2'], 'Acute confusional state': ['fourat', 'gcs', 'news2'],
    'Unwitnessed fall': ['gcs', 'fourat'], 'Fall from height': ['gcs'], 'Motor vehicle / motorbike collision': ['gcs'], 'Physical assault': ['gcs'],
    'Seizure': ['gcs'], 'Toxic ingestion': ['gcs', 'news2'], 'Behavioural change': ['fourat', 'gcs'], 'Suspected stroke': ['gcs'], 'Syncope': ['news2']
  };

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
      }
      const val = s.values[it.k];
      if (it.kind === 'check') { pts[it.k] = val ? it.pts : 0; sel[it.k] = !!val; continue; }
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

  const lowerFirst = t => /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  const fmt = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

  // Result sentence for the panel and the note. Returns {text, complete}.
  function result(key) {
    const r = evaluate(key), { def, s, pts } = r;
    if (r.missing.length) return { complete: false, text: 'Answer: ' + r.missing.join('; ') + '.' };
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
  const card = $('scores-card');
  if (!card) return;
  const pick = $('score-pick'), panel = $('score-panel'), suggest = $('score-suggest'), list = $('score-added');
  ORDER.forEach(k => pick.add(new Option(SCORES[k].title, k)));

  function renderSuggest() {
    const cond = $('condition').value, keys = SUGGEST[cond] || ['news2'];
    suggest.replaceChildren();
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.id = 'score-suggest-lbl'; lbl.textContent = 'Suggested for ' + cond;
    const row = document.createElement('div'); row.className = 'quick-options'; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', lbl.id);
    keys.forEach(k => { const b = document.createElement('button'); b.type = 'button'; b.textContent = SCORES[k].name; b.dataset.score = k;
      b.setAttribute('aria-pressed', String(openKey === k)); b.onclick = () => open(openKey === k ? '' : k); row.append(b); });
    suggest.append(lbl, row);
  }

  function open(key) {
    openKey = key; pick.value = key; renderSuggest(); renderPanel();
  }

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
          inp.onchange = () => { s.values[it.k] = i; s.touched.add(it.k); update(); };
          l.append(inp, text); row.append(l);
        });
        wrap.append(lbl, row);
        if (it.hint) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = it.hint; wrap.append(p); }
      } else {
        const l = document.createElement('label'); l.className = 'score-num'; l.textContent = it.label + (it.unit ? ' (' + it.unit + ')' : '');
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.id = id; inp.value = s.values[it.k] ?? '';
        inp.oninput = () => { s.values[it.k] = inp.value; s.touched.add(it.k); update(); };
        l.append(inp);
        if (it.units) {
          const u = document.createElement('select'); u.setAttribute('aria-label', it.label + ' unit');
          it.units.forEach(([t], i) => u.add(new Option(t, String(i)))); u.value = String(s.values[it.k + '_unit'] || 0);
          u.onchange = () => { s.values[it.k + '_unit'] = Number(u.value); update(); };
          l.append(u);
        }
        if (it.auto) { const tag = document.createElement('span'); tag.className = 'score-from'; tag.textContent = 'Filled from the page; check it'; l.append(tag); }
        wrap.append(l);
      }
      panel.append(wrap);
    });
    if (checks.length) {
      const wrap = document.createElement('div'); wrap.className = 'score-item';
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.id = 'sc-' + openKey + '-checks'; lbl.textContent = openKey === 'perc' ? 'Criteria present' : 'Tick each criterion that is present';
      const row = document.createElement('div'); row.className = 'quick-options score-checks'; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', lbl.id);
      checks.forEach(it => {
        const l = document.createElement('label'), inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!s.values[it.k]; inp.dataset.k = it.k;
        inp.onchange = () => { s.values[it.k] = inp.checked; s.touched.add(it.k); update(); };
        const pts = document.createElement('span'); pts.className = 'score-pts'; pts.textContent = openKey === 'perc' ? '' : ' ' + signed(it.pts);
        l.append(inp, it.label, pts); if (it.auto) l.title = 'Filled from the page; check it'; row.append(l);
      });
      wrap.append(lbl, row); panel.append(wrap);
    }
    const out = document.createElement('p'); out.className = 'score-result'; out.id = 'score-result'; out.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'actions';
    const add = document.createElement('button'); add.type = 'button'; add.id = 'score-add'; add.textContent = 'Add to note';
    add.onclick = () => {
      const r = result(openKey); if (!r.complete) return;
      const i = added.findIndex(a => a.key === openKey); const item = { key: openKey, text: r.text };
      if (i >= 0) added[i] = item; else added.push(item);
      renderAdded(); markDirty();
    };
    const src = document.createElement('p'); src.className = 'hint'; src.textContent = 'Source: ' + def.source + '. The band is the published one; it is not a recommendation.';
    actions.append(add); panel.append(out, actions, src);
    update();
  }

  // Refresh values filled from the page without rebuilding the panel, so a tap in progress still lands.
  function syncPanel() {
    if (!openKey) return;
    const def = SCORES[openKey], s = st(openKey);
    evaluate(openKey);
    def.items.forEach(it => {
      if (!it.auto || s.touched.has(it.k)) return;
      const id = 'sc-' + openKey + '-' + it.k;
      if (it.kind === 'num') { const e = $(id); if (e) e.value = s.values[it.k] ?? ''; }
      else if (it.kind === 'choice') document.querySelectorAll('input[name="' + id + '"]').forEach(r => { r.checked = s.values[it.k] === Number(r.value); });
      else { const e = panel.querySelector('input[data-k="' + it.k + '"]'); if (e) e.checked = !!s.values[it.k]; }
    });
    update();
  }

  function update() {
    const out = $('score-result'), add = $('score-add');
    if (!out) return;
    const r = result(openKey);
    const inNote = added.find(a => a.key === openKey);
    const stale = inNote && r.complete && inNote.text !== r.text;
    out.textContent = r.text + (stale ? ' The note still has an earlier version: press Update in note.' : inNote && r.complete ? ' This is in the note.' : '');
    out.classList.toggle('incomplete', !r.complete || !!stale);
    add.disabled = !r.complete || (inNote && !stale);
    add.textContent = inNote ? 'Update in note' : 'Add to note';
  }

  function renderAdded() {
    list.replaceChildren();
    if (!added.length) return;
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = 'In the note';
    const ul = document.createElement('ul'); ul.className = 'score-list';
    added.forEach((a, i) => {
      const li = document.createElement('li'); const t = document.createElement('span'); t.textContent = a.text;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = 'Remove';
      b.setAttribute('aria-label', 'Remove ' + SCORES[a.key].name + ' from the note');
      b.onclick = () => { added.splice(i, 1); renderAdded(); update(); markDirty(); };
      li.append(t, b); ul.append(li);
    });
    list.append(lbl, ul);
    update();
  }

  // Tell the page the encounter changed, so the live note rebuilds.
  function markDirty() { card.dispatchEvent(new Event('change', { bubbles: true })); }

  pick.onchange = () => open(pick.value);
  $('condition').addEventListener('change', () => setTimeout(renderSuggest, 0));
  // Keep filled-in values in step with the observations and age while a score is open.
  const fromPage = e => openKey && e.target && e.target.id && /^(age|ageunit|sex)$|-v-/.test(e.target.id);
  document.addEventListener('input', e => { if (fromPage(e)) syncPanel(); });
  document.addEventListener('change', e => { if (fromPage(e)) syncPanel(); });
  // Chips set the hidden sex select without an event of their own.
  document.addEventListener('click', e => { if (openKey && e.target.closest && e.target.closest('#intro')) setTimeout(syncPanel, 0); });

  window.edScoreLines = () => added.map(a => a.text);
  window.edScoresClear = () => { added.length = 0; for (const k in state) delete state[k]; open(''); renderAdded(); };
  window.edScores = { SCORES, result, evaluate, state, context };
  renderSuggest();
})();
