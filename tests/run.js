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
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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
  server.close();

  check('No script errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  const failures = results.filter(r => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok || !r.detail ? '' : ' — ' + r.detail));
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
