// Diagnosis support: asks Claude (Anthropic) for the three most likely diagnoses from the current note.
// This is the only part of the site that sends anything off the device, and only when the clinician taps Send,
// after seeing exactly what will be sent. The API key is the clinician's own; it is kept in memory unless they
// choose to remember it on this device. Only diagnoses the clinician ticks go into the note.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('ai-card');
  if (!card) return;
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const MODELS = [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (faster)'], ['claude-opus-5-5', 'Claude Opus 5.5 (more thorough)']];
  const STORE = 'ed-ai-key';

  const SYSTEM = [
    'You support an emergency department doctor at the bedside. You receive the doctor\'s clinical note for one patient.',
    'Using only information in the note, give the three most likely diagnoses, ranked.',
    'For each: features in the note that support it and features in the note that argue against it (quote or closely paraphrase the note; never invent findings), and the tests or examination findings that would best distinguish it from the others.',
    'Then list must-not-miss diagnoses that are plausible from the note but not in the top three, each with a one-line reason; use an empty list if none.',
    'Then list the missing information that would most change the ranking.',
    'Do not give treatment, drug or dosing advice. Use British English and standard diagnosis names.',
    'If the note is too sparse to rank meaningfully, still answer and say so in the caveat.'
  ].join(' ');
  const TOOL = {
    name: 'report_differential',
    description: 'Report the ranked differential diagnosis for the note.',
    input_schema: {
      type: 'object',
      properties: {
        diagnoses: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: {
          name: { type: 'string' }, likelihood: { type: 'string', enum: ['most likely', 'likely', 'possible'] },
          supporting: { type: 'array', items: { type: 'string' } }, against: { type: 'array', items: { type: 'string' } },
          distinguish: { type: 'array', items: { type: 'string' } } }, required: ['name', 'likelihood', 'supporting', 'against', 'distinguish'] } },
        must_not_miss: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, reason: { type: 'string' } }, required: ['name', 'reason'] } },
        missing_information: { type: 'array', items: { type: 'string' } },
        caveat: { type: 'string' }
      },
      required: ['diagnoses', 'must_not_miss', 'missing_information']
    }
  };

  // ---------- Key ----------
  let key = '';
  try { key = localStorage.getItem(STORE) || ''; } catch (e) { key = ''; }
  const keyInput = $('ai-key'), remember = $('ai-remember'), model = $('ai-model'), keyMsg = $('ai-key-msg');
  MODELS.forEach(([v, t]) => model.add(new Option(t, v)));
  remember.checked = !!key;
  function showKeyState() {
    keyMsg.textContent = key ? 'A key is set' + (remember.checked ? ' and remembered on this device.' : ' for this session only.') : 'No key set. Diagnosis support needs your own Anthropic API key.';
    $('ai-settings').open = !key;
  }
  $('ai-key-save').onclick = () => {
    const v = keyInput.value.trim(); if (!v) return;
    key = v; keyInput.value = '';
    try { if (remember.checked) localStorage.setItem(STORE, key); else localStorage.removeItem(STORE); } catch (e) { /* storage blocked: memory only */ }
    showKeyState();
  };
  remember.onchange = () => { try { if (remember.checked && key) localStorage.setItem(STORE, key); else localStorage.removeItem(STORE); } catch (e) { } showKeyState(); };
  $('ai-key-clear').onclick = () => { key = ''; keyInput.value = ''; try { localStorage.removeItem(STORE); } catch (e) { } remember.checked = false; showKeyState(); };

  // ---------- What is sent ----------
  // The note without the impression section, with likely identifiers removed. The clinician sees and can edit it.
  function deidentify(t) {
    return t
      .replace(/\n\nIMPRESSION:[\s\S]*?(?=\n\n[A-Z][A-Z &]+:|$)/, '')
      .replace(/\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Master)\.?\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?/g, '[name]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
      .replace(/\+?\(?\d[\d\s().-]{6,}\d(?![\d.]*\s*(?:mmol|µmol|umol|g\/|mg|ng|U\/|×10|x10|\/min|mmHg|%|°))/g, m => /\d{7,}|\d{3}[\s.-]\d{3,4}[\s.-]?\d{0,4}/.test(m.replace(/\s/g, ' ')) ? '[number]' : m)
      .replace(/\b(?:MRN|NHS|TRN|hospital\s*(?:no|number)|ID)\b\.?:?\s*[\w-]+/gi, '[identifier]')
      .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g, '[date]');
  }
  const noteText = () => ($('output') ? $('output').value : '').trim();

  // ---------- Interface ----------
  const out = $('ai-out'), status = $('ai-status'), go = $('ai-go');
  let result = null, sentText = '', ticked = new Set(), busy = false, controller = null;

  function btn(text, fn, cls, id) { const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; if (id) b.id = id; b.textContent = text; b.onclick = fn; return b; }
  function changed() { card.dispatchEvent(new Event('change', { bubbles: true })); }

  go.onclick = () => {
    status.textContent = '';
    if (!key) { status.textContent = 'Add your Anthropic API key in the settings below first.'; $('ai-settings').open = true; keyInput.focus(); return; }
    const text = deidentify(noteText());
    if (text.length < 40) { status.textContent = 'Record the presenting complaint and some findings first.'; return; }
    out.replaceChildren();
    const lbl = document.createElement('label'); lbl.textContent = 'This exact text will be sent to Anthropic. Remove anything that could identify the patient.';
    const ta = document.createElement('textarea'); ta.id = 'ai-preview'; ta.rows = 10; ta.value = text; ta.spellcheck = false; lbl.append(ta);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(btn('Send to Claude', () => send(ta.value), '', 'ai-send'), btn('Cancel', () => { out.replaceChildren(); render(); }, 'secondary'));
    out.append(lbl, actions);
    ta.focus();
  };

  async function send(text) {
    if (busy) return;
    busy = true; go.disabled = true; status.textContent = 'Asking Claude… this usually takes 10 to 30 seconds.';
    out.replaceChildren();
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: model.value, max_tokens: 2000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name },
          messages: [{ role: 'user', content: 'Clinical note:\n\n' + text }] })
      });
      if (!res.ok) {
        const why = res.status === 401 ? 'The API key was not accepted. Check it in the settings below.'
          : res.status === 403 ? 'This key is not allowed to use that model.'
          : res.status === 429 || res.status === 529 ? 'Claude is busy or the usage limit was reached. Try again in a minute.'
          : 'Claude returned an error (' + res.status + '). Try again.';
        throw new Error(why);
      }
      const data = await res.json();
      const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === TOOL.name);
      if (!use || !use.input || !Array.isArray(use.input.diagnoses)) throw new Error('The reply could not be read. Try again.');
      result = { ...use.input, model: data.model || model.value, at: new Date() };
      sentText = text; ticked = new Set();
      status.textContent = '';
    } catch (e) {
      status.textContent = e.name === 'AbortError' ? 'No reply after 90 seconds. Check the connection and try again.'
        : e instanceof TypeError ? 'Could not reach Anthropic. Check the connection and try again.' : e.message;
    } finally { clearTimeout(timer); busy = false; go.disabled = false; render(); changed(); }
  }

  function list(title, items, cls) {
    if (!items || !items.length) return null;
    const wrap = document.createElement('div'); wrap.className = cls || 'ai-list';
    const h = document.createElement('span'); h.className = 'ai-sub'; h.textContent = title;
    const ul = document.createElement('ul'); items.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.append(li); });
    wrap.append(h, ul); return wrap;
  }
  function tick(name, label) {
    const l = document.createElement('label'); l.className = 'photo-check ai-tick';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = ticked.has(name);
    cb.onchange = () => { if (cb.checked) ticked.add(name); else ticked.delete(name); changed(); };
    l.append(cb, label); return l;
  }

  function render() {
    if (!result) { if (!$('ai-preview')) out.replaceChildren(); return; }
    out.replaceChildren();
    const stale = deidentify(noteText()) !== sentText;
    if (stale) { const p = document.createElement('p'); p.className = 'ai-stale'; p.id = 'ai-stale'; p.textContent = 'The note has changed since these suggestions. Tap "Suggest top 3 diagnoses" again to update them.'; out.append(p); }
    result.diagnoses.slice(0, 3).forEach((d, i) => {
      const box = document.createElement('div'); box.className = 'ai-dx';
      const h = document.createElement('h3'); h.textContent = (i + 1) + '. ' + d.name; const lk = document.createElement('span'); lk.className = 'ai-lk'; lk.textContent = d.likelihood; h.append(' ', lk);
      box.append(h);
      [list('Fits', d.supporting), list('Against', d.against), list('Would help distinguish', d.distinguish)].forEach(x => x && box.append(x));
      box.append(tick(d.name, 'Add to impression'));
      out.append(box);
    });
    if (result.must_not_miss && result.must_not_miss.length) {
      const box = document.createElement('div'); box.className = 'ai-dx ai-mnm';
      const h = document.createElement('h3'); h.textContent = 'Must not miss'; box.append(h);
      result.must_not_miss.forEach(m => { const row = document.createElement('div'); row.className = 'ai-mnm-row'; const t = document.createElement('p'); t.textContent = m.name + ': ' + m.reason; row.append(t, tick(m.name, 'Add to impression')); box.append(row); });
      out.append(box);
    }
    const miss = list('Missing information that would change the ranking', result.missing_information); if (miss) out.append(miss);
    if (result.caveat) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = result.caveat; out.append(p); }
    const foot = document.createElement('p'); foot.className = 'hint';
    foot.textContent = 'Suggested by ' + result.model + ' at ' + result.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '. AI suggestions can be wrong and are not a diagnosis; use your own judgement. Nothing goes into the note unless you tick it.';
    out.append(foot, btn('Clear suggestions', () => { result = null; ticked = new Set(); sentText = ''; render(); changed(); }, 'secondary'));
  }

  // Ticked diagnoses go under IMPRESSION, in the order shown.
  window.edImpression = () => {
    if (!result || !ticked.size) return [];
    const names = [...result.diagnoses.map(d => d.name), ...(result.must_not_miss || []).map(m => m.name)].filter(n => ticked.has(n));
    return names.length ? ['Differential: ' + names.map((n, i) => (i + 1) + '. ' + n).join('; ') + '.'] : [];
  };
  window.edAIClear = () => { if (controller) controller.abort(); result = null; ticked = new Set(); sentText = ''; status.textContent = ''; out.replaceChildren(); };
  window.edAI = { deidentify };

  // Warn when the note moves on after the suggestions.
  let q = false;
  document.addEventListener('input', e => { if (result && !card.contains(e.target) && !q) { q = true; setTimeout(() => { q = false; const s = deidentify(noteText()) !== sentText; if (!!$('ai-stale') !== s) render(); }, 700); } });
  document.addEventListener('change', e => { if (result && !card.contains(e.target)) setTimeout(() => { const s = deidentify(noteText()) !== sentText; if (!!$('ai-stale') !== s) render(); }, 700); });
  showKeyState();
})();
