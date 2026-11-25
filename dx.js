// Diagnosis support without AI. For each presentation, a curated list of common and must-not-miss diagnoses is
// ranked by the findings recorded on the page: symptoms marked present or denied, history and exam chips,
// observations, lab results, age and sex. Every point of evidence is shown, so the ranking can be checked.
// Runs on this device; nothing is sent anywhere. Only diagnoses the clinician ticks go into the note.
// The rules are a bedside prompt list, not a validated diagnostic model, and need clinical review.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('dx-card');
  if (!card) return;

  // Feature tokens:
  //   s:Name   symptom marked present        s-:Name  symptom marked denied
  //   h:Chip   history chip ticked           e:Chip   exam chip ticked
  //   o:hr>100 observation (hr rr sbp spo2 temp)   l:wcc>11  lab in SI units (or l:trop>uln with the report's limit)
  //   a:>=50   age in years                  x:F / x:M  sex
  // D(name, prior, features [[token, weight]], tests that help distinguish, must-not-miss reason or '')
  const D = (n, p, f, t, m) => ({ n, p, f, t, m: m || '' });

  const RULES = {
    'Dementia': [
      D('Delirium superimposed on dementia', 1.5, [['h:Over hours', 2], ['h:Over a day or two', 2], ['h:Fluctuating through the day', 2], ['e:Inattentive', 2], ['e:Drowsy', 1.5], ['s:Drowsiness', 1], ['s:Visual hallucinations', 0.5], ['h:Gradual over months', -2], ['h:Stable but carers cannot cope', -1.5]], '4AT; then look for the cause (infection, retention, constipation, pain, medicines, metabolic)', 'Delirium carries high mortality and is often missed in people with dementia'),
      D('Infection (urinary, chest or skin)', 0.5, [['s:Fever', 2], ['s:Cough', 1], ['s:Breathlessness', 1], ['s:Dysuria or new urinary smell', 1.5], ['e:Chest crackles', 1.5], ['e:Suprapubic tenderness', 1], ['o:temp>=38', 1.5], ['o:rr>=22', 1], ['o:spo2<94', 1], ['l:crp>50', 1.5], ['l:wcc>11', 0.5]], 'Urine culture (a positive dipstick alone is common and not diagnostic in older people); chest X-ray; CRP; blood cultures', ''),
      D('Urinary retention or constipation', 0.5, [['s:Urinary retention', 2.5], ['s:Constipation', 2], ['e:Palpable bladder', 2.5], ['e:Faecal loading on examination', 2.5], ['h:Anticholinergic medicine', 1], ['h:New opioid', 1]], 'Bladder scan; abdominal and rectal examination', ''),
      D('Medicine-related (anticholinergic, sedative, opioid, antipsychotic)', 0.5, [['h:New sedative or sleeping tablet', 2], ['h:New antipsychotic', 2], ['h:New opioid', 2], ['h:Anticholinergic medicine', 1.5], ['h:Steroid', 1], ['h:Stopped a regular medicine', 1], ['e:Drowsy', 0.5]], 'Medication review, including anticholinergic burden', 'In Lewy body dementia, antipsychotics can cause severe and dangerous reactions'),
      D('Metabolic cause (glucose, sodium, calcium, kidney) or dehydration', 0.5, [['s:Reduced eating or drinking', 1.5], ['h:Refusing food or fluids', 1], ['e:Dry mucous membranes', 1], ['l:glu<4', 3], ['l:na<130', 2], ['l:na>146', 2], ['l:adjca>2.6', 2], ['l:urea>10', 1], ['l:creat>150', 1]], 'Glucose; sodium, calcium, renal function', ''),
      D('Subdural haematoma or other head injury', 0, [['s:Fall', 1.5], ['s:Head strike', 2.5], ['h:New falls', 1], ['e:Scalp haematoma', 2], ['e:Focal weakness', 1.5], ['h:Over days to weeks', 1]], 'CT head, especially on anticoagulants or after a fall', 'Subdural haematoma can cause a gradual decline weeks after a minor fall'),
      D('Stroke', 0, [['s:New weakness or speech change', 3], ['e:Focal weakness', 2], ['e:New speech disturbance', 2], ['h:Over hours', 0.5]], 'Neurological examination; CT head', 'Sudden focal signs'),
      D('Pain (fracture, constipation, dental, pressure ulcer)', 0.5, [['s:Pain', 2], ['e:Pain on movement', 2], ['e:Pressure ulcer', 1.5], ['h:Agitation', 0.5], ['h:Calling out', 0.5], ['h:Mobility worse', 0.5]], 'Pain assessment for people with dementia (Abbey or PAINAD); examine hips, mouth and skin', 'An unrecognised hip fracture can present as agitation or refusing to walk'),
      D('Progression of dementia', 1, [['h:Gradual over months', 2.5], ['h:Steadily worse', 1], ['h:Needs more help with self-care', 1], ['h:Over hours', -2], ['h:Over a day or two', -1.5], ['e:Inattentive', -1]], 'A diagnosis of exclusion: find no acute cause first', ''),
      D('Behavioural and psychological symptoms of dementia', 0.5, [['h:Agitation', 1], ['h:Aggression', 1], ['h:Wandering', 1], ['h:Calling out', 1], ['h:Sleep disturbance', 0.5], ['h:Suspiciousness', 1], ['h:Worse in the evening or at night', 1], ['e:Inattentive', -1]], 'Look for unmet needs (pain, constipation, hunger, environment) once delirium is excluded', ''),
      D('Carer strain or breakdown of care at home', 0.5, [['h:Stable but carers cannot cope', 3], ['h:Alone', 1], ['h:With a spouse or partner', 0.3], ['h:Refusing care', 1]], 'Carer and social care assessment', ''),
      D('Neglect or abuse', 0, [['e:Bruising of differing ages', 2.5], ['e:Bruises in unusual places', 2.5], ['e:Unkempt or poor hygiene', 1.5], ['e:Pressure ulcer', 1], ['e:Appears underweight', 1]], 'Document injuries carefully; safeguarding referral as local policy', 'Bruising of different ages or in unusual places, poor hygiene or untreated pressure ulcers'),
      D('Depression', 0, [['s:Low mood', 2.5], ['h:Withdrawn or apathetic', 1.5], ['h:Refusing food or fluids', 1], ['s:Weight loss', 1]], 'Depression often coexists with dementia; Cornell scale', '')
    ],
    'Chest pain': [
      D('Acute coronary syndrome', 2, [['h:Central / retrosternal', 1], ['h:Pressure', 1], ['h:Tightness', 1], ['h:Heaviness', 1], ['h:Left arm', 1], ['h:Jaw', 1], ['h:Exertion worsens', 1.5], ['s:Diaphoresis', 1.5], ['s:Nausea/vomiting', 0.5], ['a:>=50', 1], ['l:trop>uln', 3], ['h:Palpation reproduces', -1.5], ['h:Inspiration worsens', -1], ['a:<30', -1.5]], 'Serial ECGs; serial high-sensitivity troponin', 'Missed ACS carries high early mortality'),
      D('Pulmonary embolism', 1, [['s:Dyspnoea', 1], ['h:Inspiration worsens', 1], ['h:Sudden onset', 1], ['s:Haemoptysis', 1.5], ['s:Unilateral leg swelling', 2], ['s:Syncope', 1], ['o:hr>100', 1], ['o:spo2<94', 1.5], ['l:ddim>uln', 1], ['s-:Dyspnoea', -1]], 'Wells and PERC; D-dimer if low probability; CTPA', 'Can present with chest pain alone and deteriorate suddenly'),
      D('Aortic dissection', 0, [['h:Tearing', 3], ['h:Back', 1.5], ['h:Sudden onset', 1.5], ['s:Syncope', 1], ['s:Focal neurological symptoms', 2], ['e:Pulse asymmetry', 2.5], ['e:Diastolic murmur', 1.5], ['o:sbp<90', 1]], 'Bilateral arm blood pressures; CT aortogram', 'Tearing pain to the back, pulse or BP differential, or neurology needs urgent imaging'),
      D('Pneumothorax', 0, [['h:Sudden onset', 1], ['h:Sharp', 1], ['h:Inspiration worsens', 1], ['s:Dyspnoea', 1], ['e:Reduced air entry — left', 2], ['e:Reduced air entry — right', 2], ['e:Hyperresonant percussion', 2], ['o:spo2<94', 1]], 'Chest X-ray or lung ultrasound', 'Tension pneumothorax is immediately life-threatening'),
      D('Pericarditis', 0, [['h:Sharp', 1], ['h:Position affects pain', 2], ['h:Inspiration worsens', 1], ['s:Fever', 1], ['e:Rub', 3], ['a:<50', 0.5]], 'ECG (widespread ST elevation, PR depression); echocardiogram for effusion', ''),
      D('Musculoskeletal chest wall pain', 1, [['h:Palpation reproduces', 2.5], ['h:Movement worsens', 1.5], ['e:Chest wall tenderness', 1.5], ['h:Exertion worsens', -0.5], ['s:Diaphoresis', -1]], 'A diagnosis of exclusion: ECG and troponin first when ACS is possible', ''),
      D('Gastro-oesophageal reflux or gastritis', 1, [['h:Burning', 2], ['h:Epigastric', 1.5], ['h:Meals worsen', 1.5], ['h:Exertion worsens', -1]], 'Exclude cardiac causes first; response over time', ''),
      D('Pneumonia', 0, [['s:Fever', 1.5], ['s:Dyspnoea', 0.5], ['h:Inspiration worsens', 0.5], ['e:Crackles', 1.5], ['e:Bronchial breathing', 2], ['o:temp>=38', 1], ['l:crp>50', 1], ['l:wcc>11', 0.5]], 'Chest X-ray; CRP and white cell count', '')
    ],
    'SOB / Shortness of breath': [
      D('Asthma or COPD exacerbation', 1, [['h:Asthma/COPD', 2], ['s:Wheeze', 2], ['s:Chest tightness', 1], ['e:Wheeze', 1.5], ['h:Allergen', 0.5], ['h:Respiratory illness', 0.5], ['s-:Wheeze', -1]], 'Peak flow; blood gas if severe; chest X-ray if not settling', ''),
      D('Pneumonia or chest infection', 1, [['s:Fever/rigors', 1.5], ['s:Cough', 1], ['s:Sputum production', 1], ['s:Pleuritic chest pain', 0.5], ['e:Crackles', 1.5], ['e:Bronchial breathing', 2], ['o:temp>=38', 1], ['l:crp>50', 1], ['l:wcc>11', 0.5]], 'Chest X-ray; CRP, white cells; CURB-65', ''),
      D('Acute heart failure', 0.5, [['h:Heart failure', 2], ['s:Orthopnoea', 1.5], ['s:PND', 1.5], ['s:Bilateral leg swelling', 1], ['s:Weight gain', 1], ['e:Crackles', 1], ['e:Elevated JVP', 2], ['e:JVP elevated', 2], ['e:Pitting oedema', 1], ['l:bnp>uln', 2], ['l:nt>uln', 2], ['a:>=60', 0.5]], 'BNP or NT-proBNP; chest X-ray; ECG; echocardiogram', ''),
      D('Pulmonary embolism', 0.5, [['h:Sudden', 1], ['s:Pleuritic chest pain', 1], ['s:Haemoptysis', 1.5], ['s:Unilateral leg swelling/calf pain', 2], ['h:Previous DVT/PE', 1.5], ['h:Previous VTE', 1.5], ['h:Recent surgery', 1], ['h:Immobility', 1], ['h:Cancer', 1], ['h:Pregnancy/postpartum', 1], ['h:Oestrogen', 0.5], ['s:Dizziness/syncope', 1], ['o:hr>100', 1], ['o:spo2<94', 1], ['l:ddim>uln', 1]], 'Wells and PERC; D-dimer if low probability; CTPA', 'Breathlessness with clear lungs and low saturations needs PE considered'),
      D('Anaphylaxis or upper airway angioedema', 0, [['s:Lip/tongue swelling', 3], ['s:Throat tightness', 2.5], ['s:Urticaria', 2], ['h:Allergen', 1], ['h:After exposure', 1], ['e:Stridor', 2], ['e:Angioedema', 3], ['o:sbp<90', 1]], 'Clinical diagnosis; mast cell tryptase', 'Airway swelling can progress within minutes'),
      D('Pneumothorax', 0, [['h:Pneumothorax', 2], ['h:Sudden', 1], ['s:Pleuritic chest pain', 1], ['e:Reduced air entry — left', 2], ['e:Reduced air entry — right', 2], ['e:Hyperresonant percussion', 2], ['e:Hyper-resonance', 2]], 'Chest X-ray or lung ultrasound', 'Tension pneumothorax is immediately life-threatening'),
      D('Acute coronary syndrome or arrhythmia', 0, [['s:Pressure-like chest pain', 2], ['s:Palpitations', 1.5], ['h:IHD/arrhythmia', 1.5], ['h:On exertion', 0.5], ['l:trop>uln', 2.5], ['e:Irregular pulse', 1.5], ['e:Irregular rhythm', 1.5]], 'ECG; troponin; cardiac monitoring', 'Breathlessness can be the only symptom of ischaemia, especially in older or diabetic patients'),
      D('Metabolic acidosis or anaemia', 0, [['h:Anaemia', 1.5], ['h:Renal disease', 1], ['l:hb<8', 2.5], ['l:ph<7.3', 2], ['l:hco3<18', 1.5], ['l:ket>=3', 2]], 'Blood gas with lactate and ketones; full blood count', 'Rapid breathing with clear lungs may be compensation, for example DKA or sepsis')
    ],
    'Hypoxia': [
      D('Pneumonia', 1, [['s:Fever', 1.5], ['s:Rigors', 1], ['s:Cough', 1], ['s:Sputum production', 1], ['s:Pleuritic chest pain', 0.5], ['h:Over days', 0.5], ['e:Crackles', 1.5], ['e:Bronchial breathing', 2], ['o:temp>=38', 1], ['l:crp>50', 1], ['l:wcc>11', 0.5]], 'Chest X-ray; CRP; blood cultures if septic', ''),
      D('COPD or asthma exacerbation', 1, [['h:COPD', 2], ['h:Asthma', 1.5], ['s:Wheeze', 2], ['e:Wheeze', 1.5], ['h:Long-term oxygen', 1], ['l:pco2>6', 1], ['s-:Wheeze', -0.5]], 'Blood gas for CO₂ retention; peak flow; chest X-ray', ''),
      D('Acute heart failure', 0.5, [['h:Heart failure', 2], ['s:Orthopnoea', 1.5], ['s:Paroxysmal nocturnal dyspnoea', 1.5], ['s:Bilateral ankle swelling', 1], ['e:Raised JVP', 2], ['e:Peripheral oedema', 1], ['e:Crackles', 1], ['l:bnp>uln', 2], ['l:nt>uln', 2]], 'BNP; chest X-ray; ECG; echocardiogram', ''),
      D('Pulmonary embolism', 0.5, [['h:Sudden', 1.5], ['s:Pleuritic chest pain', 1], ['s:Haemoptysis', 1.5], ['s:Unilateral leg swelling', 2], ['h:Previous DVT or PE', 1.5], ['h:Recent surgery', 1], ['h:Immobility', 1], ['h:Active cancer', 1], ['h:Pregnant or postpartum', 1], ['h:Long-haul travel', 0.5], ['e:Unilateral calf swelling', 1.5], ['o:hr>100', 1], ['l:ddim>uln', 1]], 'Wells and PERC; CTPA', 'Hypoxia with clear lungs needs PE considered'),
      D('Hypoventilation from opioids, sedatives or CO₂ retention', 0, [['h:Opioids or sedatives', 2.5], ['h:Obesity hypoventilation', 1.5], ['h:Neuromuscular disease', 1.5], ['s:Drowsiness', 1.5], ['s:Morning headache', 1], ['e:Flapping tremor', 1.5], ['e:Drowsy', 1], ['o:rr<10', 2], ['l:pco2>6.5', 2]], 'Blood gas (raised pCO₂ with low pO₂)', 'Rising CO₂ and falling consciousness need urgent ventilatory support'),
      D('Aspiration', 0, [['h:Aspiration event', 3], ['h:Sudden', 0.5], ['s:Cough', 0.5]], 'Chest X-ray (right lower zone); swallow assessment', ''),
      D('Carbon monoxide poisoning (SpO₂ may read normal)', 0, [['h:Fuel-burning heater, stove or generator indoors', 3], ['h:Smoke or fire', 2.5], ['s:Morning headache', 0.5], ['s:New confusion', 0.5]], 'Co-oximetry carboxyhaemoglobin on a blood gas', 'Pulse oximetry reads falsely normal; others in the household may be affected'),
      D('Pneumothorax', 0, [['h:Sudden', 1], ['s:Pleuritic chest pain', 1], ['e:Reduced air entry — left', 2], ['e:Reduced air entry — right', 2]], 'Chest X-ray or lung ultrasound', 'Tension pneumothorax is immediately life-threatening')
    ],
    'Asthma': [
      D('Acute asthma, viral trigger', 2, [['h:Viral illness', 2], ['s:Wheeze', 1], ['s:Cough', 0.5], ['s:Night waking', 0.5]], 'Peak flow against best or predicted', ''),
      D('Acute asthma, allergen or irritant trigger', 1, [['h:Allergen', 2], ['h:Dust', 1.5], ['h:Smoke', 1.5], ['h:Missed controller', 1], ['h:Weather change', 1]], 'Peak flow; trigger history', ''),
      D('Life-threatening asthma', 0, [['o:spo2<92', 3], ['e:Silent chest', 4], ['e:Central cyanosis', 2], ['e:Exhausted', 2], ['e:Drowsy', 2], ['e:Phrases only', 1], ['o:hr>120', 1], ['o:rr>25', 1], ['l:pco2>4.6', 1.5]], 'Peak flow below 33%; blood gas (a normal or raised pCO₂ is ominous)', 'Silent chest, SpO₂ under 92%, exhaustion or confusion mean life-threatening asthma'),
      D('Pneumonia', 0, [['s:Fever', 1.5], ['s:Sputum production', 1], ['s:Pleuritic chest pain', 1], ['e:Crackles', 1.5], ['e:Bronchial breathing', 2], ['o:temp>=38', 1], ['l:crp>50', 1]], 'Chest X-ray; CRP', ''),
      D('Pneumothorax', 0, [['h:Sudden onset', 1.5], ['s:Pleuritic chest pain', 1.5], ['e:Reduced air entry — left', 2], ['e:Reduced air entry — right', 2]], 'Chest X-ray', 'A recognised complication of severe asthma'),
      D('Anaphylaxis', 0, [['h:Allergen', 1], ['h:Sudden onset', 1], ['o:sbp<90', 2]], 'Clinical; mast cell tryptase', 'Wheeze with swelling, rash or low blood pressure may be anaphylaxis')
    ],
    'Cough / Cold / Flu': [
      D('Viral upper respiratory tract infection', 2, [['s:Rhinorrhoea', 1.5], ['s:Nasal congestion', 1], ['s:Sneezing', 1], ['s:Sore throat', 0.5], ['h:Improving', 0.5], ['s-:Dyspnoea', 0.5], ['o:spo2<94', -2], ['e:Crackles', -1.5]], 'Clinical diagnosis', ''),
      D('Influenza or COVID-19', 1, [['s:Fever', 1], ['s:Myalgia', 1.5], ['s:Fatigue', 0.5], ['s:Headache', 0.5], ['s:Loss/change of smell or taste', 2], ['o:temp>=38', 0.5]], 'Influenza and SARS-CoV-2 testing', ''),
      D('Community-acquired pneumonia', 0.5, [['s:Fever', 1], ['s:Rigors', 1], ['s:Dyspnoea', 1.5], ['h:Productive cough', 1], ['s:Chest pain', 0.5], ['h:Improved then deteriorated', 1.5], ['e:Crackles', 2], ['e:Bronchial breathing', 2], ['o:spo2<94', 1.5], ['o:rr>20', 1], ['l:crp>50', 1.5], ['l:wcc>11', 0.5]], 'Chest X-ray; CRP; CURB-65', ''),
      D('Streptococcal pharyngitis', 0, [['s:Sore throat', 1.5], ['s:Fever', 0.5], ['e:Exudate', 2], ['e:Tonsillar exudate', 2], ['e:Cervical lymphadenopathy', 1], ['s-:Rhinorrhoea', 0.5]], 'Centor or McIsaac score; rapid antigen test', ''),
      D('Sinusitis or otitis media', 0, [['s:Facial pain', 2], ['s:Ear pain', 2], ['e:Bulging tympanic membrane', 2.5]], 'Clinical; otoscopy', ''),
      D('Sepsis or meningitis', 0, [['s:Confusion', 2], ['s:Neck stiffness', 2.5], ['s:Rash', 1], ['s:Reduced urine output', 1], ['o:sbp<90', 2], ['o:rr>22', 1], ['o:hr>130', 1], ['l:lact>2', 1.5]], 'NEWS2 and qSOFA; lactate; blood cultures; lumbar puncture if meningism', 'Confusion, neck stiffness, a non-blanching rash or low blood pressure change everything'),
      D('Pertussis, TB or other chronic cause', 0, [['h:Paroxysmal', 1.5], ['s:Post-tussive vomiting', 1.5], ['s:Night sweats / weight loss', 2], ['s:Haemoptysis', 1.5]], 'Duration of cough; chest X-ray; sputum testing', '')
    ],
    'Fever': [
      D('Viral illness', 1.5, [['s:Cough / sore throat / coryza', 1.5], ['s:Myalgia / retro-orbital pain', 0.5], ['h:Household illness', 1]], 'Clinical; viral testing as appropriate', ''),
      D('Dengue or other arboviral infection', 0.5, [['s:Myalgia / retro-orbital pain', 2], ['h:Mosquito exposure', 1.5], ['s:Headache', 0.5], ['s:Bleeding / bruising', 1.5], ['l:plt<100', 1.5], ['l:wcc<4', 1]], 'Full blood count (falling platelets, rising haematocrit); NS1 antigen or serology', 'Warning signs: abdominal pain, persistent vomiting, bleeding, lethargy, rising haematocrit with falling platelets'),
      D('Urinary tract infection or pyelonephritis', 0.5, [['s:Dysuria / frequency', 2], ['s:Flank pain', 1.5], ['e:Renal angle tenderness', 1.5]], 'Urine dipstick and culture', ''),
      D('Pneumonia', 0.5, [['s:Dyspnoea / chest pain', 1.5], ['s:Cough / sore throat / coryza', 0.5], ['e:Crackles', 2], ['o:spo2<94', 1.5], ['o:rr>20', 1]], 'Chest X-ray; CRP', ''),
      D('Skin or soft-tissue infection', 0, [['s:Skin wound / redness / swelling', 2.5], ['e:Erythema', 1]], 'Examination; mark the margin', ''),
      D('Meningitis or meningococcal sepsis', 0, [['s:Neck stiffness', 2.5], ['s:Photophobia', 1.5], ['s:Headache', 0.5], ['s:Non-blanching rash', 3], ['s:Lethargy / confusion', 1.5], ['s:Seizure', 1], ['e:Non-blanching rash', 3], ['e:Neck stiffness', 2.5]], 'Blood cultures; lumbar puncture when safe', 'A non-blanching rash with fever is meningococcal sepsis until proven otherwise'),
      D('Sepsis from any source', 0, [['s:Rigors', 1], ['s:Lethargy / confusion', 1.5], ['s:Reduced urine output', 1], ['o:sbp<=100', 1.5], ['o:rr>=22', 1], ['o:hr>130', 1], ['l:lact>2', 2], ['l:wcc>12', 0.5], ['l:wcc<4', 0.5]], 'NEWS2 and qSOFA; lactate; blood cultures', 'Low blood pressure, raised lactate or new confusion signal organ dysfunction'),
      D('Leptospirosis', 0, [['s:Myalgia / retro-orbital pain', 1], ['h:Recent travel', 0.5], ['s:Reduced urine output', 1], ['l:creat>150', 1], ['l:bili>40', 1]], 'Exposure to floodwater or rodents; renal and liver function; serology or PCR', 'Consider after flooding or rodent exposure; can cause renal and liver failure and pulmonary haemorrhage')
    ],
    'Headache': [
      D('Migraine', 1.5, [['h:Unilateral', 1], ['h:Throbbing', 1], ['s:Photophobia', 1], ['s:Phonophobia', 1], ['s:Nausea/vomiting', 0.5], ['s:Visual aura', 1.5], ['h:Gradual', 0.5], ['a:<50', 0.5], ['s:Thunderclap onset', -2], ['s:Fever', -1]], 'Clinical; previous similar episodes', ''),
      D('Tension-type headache', 1.5, [['h:Bilateral', 1], ['h:Pressure/tightness', 1.5], ['s-:Nausea/vomiting', 0.5], ['s-:Photophobia', 0.5], ['s:Thunderclap onset', -2]], 'Clinical', ''),
      D('Subarachnoid haemorrhage', 0, [['s:Thunderclap onset', 3.5], ['h:Sudden', 2], ['h:Occipital', 0.5], ['h:Exertion', 1], ['h:Sexual activity', 1], ['s:Neck stiffness', 1.5], ['s:Loss of consciousness', 1.5], ['s:Seizure', 1], ['s:Nausea/vomiting', 0.5]], 'CT head within 6 hours; lumbar puncture if CT negative and later', 'Thunderclap headache is subarachnoid haemorrhage until proven otherwise'),
      D('Meningitis or encephalitis', 0, [['s:Fever', 2], ['s:Neck stiffness', 2], ['s:Rash', 1.5], ['s:Confusion', 1.5], ['s:Seizure', 1], ['s:Photophobia', 0.5], ['o:temp>=38', 1], ['e:Neck stiffness', 2]], 'Blood cultures; lumbar puncture when safe; CT if focal signs', 'Fever with headache and neck stiffness or confusion'),
      D('Giant cell arteritis', 0, [['s:Jaw claudication', 2.5], ['s:Scalp tenderness', 2], ['s:Visual loss', 1.5], ['a:>=50', 1], ['a:<50', -3], ['l:crp>50', 1]], 'ESR and CRP; temporal artery ultrasound or biopsy', 'Can cause permanent visual loss within days'),
      D('Raised intracranial pressure or mass', 0, [['h:Worse lying down', 1.5], ['h:Cough/straining', 1], ['s:Nausea/vomiting', 0.5], ['s:Weakness/numbness', 1.5], ['s:Seizure', 1], ['e:Papilloedema suspected', 3], ['e:Focal weakness', 2]], 'Neurological and fundal examination; CT head', 'New headache with focal signs, papilloedema or seizure'),
      D('Acute angle-closure glaucoma', 0, [['s:Painful red eye / haloes', 3.5], ['h:Retro-orbital', 1], ['s:Nausea/vomiting', 0.5], ['s:Visual loss', 1]], 'Intraocular pressure; urgent ophthalmology', 'Painful red eye with haloes threatens sight'),
      D('Carbon monoxide poisoning', 0, [['h:Generalised', 0.5], ['s:Confusion', 0.5]], 'Ask about fuel-burning heaters, stoves or generators indoors and similar symptoms in others; carboxyhaemoglobin', 'Several household members with headache suggests carbon monoxide'),
      D('Low-pressure headache', 0, [['h:Worse upright', 3]], 'Recent lumbar puncture or spinal procedure', '')
    ],
    'Syncope': [
      D('Vasovagal (reflex) syncope', 2, [['h:Pain/emotion', 1.5], ['h:Prolonged standing', 1.5], ['h:Heat', 1], ['h:Sweating/warmth', 1], ['h:Nausea', 1], ['h:Visual dimming', 1], ['h:Immediate orientation', 1], ['a:<40', 0.5], ['h:During exercise', -2], ['h:Supine', -1.5], ['s:Palpitations', -1], ['h:No warning', -1]], 'Clinical; normal ECG', ''),
      D('Orthostatic hypotension', 1, [['h:Just stood up', 2.5], ['a:>=65', 1], ['o:sbp<100', 0.5], ['l:hb<10', 1]], 'Lying and standing blood pressure; medication review', ''),
      D('Situational syncope', 0, [['h:Cough', 2], ['h:Urination', 2], ['h:Straining', 2]], 'Clinical', ''),
      D('Cardiac arrhythmia', 0, [['h:No warning', 1.5], ['s:Palpitations', 2], ['h:Supine', 1.5], ['h:Sitting', 0.5], ['h:During exercise', 1.5], ['s:Head strike', 0.5], ['a:>=60', 0.5], ['o:hr<45', 2], ['e:Irregular pulse', 1], ['l:k<3', 1], ['l:k>6', 1.5]], 'ECG (QT, Brugada, pre-excitation, conduction block, pauses); monitoring', 'Syncope on exertion, while lying down, with palpitations or without warning suggests a cardiac cause'),
      D('Structural heart disease or ischaemia', 0, [['h:During exercise', 2], ['s:Chest pain', 2], ['s:Dyspnoea', 1], ['e:Murmur', 1.5], ['e:Systolic murmur', 1.5], ['l:trop>uln', 2]], 'ECG; troponin; echocardiogram (aortic stenosis, cardiomyopathy)', 'Exertional syncope with a murmur suggests aortic stenosis or cardiomyopathy'),
      D('Seizure', 0, [['s:Jerking movements', 1], ['s:Lateral tongue bite', 2.5], ['s:Post-event confusion', 2], ['h:Prolonged confusion', 1.5], ['s:Incontinence', 0.5]], 'Witness account; prolonged confusion and lateral tongue bite favour seizure', ''),
      D('Pulmonary embolism or hidden bleeding', 0, [['s:Dyspnoea', 1.5], ['s:Chest pain', 0.5], ['o:hr>100', 1], ['o:spo2<94', 1.5], ['l:hb<10', 1.5]], 'Ask about melaena or PV bleeding; haemoglobin; Wells score', 'Syncope can be the first sign of PE, GI bleeding, ectopic pregnancy or aortic dissection')
    ],
    'Acute abdomen — atraumatic': [
      D('Acute appendicitis', 0.5, [['e:Localised tenderness', 2.5], ['s:Vomiting', 0.5], ['s:Fever', 0.5], ['h:Worse movement', 0.5], ['h:Worse cough', 1], ['e:Rebound tenderness', 1], ['e:Guarding', 1], ['l:wcc>11', 1], ['l:crp>50', 0.5], ['a:<40', 0.5]], 'Alvarado or AIR score; ultrasound or CT', ''),
      D('Biliary colic or cholecystitis', 0.5, [['h:Worse food', 1.5], ['h:Radiates to shoulder', 1], ['s:Vomiting', 0.5], ['s:Fever', 0.5], ['s:Jaundice', 1], ['l:bili>40', 1], ['l:alp>130', 0.5], ['x:F', 0.3]], 'Liver function tests; ultrasound', 'Fever with jaundice suggests cholangitis'),
      D('Acute pancreatitis', 0, [['h:Radiates to back', 2], ['h:Constant', 0.5], ['s:Vomiting', 1], ['l:lip>uln', 2.5], ['l:amyl>330', 2.5]], 'Lipase or amylase (over 3 times normal); ultrasound for gallstones', ''),
      D('Bowel obstruction', 0, [['s:Bilious vomiting', 2], ['s:Distension', 2], ['s:Constipation / obstipation', 2], ['h:Colicky', 1], ['e:High-pitched bowel sounds', 1.5], ['e:Tender hernia', 1]], 'Abdominal X-ray or CT', 'Look for an incarcerated hernia'),
      D('Renal colic', 0.5, [['h:Colicky', 1.5], ['h:Radiates to groin', 2.5], ['s:Dysuria / haematuria', 1.5], ['e:Renal angle tenderness', 1.5]], 'Urinalysis; CT KUB; check renal function', 'An older patient with "renal colic" may have a leaking aortic aneurysm'),
      D('Gastritis or peptic ulcer disease', 1, [['h:Burning', 2], ['h:Worse food', 0.5], ['s:Haematemesis', 1], ['s:PR bleeding / melaena', 1]], 'Haemoglobin; endoscopy if bleeding', 'Sudden severe pain with a rigid abdomen suggests perforation'),
      D('Gynaecological cause (ectopic pregnancy, torsion, PID)', 0, [['x:M', -9], ['x:F', 0.5], ['s:PV bleeding / discharge', 2], ['s:Syncope', 1]], 'Pregnancy test in every woman of reproductive age; pelvic ultrasound', 'Ectopic pregnancy can present with abdominal pain and collapse'),
      D('Ruptured or leaking abdominal aortic aneurysm', 0, [['a:<40', -9], ['a:>=60', 1], ['x:M', 0.5], ['h:Radiates to back', 1.5], ['s:Syncope', 2], ['o:sbp<90', 2]], 'Bedside ultrasound of the aorta; CT if stable', 'Back or flank pain with collapse in an older patient'),
      D('Mesenteric ischaemia', 0, [['a:>=60', 1], ['e:Irregular pulse', 1], ['l:lact>2', 1.5]], 'Lactate; CT angiography', 'Severe pain with few signs, especially with atrial fibrillation'),
      D('Testicular torsion', 0, [['x:F', -9], ['s:Testicular pain', 3]], 'Urgent urology review; do not delay for imaging', 'Testicular pain presenting as abdominal pain in a young male'),
      D('Inferior myocardial infarction or DKA', 0, [['s:Chest pain / dyspnoea', 1.5], ['l:trop>uln', 2.5], ['l:ket>=3', 2.5], ['l:glu>14', 1]], 'ECG; capillary glucose and ketones', 'Medical causes of epigastric or abdominal pain')
    ],
    'Acute abdomen — traumatic': [
      D('Solid organ injury (spleen or liver)', 1, [['h:Blunt injury', 1], ['s:Shoulder-tip pain', 2], ['s:Syncope', 1], ['e:Tenderness', 1], ['o:hr>100', 1], ['o:sbp<90', 2], ['l:hb<10', 1]], 'FAST scan; CT abdomen if stable', 'Haemodynamic instability needs immediate escalation'),
      D('Hollow viscus injury', 0, [['h:Penetrating injury', 1.5], ['h:Road collision', 0.5], ['s:Vomiting', 0.5], ['s:Haematemesis / PR bleeding', 1.5], ['e:Guarding', 1.5], ['e:Rigidity', 2], ['e:Seat-belt mark', 2]], 'CT (may be normal early); serial examination', 'Seat-belt bruising predicts bowel and mesenteric injury'),
      D('Renal or bladder injury', 0, [['s:Haematuria', 2.5], ['s:Difficulty voiding', 1.5], ['e:Flank tenderness', 1.5], ['e:Blood at meatus', 2]], 'Urinalysis; CT with delayed phase', 'Blood at the meatus: avoid catheterising before urology advice'),
      D('Pelvic fracture with bleeding', 0, [['h:Crush', 1], ['h:Road collision', 1], ['h:Fall', 0.5], ['e:Pelvic tenderness', 2], ['o:sbp<90', 1.5]], 'Pelvic X-ray or CT; pelvic binder if suspected', 'Pelvic fractures can bleed heavily'),
      D('Abdominal wall contusion only', 1, [['e:Tenderness', 0.5], ['o:hr>100', -1], ['o:sbp<90', -2]], 'Diagnosis of exclusion after imaging or observation', '')
    ],
    'Upper GI bleed': [
      D('Peptic ulcer bleeding', 2, [['s:Melaena', 1.5], ['s:Coffee-ground vomit', 1], ['h:Coffee-ground vomit', 1], ['s:Abdominal pain', 0.5], ['e:Tenderness', 1], ['l:urea>10', 1]], 'Glasgow-Blatchford score; endoscopy', ''),
      D('Variceal bleeding', 0, [['s:Jaundice', 2], ['h:Fresh red blood', 1], ['h:Clots', 1], ['e:Ascites', 2], ['e:Jaundice', 2], ['e:Palmar erythema', 1], ['e:Spider naevi', 1.5], ['l:plt<100', 1.5], ['l:bili>40', 1], ['l:alb<30', 1]], 'Known liver disease; urgent endoscopy', 'Variceal bleeding needs specific early management'),
      D('Mallory-Weiss tear', 0.5, [['h:Retching before blood', 2.5], ['h:Vomiting before blood', 2], ['h:Fresh red blood', 0.5]], 'History; endoscopy if ongoing', ''),
      D('Oesophagitis or gastritis', 1, [['h:Coffee-ground vomit', 0.5], ['s:Abdominal pain', 0.5]], 'Endoscopy', ''),
      D('Not upper GI: swallowed blood or haemoptysis', 0, [['h:Possible swallowed blood', 2.5], ['h:Possible haemoptysis', 2.5]], 'Examine nose and throat; respiratory history', ''),
      D('Haemodynamically significant bleed', 0, [['s:Syncope', 1.5], ['s:Dizziness', 1], ['s:Confusion', 1], ['s:Reduced urine output', 1], ['o:hr>100', 1.5], ['o:sbp<90', 2.5], ['l:hb<8', 2]], 'Shock index; haemoglobin; group and crossmatch', 'Tachycardia, low blood pressure or syncope mean significant blood loss')
    ],
    'PR Bleeding': [
      D('Haemorrhoids', 2, [['h:Bright red blood', 1], ['h:On wiping', 2], ['h:Coating stool', 1], ['h:Haemorrhoids', 1.5], ['s:Anal lump / prolapse', 1.5], ['e:External haemorrhoid', 2]], 'Anal inspection and PR examination', ''),
      D('Anal fissure', 1, [['s:Anal pain', 2], ['h:On wiping', 1], ['s:Constipation / straining', 1], ['h:Fissure', 1.5], ['e:Fissure', 2.5]], 'Gentle anal inspection', ''),
      D('Diverticular bleeding', 0.5, [['h:Diverticular disease', 2], ['h:Dark red / maroon blood', 1.5], ['h:Blood alone', 1], ['a:>=60', 1]], 'CT angiography if ongoing; colonoscopy', ''),
      D('Colorectal cancer', 0, [['s:Change in bowel habit', 2], ['s:Weight loss', 2], ['h:Mixed through stool', 1.5], ['a:>=50', 1], ['l:hb<10', 1], ['e:Palpable mass', 2]], 'Colonoscopy referral', 'Change in bowel habit, weight loss or iron-deficiency anaemia'),
      D('Inflammatory or infective colitis', 0, [['s:Diarrhoea', 1.5], ['s:Mucus', 1.5], ['s:Tenesmus', 1.5], ['s:Fever', 1], ['h:IBD', 2], ['l:crp>50', 1]], 'Stool culture; CRP; colonoscopy', ''),
      D('Upper GI bleed presenting rectally', 0, [['h:Black tarry stool', 2], ['s:Haematemesis / coffee-ground vomit', 2.5], ['l:urea>10', 1.5]], 'Urea raised out of proportion to creatinine; endoscopy', 'Brisk upper GI bleeding can pass dark red blood rectally'),
      D('Haemodynamically significant bleed', 0, [['s:Heavy ongoing bleeding', 2], ['s:Syncope', 1.5], ['s:Dizziness', 1], ['o:hr>100', 1.5], ['o:sbp<90', 2.5], ['l:hb<8', 2]], 'Shock index; haemoglobin; group and crossmatch', 'Tachycardia, low blood pressure or syncope mean significant blood loss')
    ],
    'Vomiting & diarrhoea': [
      D('Viral gastroenteritis', 2.5, [['h:Watery', 1], ['h:Clear fluid', 0.5], ['s-:Bloody stool / melaena', 0.5], ['s:Fever', 0.3]], 'Clinical', ''),
      D('Bacterial gastroenteritis or food poisoning', 0.5, [['h:Bloody', 2], ['s:Bloody stool / melaena', 2], ['s:Fever', 1], ['s:Tenesmus', 1], ['l:crp>50', 1]], 'Stool culture; ask about food and travel', ''),
      D('Dehydration with acute kidney injury', 0, [['s:Reduced urine output', 2], ['s:Dizziness / syncope', 1.5], ['s:Thirst', 1], ['e:Dry mucous membranes', 1], ['e:Dry mucosa', 1], ['o:hr>100', 1], ['o:sbp<100', 1], ['l:creat>150', 2], ['l:urea>10', 1], ['l:na<130', 1], ['l:k<3', 1]], 'Renal function and electrolytes', 'Watch potassium and kidney function'),
      D('Bowel obstruction', 0, [['s:Bilious vomiting', 2.5], ['h:Bilious', 2], ['s:Distension', 2], ['s:Abdominal pain', 0.5], ['e:Distended', 1.5]], 'Abdominal X-ray or CT', 'Bilious vomiting with distension'),
      D('Surgical abdomen (appendicitis and others)', 0, [['s:Abdominal pain', 1], ['e:Guarding', 1.5], ['e:Rebound tenderness', 1.5], ['l:wcc>11', 0.5]], 'Serial examination; imaging', 'Pain that persists or localises is not gastroenteritis'),
      D('Diabetic ketoacidosis', 0, [['l:ket>=3', 3], ['l:glu>14', 1.5], ['l:ph<7.3', 1.5]], 'Capillary glucose and ketones; blood gas', 'Vomiting is a common presentation of DKA'),
      D('Meningitis or raised intracranial pressure', 0, [['s:Headache / neck stiffness', 2.5], ['e:Neck stiffness', 2.5], ['o:temp>=38', 0.5]], 'Neurological examination', 'Vomiting with headache or neck stiffness'),
      D('Upper GI bleed', 0, [['s:Haematemesis', 2.5], ['h:Coffee-ground', 2.5], ['h:Blood', 1.5], ['h:Black', 2]], 'Haemoglobin; Glasgow-Blatchford score', '')
    ],
    'Constipation': [
      D('Simple or medication-related constipation', 2, [['h:Hard pellets', 1], ['h:Hard lumpy stool', 1], ['h:Low fluid intake', 0.5], ['h:Low fibre intake', 0.5], ['h:Reduced mobility', 0.5], ['h:Opioids', 1.5], ['h:Iron', 0.5], ['h:Calcium', 0.5], ['h:Anticholinergic', 0.5], ['h:Verapamil', 0.5]], 'Clinical; medication review', ''),
      D('Faecal impaction with overflow', 0.5, [['s:Overflow soiling', 2], ['h:Watery leakage / soiling', 2], ['h:Previous impaction', 1.5], ['e:Impacted stool', 2.5], ['a:>=70', 0.5]], 'Rectal examination', ''),
      D('Bowel obstruction', 0, [['s:Vomiting', 1], ['s:Bilious vomiting', 2], ['s:Unable to pass flatus', 2.5], ['s:Distension', 1.5], ['h:Sudden', 1], ['h:Previous obstruction', 1.5], ['h:Abdominal surgery', 1], ['h:Hernia', 1], ['e:Distension', 1.5], ['e:High-pitched bowel sounds', 1.5]], 'Abdominal X-ray or CT', 'Absolute constipation with vomiting'),
      D('Cauda equina or spinal cord compression', 0, [['s:Back pain', 1], ['s:Leg weakness', 2], ['s:Saddle numbness', 3], ['s:Urinary retention', 2]], 'Neurological examination including perianal sensation; urgent MRI', 'Saddle numbness, urinary retention or leg weakness'),
      D('Colorectal cancer', 0, [['s:Weight loss', 2], ['s:PR bleeding', 1], ['s:Melaena', 1], ['h:Progressively worsening', 1.5], ['a:>=50', 1], ['l:hb<10', 1]], 'Colonoscopy referral', 'New constipation in an older adult with weight loss, bleeding or anaemia'),
      D('Hypercalcaemia or hypothyroidism', 0, [['h:Hypothyroidism', 1.5], ['l:adjca>2.6', 2.5], ['l:ca>2.6', 2]], 'Calcium; thyroid function', '')
    ],
    'Acute confusional state': [
      D('Infection (urinary, chest or other)', 1.5, [['s:Fever', 1.5], ['s:Dysuria', 1.5], ['s:Dyspnoea', 1], ['h:Recent illness', 0.5], ['o:temp>=38', 1], ['l:wcc>11', 0.5], ['l:crp>50', 1], ['e:Crackles', 1]], 'Urine, chest X-ray, CRP, blood cultures', ''),
      D('Medication or substance effect, or withdrawal', 1, [['h:Medication change', 2], ['h:Missed medication', 1], ['h:Alcohol cessation', 2.5], ['s:Hallucinations', 1], ['s:Agitation', 0.5]], 'Medication review; withdrawal assessment', 'Alcohol withdrawal can progress to delirium tremens and seizures'),
      D('Metabolic: hypoglycaemia, hyponatraemia, uraemia, hypercalcaemia', 0.5, [['h:Poor intake', 1], ['l:glu<4', 3], ['l:na<125', 2.5], ['l:na>150', 2], ['l:urea>20', 1.5], ['l:adjca>2.8', 2], ['l:ca>2.8', 2]], 'Capillary glucose; sodium, calcium, renal function', 'Check glucose in every confused patient'),
      D('Stroke or intracranial bleed', 0, [['s:New focal weakness', 3], ['h:Fall or head injury', 2], ['s:Headache', 1], ['h:Abrupt', 1], ['e:Focal neurological deficit', 2.5]], 'Neurological examination; CT head', 'Head injury on anticoagulants, or new focal signs'),
      D('Constipation or urinary retention', 0.5, [['s:Constipation', 1.5], ['s:Urinary retention', 2], ['e:Bladder distension', 2]], 'Bladder scan; abdominal and rectal examination', ''),
      D('Non-convulsive seizure or post-ictal state', 0, [['s:Seizure-like activity', 2.5], ['h:Fluctuating', 0.5]], 'EEG if suspected', ''),
      D('Meningitis or encephalitis', 0, [['s:Fever', 1], ['s:Headache', 1], ['e:Neck stiffness', 2.5], ['o:temp>=38', 0.5]], 'Lumbar puncture when safe', 'Fever with confusion and headache')
    ],
    'Decreased responsiveness — elderly': [
      D('Sepsis (urinary, chest or other)', 1.5, [['s:Fever', 1.5], ['s:Urinary symptoms', 1.5], ['s:Cough / dyspnoea', 1.5], ['o:temp>=38', 1], ['o:sbp<=100', 1], ['o:rr>=22', 1], ['l:lact>2', 1.5], ['l:crp>50', 1]], 'NEWS2; lactate; cultures; urine; chest X-ray', ''),
      D('Stroke or intracranial haemorrhage', 0.5, [['s:New focal weakness / speech change', 3], ['s:Fall / head strike', 1.5], ['s:Headache / neck stiffness', 1], ['h:Sudden onset', 1.5]], 'CT head; anticoagulant history', 'Sudden change, focal signs or a head strike'),
      D('Hypoglycaemia or other metabolic cause', 0.5, [['l:glu<4', 3.5], ['l:na<125', 2.5], ['l:urea>20', 1.5], ['l:adjca>2.8', 2], ['l:glu>25', 2]], 'Capillary glucose first; electrolytes; renal function', 'Check glucose immediately'),
      D('Medication toxicity or hypercapnia', 0.5, [['h:Drowsy', 0.5], ['o:rr<10', 2], ['l:pco2>6.5', 2.5]], 'Medication review (opioids, sedatives); blood gas', ''),
      D('Hidden bleeding or cardiac event', 0, [['s:GI bleeding', 2.5], ['s:Chest pain / syncope', 2], ['o:hr>100', 0.5], ['o:sbp<90', 1.5], ['l:hb<8', 2], ['l:trop>uln', 2]], 'Haemoglobin; ECG; troponin; PR examination', ''),
      D('Post-ictal state', 0, [['s:Seizure-like activity', 3]], 'Witness history; EEG', ''),
      D('Dehydration', 0.5, [['s:Vomiting / diarrhoea', 1.5], ['e:Dry mucous membranes', 1], ['l:urea>10', 1], ['l:na>145', 1.5]], 'Renal function; sodium', '')
    ],
    'Behavioural change': [
      D('Delirium from a medical cause', 1, [['h:Sudden', 1], ['h:Fluctuating', 1.5], ['h:Confusion', 1.5], ['s:Fever', 1.5], ['s:Cough/dyspnoea', 1], ['s:Urinary symptoms', 1], ['h:Dementia', 1], ['a:>=65', 1], ['l:glu<4', 2], ['l:na<125', 2]], '4AT; glucose; infection screen; electrolytes', 'A first episode of behavioural change in an older person is delirium until proven otherwise'),
      D('Substance intoxication or withdrawal', 0.5, [['h:Alcohol', 1.5], ['h:Cannabis', 1], ['h:Stimulants', 1.5], ['h:Sedatives', 1], ['e:Intoxication signs', 2]], 'Substance history; toxicology as indicated', ''),
      D('Psychotic disorder', 0.5, [['s:Hallucinations', 1.5], ['s:Command hallucinations', 2], ['h:Talking to unseen people', 1.5], ['h:Unusual beliefs', 1.5], ['h:Suspiciousness', 1], ['h:Psychiatric illness', 1], ['h:Similar previous episodes', 1], ['e:Delusional content elicited', 2], ['h:Gradual', 0.5], ['h:Fluctuating', -1]], 'Exclude organic causes first; mental state examination', ''),
      D('Mania or bipolar disorder', 0, [['s:Elevated/irritable mood', 2], ['s:Reduced need for sleep', 2], ['s:Racing thoughts', 1.5], ['s:Impulsive/risk-taking behaviour', 1.5], ['e:Pressured speech', 2]], 'Mental state examination; history from family', ''),
      D('Severe depression with risk', 0, [['s:Low mood', 1.5], ['s:Hopelessness', 2], ['s:Self-neglect', 1], ['h:Withdrawal', 1]], 'Suicide risk assessment', 'Hopelessness raises suicide risk; ask directly'),
      D('Encephalitis, meningitis or intracranial lesion', 0, [['s:Fever', 1], ['s:Headache', 1], ['s:Neck stiffness', 2.5], ['s:Seizure', 2], ['s:Focal weakness', 2.5], ['h:Head injury', 1]], 'CT head; lumbar puncture when safe', 'Fever, headache, seizure or focal signs with behavioural change')
    ],
    'Seizure': [
      D('Breakthrough seizure in known epilepsy', 1, [['h:Known epilepsy', 3], ['h:Full recovery between events', 0.5]], 'Adherence, sleep, alcohol, intercurrent illness; drug levels if relevant', ''),
      D('First unprovoked seizure', 1, [['h:First suspected seizure', 2], ['s:Lateral tongue injury', 1], ['s:Post-event confusion', 1], ['h:Bilateral from onset', 0.5]], 'ECG; glucose; electrolytes; neuroimaging and first-seizure follow-up', ''),
      D('Provoked seizure: metabolic, alcohol or drugs', 0.5, [['l:glu<4', 3], ['l:na<125', 2.5], ['l:adjca<1.9', 2], ['l:ca<1.9', 2], ['l:mg<0.5', 1.5]], 'Glucose, sodium, calcium, magnesium; alcohol and drug history', ''),
      D('Syncope with jerking (convulsive syncope)', 0.5, [['s:Palpitations / chest pain', 2], ['s-:Post-event confusion', 1], ['s-:Lateral tongue injury', 0.5]], 'Brief jerks with rapid recovery favour syncope; ECG', 'Cardiac syncope can look like a seizure'),
      D('Intracranial cause: bleed, stroke, mass or infection', 0, [['s:Persistent weakness', 2.5], ['s:Speech / visual change', 1.5], ['s:Severe headache', 2], ['s:Fall / head strike', 1], ['h:Focal onset', 1.5], ['e:Focal weakness', 2.5]], 'CT head', 'Persistent focal deficit, severe headache or head injury'),
      D('Meningitis or encephalitis', 0, [['s:Fever', 2], ['s:Neck stiffness', 2.5], ['o:temp>=38', 1]], 'Lumbar puncture when safe', 'Seizure with fever in an adult'),
      D('Status epilepticus or ongoing seizures', 0, [['h:No recovery', 3], ['h:Incomplete recovery', 2]], 'Time each seizure; blood gas', 'Failure to recover between seizures')
    ],
    'Suspected stroke': [
      D('Ischaemic stroke', 2, [['h:Sudden onset', 1.5], ['s:Limb weakness', 1], ['s:Facial droop', 1], ['s:Speech disturbance', 1], ['h:Persistent', 1], ['e:Facial asymmetry', 1], ['e:Pronator drift', 1], ['e:Irregular pulse', 1], ['a:>=60', 0.5]], 'Urgent CT and CT angiography; time last known well', 'Time-critical for reperfusion'),
      D('Intracerebral haemorrhage', 0.5, [['s:Severe headache', 2], ['s:Loss of consciousness', 1.5], ['s:Seizure', 0.5], ['h:Worsening', 1], ['o:sbp>200', 1.5]], 'CT head; anticoagulant history', ''),
      D('Transient ischaemic attack', 0.5, [['h:Improving', 2], ['h:Intermittent', 1]], 'Full resolution; urgent TIA assessment', ''),
      D('Hypoglycaemia', 0, [['l:glu<4', 4]], 'Capillary glucose', 'Hypoglycaemia mimics stroke; check glucose first'),
      D('Post-ictal (Todd) paresis', 0, [['s:Seizure', 3]], 'Witness history', ''),
      D('Migraine with aura', 0, [['s:Severe headache', 0.5], ['h:Gradual onset', 1.5], ['a:<45', 0.5]], 'Spreading positive symptoms; previous episodes', ''),
      D('Posterior circulation stroke', 0, [['s:Ataxia/imbalance', 2], ['s:Diplopia', 2], ['s:Dysphagia', 1], ['h:Balance', 1.5], ['e:Ataxia', 1.5], ['e:Dysmetria', 1.5]], 'Neurological examination including gait; CT angiography or MRI', 'Posterior strokes are often missed by face-arm-speech screens')
    ],
    'Dizziness': [
      D('Benign paroxysmal positional vertigo', 1, [['h:Spinning', 1], ['h:Rolling in bed', 2], ['h:Looking up', 1.5], ['h:Episodic with full recovery', 1.5], ['h:No symptoms between spells', 1]], 'Dix-Hallpike test', ''),
      D('Vestibular neuritis or labyrinthitis', 0.5, [['h:Spinning', 1], ['h:Continuous', 2], ['s:Vomiting', 1], ['s:New hearing loss', 0.5], ['h:Movement worsens existing symptoms', 1]], 'HINTS examination in continuous vertigo', ''),
      D('Posterior circulation stroke', 0, [['h:Continuous', 0.5], ['s:Diplopia', 2], ['s:Dysarthria', 2], ['s:Dysphagia', 1.5], ['s:Unilateral weakness or numbness', 2.5], ['s:New gait difficulty', 2], ['s:Headache', 0.5], ['s:Neck pain', 1], ['e:Direction-changing gaze-evoked nystagmus', 2.5], ['e:Ataxia', 1.5], ['a:>=60', 0.5]], 'HINTS by a trained examiner; MRI or CT angiography', 'Acute continuous vertigo with any neurological sign, or neck pain (dissection)'),
      D('Orthostatic hypotension or dehydration', 0.5, [['h:Near-fainting', 1.5], ['h:Light-headedness', 1], ['h:Standing up', 2.5], ['o:sbp<100', 1], ['l:hb<10', 1]], 'Lying and standing blood pressure; medications', ''),
      D('Cardiac arrhythmia or ischaemia', 0, [['h:Near-fainting', 1], ['h:Exertion', 1.5], ['s:Palpitations', 2], ['s:Chest pain', 2], ['s:Syncope', 1.5], ['o:hr<45', 2], ['o:hr>130', 1.5]], 'ECG; monitoring; troponin if chest pain', 'Pre-syncope with palpitations, chest pain or exertion'),
      D('Anaemia or hypoglycaemia', 0, [['l:hb<9', 2.5], ['l:glu<4', 3]], 'Haemoglobin; glucose', ''),
      D('Ménière disease', 0, [['s:Tinnitus', 1.5], ['s:New hearing loss', 1.5], ['h:Episodic with residual symptoms', 0.5]], 'Audiology', '')
    ],
    'Unwitnessed fall': [
      D('Mechanical fall', 1.5, [['h:a trip or slip', 3], ['h:Recalls the fall clearly', 1.5], ['h:Got up unaided', 0.5]], 'Falls assessment; environment', ''),
      D('Syncope (cardiac or orthostatic)', 0.5, [['h:a blackout', 2.5], ['h:Dizziness on standing', 2], ['s:Loss of consciousness', 1.5], ['s:Dizziness before the fall', 1.5], ['s:Palpitations', 1.5], ['s:Chest pain', 1.5], ['h:Has no recall of the fall', 1]], 'ECG; lying and standing blood pressure', 'Cardiac syncope in an older adult'),
      D('Seizure', 0, [['h:a possible seizure', 2.5], ['s:Jerking movements', 1.5], ['s:Tongue biting', 2], ['s:Incontinence', 0.5], ['s:Confusion', 0.5]], 'Witness history; glucose; electrolytes', ''),
      D('Intercurrent illness (infection, metabolic)', 0.5, [['h:Legs giving way', 1], ['s:Fever', 1.5], ['s:Urinary symptoms', 1.5], ['s:Confusion', 1], ['o:temp>=38', 1], ['l:na<130', 1.5], ['l:crp>50', 1]], 'Infection screen; electrolytes', ''),
      D('Stroke', 0, [['s:Limb weakness', 2.5], ['s:Speech disturbance', 2.5], ['s:Visual disturbance', 1], ['e:Focal limb weakness', 2.5]], 'Neurological examination; CT head', 'New weakness or speech disturbance'),
      D('Head injury with intracranial bleed', 0, [['s:Head strike', 1.5], ['s:Vomiting', 1], ['s:Headache', 1], ['s:Amnesia for the event', 1], ['s:Confusion', 1]], 'CT head criteria (anticoagulants, age 65 or over, vomiting)', 'Anticoagulated or older patients with a head strike'),
      D('Hip fracture', 0, [['s:Hip or groin pain', 2.5], ['s:Inability to weight-bear', 2.5], ['e:Leg shortened and externally rotated', 3], ['e:Pain on hip movement', 1.5]], 'Hip and pelvis X-ray', ''),
      D('Rhabdomyolysis or pressure injury from a long lie', 0, [['h:More than 4 hours', 3], ['h:Was unable to get up', 1.5], ['l:ck>uln', 2], ['l:creat>150', 1], ['e:Pressure area redness', 1.5]], 'CK; renal function; skin check', 'A long lie causes rhabdomyolysis, pressure injury and hypothermia')
    ],
    'Fall from height': [
      D('Head injury', 1, [['s:Head strike', 2], ['s:Vomiting', 1], ['h:Head first', 2]], 'CT head criteria', ''),
      D('Spinal injury', 0.5, [['s:Neck pain', 1.5], ['s:Back pain', 1.5], ['s:Limb weakness', 2.5], ['s:Numbness/tingling', 2], ['h:Feet first', 0.5], ['h:Buttocks first', 1]], 'Spinal immobilisation; Canadian C-spine rule; CT', 'Feet-first landings transmit force to the lumbar spine'),
      D('Limb fracture (calcaneus, wrist, tibia)', 1, [['h:Feet first', 1.5], ['h:Outstretched hand', 1.5], ['e:Deformity', 2], ['e:Tenderness', 1]], 'X-ray; look for associated spinal injury with calcaneal fractures', ''),
      D('Chest injury', 0, [['s:Chest pain', 1.5], ['s:Dyspnoea', 1.5], ['o:spo2<94', 1.5]], 'Chest X-ray; ultrasound for pneumothorax', 'Pneumothorax or haemothorax'),
      D('Abdominal or pelvic injury', 0, [['s:Abdominal pain', 1.5], ['s:Pelvic pain', 2], ['s:Haematuria', 1.5], ['o:sbp<90', 2]], 'FAST; CT', 'Hidden bleeding from abdomen or pelvis')
    ],
    'Motor vehicle / motorbike collision': [
      D('Musculoskeletal soft-tissue injury (whiplash, contusion)', 2, [['s:Neck pain', 0.5], ['h:Seat belt worn', 0.5]], 'Canadian C-spine rule to decide imaging', ''),
      D('Head injury', 0.5, [['s:Head strike', 2], ['s:Vomiting', 1], ['s:Seizure-like activity', 1.5], ['h:No helmet', 1], ['h:Ejection', 1.5]], 'CT head criteria', ''),
      D('Spinal injury', 0, [['s:Neck pain', 1], ['s:Back pain', 1], ['s:Weakness', 2.5], ['s:Numbness/tingling', 2], ['h:Rollover', 1], ['h:Ejection', 1.5]], 'Canadian C-spine rule; CT', ''),
      D('Chest injury', 0, [['s:Chest pain', 1.5], ['s:Dyspnoea', 1.5], ['h:Airbag deployed', 0.5], ['h:Vehicle intrusion', 1], ['o:spo2<94', 1.5]], 'Chest X-ray; ultrasound', 'Pneumothorax, haemothorax, aortic injury'),
      D('Abdominal or pelvic injury', 0, [['s:Abdominal pain', 1.5], ['s:Pelvic pain', 2], ['s:Haematuria', 1.5], ['h:Unrestrained', 1], ['h:Run over', 2], ['o:sbp<90', 2]], 'FAST; CT', 'High-energy mechanisms need a low threshold for CT')
    ],
    'Physical assault': [
      D('Soft-tissue injuries only', 2, [['h:Punches', 0.5]], 'Document injuries; safeguarding', ''),
      D('Head injury', 0.5, [['s:Headache', 1], ['s:Vomiting', 1.5], ['s:Loss of consciousness', 2], ['s:Amnesia', 1.5], ['s:Confusion', 1.5], ['s:Seizure-like activity', 2], ['h:Blunt object', 1], ['h:Kicks', 1]], 'CT head criteria', ''),
      D('Facial fracture', 0, [['e:Facial tenderness', 1], ['e:Periorbital bruising', 1.5], ['s:Visual change', 1.5], ['e:Diplopia on testing', 2], ['e:Dental injury', 1]], 'Facial X-ray or CT', ''),
      D('Strangulation injury (airway or vascular)', 0, [['h:Neck compression / strangulation', 3], ['s:Voice change', 1.5], ['s:Difficulty swallowing', 1.5], ['s:Difficulty breathing', 1.5], ['e:Ligature mark', 2]], 'CT angiography of the neck if indicated', 'Strangulation can cause delayed airway swelling or arterial dissection'),
      D('Chest or abdominal injury', 0, [['s:Chest pain', 1.5], ['s:Difficulty breathing', 1], ['s:Abdominal pain', 1.5], ['s:Haematuria', 1.5], ['h:Kicks', 1], ['h:Sharp object', 2]], 'Chest X-ray; FAST; CT', 'Penetrating wounds and kicks to the trunk'),
      D('Limb fracture or tendon injury', 0, [['s:Limb pain / reduced function', 2], ['h:Bite', 1]], 'X-ray; hand examination for fight bite', '')
    ],
    'Fracture': [
      D('Closed fracture', 2, [['s:Deformity', 1], ['h:Closed injury reported', 1]], 'X-ray including the joint above and below', ''),
      D('Open fracture', 0, [['s:Open wound', 2.5], ['h:Open wound', 2], ['h:Exposed bone', 3], ['h:Contamination', 1], ['e:Exposed bone', 3]], 'Photograph and cover the wound; antibiotics and tetanus per protocol', 'Open fractures need urgent orthopaedic management'),
      D('Compartment syndrome', 0, [['s:Escalating pain', 2], ['s:Pain on passive stretch', 3], ['e:Pain on passive stretch', 3], ['e:Compartments tense', 3], ['h:Crush', 1.5]], 'Serial examination; compartment pressure', 'Pain out of proportion and pain on passive stretch'),
      D('Neurovascular injury', 0, [['s:Numbness/tingling', 1.5], ['s:Coldness distally', 2.5], ['s:Weakness', 1], ['e:Absent distal pulse', 3], ['e:Distal sensory deficit', 2], ['e:Distal motor deficit', 2]], 'Distal pulses, capillary refill, sensation and power before and after any manipulation', 'Absent pulse or cold limb needs immediate reduction or vascular review'),
      D('Pathological or fragility fracture', 0, [['h:Low-energy injury', 2], ['a:>=65', 1]], 'Bone health; consider underlying malignancy', ''),
      D('Associated head or other injuries', 0, [['s:Head strike', 1.5], ['s:Loss of consciousness', 2], ['s:Other injuries', 2], ['h:High-energy injury', 1.5]], 'Full secondary survey', '')
    ],
    'Pain and aches': [
      D('Viral illness with myalgia', 1.5, [['s:Fever', 1], ['s:Sore throat', 1], ['s:Cough', 1], ['h:Generalised', 0.5], ['h:Muscle pain', 1]], 'Clinical', ''),
      D('Dengue, chikungunya or other arbovirus', 0.5, [['s:Fever', 1], ['s:Pain behind the eyes', 2], ['s:Rash', 1], ['h:Joint pain', 1], ['s:Bleeding or bruising', 1.5], ['l:plt<100', 1.5]], 'Full blood count; NS1 or serology', 'Dengue warning signs: abdominal pain, vomiting, bleeding, lethargy'),
      D('Inflammatory arthritis', 0, [['s:Joint swelling', 2], ['s:Joint stiffness', 1], ['h:Morning stiffness lasting over 30 minutes', 2.5], ['h:In several separate regions', 1], ['l:crp>20', 1]], 'Joint examination; CRP; rheumatoid factor and anti-CCP', ''),
      D('Rhabdomyolysis or myositis', 0, [['s:Dark urine', 3], ['s:Muscle weakness', 2], ['s:Muscle tenderness', 1.5], ['s:Reduced urine output', 1], ['l:ck>uln', 3], ['l:creat>150', 1]], 'CK; renal function; urinalysis (blood without red cells)', 'Dark urine with muscle pain'),
      D('Polymyalgia rheumatica or giant cell arteritis', 0, [['a:>=50', 1], ['a:<50', -2], ['h:Worse in the morning', 1], ['s:Jaw pain on chewing', 2.5], ['s:Scalp tenderness', 2], ['s:Visual disturbance', 1.5], ['l:crp>20', 1]], 'ESR and CRP; temporal artery assessment', 'Visual symptoms with jaw claudication threaten sight'),
      D('Spinal cord or cauda equina compression', 0, [['h:Back pain', 1], ['s:Numbness or tingling', 1], ['s:Bladder or bowel disturbance', 3], ['s:Muscle weakness', 1]], 'Neurological examination; urgent MRI', 'Back pain with bladder or bowel disturbance'),
      D('Malignancy or chronic infection', 0, [['s:Weight loss', 2], ['s:Night sweats', 2], ['h:Bone pain', 1.5], ['h:Worse at night', 1], ['a:>=50', 0.5]], 'Blood count; calcium; imaging as indicated', '')
    ],
    'UTI / Dysuria': [
      D('Lower urinary tract infection (cystitis)', 2, [['s:Dysuria', 1], ['s:Frequency', 1], ['s:Urgency', 1], ['s:Suprapubic pain', 1], ['s:Cloudy urine', 0.5], ['e:Nitrites positive', 1.5], ['e:Leucocytes positive', 1], ['x:F', 0.5], ['s:Vaginal discharge', -1]], 'Urine dipstick; culture in men, pregnancy, recurrent or complicated cases', ''),
      D('Pyelonephritis', 0, [['s:Fever', 1.5], ['s:Rigors', 1.5], ['s:Loin pain', 2.5], ['s:Vomiting', 1], ['e:Renal angle tenderness', 2], ['e:Left renal angle tenderness', 2], ['o:temp>=38', 1], ['l:crp>50', 1]], 'Urine culture; renal function', ''),
      D('Urosepsis', 0, [['s:New confusion', 2], ['s:Unable to keep fluids down', 1], ['h:Urinary catheter in place', 1], ['h:Immunosuppressed', 1], ['o:sbp<=100', 1.5], ['o:rr>=22', 1], ['o:hr>130', 1], ['l:lact>2', 2]], 'NEWS2, qSOFA; lactate; blood cultures', 'New confusion, low blood pressure or raised lactate'),
      D('Sexually transmitted infection or urethritis', 0, [['s:Vaginal discharge', 2], ['s:Penile discharge', 2.5], ['s:Genital ulcers', 2], ['s:Genital itching or soreness', 1]], 'NAAT for chlamydia and gonorrhoea; sexual history', ''),
      D('Prostatitis or epididymo-orchitis', 0, [['x:F', -9], ['x:M', 0.5], ['s:Perineal or rectal pain', 2], ['s:Pain on ejaculation', 1.5], ['s:Testicular pain or swelling', 2.5], ['s:Difficulty passing urine', 1]], 'Prostate examination; scrotal examination', 'Exclude testicular torsion when the testis is painful'),
      D('Urinary retention or obstruction', 0, [['s:Unable to pass urine', 3], ['s:Difficulty passing urine', 1.5], ['e:Palpable bladder', 2]], 'Bladder scan', ''),
      D('Renal stone with infection', 0, [['h:Kidney stones', 1.5], ['s:Loin pain', 1], ['s:Visible blood in urine', 1], ['s:Fever', 0.5]], 'Imaging (CT KUB or ultrasound)', 'An infected obstructed kidney needs urgent drainage')
    ],
    'Haematuria': [
      D('Urinary tract infection', 1.5, [['s:Dysuria', 1.5], ['s:Frequency/urgency', 1.5], ['s:Fever/rigors', 1]], 'Urine culture', ''),
      D('Renal or ureteric stone', 1, [['s:Flank pain', 2.5], ['s:Nausea/vomiting', 0.5], ['h:Urine-test finding only', 0.5]], 'CT KUB', ''),
      D('Bladder or renal tract cancer', 0, [['h:Visible haematuria', 1], ['s-:Dysuria', 0.5], ['s:Weight loss', 2], ['h:Clots', 0.5], ['a:>=45', 1.5]], 'Urology referral for cystoscopy and imaging', 'Painless visible haematuria over 45'),
      D('Benign prostatic enlargement or clot retention', 0, [['x:F', -2], ['x:M', 0.5], ['s:Weak stream / hesitancy', 1.5], ['s:Incomplete emptying', 1], ['s:Unable to pass urine', 2.5], ['s:Clots', 1.5], ['s:Suprapubic pain/distension', 1.5]], 'Bladder scan; catheter with irrigation for clot retention', ''),
      D('Glomerulonephritis', 0, [['s:Oedema / frothy urine', 2.5], ['s:Rash / joint symptoms', 1.5], ['h:Tea-coloured', 2], ['l:creat>150', 1.5], ['o:sbp>160', 0.5]], 'Urine protein:creatinine ratio; renal function; urine microscopy', 'Haematuria with proteinuria, oedema and rising creatinine'),
      D('Anticoagulant-related or bleeding disorder', 0, [['l:inr>3', 2.5], ['l:plt<50', 2]], 'INR; platelets; anticoagulant history (still investigate the urinary tract)', '')
    ],
    'Leg swelling': [
      D('Deep vein thrombosis', 0.5, [['h:Sudden onset', 1], ['h:Right leg', 0.5], ['h:Left leg', 0.5], ['h:Calf', 0.5], ['h:Entire leg', 1], ['h:Persists overnight', 0.5], ['h:Both legs', -2], ['e:Calf asymmetry', 1], ['e:Calf tenderness', 1], ['l:ddim>uln', 1]], 'Wells DVT score; D-dimer; ultrasound', 'Unilateral swelling with chest pain or breathlessness suggests PE'),
      D('Heart failure', 0.5, [['h:Both legs', 1.5], ['h:Gradual onset', 0.5], ['s:Orthopnoea / PND', 2], ['s:Dyspnoea', 1], ['s:Weight gain', 1], ['e:Elevated JVP', 2], ['e:JVP elevated', 2], ['l:bnp>uln', 2], ['l:nt>uln', 2]], 'BNP; ECG; chest X-ray; echocardiogram', ''),
      D('Venous insufficiency or dependent oedema', 1, [['h:Both legs', 1], ['h:Worse standing', 1], ['h:Worse evening', 1], ['h:Improves with elevation', 1.5], ['h:Gradual onset', 0.5]], 'Clinical; medication review (calcium-channel blockers)', ''),
      D('Cellulitis', 0, [['s:Fever', 1.5], ['e:Erythema', 1.5], ['e:Warmth', 1], ['l:crp>50', 1]], 'Examination; mark the margin', ''),
      D('Nephrotic syndrome or renal failure', 0, [['s:Frothy urine', 2.5], ['s:Reduced urine output', 1.5], ['h:Both legs', 0.5], ['l:alb<30', 2], ['l:creat>150', 1.5]], 'Urine protein; albumin; renal function', ''),
      D('Liver disease', 0, [['s:Jaundice / abdominal distension', 2.5], ['e:Ascites', 2], ['l:alb<30', 1], ['l:bili>40', 1]], 'Liver function; ultrasound', ''),
      D('Pulmonary embolism', 0, [['s:Chest pain', 1.5], ['s:Dyspnoea', 1.5], ['s:Haemoptysis', 2], ['s:Syncope', 1.5], ['o:spo2<94', 1.5], ['o:hr>100', 1]], 'Wells PE; CTPA', 'Leg swelling with breathlessness, chest pain or syncope')
    ],
    'Suspected DVT': [
      D('Deep vein thrombosis', 1.5, [['s:Leg pain', 0.5], ['s:Leg swelling', 1], ['h:Entire leg', 1], ['h:Bedridden at least 3 days', 1], ['h:Major surgery within 12 weeks', 1], ['h:Lower-limb plaster immobilisation', 1], ['h:Paralysis / paresis', 1], ['h:Long-distance travel', 0.5], ['e:Calf swelling', 1], ['e:Pitting oedema confined to symptomatic leg', 1], ['e:Deep venous distribution tenderness', 1], ['e:Non-varicose collateral superficial veins', 1], ['l:ddim>uln', 1.5]], 'Wells DVT score; D-dimer; proximal leg ultrasound', ''),
      D('Cellulitis', 0.5, [['s:Redness', 1.5], ['s:Warmth', 1], ['s:Fever', 1.5], ['h:Skin infection', 2], ['e:Erythema', 2], ['l:crp>50', 1]], 'Examination; mark the margin; ultrasound if doubt', ''),
      D('Ruptured Baker cyst', 0, [['h:Possible Baker cyst', 3]], 'Ultrasound', ''),
      D('Muscle injury or haematoma', 0.5, [['h:Recent leg injury', 2.5]], 'Ultrasound', ''),
      D('Chronic venous or lymphatic swelling', 0.5, [['h:Chronic venous swelling', 2], ['h:Known lymphoedema', 2], ['h:Both legs', 1]], 'Clinical', ''),
      D('Pulmonary embolism', 0, [['s:Dyspnoea', 2], ['s:Pleuritic chest pain', 2], ['s:Haemoptysis', 2], ['s:Syncope', 1.5], ['s:Palpitations', 0.5], ['o:spo2<94', 1.5], ['o:hr>100', 1]], 'Wells PE; CTPA', 'DVT with breathlessness, chest pain or syncope')
    ],
    'Anaphylaxis': [
      D('Anaphylaxis', 2, [['s:Lip or tongue swelling', 1.5], ['s:Throat tightness', 1.5], ['s:Hoarse voice', 1.5], ['s:Wheeze', 1], ['s:Dyspnoea', 1], ['s:Dizziness', 1], ['s:Syncope', 1.5], ['s:Hives', 0.5], ['s:Vomiting', 0.5], ['h:Within minutes', 1], ['o:sbp<90', 2], ['o:spo2<94', 1.5]], 'Clinical diagnosis; mast cell tryptase', 'Airway, breathing or circulation involvement after a trigger'),
      D('Urticaria or angioedema without anaphylaxis', 1, [['s:Hives', 1.5], ['s:Generalised itching', 1], ['s:Facial swelling', 0.5], ['s-:Dyspnoea', 1], ['s-:Dizziness', 0.5], ['s-:Throat tightness', 1]], 'Clinical', ''),
      D('ACE-inhibitor or hereditary angioedema', 0, [['s:Lip or tongue swelling', 1], ['s:Facial swelling', 1], ['s-:Hives', 1.5], ['s-:Generalised itching', 1], ['h:Over several hours', 1]], 'Medication history (ACE inhibitors); C4 level', 'Does not respond to adrenaline in the usual way'),
      D('Vasovagal reaction or panic', 0, [['s:Dizziness', 0.5], ['s:Syncope', 0.5], ['s-:Hives', 1], ['s-:Lip or tongue swelling', 1], ['o:hr<60', 1.5]], 'Bradycardia and pallor without rash or swelling', ''),
      D('Acute asthma', 0, [['s:Wheeze', 1.5], ['s:Cough', 0.5], ['s-:Hives', 0.5]], 'Peak flow', '')
    ],
    'Rash': [
      D('Urticaria (allergic or idiopathic)', 1, [['h:Wheals', 2.5], ['h:Transient / migrating', 2], ['h:Itchy', 1], ['s:Itching', 0.5]], 'Clinical', ''),
      D('Contact or irritant dermatitis', 0.5, [['h:Soap / detergent', 2], ['h:Cream / cosmetic', 2], ['h:Plants', 2], ['h:Occupational chemical', 2], ['h:Localised', 0.5], ['h:Itchy', 0.5]], 'Clinical; patch testing later', ''),
      D('Viral exanthem', 1, [['s:Fever', 1], ['h:Generalised', 1], ['h:Flat spots', 0.5], ['h:Trunk', 0.5]], 'Clinical', ''),
      D('Drug reaction', 0, [['h:Medication', 2.5], ['h:Generalised', 0.5]], 'Timing after a new drug', ''),
      D('Eczema or psoriasis flare', 0.5, [['h:Eczema', 2], ['h:Psoriasis', 2], ['h:Scaling', 1], ['h:Flexural', 1], ['h:Extensor', 1], ['h:Similar prior episodes', 1]], 'Clinical', ''),
      D('Shingles', 0, [['h:Dermatomal', 3], ['h:Vesicles / blisters', 1], ['h:Painful', 1], ['h:Burning', 1]], 'Clinical; check eye involvement in ophthalmic shingles', 'Shingles near the eye needs ophthalmology review'),
      D('Cellulitis', 0, [['s:Skin pain', 1], ['s:Fever', 1], ['h:Localised', 0.5], ['h:Painful', 1], ['h:Spreading', 1]], 'Examination; mark the margin', ''),
      D('Meningococcal sepsis or vasculitis', 0, [['h:Non-blanching spots', 3], ['s:Fever', 1.5], ['s:Headache/neck stiffness', 2], ['e:Non-blanching', 3], ['e:Purpura', 2], ['e:Petechiae', 2], ['o:sbp<90', 1.5]], 'Blood cultures; full blood count; coagulation', 'A non-blanching rash with fever is an emergency'),
      D('SJS/TEN or other severe skin reaction', 0, [['s:Mouth sores', 2], ['s:Eye pain / visual change', 1.5], ['s:Genital erosions', 2], ['s:Skin peeling', 3], ['s:Skin pain', 1], ['h:Medication', 1], ['e:Mucosal involvement', 2.5], ['e:Blistering', 1.5]], 'Urgent dermatology; stop the culprit drug', 'Mucosal involvement with skin pain or peeling'),
      D('Anaphylaxis', 0, [['s:Lip/tongue swelling', 2], ['s:Throat tightness', 2.5], ['s:Dyspnoea/wheeze', 2], ['s:Dizziness/syncope', 1.5], ['h:Wheals', 0.5], ['o:sbp<90', 2]], 'Clinical', 'Rash with airway, breathing or circulation involvement'),
      D('Scabies', 0, [['h:Itchy', 0.5], ['h:Similar prior episodes', -0.5]], 'Look between the fingers and at the wrists; ask whether contacts itch', ''),
      D('Secondary syphilis or hand, foot and mouth disease', 0, [['h:Palms / soles', 2.5], ['s:Mouth sores', 0.5]], 'Syphilis serology; sexual history', '')
    ],
    'Itching': [
      D('Dry skin or eczema', 1.5, [['s:Dry skin', 2], ['h:Worse after bathing', 1], ['h:Constant', 0.5]], 'Clinical', ''),
      D('Scabies', 0.5, [['s:Itching between the fingers', 2.5], ['h:Worse at night', 1.5], ['h:Contacts are also itching', 2.5], ['e:Burrows', 3]], 'Examination of finger webs and wrists', ''),
      D('Urticaria or allergic reaction', 0.5, [['s:Hives', 2.5], ['h:a new medication', 1], ['h:a new food', 1], ['h:Insect bites', 1], ['h:a rash appeared before the itching', 0.5]], 'Clinical', ''),
      D('Contact dermatitis', 0.5, [['h:a new soap or detergent', 2], ['h:a new cosmetic', 2], ['h:Plants', 1.5], ['h:an occupational exposure', 1.5], ['h:Localised', 0.5]], 'Clinical', ''),
      D('Cholestatic liver disease', 0, [['s:Jaundice', 2.5], ['s:Dark urine', 1.5], ['s:Pale stools', 2], ['s:Itching of the palms and soles', 1], ['l:bili>40', 1.5], ['l:alp>130', 1]], 'Liver function; ultrasound', 'Jaundice with pale stools suggests obstruction'),
      D('Systemic cause: renal failure, iron deficiency, thyroid, diabetes', 0, [['s:Excessive thirst or urination', 2], ['s:Fatigue', 0.5], ['h:a rash appeared only after scratching', 1], ['h:No rash has been noticed', 1], ['l:creat>200', 1.5], ['l:hb<11', 1], ['l:glu>11', 1.5]], 'Renal function; blood count and ferritin; glucose; thyroid', ''),
      D('Lymphoma or other malignancy', 0, [['s:Night sweats', 2], ['s:Weight loss', 2], ['s:Fatigue', 0.5], ['h:Generalised', 0.5], ['h:No rash has been noticed', 0.5]], 'Blood count; lymph node examination; chest X-ray', 'Itch without rash plus night sweats or weight loss'),
      D('Anaphylaxis', 0, [['s:Lip or tongue swelling', 2.5], ['s:Dyspnoea', 2], ['s:Wheeze', 2]], 'Clinical', 'Itch with airway or breathing involvement')
    ],
    'Breast lump': [
      D('Breast abscess or mastitis', 0.5, [['s:Breast pain', 1], ['s:Redness', 2], ['s:Fever', 1.5], ['e:Fluctuant', 2]], 'Ultrasound; aspiration', ''),
      D('Fibroadenoma or cyst', 1, [['h:No change in size', 0.5], ['h:Fluctuation with the menstrual cycle', 1.5], ['e:Mobile', 1.5], ['a:<35', 1]], 'Triple assessment (examination, imaging, biopsy)', ''),
      D('Breast cancer', 0.5, [['s:Skin dimpling', 2.5], ['s:New nipple inversion', 2], ['s:Nipple discharge', 1], ['s:Axillary lump', 2], ['s:Unintentional weight loss', 1.5], ['h:An increase in size', 1], ['e:Hard', 1.5], ['e:Fixed', 2], ['e:Irregular margins', 1.5], ['e:Peau d’orange', 3], ['e:Nipple retraction', 2], ['e:Palpable axillary node', 2], ['a:>=40', 1]], 'Urgent breast clinic referral for triple assessment', 'Every new discrete lump needs triple assessment'),
      D('Inflammatory breast cancer', 0, [['s:Redness', 1], ['e:Peau d’orange', 2.5], ['s-:Fever', 0.5]], 'Redness that does not settle with antibiotics; urgent referral', 'Can be mistaken for mastitis')
    ],
    'Diabetic foot': [
      D('Diabetic foot infection (cellulitis or abscess)', 1.5, [['s:Redness', 1], ['s:Swelling', 1], ['s:Discharge', 1], ['h:Purulent discharge', 1.5], ['h:Spreading redness', 1.5], ['h:Malodour', 1], ['e:Purulence', 1.5], ['l:crp>50', 1], ['l:wcc>11', 0.5]], 'Wound swab after debridement; X-ray', ''),
      D('Osteomyelitis', 0, [['e:Probe-to-bone positive if performed', 3], ['h:Increasing wound size', 0.5], ['l:crp>100', 1]], 'X-ray, then MRI; bone biopsy', ''),
      D('Necrotising infection or gas gangrene', 0, [['e:Crepitus', 3], ['h:Black tissue', 1.5], ['e:Necrosis', 2], ['o:sbp<90', 1.5], ['l:lact>2', 1.5]], 'Urgent surgical review; X-ray for gas', 'Crepitus, rapid spread or systemic toxicity'),
      D('Critical limb ischaemia', 0, [['s:Rest pain', 2.5], ['h:Black tissue', 1.5], ['e:Gangrene', 2.5], ['e:Absent dorsalis pedis pulse', 1.5], ['e:Absent posterior tibial pulse', 1.5], ['e:Cool foot', 1.5]], 'Ankle-brachial pressure index; vascular review', 'Rest pain, gangrene or absent pulses'),
      D('Charcot foot', 0, [['e:Hot swollen foot', 2.5], ['e:Foot deformity', 1.5], ['s:Numbness', 0.5], ['s-:Fever', 0.5]], 'Temperature difference; X-ray and MRI', 'A hot swollen foot in neuropathy without infection'),
      D('Sepsis or hyperglycaemic crisis', 0, [['s:Fever', 1], ['s:Rigors', 1.5], ['s:Vomiting', 1], ['s:Confusion', 1.5], ['s:Polyuria / polydipsia', 1.5], ['l:glu>25', 1.5], ['l:ket>=3', 2]], 'Glucose and ketones; lactate; NEWS2', '')
    ],
    'Difficulty swallowing': [
      D('Food bolus or foreign body obstruction', 0.5, [['h:Food sticking after swallowing', 1.5], ['h:Being unable to swallow saliva', 3], ['h:Difficulty swallowing saliva', 2], ['s:Drooling', 2], ['s:Regurgitation', 1]], 'Urgent ENT or endoscopy if unable to swallow saliva', 'Unable to swallow saliva means complete obstruction'),
      D('Tonsillitis or peritonsillar abscess', 0.5, [['s:Painful swallowing', 2], ['s:Fever', 1.5], ['e:Tonsillar exudate', 1], ['e:Pharyngeal asymmetry', 2.5], ['e:Muffled voice', 1.5]], 'Throat examination; aspiration if abscess', ''),
      D('Epiglottitis or deep neck infection', 0, [['s:Painful swallowing', 1], ['s:Drooling', 2], ['s:Dyspnoea', 2], ['s:Fever', 1], ['e:Stridor', 3], ['e:Muffled voice', 2], ['e:Neck swelling', 2], ['e:Pooling secretions', 2]], 'Do not examine the throat if airway is threatened; senior airway help', 'Drooling, stridor or a muffled voice threaten the airway'),
      D('Neurological dysphagia (stroke, other)', 0, [['h:Difficulty initiating a swallow', 2], ['s:Coughing or choking with meals', 1.5], ['s:Wet voice after swallowing', 2], ['s:New focal weakness', 3], ['e:Dysarthria', 1.5]], 'Neurological examination; swallow assessment', 'New dysphagia with focal signs suggests stroke'),
      D('Oesophageal stricture or cancer', 0, [['h:Initially solids, now also liquids', 2.5], ['h:Solids only', 1], ['s:Weight loss', 2], ['a:>=55', 1]], 'Urgent endoscopy referral', 'Progressive dysphagia with weight loss'),
      D('Achalasia or motility disorder', 0, [['h:Both solids and liquids', 1.5], ['s:Regurgitation', 1]], 'Barium swallow; manometry', '')
    ],
    'DKA': [
      D('Diabetic ketoacidosis', 2, [['l:ket>=3', 2.5], ['l:ph<7.3', 2], ['l:hco3<15', 1.5], ['l:glu>11', 1], ['s:Deep/rapid breathing', 1], ['s:Nausea/vomiting', 0.5], ['s:Abdominal pain', 0.5], ['h:Type 1', 1], ['h:Missed insulin', 1], ['h:Pump interrupted', 1.5]], 'Blood gas, ketones and glucose; potassium', ''),
      D('Hyperosmolar hyperglycaemic state', 0, [['h:Type 2', 1], ['h:Gradual', 0.5], ['s:Confusion/drowsiness', 1.5], ['l:glu>30', 2.5], ['l:ket<3', 1], ['l:na>145', 1]], 'Serum osmolality (over 320); ketones usually under 3', 'Mixed DKA and HHS can occur'),
      D('Euglycaemic DKA (SGLT2 inhibitor)', 0, [['l:glu>=14', -3], ['h:Steroids/new medicine', 0.5], ['h:Fasting/restricted intake', 1], ['l:ket>=3', 1.5], ['l:glu<14', 2]], 'Ketones and pH even when glucose is normal', 'SGLT2 inhibitors cause DKA with near-normal glucose'),
      D('Precipitating infection', 0.5, [['h:Infection symptoms', 2], ['s:Fever/rigors', 1.5], ['s:Cough/dyspnoea', 1], ['s:Dysuria/flank pain', 1.5], ['s:Skin infection/wound', 1.5], ['l:crp>50', 1]], 'Cultures; urine; chest X-ray', ''),
      D('Precipitating myocardial infarction or other acute illness', 0, [['s:Chest pain/palpitations', 2.5], ['l:trop>uln', 2.5], ['h:Pregnancy possible', 1], ['h:Alcohol/drugs', 1]], 'ECG; troponin; pregnancy test', ''),
      D('Surgical abdomen', 0, [['s:Abdominal pain', 0.5]], 'Abdominal pain should settle as ketoacidosis resolves; re-examine', 'Persistent abdominal pain after DKA treatment needs reassessment')
    ],
    'Toxic ingestion': [
      D('Paracetamol (acetaminophen) poisoning', 0, [['h:Intentional', 0.5], ['h:Staggered', 1], ['l:alt>120', 2]], 'Paracetamol level at 4 hours; liver function; INR', 'Early paracetamol overdose has no symptoms; check a level in every intentional overdose'),
      D('Opioid toxicity', 0, [['s:Drowsiness', 1.5], ['s:Slow breathing', 3], ['o:rr<10', 2.5]], 'Response to naloxone', 'Respiratory depression'),
      D('Sedative or alcohol toxicity', 0.5, [['h:Alcohol', 1.5], ['s:Drowsiness', 1], ['s:Confusion', 0.5]], 'Glucose; observe airway', ''),
      D('Anticholinergic or sympathomimetic toxidrome', 0, [['s:Agitation', 1.5], ['s:Hallucinations', 1.5], ['s:Dry mouth', 1.5], ['s:Urinary retention', 1.5], ['s:Blurred vision', 1], ['s:Palpitations', 1], ['h:Recreational drugs', 1], ['o:hr>120', 1], ['o:temp>=38', 1]], 'ECG (QRS, QT); temperature', 'Hyperthermia and seizures'),
      D('Cholinergic (organophosphate) toxicity', 0, [['s:Excessive secretions', 2.5], ['s:Sweating', 1], ['s:Drooling', 1], ['s:Vomiting', 0.5], ['s:Diarrhoea', 1], ['o:hr<60', 1.5], ['h:Chemical / household product', 1.5]], 'Pesticide exposure; pupils; secretions', 'Bronchorrhoea and bradycardia'),
      D('Salicylate toxicity', 0, [['s:Tinnitus', 2.5], ['s:Vomiting', 0.5], ['o:rr>22', 1], ['l:ph<7.35', 1]], 'Salicylate level; blood gas (mixed respiratory alkalosis and metabolic acidosis)', ''),
      D('Cardiotoxic drug (tricyclic, beta-blocker, calcium-channel blocker, digoxin)', 0, [['s:Palpitations', 1], ['s:Collapse', 1.5], ['s:Seizure', 1], ['o:hr<50', 2], ['o:sbp<90', 2], ['h:Modified release', 1], ['h:Cardiac disease', 0.5]], 'ECG (QRS, QT, heart block); glucose; potassium', 'Modified-release preparations can deteriorate late'),
      D('Corrosive ingestion', 0, [['s:Oral burns', 3], ['s:Painful swallowing', 2], ['s:Drooling', 1.5], ['s:Haematemesis', 1.5], ['h:Chemical / household product', 1.5]], 'Airway assessment; endoscopy', 'Airway swelling and perforation')
    ],
    'Foreign body': [
      D('Airway foreign body', 0, [['h:The airway (inhaled)', 3], ['h:a choking or coughing episode was witnessed', 2], ['s:Wheeze', 1], ['s:Noisy breathing', 1.5], ['s:Dyspnoea', 1.5], ['s:Cough', 0.5]], 'Chest X-ray (inspiratory and expiratory); bronchoscopy', 'A witnessed choking episode needs airway assessment even if now well'),
      D('Oesophageal impaction', 0, [['h:The oesophagus or stomach (swallowed)', 1.5], ['h:The throat', 1], ['s:Inability to swallow saliva', 3], ['s:Drooling', 2], ['s:Sensation of something stuck in the throat', 1], ['s:Chest pain', 1]], 'X-ray; endoscopy if unable to swallow saliva', 'Button batteries and magnets need urgent removal'),
      D('Object passed into the stomach', 1, [['h:The oesophagus or stomach (swallowed)', 1], ['s-:Difficulty swallowing', 1], ['s-:Chest pain', 0.5]], 'X-ray depending on object; most pass spontaneously', 'Button battery, magnets or sharp objects change management'),
      D('Ear, nose or soft-tissue foreign body', 1, [['h:The ear', 2], ['h:The nose', 2], ['h:Skin or soft tissue', 2], ['s:Offensive odour', 0.5], ['s:Discharge', 0.5]], 'Direct visualisation; X-ray or ultrasound for radio-opaque objects in tissue', ''),
      D('Corneal or intraocular foreign body', 0, [['h:The eye', 2], ['h:Occupational — grinding, hammering or drilling', 2.5], ['s:Reduced vision', 1.5], ['e:Corneal foreign body', 2]], 'Visual acuity; fluorescein; orbital X-ray or CT for high-velocity injuries', 'High-velocity metal fragments may penetrate the globe'),
      D('Secondary infection', 0, [['s:Fever', 1.5], ['s:Discharge', 1], ['s:Offensive odour', 1.5]], 'Examination', '')
    ],
    'Hand swelling': [
      D('Cellulitis or skin infection', 1, [['s:Redness', 1], ['s:Warmth', 1], ['s:Fever', 1], ['s:Spreading redness', 1.5], ['h:a cut', 0.5], ['h:a puncture', 0.5], ['e:Lymphangitic streaking', 1.5]], 'Examination; mark the margin', ''),
      D('Flexor tendon sheath infection', 0, [['e:Fusiform digit swelling', 2], ['e:Digit held in flexion', 2], ['e:Pain on passive finger extension', 2.5], ['h:a puncture', 0.5]], 'Kanavel signs; urgent hand surgery review', 'Needs urgent surgical washout'),
      D('Bite or fight-bite infection', 0, [['h:a human bite', 2.5], ['h:An animal bite', 2.5], ['h:Knuckle contact with teeth', 3], ['e:Knuckle wound', 2]], 'X-ray for fracture or tooth fragment; explore the wound', 'Fight bites over the knuckle can enter the joint'),
      D('Fracture or ligament injury', 0.5, [['h:a fall', 1.5], ['h:a crush injury', 1.5], ['h:a punch', 2], ['h:a twisting injury', 1], ['e:Focal bony tenderness', 1.5], ['e:Deformity', 2]], 'X-ray', ''),
      D('Gout or inflammatory arthritis', 0, [['h:No recalled injury', 1], ['s:Morning stiffness', 1.5], ['s:Other painful or swollen joints', 2], ['e:Joint effusion', 1]], 'Joint aspiration if a single hot joint (exclude septic arthritis)', 'A single hot swollen joint is septic until proven otherwise'),
      D('Constriction or compartment syndrome', 0, [['h:a tight ring or bandage', 3], ['s:Pale or blue fingers', 2], ['s:Cold fingers', 1.5], ['e:Constricting ring or bandage', 3], ['e:Tense compartments', 3]], 'Remove constriction now; check perfusion', 'Remove rings and constricting dressings straight away'),
      D('Allergic reaction or sting', 0, [['h:a sting', 2.5], ['s:Itching', 1], ['s:Rash', 1], ['s:Swelling elsewhere', 1.5]], 'Clinical', '')
    ],
    'Hernia': [
      D('Reducible uncomplicated hernia', 2, [['h:Reduces spontaneously when supine', 2], ['h:Usually manually reducible', 1.5], ['h:Improves lying down', 1], ['e:Cough impulse present', 1]], 'Elective surgical referral', ''),
      D('Incarcerated or obstructed hernia', 0, [['h:Previously reducible, now irreducible', 3], ['s:Vomiting', 1], ['s:Bilious vomiting', 2], ['s:Abdominal distension', 1.5], ['s:Inability to pass flatus', 2], ['s:Inability to pass stool', 1.5], ['e:Irreducible lump', 2], ['e:Irreducible on assessment', 2]], 'Surgical review; abdominal X-ray or CT', ''),
      D('Strangulated hernia', 0, [['s:Sudden severe pain', 2.5], ['s:Overlying redness / darkening', 3], ['s:Fever', 1], ['e:Overlying erythema', 2], ['o:hr>100', 1], ['l:lact>2', 1.5], ['l:wcc>11', 0.5]], 'Emergency surgical review', 'A tender, irreducible, discoloured hernia is strangulated'),
      D('Testicular torsion or other scrotal cause', 0, [['x:F', -9], ['s:Testicular pain', 2.5], ['h:Scrotum', 0.5], ['e:Testicular tenderness', 2.5]], 'Urgent urology review', 'Testicular torsion'),
      D('Lymph node, lipoma or other groin lump', 0.5, [['h:Never reducible', 1.5], ['e:No expansile cough impulse', 1.5], ['e:Cough impulse absent', 1.5]], 'Ultrasound', 'Femoral hernias are often irreducible and easily missed')
    ],
    'Penile Discharge': [
      D('Gonorrhoea', 0.5, [['h:Yellow', 1], ['h:Green', 1.5], ['h:Thick/purulent', 2], ['h:Spontaneous', 1], ['s:Dysuria', 0.5]], 'NAAT on first-void urine; culture for sensitivity', ''),
      D('Chlamydia or non-gonococcal urethritis', 1, [['h:Clear', 1], ['h:White', 1], ['h:Watery', 1], ['h:Mucoid', 1.5], ['h:Only with pressure', 1], ['s:Dysuria', 0.5], ['s:Urethral itching', 1]], 'NAAT on first-void urine', ''),
      D('Balanitis', 0, [['h:Beneath foreskin', 3], ['s:Penile pain/swelling', 1]], 'Examination; swab; check glucose', ''),
      D('Epididymo-orchitis', 0, [['s:Testicular pain', 1.5], ['s:Testicular swelling', 2], ['s:Fever/rigors', 1]], 'Scrotal examination; NAAT', ''),
      D('Testicular torsion', 0, [['x:F', -9], ['s:Sudden severe unilateral testicular pain', 4]], 'Urgent urology review; do not delay for imaging', 'Sudden severe testicular pain'),
      D('Herpes or syphilis', 0, [['s:Genital ulcers/vesicles', 3], ['s:Groin lumps', 1]], 'Swab ulcers for HSV PCR; syphilis serology', ''),
      D('Reactive arthritis or disseminated gonococcal infection', 0, [['s:Joint pain/swelling', 2.5], ['s:Eye symptoms', 1.5], ['s:Rash', 1.5], ['s:Fever/rigors', 1]], 'Joint examination; blood cultures', 'Joint involvement with fever or rash')
    ],
    'PV Discharge': [
      D('Bacterial vaginosis', 1, [['h:Grey', 1.5], ['h:Thin/watery', 1.5], ['h:Fishy', 3], ['s-:Vulval itching', 0.5]], 'pH over 4.5; whiff test; microscopy', ''),
      D('Vulvovaginal candidiasis', 1, [['h:Thick/curdy', 2.5], ['h:White', 1], ['s:Vulval itching', 2], ['s:Burning / soreness', 1], ['h:No unusual odour', 0.5]], 'Clinical; microscopy or culture if recurrent', ''),
      D('Trichomoniasis', 0, [['h:Frothy', 2.5], ['h:Yellow', 0.5], ['h:Green', 1], ['h:Offensive', 1], ['s:Vulval itching', 0.5]], 'NAAT', ''),
      D('Chlamydia or gonorrhoea (cervicitis)', 0.5, [['s:Postcoital bleeding', 2], ['s:Intermenstrual bleeding', 1.5], ['s:Dysuria', 0.5], ['h:Yellow', 0.5], ['e:Cervical mucopus', 2], ['e:Contact bleeding', 1.5]], 'NAAT; sexual history', ''),
      D('Pelvic inflammatory disease', 0, [['s:Pelvic/lower abdominal pain', 2], ['s:Deep dyspareunia', 2], ['s:Fever/rigors', 1.5], ['e:Cervical motion tenderness', 2.5], ['e:Adnexal tenderness', 2]], 'NAAT; pregnancy test; pelvic examination', 'Exclude ectopic pregnancy and appendicitis'),
      D('Genital herpes', 0, [['s:Genital ulcers/blisters', 3], ['s:Groin lumps', 0.5]], 'Swab for HSV PCR', ''),
      D('Rupture of membranes', 0, [['s:Watery gush / continuous leakage in pregnancy', 4]], 'Speculum examination; obstetric review', 'Leaking fluid in pregnancy')
    ],
    'PV Bleeding': [
      D('Miscarriage (threatened, incomplete or complete)', 0.5, [['h:Pregnant', 1.5], ['s:Abdominal/pelvic pain', 1], ['s:Clots', 0.5], ['s:Tissue passed', 2], ['h:Tissue passed', 2]], 'Pregnancy test; pelvic ultrasound; rhesus status', ''),
      D('Ectopic pregnancy', 0, [['h:Postmenopausal', -9], ['h:Pregnancy test negative', -6], ['h:Pregnant', 1], ['h:Pregnancy possible / status unknown', 1], ['s:Abdominal/pelvic pain', 1.5], ['s:Shoulder-tip pain', 2.5], ['s:Dizziness', 1], ['s:Syncope', 2], ['e:Adnexal tenderness', 1.5], ['o:hr>100', 1], ['o:sbp<90', 2]], 'Pregnancy test; transvaginal ultrasound; serum hCG', 'Pain with a positive pregnancy test, shoulder-tip pain or collapse'),
      D('Heavy menstrual or dysfunctional bleeding', 1, [['h:Menstrual', 1.5], ['h:Pregnancy test negative', 1.5], ['s:Clots', 0.5]], 'Haemoglobin; pregnancy test', ''),
      D('Hormonal contraception-related bleeding', 0.5, [['h:Progestogen-only pill', 1.5], ['h:Injection', 1.5], ['h:Implant', 1.5], ['h:Intermenstrual', 0.5]], 'Pregnancy test; STI screen', ''),
      D('Cervical cause: infection, ectropion, polyp or cancer', 0, [['h:Postcoital', 2.5], ['h:Intermenstrual', 1], ['s:Offensive discharge', 1], ['e:Cervical lesion', 2.5]], 'Speculum examination; STI testing; cervical screening history', ''),
      D('Postmenopausal bleeding: endometrial pathology', 0, [['h:Pregnant', -9], ['h:Pregnancy possible / status unknown', -9], ['a:<40', -9], ['h:Postmenopausal', 3]], 'Urgent gynaecology referral for ultrasound and biopsy', 'Postmenopausal bleeding needs urgent assessment'),
      D('Obstetric haemorrhage (placental abruption or praevia)', 0, [['h:Postmenopausal', -9], ['h:Pregnant', 0.5], ['s:Contractions', 1.5], ['s:Reduced fetal movements', 2], ['s:Fluid loss', 1], ['h:Postpartum', 1.5]], 'Obstetric review; do not perform digital examination before excluding praevia', 'Bleeding in later pregnancy or after delivery'),
      D('Haemodynamically significant bleed', 0, [['s:Heavy ongoing bleeding', 2], ['s:Syncope', 1.5], ['s:Dizziness', 1], ['o:hr>100', 1.5], ['o:sbp<90', 2.5], ['l:hb<8', 2]], 'Shock index; haemoglobin; group and crossmatch', 'Tachycardia, low blood pressure or syncope')
    ],
    'Surgical site infection': [
      D('Superficial wound infection', 2, [['s:Increasing wound pain', 1], ['s:Spreading redness', 1], ['s:Wound swelling', 1], ['s:Wound discharge', 1], ['h:Purulent', 1.5], ['e:Erythema', 1], ['e:Purulent discharge', 1]], 'Wound swab; mark the margin', ''),
      D('Deep or organ-space infection, or abscess', 0, [['s:Fever', 1], ['s:Rigors', 1.5], ['s:Abdominal pain', 1], ['e:Fluctuance', 2], ['l:crp>150', 1.5], ['l:wcc>15', 1]], 'Ultrasound or CT', ''),
      D('Anastomotic leak or bowel complication', 0, [['s:Abdominal pain', 1], ['s:Abdominal distension', 1.5], ['s:Not passing stool or flatus', 2], ['h:Faeculent or bile-stained', 3], ['h:Emergency', 0.5], ['o:hr>100', 1], ['l:lact>2', 1.5]], 'CT with contrast; surgical review', 'Faeculent discharge or peritonism after bowel surgery'),
      D('Wound dehiscence', 0, [['s:Wound opening', 3], ['e:Deep dehiscence', 3], ['e:Bowel or implant visible', 3], ['e:Fascia visible', 2.5]], 'Surgical review', 'Visible fascia, bowel or implant'),
      D('Implant or prosthesis infection', 0, [['h:a prosthetic joint', 2], ['h:Mesh', 1.5], ['h:Metalwork', 1.5], ['h:a vascular graft', 2]], 'Surgical team review before antibiotics if possible', 'Implant infections need the operating team'),
      D('Necrotising soft-tissue infection', 0, [['e:Crepitus', 3], ['e:Pain out of proportion to appearance', 3], ['h:Offensive', 0.5], ['o:sbp<90', 1.5], ['l:lact>2', 1]], 'Emergency surgical review', 'Pain out of proportion, crepitus or systemic toxicity'),
      D('Another postoperative cause: VTE, pneumonia or urinary infection', 0, [['s:Calf pain or swelling', 2], ['s:Dyspnoea', 1], ['s:Chest pain', 1], ['s:Cough', 1], ['s:Dysuria', 1.5]], 'Wells scores; chest X-ray; urine', '')
    ]
  };
  const NOT_USED = { 'Sexual assault': 'Diagnosis suggestions are not shown for this presentation. Focus on safety, consent, injuries, emergency contraception, post-exposure prophylaxis and referral.' };

  // ---------- Evidence from the page ----------
  function page() {
    const sc = window.edScores && window.edScores.context ? window.edScores.context() : null;
    const ticked = sel => new Set([...document.querySelectorAll(sel)].filter(l => l.querySelector('input:checked')).map(l => l.textContent.trim()));
    const hist = ticked('#fields label'), exam = ticked('#exam label');
    document.querySelectorAll('#fields button[aria-pressed="true"]').forEach(b => hist.add(b.textContent.trim()));
    document.querySelectorAll('#fields select').forEach(s => { if (s.value) hist.add(s.value); });
    const sym = {}; document.querySelectorAll('#symptoms .rapid-row').forEach(r => { const n = r.querySelector('span'), st = r.querySelector('input[type=hidden]'); if (n && st) sym[n.textContent.trim()] = st.value; });
    const ob = k => { const e = document.querySelector('#obs-slot [id$="-v-' + k + '"]'); const n = e && e.value !== '' ? Number(e.value) : null; return Number.isFinite(n) ? n : null; };
    return { hist, exam, sym, obs: { hr: ob('hr'), rr: ob('rr'), sbp: ob('sbp'), spo2: ob('spo2'), temp: ob('temp') }, age: sc ? sc.age : null, sex: $('sex') ? $('sex').value : '', lab: k => window.edLabs ? window.edLabs.get(k) : null };
  }
  const OBS = { hr: ['HR', '/min'], rr: ['RR', '/min'], sbp: ['SBP', 'mmHg'], spo2: ['SpO₂', '%'], temp: ['temperature', '°C'] };
  const LABN = { trop: 'troponin', wcc: 'WCC', crp: 'CRP', hb: 'Hb', plt: 'platelets', na: 'Na', k: 'K', glu: 'glucose', ket: 'ketones', ph: 'pH', hco3: 'HCO₃', lact: 'lactate', urea: 'urea', creat: 'creatinine', alt: 'ALT', bili: 'bilirubin', alp: 'ALP', alb: 'albumin', lip: 'lipase', amyl: 'amylase', ddim: 'D-dimer', bnp: 'BNP', nt: 'NT-proBNP', ck: 'CK', inr: 'INR', pco2: 'pCO₂', adjca: 'adjusted calcium', ca: 'calcium', mg: 'magnesium' };
  const cmp = (v, op, x) => op === '>' ? v > x : op === '>=' ? v >= x : op === '<' ? v < x : op === '<=' ? v <= x : false;

  // Does a feature hold? Returns a label describing the recorded finding, or null.
  function test(tok, P) {
    const i = tok.indexOf(':'), kind = tok.slice(0, i), arg = tok.slice(i + 1);
    if (kind === 's') return P.sym[arg] === 'present' ? arg : null;
    if (kind === 's-') return P.sym[arg] === 'absent' ? 'no ' + arg.charAt(0).toLowerCase() + arg.slice(1) : null;
    if (kind === 'h') return P.hist.has(arg) ? arg : null;
    if (kind === 'e') return P.exam.has(arg) ? arg : null;
    if (kind === 'x') return (arg === 'F' && /female/i.test(P.sex)) || (arg === 'M' && /^male/i.test(P.sex)) ? (arg === 'F' ? 'female' : 'male') : null;
    if (kind === 'a') { const m = arg.match(/^(>=|<=|>|<)(\d+)/); return P.age != null && m && cmp(P.age, m[1], +m[2]) ? 'age ' + Math.floor(P.age) : null; }
    if (kind === 'o') { const m = arg.match(/^(\w+)(>=|<=|>|<)([\d.]+)/); const v = m && P.obs[m[1]]; return v != null && cmp(v, m[2], +m[3]) ? OBS[m[1]][0] + ' ' + v + ' ' + OBS[m[1]][1] : null; }
    if (kind === 'l') {
      const m = arg.match(/^(\w+)(>=|<=|>|<)(uln|[\d.]+)/); if (!m) return null;
      const r = P.lab(m[1]); if (!r) return null;
      let ok;
      if (m[3] === 'uln') ok = r.uln != null && r.value > r.uln;
      else ok = cmp(r.si, m[2], +m[3]);
      return ok ? LABN[m[1]] + ' ' + (r.cmp || '') + r.value + (r.unit ? ' ' + r.unit : '') : null;
    }
    return null;
  }

  function rank(cond) {
    const rules = RULES[cond]; if (!rules) return null;
    const P = page();
    const scored = rules.map(d => {
      const fits = [], against = [];
      let s = d.p;
      d.f.forEach(([tok, w]) => { const l = test(tok, P); if (l == null) return; s += w; (w > 0 ? fits : against).push(l); });
      return { d, s, fits, against };
    });
    const recorded = scored.reduce((n, x) => n + x.fits.length + x.against.length, 0);
    const order = scored.slice().sort((a, b) => b.s - a.s || b.fits.length - a.fits.length);
    // Diagnoses the record rules out (sex, age, pregnancy status) are not offered.
    const top = order.filter(x => x.s > x.d.p - 4).slice(0, 3);
    const mnm = order.filter(x => !top.includes(x) && x.d.m && x.s > x.d.p - 4);
    return { top, mnm, recorded };
  }

  // ---------- Interface ----------
  const out = $('dx-out');
  const ticked = new Set();
  function changed() { card.dispatchEvent(new Event('change', { bubbles: true })); }
  function list(title, items) {
    if (!items.length) return null;
    const w = document.createElement('div'); w.className = 'ai-list';
    const h = document.createElement('span'); h.className = 'ai-sub'; h.textContent = title;
    const ul = document.createElement('ul'); [...new Set(items)].forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.append(li); });
    w.append(h, ul); return w;
  }
  function tick(name) {
    const l = document.createElement('label'); l.className = 'photo-check ai-tick';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = ticked.has(name); cb.dataset.dx = name;
    cb.onchange = () => { if (cb.checked) ticked.add(name); else ticked.delete(name); changed(); };
    l.append(cb, 'Add to impression'); return l;
  }
  let last = '';
  function render() {
    const cond = $('condition').value;
    if (NOT_USED[cond]) { out.textContent = NOT_USED[cond]; last = ''; return; }
    const r = rank(cond);
    if (!r) { out.textContent = 'No diagnosis rules for this presentation yet.'; last = ''; return; }
    const sig = JSON.stringify([cond, r.top.map(x => [x.d.n, x.fits, x.against]), r.mnm.map(x => [x.d.n, x.fits]), [...ticked]]);
    if (sig === last) return; last = sig;
    const focus = document.activeElement && out.contains(document.activeElement) ? document.activeElement.dataset.dx : null;
    out.replaceChildren();
    if (r.recorded < 2) { const p = document.createElement('p'); p.className = 'ai-stale'; p.textContent = 'Few findings recorded yet, so this is the usual order for ' + cond.toLowerCase() + '. It updates as you add symptoms, examination findings, observations and results.'; out.append(p); }
    r.top.forEach((x, i) => {
      const box = document.createElement('div'); box.className = 'ai-dx';
      const h = document.createElement('h3'); h.textContent = (i + 1) + '. ' + x.d.n; box.append(h);
      [list('Fits', x.fits), list('Against', x.against), list('Would help distinguish', [x.d.t])].forEach(e => e && box.append(e));
      if (x.d.m) { const p = document.createElement('p'); p.className = 'dx-mnm-note'; p.textContent = 'Must not miss: ' + x.d.m; box.append(p); }
      box.append(tick(x.d.n)); out.append(box);
    });
    if (r.mnm.length) {
      const box = document.createElement('div'); box.className = 'ai-dx ai-mnm';
      const h = document.createElement('h3'); h.textContent = 'Must not miss'; box.append(h);
      r.mnm.forEach(x => {
        const row = document.createElement('div'); row.className = 'ai-mnm-row';
        const p = document.createElement('p'); p.textContent = x.d.n + ': ' + x.d.m + (x.fits.length ? ' Recorded: ' + [...new Set(x.fits)].join('; ') + '.' : '');
        row.append(p, tick(x.d.n)); box.append(row);
      });
      out.append(box);
    }
    if (focus) { const e = out.querySelector('input[data-dx="' + CSS.escape(focus) + '"]'); if (e) e.focus(); }
  }

  window.edImpression = () => {
    const r = rank($('condition').value); if (!r || !ticked.size) return [];
    const names = [...r.top, ...r.mnm].map(x => x.d.n).filter(n => ticked.has(n));
    return names.length ? ['Differential: ' + names.map((n, i) => (i + 1) + '. ' + n).join('; ') + '.'] : [];
  };
  window.edDxClear = () => { ticked.clear(); last = ''; render(); };
  window.edDx = { RULES, rank, test, page };

  let q = false;
  const later = () => { if (q) return; q = true; setTimeout(() => { q = false; render(); }, 120); };
  ['input', 'change', 'click'].forEach(t => document.addEventListener(t, e => { if (!card.contains(e.target)) later(); }));
  $('condition').addEventListener('change', () => { ticked.clear(); last = ''; later(); });
  render();
})();
