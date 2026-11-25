// Automated checks for ED History Studio. Run with: npm test
// Uses fictional entries only. Exits with code 1 if any check fails.
const path = require('path');
const { chromium, devices } = require('playwright');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = [];
const g0Sym = (pg, t, v) => pg.locator('#symptoms .rapid-row').filter({ has: pg.locator('span', { hasText: new RegExp('^' + t + '$') }) }).locator('button[data-value=' + v + ']').click();
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  let acceptDialogs = true;
  page.on('dialog', d => (acceptDialogs ? d.accept() : d.dismiss()));
  const note = () => page.inputValue('#output');
  const status = () => page.textContent('#status');
  const settle = () => page.waitForTimeout(450);
  const clear = async () => { acceptDialogs = true; await page.click('#reset'); await settle(); };

  await page.goto(PAGE);

  // 1. Presentation list
  const names = await page.evaluate(() => [...document.querySelectorAll('#condition option')].map(o => o.value));
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  check('Presentations load (at least 45)', names.length >= 45, names.length + ' found');
  check('Presentations are alphabetical', JSON.stringify(names) === JSON.stringify(sorted));

  // 2. Every presentation produces a note from typical entries
  const failed = [];
  for (const name of names) {
    await page.selectOption('#condition', name);
    await page.fill('#pc0', 'test complaint');
    await page.evaluate(() => {
      document.querySelectorAll('#fields input:not([type=hidden]):not([type=checkbox])').forEach(e => {
        if (!e.hidden) { e.value = 'x'; e.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      document.querySelectorAll('#fields .shortcuts').forEach(g => g.querySelector('button').click());
    });
    const minus = await page.$('#symptoms button[data-value=absent]');
    if (minus) await minus.click();
    await settle();
    if (!(await note()).includes('HPC:') || !/^Note up to date/.test(await status())) failed.push(name + ': ' + (await status()));
  }
  check('Every presentation generates a note', failed.length === 0, failed.join(' | '));

  // 3. Nothing is assumed
  await clear();
  await page.selectOption('#condition', 'Chest pain');
  await page.fill('#pc0', 'chest pain');
  await settle();
  let text = await note();
  check('Untouched symptoms are not recorded as denied', !/denies|reports no/i.test(text), text.slice(0, 120));
  check('No examination is written when none was entered', !/EXAMINATION:/.test(text));
  check('No normal findings are assumed', !/normal/i.test(text));

  // 4. Only symptoms marked − are denied
  const row = t => page.locator('#symptoms .rapid-row', { hasText: new RegExp('^' + t) });
  await row('Dyspnoea').locator('button[data-value=present]').click();
  await row('Syncope').locator('button[data-value=absent]').click();
  await settle();
  text = await note();
  check('Present symptom is reported', /Associated symptoms include dyspnoea\./.test(text), text.match(/Associated[^.]*\./)?.[0]);
  check('Denied symptom is listed', /The patient denies syncope\./.test(text), text.match(/denies[^.]*\./i)?.[0]);

  // 5. Durations
  await page.fill('#dur0', '2/24');
  await settle();
  check('6/24-style durations read as hours', /for 2 hours/.test(await note()));

  // 6. Age validation
  await page.fill('#age', '-3');
  await settle();
  check('Negative age is refused', /non-negative age/i.test(await status()) && (await note()) === '');
  await page.fill('#age', '58');
  await settle();

  // 7. Vital signs outside limits are refused and Copy is blocked
  await page.fill('#e1-v-spo2', '150');
  await settle();
  check('Impossible SpO2 is refused', /outside/.test(await status()), await status());
  await page.click('#copy');
  check('Copy is blocked while a vital sign is out of range', /outside/.test(await status()));
  await page.fill('#e1-v-spo2', '97');
  await settle();
  check('Valid SpO2 is recorded', /SpO₂ 97 %/.test(await note()));

  // 8. Manual edits are never overwritten without asking
  await page.locator('#output').focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' EDITED');
  await page.fill('#plan', 'ECG');
  await settle();
  check('Typing in the note pauses automatic updates', (await note()).includes('EDITED'));
  acceptDialogs = false;
  await page.click('#generate');
  check('Declining Update note keeps the edit', (await note()).includes('EDITED'));
  acceptDialogs = true;
  await page.click('#generate');
  check('Accepting Update note rebuilds it', !(await note()).includes('EDITED') && /ECG/.test(await note()));

  // 9. "Mark the rest as denied" asks first
  acceptDialogs = false;
  await page.locator('#symptoms button', { hasText: 'Mark the rest' }).click();
  const absentAfterDismiss = await page.evaluate(() => [...document.querySelectorAll('#symptoms .rapid-row input')].filter(e => e.value === 'absent').length);
  check('Mark-the-rest does nothing when cancelled', absentAfterDismiss === 1, absentAfterDismiss + ' denied');
  acceptDialogs = true;

  // 10. Consent gate for intimate findings
  await clear();
  await page.selectOption('#condition', 'Penile Discharge');
  await page.fill('#pc0', 'discharge');
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#normal-exam input[data-finding]')].find(e => e.dataset.system === 'Male genitourinary');
    c.closest('details').open = true; c.click();
  });
  await settle();
  check('Intimate findings need recorded consent', /Record specific consent/.test(await status()) && (await note()) === '', await status());

  // 11. History source and how it was obtained
  await clear();
  await page.selectOption('#condition', 'Unwitnessed fall');
  await page.fill('#pc0', 'an unwitnessed fall at home');
  await page.locator('#intro button:text-is("Family member")').click();
  await page.locator('#how label', { hasText: 'By telephone' }).click();
  await settle();
  text = await note();
  check('Note states who gave the history and how', /History was obtained from the family member by telephone\./.test(text));
  await g0Sym(page, 'Head strike', 'present'); await g0Sym(page, 'Neck pain', 'absent'); await g0Sym(page, 'Vomiting', 'absent');
  await settle();
  text = await note();
  check('Symptoms from someone else are attributed to them', /According to the family member, associated symptoms include head strike\./.test(text) && /The family member reports no vomiting or neck pain\.|The family member reports no neck pain or vomiting\./.test(text), text.match(/(According|The family member reports)[^.]*\./g)?.join(' '));
  check('PC line is capitalised without a leading article', /PC:\nUnwitnessed fall at home/.test(text));

  // 12. Side chips
  await page.evaluate(() => document.querySelectorAll('#normal-exam > details').forEach(d => (d.open = true)));
  const hip = page.locator('#normal-exam .exam-quick', { hasText: 'Hips / limbs / weight-bearing' });
  await hip.locator('label', { hasText: 'Leg shortened and externally rotated' }).click();
  await hip.locator('.side button:text-is("Right")').click();
  await settle();
  check('Side is recorded with the finding', /Right side: leg shortened and externally rotated/.test(await note()));

  // 12b. A finding clears every finding it conflicts with
  await clear();
  await page.selectOption('#condition', 'UTI / Dysuria');
  await page.evaluate(() => document.querySelectorAll('#normal-exam > details').forEach(d => (d.open = true)));
  for (const t of ['Right renal angle tenderness', 'Left renal angle tenderness', 'No renal angle tenderness'])
    await page.locator('input[aria-label="Renal angles — ' + t + '"]').click({ force: true });
  const angles = await page.evaluate(() => [...document.querySelectorAll('input[aria-label^="Renal angles —"]')].filter(e => e.checked).map(e => e.getAttribute('aria-label')));
  check('Conflicting findings are cleared (no renal angle tenderness clears both sides)', angles.length === 1 && /No renal/.test(angles[0]), angles.join(', '));

  // 12c. My quick normal exam: exact wording, clash protection, removal
  await clear();
  await page.selectOption('#condition', 'Fracture');
  await page.fill('#pc0', 'a painful wrist');
  await page.click('#quicknormal');
  await settle();
  const quickTarget = 'General appearance and observations\nPatient in no distress. Mucous membranes pink and moist. Anicteric and acyanotic.\n\nAbdominal examination\nAbdomen not distended. Abdomen soft and non-tender. No guarding or rigidity. No palpable masses. No palpable hepatomegaly or splenomegaly. Bowel sounds heard.\n\nRespiratory system\nChest expansion symmetrical. No crackles or wheeze. No increased work of breathing. Air entry equal bilaterally.\n\nCardiovascular system\nPulse regular with normal volume. S1 and S2 heard. No murmurs or added heart sounds.';
  const examPart = async () => ((await note()).split('EXAMINATION:\n')[1] || '').split('\n\nPLAN')[0].trim();
  check('Quick normal exam writes Dr Levene\'s wording exactly', (await examPart()) === quickTarget, await examPart());
  await page.click('#quicknormal');
  await settle();
  check('Quick normal exam can be removed in one tap', (await examPart()) === '');
  await page.evaluate(() => { const w = document.querySelector('#normal-exam input[data-system="Respiratory"][data-finding="Wheeze"]'); w.closest('details').open = true; w.click(); });
  await page.click('#quicknormal');
  await settle();
  check('Quick normal exam never overrides a ticked abnormal finding', !/No crackles or wheeze|No wheeze/.test(await examPart()) && /Wheeze\./.test(await examPart()));
  await page.evaluate(() => document.querySelector('#normal-exam input[data-system="Cardiovascular"][data-finding="Murmur"]').click());
  await settle();
  check('Ticking an abnormal finding clears the normal it contradicts', /Murmur\./.test(await examPart()) && !/No murmurs?/.test(await examPart()));

  // 12d. Version 48: observations at the top, time seen, copy by section, keyboard, essentials, quick normal check
  await clear();
  await page.selectOption('#condition', 'Chest pain');
  check('Observations sit at the top of the form', await page.evaluate(() => !!document.querySelector('#obs-slot #e1-v-hr') && !document.querySelector('#exam #e1-v-hr')));
  await page.fill('#pc0', 'chest pain');
  await page.fill('#e1-v-hr', '120');
  await settle();
  await page.selectOption('#condition', 'UTI / Dysuria');
  await settle();
  check('Observations survive switching presentation', (await page.inputValue('#e1-v-hr')) === '120' && /HR 120 \/min/.test(await note()));
  await page.click('#timenow');
  await settle();
  check('Time seen is added to the note when set', /^TIME SEEN: \d\d:\d\d\n\nPC:/.test(await note()), (await note()).slice(0, 40));
  const hpcOnly = await page.evaluate(() => noteSection(document.getElementById('output').value, 'HPC')?.body || '');
  check('Copy section picks out just that section', hpcOnly.length > 0 && !/PC:|EXAMINATION:|TIME SEEN/.test(hpcOnly), hpcOnly.slice(0, 60));
  await page.click('.copyparts button[data-part="PLAN"]');
  check('Copying a missing section says so', /no Plan section/.test(await status()), await status());
  await page.click('#quicknormal');
  await settle();
  const prompts = await page.evaluate(() => [...document.querySelectorAll('#quicknormal-check li')].map(l => l.textContent));
  check('Quick normal exam prompts when heart rate is abnormal', prompts.some(t => /Heart rate 120/.test(t)), prompts.join(' | '));
  check('The prompt never blocks the note', /Pulse regular with normal volume/.test(await note()));
  await page.focus('#age');
  let tabs = 0;
  for (; tabs < 40; tabs++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => document.activeElement.id === 'pc0')) break; }
  check('Age to Complaint takes at most 10 Tab presses', tabs + 1 <= 10, (tabs + 1) + ' presses');
  await page.locator('#intro .quick-options button:text-is("Male")').focus();
  await page.keyboard.press('ArrowRight');
  check('Arrow keys move within a chip group', await page.evaluate(() => document.activeElement.textContent === 'Female'));
  // 13. Clear encounter
  await clear();
  const leftovers = await page.evaluate(() => ({
    note: document.getElementById('output').value,
    how: [...document.querySelectorAll('#how input')].filter(e => e.checked || !e.value).length,
    paeds: document.getElementById('paeds').checked,
    complaint: document.getElementById('pc0').value
  }));
  check('Clear encounter empties everything', !leftovers.note && !leftovers.how && !leftovers.paeds && !leftovers.complaint, JSON.stringify(leftovers));

  // 14. Medication order arithmetic
  await page.check('#paeds');
  for (const [id, v] of [['weight', '12.3'], ['medname', 'Testamol'], ['route', 'PO'], ['frequency', 'q6h'], ['dose', '0.1'], ['maxdose', '1000'], ['reference', 'test reference']]) await page.fill('#' + id, v);
  await page.check('#verified');
  await page.click('#addorder');
  check('Order uses rounded dose (12.3 kg × 0.1 mg/kg = 1.23 mg)', /Testamol 1\.23 mg /.test(await page.textContent('#medlist')), await page.textContent('#medlist'));

  // 15. Phone layout
  const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(PAGE);
  const layout = await phone.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    openSystems: [...document.querySelectorAll('#normal-exam > details')].filter(d => d.open).length,
    quickbar: getComputedStyle(document.querySelector('.quickbar')).display
  }));
  check('Phone: no sideways scrolling', !layout.overflow);
  check('Phone: examination systems start collapsed', layout.openSystems === 1, layout.openSystems + ' open');
  check('Phone: quick bar is shown', layout.quickbar === 'flex');

  // 16. Privacy: no outside requests
  const outside = [];
  const fresh = await browser.newPage();
  fresh.on('request', r => { if (!r.url().startsWith('file:')) outside.push(r.url()); });
  await fresh.goto(PAGE);
  await fresh.waitForTimeout(500);
  check('No requests leave the page', outside.length === 0, outside.join(', '));

  // 17. Check wording (Harper) runs on the device and fixes the HPC
  const http = require('http'), fs = require('fs'), ROOT = path.resolve(__dirname, '..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.gz': 'application/gzip', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]), file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const g = await browser.newPage();
  const leaving = [];
  g.on('pageerror', e => errors.push(e.message));
  g.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:' + base)) leaving.push(r.url()); });
  g.on('dialog', d => d.accept());
  const clearG = async () => { await g.click('#reset'); await g.waitForTimeout(450); };
  await g.goto(base + '/index.html');
  await g.selectOption('#condition', 'UTI / Dysuria');
  await g.fill('#pc0', 'burning on passing urine');
  await g.locator('#fields label', { hasText: 'Onset / duration / course' }).first().locator('input').fill('started 3 days ago with no recall of of any trigger');
  await g.locator('#symptoms .rapid-row').filter({ has: g.locator('span', { hasText: /^Dysuria$/ }) }).locator('button[data-value=present]').click();
  await g.locator('#symptoms .rapid-row').filter({ has: g.locator('span', { hasText: /^Suprapubic pain$/ }) }).locator('button[data-value=present]').click();
  await g.waitForTimeout(500);
  const ready = () => g.waitForFunction(() => !document.getElementById('checkwording').disabled && !/Loading|Checking/.test(document.getElementById('grammar-note').textContent), null, { timeout: 120000 });
  await g.click('#checkwording');
  await ready();
  const found = await g.evaluate(() => [...document.querySelectorAll('#grammar-list .lint mark')].map(m => m.textContent));
  check('Check wording finds a repeated word', found.includes('of of'), found.join(', ') || await g.textContent('#grammar-note'));
  check('Check wording does not flag the site\'s medical words', !found.some(w => /dysuria|suprapubic/i.test(w)), found.join(', '));
  await g.locator('#grammar-list .lint', { hasText: 'of of' }).locator('button', { hasText: 'Change to' }).first().click();
  await g.waitForTimeout(1500);
  check('Applying a suggestion corrects the note', !(await g.inputValue('#output')).includes('of of'));
  check('Check wording sends nothing off the device', leaving.length === 0, leaving.join(', '));

  // 18. Read observations from a photo, on the device (fictional test images)
  const fx = f => path.join(__dirname, 'fixtures', f);
  const readPhoto = async f => { await g.setInputFiles('#photo-file', fx(f)); await g.waitForSelector('#photo-panel .actions button', { timeout: 120000 }); };
  const photoVals = () => g.$$eval('.photo-row', rs => Object.fromEntries(rs.map(r => [r.querySelector('label').textContent.trim(), r.querySelector('input[type=number]')?.value || r.querySelector('.photo-unit')?.textContent])));
  await clearG();
  await readPhoto('triage-photo-fictional.jpg');
  let pv = await photoVals();
  check('Photo: reads BP, HR, RR, SpO₂, temperature and room air from a skewed, blurred photo', pv.SBP === '142' && pv.DBP === '88' && pv.HR === '104' && pv.RR === '22' && pv['SpO₂'] === '91' && pv.Temperature === '38.4' && pv.Oxygen === 'Room air', JSON.stringify(pv));
  const unclear = await g.$$eval('.photo-row', rs => rs.filter(r => /unclear in the image/.test(r.textContent)).map(r => r.querySelector('label').textContent.trim()));
  check('Photo: values the reader was unsure of are left unticked for checking', await g.$$eval('.photo-row', rs => rs.every(r => !/unclear in the image/.test(r.textContent) || !r.querySelector('input[type=checkbox]').checked)), unclear.join(', '));
  for (const cb of await g.$$('.photo-row input[type=checkbox]')) await cb.check();
  await g.click('#photo-fill'); await g.waitForTimeout(500);
  check('Photo: Fill observations puts the values in the note and discards the photo', /BP 142\/88 mmHg\. HR 104 \/min\. RR 22 \/min\. SpO₂ 91 %\. Temperature 38\.4 °C\. Room air/.test(await g.inputValue('#output')) && (await g.locator('#photo-panel > *').count()) === 0);
  await readPhoto('fahrenheit-fictional.png');
  pv = await photoVals();
  check('Photo: converts °F and reads nasal cannula oxygen', pv.Temperature === '38.5' && pv['SpO₂'] === '95' && /Nasal cannula, 2 L\/min/.test(pv.Oxygen), JSON.stringify(pv));
  await g.locator('#photo-panel .actions button', { hasText: 'Discard' }).click();
  await readPhoto('flowsheet-photo-fictional.jpg');
  await g.locator('.photo-sets button', { hasText: '2nd' }).click();
  pv = await photoVals();
  check('Photo: a flowsheet\'s second reading switches every value together', pv.SBP === '128' && pv.DBP === '80' && pv.HR === '96' && pv['SpO₂'] === '94' && pv.Temperature === '37.9', JSON.stringify(pv));
  await g.locator('#photo-panel .actions button', { hasText: 'Discard' }).click();
  check('Photo: nothing leaves the device', leaving.length === 0, leaving.join(', '));

  // 19. Labs: image, photo safeguards, pasted text, links to scores (fictional reports)
  await clearG();
  await g.selectOption('#condition', 'Cough / Cold / Flu'); await g.fill('#age', '70');
  const readLabs = async f => { await g.setInputFiles('#labs-file', fx(f)); await g.waitForSelector('#labs-panel .actions button', { timeout: 120000 }); };
  const labRows = () => g.$$eval('.labs-review .photo-row', rs => Object.fromEntries(rs.map(r => [r.querySelector('label').textContent.trim(), { v: r.querySelector('input[type=number]').value, flag: r.querySelector('.labs-flag').textContent, on: r.querySelector('input[type=checkbox]').checked, warn: r.querySelector('.photo-note').textContent }])));
  await readLabs('lab-report-fictional.png');
  let lr = await labRows();
  const want = { Hb: ['112', 'Low'], WCC: ['14.2', 'High'], neutrophils: ['11.8', 'High'], platelets: ['250', ''], Na: ['133', 'Low'], K: ['4.1', ''], urea: ['9.1', 'High'], creatinine: ['112', 'High'], CRP: ['87', 'High'], troponin: ['45', 'High'], lactate: ['2.8', 'High'] };
  const labBad = Object.entries(want).filter(([n, [v, f]]) => !lr[n] || lr[n].v !== v || lr[n].flag !== f).map(([n]) => n + '=' + JSON.stringify(lr[n]));
  check('Labs: reads 11 results with correct high and low flags from a report image', labBad.length === 0, labBad.join(' | '));
  await g.click('#labs-add'); await g.waitForTimeout(500);
  const ln = await g.inputValue('#output');
  check('Labs: results go into the note under INVESTIGATIONS, grouped', /INVESTIGATIONS:\nFBC: Hb 112 g\/L \(low\), WCC 14\.2 ×10⁹\/L \(high\), neutrophils 11\.8 ×10⁹\/L \(high\), platelets 250 ×10⁹\/L\.\nU&E: Na 133 mmol\/L \(low\), K 4\.1 mmol\/L, urea 9\.1 mmol\/L \(high\), creatinine 112 µmol\/L \(high\)\./.test(ln) && /Cardiac: troponin 45 ng\/L \(high\) \(assay upper limit 34\)\./.test(ln), ln.slice(ln.indexOf('INVESTIGATIONS')));
  check('Labs: urea from the report answers CURB-65', await g.evaluate(() => window.edScores.evaluate('curb65') && window.edScores.state.curb65.values.u === 2));
  await readLabs('lab-photo-fictional.jpg');
  lr = await labRows();
  check('Labs: misread values in a blurred photo are left unticked with a reason', lr.urea && !lr.urea.on && /unusual value/.test(lr.urea.warn) && lr.WCC && lr.WCC.on, JSON.stringify(lr.urea));
  await g.locator('#labs-panel .actions button', { hasText: 'Discard' }).click();
  await g.fill('#labs-text', 'pH 7.28  pCO2 7.9 kPa  HCO3 27  Glucose 6.2'); await g.click('#labs-textbtn'); await g.click('#labs-add'); await g.waitForTimeout(500);
  check('Labs: pasted text is read too', /Gas: lactate 2\.8 mmol\/L \(high\), pH 7\.28 \(low\), pCO₂ 7\.9 kPa \(high\), HCO₃ 27 mmol\/L\./.test(await g.inputValue('#output')));
  const shot = fs.readFileSync(fx('lab-report-fictional.png')).toString('base64');
  await g.evaluate(b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'shot.png', { type: 'image/png' })); const z = document.getElementById('labs-paste-zone'); z.hidden = false; z.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, shot);
  await g.waitForSelector('#labs-panel .actions button', { timeout: 120000 });
  check('Labs: a pasted screenshot is read', (await g.locator('.labs-review .photo-row').count()) >= 10);
  await g.locator('#labs-panel .actions button', { hasText: 'Discard' }).click();
  check('Labs: nothing leaves the device', leaving.length === 0, leaving.join(', '));

  // 20. Diagnosis support: rule-based, on the device
  await clearG();
  const H = async t => g.locator('#fields label:visible, #fields button:visible', { hasText: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
  const SY = (n, v) => g.locator(`#symptoms button[aria-label="${n} — ${v || 'present'}"]`).click();
  const dxTop = async () => { await g.waitForTimeout(400); return g.$$eval('#dx-out .ai-dx:not(.ai-mnm) h3', hs => hs.map(h => h.textContent.replace(/^\d\.\s*/, ''))); };
  await g.selectOption('#condition', 'Chest pain'); await g.fill('#age', '62');
  for (const h of ['Central / retrosternal', 'Pressure', 'Left arm', 'Exertion worsens']) await H(h);
  await SY('Diaphoresis');
  await g.fill('#labs-text', 'Troponin I 120 ng/L (<14)'); await g.click('#labs-textbtn'); await g.click('#labs-add');
  let top3 = await dxTop();
  check('Diagnosis: typical ACS history with a raised troponin ranks ACS first', top3[0] === 'Acute coronary syndrome' && top3.length === 3, top3.join(' > '));
  const fits = await g.locator('#dx-out .ai-dx').first().textContent();
  check('Diagnosis: shows the recorded findings behind the ranking', /Fits.*Pressure.*Diaphoresis.*age 62.*troponin 120 ng\/L/s.test(fits), fits);
  check('Diagnosis: must-not-miss diagnoses are listed when not in the top 3', /Must not miss/.test(await g.textContent('#dx-out')));
  check('Diagnosis: nothing enters the note until ticked', !/IMPRESSION/.test(await g.inputValue('#output')));
  await g.locator('#dx-out .ai-dx').first().locator('.ai-tick input').check(); await g.waitForTimeout(600);
  check('Diagnosis: ticked diagnoses go under IMPRESSION', /\n\nIMPRESSION:\nDifferential: 1\. Acute coronary syndrome\./.test(await g.inputValue('#output')));
  await clearG();
  check('Diagnosis: Clear encounter removes the impression', !/IMPRESSION/.test(await g.inputValue('#output')));
  await g.selectOption('#condition', 'Chest pain'); await g.fill('#age', '24');
  for (const h of ['Sharp', 'Palpation reproduces', 'Movement worsens']) await H(h);
  top3 = await dxTop();
  check('Diagnosis: reproducible chest wall pain in a young adult ranks musculoskeletal first', top3[0] === 'Musculoskeletal chest wall pain', top3.join(' > '));
  await clearG(); await g.selectOption('#condition', 'Headache'); await H('Sudden'); await SY('Thunderclap onset');
  top3 = await dxTop();
  check('Diagnosis: thunderclap headache ranks subarachnoid haemorrhage first', top3[0] === 'Subarachnoid haemorrhage', top3.join(' > '));
  await clearG(); await g.selectOption('#condition', 'PV Bleeding'); await H('Pregnancy possible / status unknown'); await SY('Shoulder-tip pain'); await SY('Syncope');
  top3 = await dxTop();
  check('Diagnosis: shoulder-tip pain and syncope with possible pregnancy ranks ectopic first', top3[0] === 'Ectopic pregnancy', top3.join(' > '));
  await clearG(); await g.selectOption('#condition', 'Acute abdomen — atraumatic'); await g.locator('#intro button:visible, #intro label:visible', { hasText: /^Female$/ }).first().click(); await g.waitForTimeout(400);
  const sexSet = await g.inputValue('#sex');
  check('Diagnosis: diagnoses ruled out by sex are not offered (no testicular torsion for a woman)', sexSet === 'Female' && !/Testicular torsion/.test(await g.textContent('#dx-out')), sexSet);
  const rulesOk = await g.evaluate(() => Object.keys(window.edDx.RULES).length);
  check('Diagnosis: rules cover every presentation except sexual assault', rulesOk === (await g.$$eval('#condition option', o => o.filter(x => x.value).length)) - 1, String(rulesOk));
  // 21. Lab interpretation against the laboratory's own ranges
  await clearG(); await g.selectOption('#condition', 'DKA');
  await g.fill('#labs-text', 'Hb 9.2 g/dL (13.0-17.0)\nMCV 72 fL (80-100)\nSodium 127 mmol/L (135-145)\nPotassium 6.2 mmol/L (3.5-5.3)\nChloride 100 mmol/L (98-107)\nGlucose 22.1 mmol/L (3.9-7.8)\nKetones 4.2 mmol/L (<0.6)\npH 7.18 (7.35-7.45)\npCO2 3.1 kPa (4.7-6.0)\nHCO3 9 mmol/L (22-29)\nCalcium 2.05 mmol/L (2.20-2.60)\nAlbumin 31 g/L (35-50)');
  await g.click('#labs-textbtn'); await g.click('#labs-add'); await g.waitForTimeout(500);
  let it = await g.inputValue('#output');
  check('Lab interpretation: grades and patterns go into the note under Investigations', /Interpretation:\n- Anaemia, moderate \(Hb 9\.2 g\/dL\), microcytic/.test(it) && /Hyponatraemia, moderate/.test(it) && /Hyperkalaemia, moderate/.test(it) && /Meets the JBDS biochemical criteria for diabetic ketoacidosis/.test(it) && /metabolic acidosis, appropriately compensated/.test(it) && /Raised anion gap of 18/.test(it) && /Calculated adjusted calcium 2\.23 mmol\/L \(normal\)/.test(it), it.slice(it.indexOf('Interpretation')));
  await clearG(); await g.selectOption('#condition', 'Fever');
  await g.fill('#labs-text', 'Sodium 133 mmol/L (133-146)\nPotassium 5.6 mmol/L (3.5-5.8)\nWBC 10.8 (4.0-10.0)'); await g.click('#labs-textbtn'); await g.click('#labs-add'); await g.waitForTimeout(500);
  it = await g.inputValue('#output');
  check('Lab interpretation: abnormal means outside the laboratory\'s own range from the report', !/Hyponatraemia|Hyperkalaemia/.test(it) && /Leucocytosis \(WCC 10\.8/.test(it), it.slice(it.indexOf('INVESTIGATIONS')));
  await g.uncheck('#labs-interp'); await g.waitForTimeout(500);
  check('Lab interpretation: can be left out of the note', !/Interpretation:/.test(await g.inputValue('#output')));
  await clearG();
  check('No feature sends anything off the device', leaving.length === 0, leaving.join(', '));
  server.close();

  // Version 50: form safety and accessibility
  await clear();
  await page.selectOption('#condition', 'Chest pain'); await settle();
  const v50 = await page.evaluate(() => ({
    autofill: [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea')].filter(e => e.autocomplete !== 'off').length,
    keypad: [...document.querySelectorAll('input[type=number]')].filter(e => e.inputMode !== 'decimal').length,
    unnamed: [...document.querySelectorAll('button.more')].filter(b => !/^Add detail: ./.test(b.getAttribute('aria-label') || '')).length }));
  check('Browser form history is off for every field', v50.autofill === 0, v50.autofill + ' fields allow autofill');
  check('Number fields use the decimal keypad', v50.keypad === 0, v50.keypad + ' without');
  check('Each Add detail button names its question', v50.unnamed === 0, v50.unnamed + ' unnamed');
  await page.fill('#e1-v-hr', '999'); await settle();
  const err = await page.locator('#e1-v-hr-err').textContent().catch(() => '');
  check('Out-of-range observation is flagged beside the field', /Outside 1–400/.test(err) && await page.getAttribute('#e1-v-hr', 'aria-invalid') === 'true', err);
  await page.fill('#e1-v-hr', '99'); await settle();
  check('Correcting it clears the flag and resumes the note', !(await page.locator('#e1-v-hr-err').count()) && /HR 99 \/min/.test(await note()));
  await clear();

  // Version 52: Hypoxia presentation
  await page.selectOption('#condition', 'Hypoxia'); await settle();
  await page.fill('#pc0', 'low oxygen saturations');
  await page.locator('#fields label:visible, #fields button:visible', { hasText: 'Over hours' }).first().click();
  await page.locator('#fields label:visible, #fields button:visible', { hasText: 'COPD' }).first().click();
  await page.locator('#exam label:visible', { hasText: 'Good oximeter waveform' }).first().click();
  await settle();
  const hyp = await note();
  check('Hypoxia: history and oximeter findings read correctly', /The onset was over hours\. Known conditions include COPD\./.test(hyp) && /Good oximeter waveform/.test(hyp), hyp);
  check('Hypoxia: bedside reminder covers CO₂ retention targets and oximeter limits', await page.evaluate(() => /88–92%/.test(document.getElementById('exam').textContent) && /darker skin/.test(document.getElementById('exam').textContent)));
  await clear();

  // Version 52: scores
  const sres = (k, v) => page.evaluate(([k, v]) => { const S = window.edScores, vals = { ...v }; S.SCORES[k].items.forEach(i => { if (i.kind === 'check' && vals[i.k] == null) vals[i.k] = false; }); S.state[k] = { values: vals, touched: new Set(S.SCORES[k].items.map(i => i.k)) }; return S.result(k).text; }, [k, v]);
  const sc = [
    ['NEWS2 boundaries', await sres('news2', { rr: '25', scale: 0, o2: 1, spo2: '93', sbp: '90', hr: '131', acvpu: 1, temp: '39.1' }), /^NEWS2 18 \(RR 3, air or oxygen 2, SpO₂ 2, SBP 3, pulse 3, consciousness 3, temperature 2\): high/],
    ['NEWS2 scale 2 on oxygen', await sres('news2', { rr: '16', scale: 1, o2: 1, spo2: '97', sbp: '120', hr: '72', acvpu: 0, temp: '36.8' }), /^NEWS2 5 .*SpO₂ 3, .*: medium clinical risk band/],
    ['HEART', await sres('heart', { h: 1, e: 1, a: '64', r: 1, t: 1 }), /^HEART 5\/10 .*moderate risk band \(4–6\)/],
    ['Wells PE', await sres('wellspe', { dvt: true, hr: true }), /^Wells PE 4\.5\/12\.5 .*PE likely/],
    ['PERC', await sres('perc', {}), /^PERC negative/],
    ['Wells DVT', await sres('wellsdvt', { tend: true, alt: true }), /^Wells DVT −1\/9|^Wells DVT -1\/9/],
    ['CURB-65 and CRB-65', (await sres('curb65', { c: true, u: 2, r: true, b: true, a: true })) + (await sres('curb65', { u: 0, a: true })), /^CURB-65 5\/5 .*high severity.*CRB-65 1\/4 .*intermediate/],
    ['GCS', await sres('gcs', { e: 1, v: 1, m: 0 }), /^GCS 13\/15 \(E3 V4 M6\)/],
    ['Glasgow-Blatchford (BUN and g/L)', await sres('gbs', { urea: '25', urea_unit: 1, sex: 1, hb: '110', hb_unit: 1, sbp: '120' }), /^Glasgow-Blatchford 4\/23 \(urea 3, Hb 1, SBP 0\)/],
    ['McIsaac', await sres('mcisaac', { ex: true, node: true, temp: true, cough: true, age: '50' }), /^McIsaac score 3 .*28–35%/],
    ['qSOFA', await sres('qsofa', { rr: '22', mental: 0, sbp: '100' }), /^qSOFA 2\/3/],
    ['4AT', await sres('fourat', { alert: 0, amt: 1, att: 1, acute: 1 }), /^4AT 6\/12 .*possible delirium/]
  ];
  const scBad = sc.filter(([, t, re]) => !re.test(t));
  check('Scores give the published totals and bands (12 worked cases)', scBad.length === 0, scBad.map(([n, t]) => n + ': ' + t).join(' | '));
  await clear();
  await page.selectOption('#condition', 'Chest pain'); await settle();
  await page.fill('#pc0', 'chest pain');
  await page.fill('#age', '58'); await page.fill('#e1-v-hr', '112'); await settle();
  check('Auto scores: nothing reaches the note before every item is answered', !/SCORES/.test(await note()) && /HEART: not in the note yet/.test(await page.textContent('#score-added')), await note());
  await page.locator('#score-suggest button', { hasText: 'HEART' }).click();
  check('Auto scores: age is filled from the page', await page.inputValue('#sc-heart-a') === '58');
  for (const [k, i] of [['h', 1], ['e', 0], ['r', 1], ['t', 0]]) await page.locator('input[name="sc-heart-' + k + '"]').nth(i).check({ force: true });
  await settle();
  check('Auto scores: HEART enters the note on its own once answered', /\n\nSCORES:\nHEART 3\/10 \(history 1, ECG 0, age 1, risk factors 1, troponin 0\): low risk band \(0–3\)\./.test(await note()), await note());
  await page.fill('#age', '66'); await settle();
  check('Auto scores: the note follows a changed answer (age 66 gives HEART 4)', /HEART 4\/10/.test(await note()) && !/HEART 3\/10/.test(await note()));
  await g0Sym(page, 'Haemoptysis', 'present'); await settle();
  await page.locator('#score-suggest button', { hasText: 'Wells PE' }).click();
  check('Auto scores: Wells PE waits until every criterion is answered', !/Wells PE/.test(await note()));
  const autoHr = await page.locator('input[name="sc-wellspe-hr"][value="true"]').isChecked(), autoHaem = await page.locator('input[name="sc-wellspe-haem"][value="true"]').isChecked();
  await page.click('#score-rest'); await settle();
  check('Auto scores: heart rate and a haemoptysis symptom fill Wells PE; the rest marked absent', autoHr && autoHaem && /Wells PE 2\.5\/12\.5 \(heart rate over 100 \+1\.5, haemoptysis \+1\): PE unlikely/.test(await note()), await note());
  await page.locator('#score-added button[aria-label="Remove HEART from the note"]').click(); await settle();
  await page.fill('#e1-v-rr', '18'); await settle();
  check('Auto scores: a removed score stays out of the note', !/HEART/.test(await note()) && /Wells PE/.test(await note()));
  await page.uncheck('#score-auto'); await page.fill('#e1-v-rr', '19'); await settle();
  check('Auto scores: turning automatic off leaves only scores added by hand', !/SCORES/.test(await note()));
  await clear();
  check('Auto scores: Clear encounter removes scores and turns automatic back on', !/SCORES/.test(await note()) && await page.isChecked('#score-auto') && (await page.locator('#score-added li:not(.waiting)').count()) === 0);

  check('No script errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  const failures = results.filter(r => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok || !r.detail ? '' : ' — ' + r.detail));
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
