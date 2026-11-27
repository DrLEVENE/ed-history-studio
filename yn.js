// Simpler answering: Y / N / N/A.
// History: yes/no-type questions (typed boxes and multi-choice chip lists) collapse to one row. Y opens the box or
// chips for detail, N records "…: none" in the note, N/A hides the question and writes nothing. Single-choice
// descriptive questions (onset, site, character, severity) stay as one-tap chips.
// Examination: each system card gets "Normal? Y / N / N/A". Y ticks that system's normal findings, N opens its
// abnormal findings to choose from, N/A clears the system and writes nothing.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const OPTS = [['Y', 'Yes'], ['N', 'No'], ['NA', 'Not applicable']];

  // Descriptive questions have no sensible "no" answer: they get Y and N/A only.
  const DESCRIPTIVE = /^(Duration|Exact|Time to|Time of|Site|Character|Course|Measured|Onset|Frequency|How |Who |What |When |Where |Usual|Baseline|Last |Intake|Child:|Fever pattern|Analgesic \/ triptan days|Severity|Location|Mechanism|Amount|Volume|Colour|Number of|Weight|Height|LMP)/i;
  function buttons(name, onPick, opts) {
    const g = document.createElement('span'); g.className = 'yn'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', name);
    (opts || OPTS).forEach(([v, long]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.yn = v; b.textContent = v === 'NA' ? 'N/A' : v;
      b.setAttribute('aria-label', name + ' — ' + long); b.setAttribute('aria-pressed', 'false');
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); onPick(v); };
      g.append(b);
    });
    return g;
  }
  const press = (g, v) => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.yn === v)));

  // ---------- History ----------
  function history() {
    const fields = $('fields'); if (!fields) return;
    [...fields.children].forEach(el => {
      if (el.dataset.yn) return;
      let id, title, body = [];
      if (el.tagName === 'LABEL' && el.querySelector(':scope > input[id^="f"]') && !el.querySelector('input[type=hidden]')) {
        const inp = el.querySelector(':scope > input'); id = inp.id;
        title = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        if (!title || inp.type === 'checkbox') return;
        inp.setAttribute('aria-label', title);
        [...el.childNodes].filter(n => n.nodeType === 3).forEach(n => { const h = document.createElement('span'); h.className = 'yn-hidden'; h.textContent = n.textContent; n.replaceWith(h); });
        body = [el];
      } else if (el.classList.contains('quick-field') && el.querySelector('.quick-options input[type=checkbox]')) {
        const head = el.querySelector(':scope > label'); const hid = el.querySelector(':scope > input[type=hidden][id^="f"]');
        if (!head || !hid) return;
        id = hid.id; title = head.textContent.trim(); head.hidden = true;
        body = [...el.children].filter(c => c !== head && c !== hid);
      } else return;
      // Text question: a new wrapper holds the row and the original label (with its box).
      // Chip question: the existing block becomes the wrapper.
      let wrap;
      if (el.tagName === 'LABEL') { wrap = document.createElement('div'); el.before(wrap); }
      else wrap = el;
      wrap.classList.add('yn-field'); wrap.dataset.yn = '1';
      const row = document.createElement('div'); row.className = 'yn-row';
      const t = document.createElement('span'); t.className = 'yn-title'; t.textContent = title;
      const state = document.createElement('input'); state.type = 'hidden'; state.id = id + '-yn';
      const box = document.createElement('div'); box.className = 'yn-body';
      box.append(...body);
      const g = buttons(title, v => pick(v), DESCRIPTIVE.test(title) ? OPTS.filter(o => o[0] !== 'N') : null);
      row.append(t, g);
      wrap.append(row, state, box);
      function clearBody() {
        box.querySelectorAll('input[type=checkbox]:checked').forEach(c => c.click());
        box.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), textarea').forEach(i => { if (i.value) { i.value = ''; fire(i); } });
        const h = $(id); if (h && h.type === 'hidden' && h.value) { h.value = ''; fire(h); }
      }
      function pick(v) {
        const now = state.value === v ? '' : v;
        if (now !== 'Y') clearBody();
        state.value = now; sync(); fire(state);
        if (now === 'Y') { const f = box.querySelector('input:not([type=hidden]), textarea, button'); if (f) f.focus(); }
      }
      function sync() {
        const filled = !!($(id) && $(id).value.trim());
        if (filled && state.value !== 'Y') state.value = 'Y';
        box.hidden = state.value !== 'Y';
        wrap.dataset.state = state.value || '';
        press(g, state.value);
      }
      wrap.ynSync = sync; sync();
    });
  }

  // ---------- Examination ----------
  function exam() {
    const panel = $('normal-exam'); if (!panel) return;
    panel.querySelectorAll('details').forEach(card => {
      if (card.dataset.yn) return; card.dataset.yn = '1';
      const sum = card.querySelector('summary'); if (!sum) return;
      const system = sum.textContent.trim();
      const bands = [...card.querySelectorAll(':scope > div, :scope > * > div')].filter(d => d.querySelector(':scope > strong'));
      const normalBand = bands.find(b => /Normal findings/.test(b.querySelector('strong').textContent));
      const abnormalBand = bands.find(b => /Abnormal findings/.test(b.querySelector('strong').textContent));
      if (!normalBand) return;
      const normals = () => [...normalBand.querySelectorAll('input[type=checkbox]')];
      const abnormals = () => abnormalBand ? [...abnormalBand.querySelectorAll('input[type=checkbox]')] : [];
      const all = () => [...card.querySelectorAll('input[type=checkbox]')];
      const lab = document.createElement('span'); lab.className = 'yn-q'; lab.textContent = 'Normal?';
      const g = buttons(system + ' normal', v => pick(v));
      const box = document.createElement('span'); box.className = 'yn-exam'; box.append(lab, g); sum.append(box);
      let na = false;
      function pick(v) {
        const cur = state();
        if (v === cur) { all().forEach(c => { if (c.checked) c.click(); }); na = false; card.open = false; sync(); return; }
        if (v === 'Y') { abnormals().forEach(c => { if (c.checked) c.click(); }); normals().forEach(c => { if (!c.checked && !c.closest('[hidden]')) c.click(); }); na = false; card.open = false; }
        if (v === 'N') { normals().forEach(c => { if (c.checked) c.click(); }); na = false; card.open = true; if (abnormalBand) abnormalBand.scrollIntoView({ block: 'nearest' }); }
        if (v === 'NA') { all().forEach(c => { if (c.checked) c.click(); }); na = true; card.open = false; }
        nPending = v === 'N'; sync();
      }
      let nPending = false;
      function state() {
        if (abnormals().some(c => c.checked)) return 'N';
        if (normals().some(c => c.checked)) return 'Y';
        if (nPending) return 'N';
        return na ? 'NA' : '';
      }
      function sync() { const s = state(); press(g, s); card.dataset.state = s; }
      card.addEventListener('change', e => { if (e.target.type === 'checkbox') { if (e.target.checked) { na = false; } if (!abnormals().some(c => c.checked)) nPending = false; sync(); } });
      card.ynSync = sync; sync();
    });
  }

  function all() { history(); exam(); syncAll(); }
  function syncAll() { document.querySelectorAll('.yn-field, #normal-exam details').forEach(x => x.ynSync && x.ynSync()); }

  // The form is rebuilt when the presentation changes or the encounter is cleared; drafts are restored after.
  // Y / N / N/A answers are kept per presentation, like the rest of the form's drafts.
  let current = $('condition').value; const memory = {};
  const collect = () => { const m = {}; document.querySelectorAll('#fields input[id$="-yn"]').forEach(i => { if (i.value) m[i.id] = i.value; }); return m; };
  document.addEventListener('change', e => { if (e.target && e.target.id === 'condition' && current) memory[current] = collect(); }, true);
  $('condition').addEventListener('change', () => setTimeout(() => {
    current = $('condition').value; all();
    Object.entries(memory[current] || {}).forEach(([id, v]) => { const i = $(id); if (i && !i.value) i.value = v; });
    syncAll();
  }, 0));
  $('reset').addEventListener('click', () => setTimeout(all, 0));
  window.edYNClear = () => { for (const k in memory) delete memory[k]; };
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#quick-normal, .quick-normal, [data-quick-normal]')) setTimeout(syncAll, 0); });
  ['input', 'change'].forEach(t => document.addEventListener(t, e => { if (e.target && e.target.closest && e.target.closest('#fields')) { const w = e.target.closest('.yn-field'); if (w && w.ynSync) w.ynSync(); } }));
  // Open a question programmatically (used by keyboard users and tests): window.edYN.open(element)
  const open = el => { const w = el && el.closest && el.closest('.yn-field'); if (w && w.dataset.state !== 'Y') { const b = w.querySelector('.yn-row button[data-yn=Y]'); if (b) b.click(); } };
  window.edYN = { all, syncAll, open };
  all();
})();
