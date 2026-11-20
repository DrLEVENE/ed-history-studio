// "Check wording": spelling, grammar and style suggestions for the HPC.
// Uses Harper (https://github.com/Automattic/harper, Apache-2.0), copied into vendor/harper.
// Harper runs on this device in a background worker. The note text is never sent anywhere.
(() => {
  const $ = id => document.getElementById(id);
  const button = $('checkwording'), list = $('grammar-list'), info = $('grammar-note');
  if (!button) return;

  // Common emergency department words, drugs and abbreviations that a general dictionary does not know.
  const clinicalWords = `ED A&E HPC PMH PSH DH SH FH ROS PC NKDA NKA SOB LOC CP N&V D&V PR PV DRE ECG CXR AXR CT CTPA MRI USS FAST POCUS FBC U&E UE LFT LFTs CRP CK ESR VBG ABG INR APTT HbA1c BNP GCS AVPU NEWS NEWS2 4AT SpO2 SpO₂ BP HR RR GP ICU HDU ITU IV IM SC PO PRN OD BD TDS QDS mmHg mmol bpm kg mg mcg mL
  HTN DM T1DM T2DM AF CKD COPD IHD CCF MI NSTEMI STEMI ACS PE DVT VTE TIA CVA UTI URTI LRTI STI PID IUD IUCD HRT IBD IBS GORD OGD AAA ACE NSAID NSAIDs SSRI DOAC LMWH
  haematuria dysuria haemoptysis haematemesis melaena dyspnoea orthopnoea tachycardia tachycardic bradycardia bradycardic tachypnoea tachypnoeic hypoxia hypoxic hypotension hypotensive hypertension hypertensive pyrexia pyrexial apyrexial afebrile febrile rigors malaise myalgia myalgias arthralgia photophobia phonophobia syncope presyncope presyncopal vertigo paraesthesia paraesthesiae haematoma ecchymosis erythema erythematous oedema oedematous cellulitis crepitus dehiscence suprapubic periumbilical epigastric epigastrium hypochondrium iliac fossa ureteric urethral perianal perineal perineum dysphagia odynophagia dysphasia dysarthria diplopia hemiparesis ataxia nystagmus meningism nocturia polyuria polydipsia anuria oliguria tenesmus haemorrhoids diverticular rhinorrhoea coryza epistaxis otalgia otorrhoea tinnitus anaesthesia analgesia antiemetic antipyretic urticaria angioedema pruritus excoriations lymphadenopathy hepatomegaly splenomegaly ascites jaundice icteric pallor cyanosis cyanosed diaphoresis diaphoretic clammy postictal prodrome aura incontinence retention catheterised
  apixaban rivaroxaban edoxaban dabigatran warfarin clopidogrel ticagrelor aspirin amlodipine metformin gliclazide ramipril lisinopril losartan bisoprolol atenolol atorvastatin simvastatin furosemide bendroflumethiazide salbutamol ipratropium budesonide beclometasone montelukast paracetamol ibuprofen naproxen diclofenac codeine tramadol morphine oxycodone nitrofurantoin trimethoprim amoxicillin co-amoxiclav flucloxacillin clarithromycin doxycycline ceftriaxone metronidazole gentamicin adrenaline chlorphenamine cetirizine hydrocortisone prednisolone dexamethasone ondansetron metoclopramide cyclizine omeprazole lansoprazole insulin enoxaparin tinzaparin heparin tranexamic levetiracetam lorazepam diazepam midazolam sertraline citalopram fluoxetine mirtazapine amitriptyline levothyroxine allopurinol colchicine`;

  let linter = null, loading = null, lastText = '', ignored = new Set();
  const appWords = () => {
    // Every word already used by the site's own presentations counts as correct.
    const bag = new Set();
    const add = v => { if (typeof v === 'string') for (const w of v.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) || []) bag.add(w); else if (v && typeof v === 'object') Object.values(v).forEach(add); };
    try { add(configs); add(examination); add(examinationChoices); add(narrativeTemplates); add(normalExamSystems); } catch (e) {}
    clinicalWords.split(/\s+/).forEach(w => w && bag.add(w));
    return [...bag];
  };
  const load = () => loading ||= (async () => {
    const harper = await import('./vendor/harper/index.js');
    const { binary } = await import('./vendor/harper/binary.js');
    const l = new harper.WorkerLinter({ binary, dialect: harper.Dialect.British });
    await l.setup();
    await l.importWords(appWords());
    linter = l;
    return l;
  })();

  // The HPC section of the note: from "HPC:" to the next heading.
  const hpcRange = text => {
    const at = text.indexOf('HPC:\n');
    if (at < 0) return null;
    const start = at + 5, rest = text.slice(start), next = rest.search(/\n\n[A-Z][A-Z &/]+:\n/);
    return { start, end: next < 0 ? text.length : start + next };
  };
  const plain = s => s.replace(/`([^`]+)`/g, '“$1”');

  async function check() {
    const note = $('output'), text = note.value, range = hpcRange(text);
    list.replaceChildren();
    if (!range) { info.textContent = 'There is no HPC to check yet.'; return; }
    button.disabled = true;
    info.textContent = linter ? 'Checking…' : 'Loading the checker on this device (about 20 MB the first time)…';
    try {
      const l = await load();
      const hpc = text.slice(range.start, range.end);
      const lints = (await l.lint(hpc)).filter(x => !ignored.has(x.lint_kind() + '|' + hpc.slice(x.span().start, x.span().end)));
      lastText = text;
      if (!lints.length) { info.textContent = 'No suggestions for the HPC.'; return; }
      info.textContent = lints.length + ' suggestion' + (lints.length === 1 ? '' : 's') + ' for the HPC. Read each one: the checker does not know the patient or the clinical context.';
      for (const lint of lints) list.append(item(lint, hpc, range.start));
    } catch (e) {
      info.textContent = 'The checker could not start on this device. The note itself is unaffected.';
      loading = null;
    } finally { button.disabled = false; }
  }

  function item(lint, hpc, offset) {
    const { start, end } = lint.span(), word = hpc.slice(start, end);
    const li = document.createElement('li'); li.className = 'lint';
    const head = document.createElement('p'); head.className = 'lint-context';
    const kind = document.createElement('span'); kind.className = 'lint-kind'; kind.textContent = lint.lint_kind_pretty();
    const before = hpc.slice(Math.max(0, start - 40), start), after = hpc.slice(end, end + 40);
    const mark = document.createElement('mark'); mark.textContent = word.trim() ? word : '·';
    head.append(kind, ' …' + before.replace(/^\S*\s/, ''), mark, after.replace(/\s\S*$/, '') + '…');
    const msg = document.createElement('p'); msg.className = 'lint-message'; msg.textContent = plain(lint.message());
    const actions = document.createElement('div'); actions.className = 'lint-actions';
    for (const s of lint.suggestions().slice(0, 3)) {
      const replacement = s.get_replacement_text();
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = !replacement.trim() ? (word.trim() ? 'Remove “' + word.trim() + '”' : 'Fix spacing') : !word.trim() ? 'Insert “' + replacement.trim() + '”' : 'Change to “' + replacement.trim() + '”';
      b.onclick = () => apply(offset + start, offset + end, word, replacement);
      actions.append(b);
    }
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'secondary'; skip.textContent = 'Ignore';
    skip.onclick = () => { ignored.add(lint.lint_kind() + '|' + word); li.remove(); if (!list.children.length) info.textContent = 'No suggestions left for the HPC.'; };
    actions.append(skip);
    if (lint.lint_kind() === 'Spelling' && word) {
      const learn = document.createElement('button'); learn.type = 'button'; learn.className = 'secondary'; learn.textContent = 'Add “' + word + '” to the dictionary';
      learn.title = 'Kept until this tab is closed';
      learn.onclick = async () => { await linter.importWords([word]); check(); };
      actions.append(learn);
    }
    li.append(head, msg, actions);
    return li;
  }

  function apply(start, end, word, replacement) {
    const note = $('output');
    if (note.value !== lastText || note.value.slice(start, end) !== word) { info.textContent = 'The note changed since the check, so it was checked again.'; check(); return; }
    note.value = note.value.slice(0, start) + replacement + note.value.slice(end);
    note.dispatchEvent(new Event('input', { bubbles: true }));
    check();
  }

  button.onclick = check;
  // Suggestions are cleared whenever the note is rebuilt or cleared, so they never point at old text.
  const clearIfChanged = () => { if (list.children.length && $('output').value !== lastText) { list.replaceChildren(); info.textContent = 'The note changed. Check wording again when ready.'; } };
  setInterval(clearIfChanged, 1000);
})();
