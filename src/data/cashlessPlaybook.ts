// ====================================================================
// Cashless Denial Management Playbook
// Source: Health_Insurance_Denial_Management.xlsx (hospital reference guide)
// 35 denial reasons across 15 departments, 17 categories
// ====================================================================

export type DenialType =
  | "Outright Denial"
  | "Procedural Denial"
  | "Partial Denial"
  | "Denial"
  | "Illegal Denial";

export type PlaybookCategory =
  | "Network Issue"
  | "Process Gap"
  | "Eligibility Issue"
  | "Eligibility"
  | "Financial Cap"
  | "Waiting Period"
  | "TAT Breach"
  | "Exclusion"
  | "Medical Necessity"
  | "Rate Dispute"
  | "Implant Cap"
  | "Pre-existing"
  | "PED / OPD"
  | "OPD Exclusion"
  | "Exclusion / WP"
  | "Exclusion / Cap"
  | "Regulatory Violation";

export interface PlaybookEntry {
  sr: number;
  dept: string;
  reason: string;
  clause: string;
  type: DenialType;
  category: PlaybookCategory;
  docs: string[];
  actions: string[];
  escalation: string;
  tat: string;
  outcome: string;
}

export const CASHLESS_PLAYBOOK: readonly PlaybookEntry[] = [
  {
    sr: 1,
    dept: `ALL DEPARTMENTS`,
    reason: `Non-empanelled hospital / Out-of-network`,
    clause: `General Conditions Clause 1(a) – Network Provider`,
    type: `Outright Denial`,
    category: `Network Issue`,
    docs: ["Empanelment letter", "MOU with insurer", "NAS/TPA empanelment certificate"],
    actions: ["Verify empanelment status immediately", "Produce empanelment letter & MOU copy", "If lapsed – initiate emergency empanelment", "Escalate to State TPA nodal officer", "Arrange patient self-pay with reimbursement promise"],
    escalation: `TPA Nodal Officer → Insurer Branch → SLA Grievance`,
    tat: `24–48 hrs`,
    outcome: `Partial/Full approval or patient advised reimbursement`,
  },
  {
    sr: 2,
    dept: `ALL DEPARTMENTS`,
    reason: `Pre-authorization not obtained / Lapsed`,
    clause: `Clause 4.2 – Prior Authorization / Pre-auth Condition`,
    type: `Procedural Denial`,
    category: `Process Gap`,
    docs: ["Treating doctor's emergency justification", "indoor case papers", "vitals chart at admission"],
    actions: ["Get emergency declaration letter from treating doctor", "Submit retroactive pre-auth with clinical summary within 6 hrs", "Attach MLC/emergency certificate if applicable", "Call TPA helpdesk and get verbal approval reference no.", "Follow up with written communication"],
    escalation: `TPA Medical Officer → Chief Medical Officer of Insurer`,
    tat: `6–12 hrs`,
    outcome: `Approval if genuine emergency established`,
  },
  {
    sr: 3,
    dept: `ALL DEPARTMENTS`,
    reason: `Policy not active / Premium lapse`,
    clause: `General Conditions – Continuity of Cover`,
    type: `Outright Denial`,
    category: `Eligibility Issue`,
    docs: ["Policy renewal receipt", "grace period letter", "premium paid receipt"],
    actions: ["Request patient provide latest policy document", "Check grace period (usually 30 days)", "Contact insurer's policy servicing helpdesk", "If within grace period – submit with grace period proof", "Advise patient to pay premium immediately & get reinstatement"],
    escalation: `Insurer Policy Servicing → Branch Manager`,
    tat: `24 hrs`,
    outcome: `Resolved if within grace period`,
  },
  {
    sr: 4,
    dept: `ALL DEPARTMENTS`,
    reason: `Sub-limit exceeded – Room rent`,
    clause: `Clause 7(a) – Room Rent Sublimit / Co-payment trigger`,
    type: `Partial Denial`,
    category: `Financial Cap`,
    docs: ["Room allocation letter", "room rent bifurcation", "patient choice letter"],
    actions: ["Provide room rent bifurcation immediately", "Offer proportionate deduction calculation", "Obtain patient consent to downgrade room", "If ICU – cite medical necessity for ICU which has no sublimit", "Resubmit with corrected billing"],
    escalation: `TPA Claims Team → Insurer Claims Head`,
    tat: `48 hrs`,
    outcome: `Partial payment after proportionate deduction`,
  },
  {
    sr: 5,
    dept: `ALL DEPARTMENTS`,
    reason: `Waiting period not completed (for specific illness)`,
    clause: `Clause 5 – Waiting Period (30/90 day / 2yr / 4yr specific disease)`,
    type: `Outright Denial`,
    category: `Waiting Period`,
    docs: ["Treating doctor's certificate ruling out pre-existing", "policy copy with waiting period endorsement"],
    actions: ["Obtain clinical certificate that condition is acute/first occurrence", "Check exact policy issuance date vs admission date", "Submit doctor's letter confirming no pre-existing link", "Get patient's past medical records to prove new onset", "If waiver exists in policy – attach endorsement"],
    escalation: `TPA Medical Reviewer → Medical Director`,
    tat: `72 hrs`,
    outcome: `Overturned if acute onset proven`,
  },
  {
    sr: 6,
    dept: `ALL DEPARTMENTS`,
    reason: `Claim submitted after deadline (late filing)`,
    clause: `Clause 10 – Claim Intimation & Submission TAT (usually 7–30 days for cashless)`,
    type: `Procedural Denial`,
    category: `TAT Breach`,
    docs: ["Reason for delay letter", "discharge summary", "internal correspondence log"],
    actions: ["Document genuine reason for delay", "Write formal condone-of-delay letter with supporting proof", "Submit all claim documents along with delay justification", "Quote SLA circular on non-rejection of claims on technicalities", "Escalate to insurer's grievance cell if rejected"],
    escalation: `Insurer Grievance Cell → SLA Bima Bharosa`,
    tat: `7 days`,
    outcome: `SLA mandates not to reject on TAT alone if genuine`,
  },
  {
    sr: 7,
    dept: `Cardiology`,
    reason: `Angioplasty – experimental device not covered (e.g., drug-eluting stent above cap)`,
    clause: `Clause 8(b) – Consumable Exclusion / Device Cap`,
    type: `Partial Denial`,
    category: `Exclusion`,
    docs: ["Stent invoice", "brand justification letter from cardiologist", "NPPA price compliance proof"],
    actions: ["Cardiologist to give clinical necessity letter for specific stent brand", "Ensure NPPA/DPIT price compliance", "Submit device invoice with batch no. & implant certificate", "Cite clinical outcome studies if TPA questions brand", "Negotiate lumpsum acceptance"],
    escalation: `TPA Medical Reviewer → Cardiology Empanelment Desk`,
    tat: `48 hrs`,
    outcome: `Partial payment up to capped amount; excess to patient`,
  },
  {
    sr: 8,
    dept: `Cardiology`,
    reason: `CABG – not pre-authorized / elective labelled`,
    clause: `Clause 4.3 – Elective vs Emergency Categorization`,
    type: `Denial`,
    category: `Medical Necessity`,
    docs: ["ECG", "Echo", "Angiography report", "cardiologist's decision note", "surgical urgency certificate"],
    actions: ["Gather all angiography films/reports", "Cardiologist to certify urgency (triple-vessel / LM disease)", "Submit pre-operative evaluation", "Provide comparative conservative treatment failure evidence", "Request independent medical review"],
    escalation: `TPA Medical Officer → Cardiac Surgeon Panel Review`,
    tat: `48–72 hrs`,
    outcome: `Approval if medical necessity well documented`,
  },
  {
    sr: 9,
    dept: `Cardiology`,
    reason: `Pacemaker / ICD – above CGHS rate / not pre-approved`,
    clause: `Clause 8(c) – Implant Package Rate Binding`,
    type: `Partial Denial`,
    category: `Rate Dispute`,
    docs: ["Device invoice", "import documentation", "pre-auth communication", "CGHS notification"],
    actions: ["Submit original device invoice with HSN code", "Produce NPPA cap compliance or exemption proof", "Cardiologist certificate for specific model requirement", "Negotiate at package rate; balance as patient liability", "Provide implant certificate for SLA compliance"],
    escalation: `TPA Claims Desk → Insurer Medical Head`,
    tat: `48 hrs`,
    outcome: `CGHS/NPPA rate paid; balance patient's responsibility`,
  },
  {
    sr: 10,
    dept: `Orthopaedics`,
    reason: `Joint replacement – implant cost above cap`,
    clause: `Clause 8(b) – Implant Sublimit (Knee/Hip)`,
    type: `Partial Denial`,
    category: `Implant Cap`,
    docs: ["Implant invoice", "surgical notes", "brand justification", "NPPA pricing compliance"],
    actions: ["Provide itemized implant invoice", "Surgeon to certify brand-specific clinical need", "Apply NPPA price ceiling compliance proof", "Negotiate package deal with TPA", "Excess to be collected from patient"],
    escalation: `TPA Claims → Orthopedic Desk Reviewer`,
    tat: `48 hrs`,
    outcome: `Cap amount approved; excess patient liability`,
  },
  {
    sr: 11,
    dept: `Orthopaedics`,
    reason: `Fracture – injury during intoxication (MLC)`,
    clause: `Clause 6(d) – Exclusion: Self-inflicted / Intoxication`,
    type: `Outright Denial`,
    category: `Exclusion`,
    docs: ["MLC copy", "blood alcohol report", "police report", "FIR if applicable"],
    actions: ["Check MLC report carefully – was alcohol mentioned?", "If not documented as drunk – do NOT submit MLC with alcohol mention", "Obtain treating surgeon's clinical note without intoxication reference if genuinely absent", "If contested – request insurer provide exact exclusion clause", "File consumer forum complaint if wrongful denial"],
    escalation: `TPA Legal/Medical Desk → SLA`,
    tat: `72 hrs`,
    outcome: `Approved if intoxication not clinically confirmed`,
  },
  {
    sr: 12,
    dept: `Orthopaedics`,
    reason: `Degenerative/Chronic condition treated as acute`,
    clause: `Clause 5(ii) – Pre-existing Disease (PED) Exclusion`,
    type: `Denial`,
    category: `Pre-existing`,
    docs: ["X-ray comparison (old vs new)", "treating doctor letter", "DEXA scan", "symptoms onset record"],
    actions: ["Orthopedic surgeon to provide certificate of acute trauma component", "Submit pre-admission OPD records showing no prior treatment", "Distinguish osteoporotic fracture from degenerative arthritis if applicable", "Provide radiological evidence of acute fracture", "Get second opinion from independent orthopedic"],
    escalation: `TPA Medical Reviewer → Independent Medical Examiner`,
    tat: `72 hrs`,
    outcome: `Partial or full approval if acute component proven`,
  },
  {
    sr: 13,
    dept: `Neurology / Neurosurgery`,
    reason: `Stroke – not pre-authorized (emergency)`,
    clause: `Clause 4.2 – Emergency Admission Exception`,
    type: `Procedural Denial`,
    category: `Process Gap`,
    docs: ["Emergency ambulance record", "ER notes", "CT/MRI brain", "Glasgow Coma Scale"],
    actions: ["Submit emergency declaration within 24 hrs of admission", "Provide paramedic/ER record confirming emergency", "Neuro team's admission note with stroke protocol activation", "CT/MRI report with timestamp", "Retroactive pre-auth application citing emergency clause"],
    escalation: `TPA Emergency Help Desk → Insurer CMD`,
    tat: `12 hrs`,
    outcome: `Approved under emergency clause`,
  },
  {
    sr: 14,
    dept: `Neurology / Neurosurgery`,
    reason: `Epilepsy – chronic condition / OPD medications listed`,
    clause: `Clause 5(ii) – PED; Clause 12 – OPD Exclusion`,
    type: `Denial`,
    category: `PED / OPD`,
    docs: ["Previous discharge summaries", "EEG", "treating neurologist's note on inpatient need"],
    actions: ["Neurologist must certify inpatient admission was medically necessary (status epilepticus)", "Provide EEG showing acute uncontrolled seizure", "Submit medication chart showing IV anti-epileptics used (not just oral)", "Differentiate hospitalization from OPD drug refill", "Attach ICU stay records if applicable"],
    escalation: `TPA Medical Reviewer`,
    tat: `48 hrs`,
    outcome: `Approved if acute inpatient necessity proved`,
  },
  {
    sr: 15,
    dept: `Neurology / Neurosurgery`,
    reason: `Spine surgery – functional vs. pain management debate`,
    clause: `Clause 8(g) – Investigational Procedures / Exclusion`,
    type: `Denial`,
    category: `Medical Necessity`,
    docs: ["MRI spine", "nerve conduction study", "failed conservative treatment records (6+ months)", "surgeon's note"],
    actions: ["Collect 6-month conservative treatment failure records", "Neuro-surgeon's pre-operative evaluation with functional deficits noted", "MRI corroborating compression with clinical signs", "VAS pain score documentation", "Request independent peer review"],
    escalation: `TPA Medical Director → Insurer Medical Board`,
    tat: `72 hrs`,
    outcome: `Approved if deformity/functional deficit documented`,
  },
  {
    sr: 16,
    dept: `Oncology`,
    reason: `Chemotherapy – oral chemotherapy excluded`,
    clause: `Clause 12 – OPD Exclusion / Inpatient-only Coverage`,
    type: `Denial`,
    category: `OPD Exclusion`,
    docs: ["Oncologist letter on IV vs oral equivalence", "hospital admission record for chemo"],
    actions: ["Oncologist to certify that oral chemo is inpatient protocol in your hospital", "Administer in day-care/inpatient setting (not pure OPD)", "Provide daycare admission slip, monitoring notes", "Cite NCCN guidelines for oral regimen", "Quote SLA daycare treatment list inclusion"],
    escalation: `TPA Oncology Desk → SLA Daycare Circular`,
    tat: `48 hrs`,
    outcome: `Covered if administered as daycare`,
  },
  {
    sr: 17,
    dept: `Oncology`,
    reason: `Immunotherapy / targeted therapy – not in approved list`,
    clause: `Clause 8(h) – Experimental / Unproven Treatment`,
    type: `Denial`,
    category: `Exclusion`,
    docs: ["DCGI approval of drug", "FDA/EMA approval", "published RCT data", "oncologist justification"],
    actions: ["Obtain DCGI approval proof for the specific drug", "Provide published peer-reviewed evidence (Phase 3 trial data)", "Oncologist's letter citing no alternative standard treatment", "Show drug is standard-of-care per NCCN/ESMO guidelines", "Escalate to insurer's medical board for exception approval"],
    escalation: `Insurer Medical Board → SLA`,
    tat: `5–7 days`,
    outcome: `Case-by-case exception; often approved with evidence`,
  },
  {
    sr: 18,
    dept: `Oncology`,
    reason: `Cancer diagnosed during waiting period`,
    clause: `Clause 5(iii) – Specific Disease Waiting Period (2/4 years for cancer)`,
    type: `Outright Denial`,
    category: `Waiting Period`,
    docs: ["Histopathology report with date", "first symptom record", "GP referral letter"],
    actions: ["Verify exact policy inception date vs HPE date", "Obtain oncologist's letter on when cancer likely originated", "Check if policy has waiting period waiver / first-day cover rider", "Cross-check for early-stage specific disease cover", "File grievance citing SLA mandate on genuine new occurrence"],
    escalation: `Insurer Grievance → SLA Ombudsman`,
    tat: `7–14 days`,
    outcome: `Difficult to overturn unless policy has special clause`,
  },
  {
    sr: 19,
    dept: `Obstetrics & Gynaecology`,
    reason: `Normal delivery excluded / Maternity not in policy`,
    clause: `Clause 6(e) – Maternity Exclusion / Waiting Period 9–24 months`,
    type: `Outright Denial`,
    category: `Exclusion / WP`,
    docs: ["Policy endorsement for maternity", "delivery date", "insurance inception date"],
    actions: ["Verify if maternity benefit rider is attached", "Check if 9/24-month waiting period is complete", "If complications exist (PPH, eclampsia) – claim as complication not routine delivery", "Retain child-birth admission as medically necessary hospitalization", "Separate the complication claim from routine delivery cost"],
    escalation: `TPA Maternity Desk → Insurer`,
    tat: `48 hrs`,
    outcome: `Complication component often approved even if maternity excluded`,
  },
  {
    sr: 20,
    dept: `Obstetrics & Gynaecology`,
    reason: `MTP / Abortion – voluntary termination denied`,
    clause: `Clause 6(f) – Voluntary MTP Exclusion`,
    type: `Denial`,
    category: `Exclusion`,
    docs: ["Gynaecologist's note", "USG report", "MTP Act compliance certificate", "fetal anomaly report if applicable"],
    actions: ["Determine if MTP was medical (fetal anomaly/mother's health) or voluntary", "Medical MTP – submit fetal anomaly scan, genetic report, doctor's certificate", "MTP Act compliance certificate", "Separate claim for D&C/post-procedure complication if medically necessary", "Voluntary MTP – advise patient on non-coverage"],
    escalation: `TPA Medical Reviewer`,
    tat: `48 hrs`,
    outcome: `Medical MTP often approved; voluntary rarely covered`,
  },
  {
    sr: 21,
    dept: `Obstetrics & Gynaecology`,
    reason: `Hysterectomy – pre-existing fibroid not covered`,
    clause: `Clause 5(ii) – PED Exclusion`,
    type: `Denial`,
    category: `Pre-existing`,
    docs: ["Previous USG reports", "gynecologist's note on progression", "HPE report"],
    actions: ["Check if prior USG mentioned fibroids before policy inception", "Gynecologist letter showing acute complication (AUB, bladder compression)", "Submit pre-admission USG from policy period showing new development", "HPE report confirming benign vs. malignant", "Document conservative treatment failure"],
    escalation: `TPA Medical Director`,
    tat: `72 hrs`,
    outcome: `Approved if complication was new and acute`,
  },
  {
    sr: 22,
    dept: `Paediatrics / Neonatology`,
    reason: `Newborn not covered – not added to policy`,
    clause: `Clause 3 – Insured Member Definition / Addition of Newborn`,
    type: `Denial`,
    category: `Eligibility`,
    docs: ["Birth certificate", "policy copy", "application for addition of child"],
    actions: ["Immediately intimate insurer about newborn birth (usually within 90 days)", "If NICU admission before addition – cite congenital cover clause if applicable", "Apply for retroactive addition with birth certificate", "Check if policy auto-covers newborn for first 90 days (some policies)", "Group policy HR to be informed immediately"],
    escalation: `Insurer Policy Servicing`,
    tat: `24–48 hrs`,
    outcome: `Covered if addition done within stipulated period`,
  },
  {
    sr: 23,
    dept: `Paediatrics / Neonatology`,
    reason: `Congenital disease exclusion`,
    clause: `Clause 6(g) – Congenital Anomaly Exclusion`,
    type: `Outright Denial`,
    category: `Exclusion`,
    docs: ["Pediatrician note on acquired vs congenital", "surgery details", "Genetics consult"],
    actions: ["Pediatric surgeon to certify condition is not congenital but acquired", "If congenital – check if policy has congenital cover rider", "Group insurance – check employer policy which often has congenital cover", "Neonatologist's note distinguishing internal vs external congenital", "File consumer court if wrongful classification"],
    escalation: `Insurer Medical Board → Ombudsman`,
    tat: `5–7 days`,
    outcome: `External congenital sometimes covered; internal rarely`,
  },
  {
    sr: 24,
    dept: `Psychiatry`,
    reason: `Mental illness claim denied (pre-MHCA Act)`,
    clause: `Clause 6(h) – Mental/Psychiatric Disorder Exclusion – NOW ILLEGAL`,
    type: `Illegal Denial`,
    category: `Regulatory Violation`,
    docs: ["MHCA 2017 copy", "SLA circular on mental health parity", "treating psychiatrist's note"],
    actions: ["Quote MHCA 2017 Section 21(4) – parity mandate", "Cite SLA Circular SLA/HLT/REG/CIR/194/09/2018", "Submit psychiatrist's certificate of inpatient necessity", "Provide treatment plan (not just counselling – must be inpatient)", "File SLA complaint immediately if insurer still denies"],
    escalation: `SLA Grievance Cell – IMMEDIATE`,
    tat: `48 hrs (legal)`,
    outcome: `Must be approved by law; insurer faces penalty for denial`,
  },
  {
    sr: 25,
    dept: `Psychiatry`,
    reason: `Substance abuse / de-addiction denied`,
    clause: `Clause 6(i) – Alcohol / Drug Abuse Exclusion`,
    type: `Denial`,
    category: `Exclusion`,
    docs: ["Psychiatrist's certificate", "DSM-5 diagnosis", "clinical necessity for inpatient detox"],
    actions: ["Psychiatrist to certify medical necessity for inpatient detox (withdrawal risk)", "Document withdrawal symptoms (DTs, seizure risk)", "De-addiction as primary medical treatment vs. voluntary rehab", "Check if MHCA parity applies (it should for substance use disorder)", "Quote SLA guidelines on substance use disorder as illness"],
    escalation: `SLA Grievance Cell`,
    tat: `72 hrs`,
    outcome: `Evolving area; MHCA increasingly supports coverage`,
  },
  {
    sr: 26,
    dept: `Nephrology / Urology`,
    reason: `Dialysis – repeated sessions denied (chronic)`,
    clause: `Clause 5 – PED / Clause 7 – Day Care vs OPD`,
    type: `Denial`,
    category: `PED / OPD`,
    docs: ["Nephrology notes", "creatinine trend", "daycare admission slips", "each session chart"],
    actions: ["Ensure each dialysis session has separate daycare admission/discharge", "Submit individual session clinical notes", "Nephrologist's certificate of CKD stage and necessity", "Check if policy has specific dialysis day-care benefit", "SLA daycare list includes dialysis – cite it specifically"],
    escalation: `TPA Nephrology Desk`,
    tat: `24 hrs per session`,
    outcome: `Covered under daycare; SLA explicitly lists dialysis`,
  },
  {
    sr: 27,
    dept: `Nephrology / Urology`,
    reason: `Kidney transplant – donor expenses denied`,
    clause: `Clause 8(e) – Donor Expense Coverage Limit`,
    type: `Partial Denial`,
    category: `Exclusion`,
    docs: ["Donor investigation reports", "surgical team notes", "hospital bills bifurcated donor vs recipient"],
    actions: ["Bifurcate recipient and donor expenses clearly", "Submit donor's pre-operative workup bills separately", "Check policy for donor expense sub-limit (often INR 1–3 lakhs)", "Cite THOA 1994 compliance – donor expenses are part of transplant", "Provide matching transplant package breakup"],
    escalation: `TPA Claims Head`,
    tat: `72 hrs`,
    outcome: `Donor expenses covered up to sub-limit`,
  },
  {
    sr: 28,
    dept: `Gastroenterology`,
    reason: `Endoscopy / Colonoscopy – OPD procedure`,
    clause: `Clause 12 – OPD / Day Care Classification`,
    type: `Denial`,
    category: `OPD Exclusion`,
    docs: ["Daycare admission slip", "procedure note", "sedation chart", "recovery room note"],
    actions: ["Ensure proper daycare admission and discharge paperwork", "Anesthesia/sedation record is mandatory for coverage", "Document post-procedure recovery observation (min 2 hrs)", "Cite SLA approved daycare procedure list", "Submit treating gastroenterologist's inpatient necessity note"],
    escalation: `TPA Claims`,
    tat: `24 hrs`,
    outcome: `Covered if daycare process followed correctly`,
  },
  {
    sr: 29,
    dept: `Gastroenterology`,
    reason: `Liver cirrhosis – chronic/PED denial`,
    clause: `Clause 5(ii) – PED Exclusion`,
    type: `Denial`,
    category: `Pre-existing`,
    docs: ["Liver biopsy report", "alcohol history (if applicable)", "previous LFT reports", "fibroscan"],
    actions: ["Check if LFT was normal at policy inception (Fibroscan or biopsy)", "Gastroenterologist to certify acute complication (variceal bleed, SBP, encephalopathy)", "Separate acute episode claim from underlying chronic condition", "Submit evidence that acute exacerbation is new and separate", "File grievance if acute complication is denied on PED ground"],
    escalation: `TPA Medical Director`,
    tat: `72 hrs`,
    outcome: `Acute complication often approved separately`,
  },
  {
    sr: 30,
    dept: `Ophthalmology`,
    reason: `Cataract – refractive error vs. cataract denial`,
    clause: `Clause 6(j) – Refractive Error Exclusion / Clause 7 – Cataract Cap`,
    type: `Partial Denial`,
    category: `Exclusion / Cap`,
    docs: ["Slit lamp examination", "visual acuity chart", "IOL power certificate", "surgeon's note"],
    actions: ["Ophthalmologist to document corrected visual acuity <6/18 confirming surgical grade cataract", "Provide slit lamp grading of nuclear sclerosis (Grade 3+)", "Submit IOL calculation sheet", "Ensure claim is for cataract (ICD H25/H26) not refractive error", "Apply within policy's cataract sub-limit"],
    escalation: `TPA Claims`,
    tat: `48 hrs`,
    outcome: `Approved up to cataract sub-limit if properly documented`,
  },
  {
    sr: 31,
    dept: `ENT`,
    reason: `Tonsillectomy / Adenoidectomy – not medically necessary`,
    clause: `Clause 4.5 – Medical Necessity Criterion`,
    type: `Denial`,
    category: `Medical Necessity`,
    docs: ["ENT clinical notes", "culture reports", "sleep study (OSA)", "treatment history"],
    actions: ["ENT to provide frequency of infections (≥7/yr standard)", "Sleep study for OSA as comorbidity", "Failed conservative antibiotic therapy records", "Growth impact documentation for paediatric cases", "Surgeon's pre-op evaluation with specific indication"],
    escalation: `TPA Medical Reviewer`,
    tat: `48 hrs`,
    outcome: `Approved if clinical criteria met (Paradise Criteria)`,
  },
  {
    sr: 32,
    dept: `Dermatology`,
    reason: `Cosmetic surgery denied (e.g., skin graft post-burn classified cosmetic)`,
    clause: `Clause 6(k) – Cosmetic/Aesthetic Surgery Exclusion`,
    type: `Denial`,
    category: `Exclusion`,
    docs: ["Burn assessment chart", "plastic surgeon's reconstruction note", "functional deficit certificate"],
    actions: ["Plastic surgeon to certify it is reconstructive (not cosmetic)", "Document functional impairment being corrected", "Burn degree assessment with area%", "ICD coding must be burn reconstruction (Z42/T31) not cosmetic", "Provide post-burn contracture / disfigurement photographs"],
    escalation: `TPA Medical Director`,
    tat: `72 hrs`,
    outcome: `Reconstructive post-trauma approved; cosmetic denied`,
  },
  {
    sr: 33,
    dept: `Physiotherapy / Rehab`,
    reason: `Post-operative physio denied as OPD`,
    clause: `Clause 12 – OPD Exclusion`,
    type: `Denial`,
    category: `OPD Exclusion`,
    docs: ["Post-op orders", "physio assessment", "inpatient continuation record"],
    actions: ["Document physio as continuation of inpatient treatment", "Physiotherapist's chart as part of inpatient record", "Treating surgeon's order for mandatory bedside physio", "Bill under inpatient day charges not separately as OPD", "For daycare physio – obtain daycare admission"],
    escalation: `TPA Claims`,
    tat: `24 hrs`,
    outcome: `Approved if bundled within inpatient admission`,
  },
  {
    sr: 34,
    dept: `Critical Care / ICU`,
    reason: `ICU charges above package rate`,
    clause: `Clause 7(b) – Package Rate Restriction`,
    type: `Partial Denial`,
    category: `Rate Dispute`,
    docs: ["ICU monitoring chart", "ventilator usage log", "drug chart", "nursing notes per hour"],
    actions: ["Provide itemized ICU bill with each consumable/drug listed", "Ventilator hours log and settings", "Specialist visit charges separately documented", "NABH accreditation as justification for premium ICU rate", "Negotiate above-package as per policy's hospital grade clause"],
    escalation: `TPA Hospital Desk → Insurer Claims Head`,
    tat: `48 hrs`,
    outcome: `NABH/NABL hospitals often get higher rate acceptance`,
  },
  {
    sr: 35,
    dept: `Critical Care / ICU`,
    reason: `Ventilator support denied post-weaning`,
    clause: `Clause 4.5 – Medical Necessity After Stabilization`,
    type: `Denial`,
    category: `Medical Necessity`,
    docs: ["Pulmonologist weaning trial records", "ABG reports", "chest X-ray series"],
    actions: ["ICU/Pulmonologist to document failed weaning attempts", "Provide daily ABG, SpO2 trends", "Chest X-ray series showing ongoing pulmonary compromise", "Demonstrate clinical instability requiring continued ICU", "SOFA/APACHE score documentation"],
    escalation: `TPA Medical Officer → ICU Reviewer`,
    tat: `24 hrs`,
    outcome: `Approved if clinical evidence of ongoing need documented`,
  },
] as const;

// Color tokens for each playbook category (HSL strings)
export const PLAYBOOK_CATEGORY_COLORS: Record<PlaybookCategory, string> = {
  "Network Issue":         "hsl(220, 70%, 45%)",
  "Process Gap":           "hsl(35, 90%, 45%)",
  "Eligibility Issue":     "hsl(280, 55%, 45%)",
  "Eligibility":           "hsl(280, 55%, 45%)",
  "Financial Cap":         "hsl(45, 90%, 42%)",
  "Waiting Period":        "hsl(15, 75%, 45%)",
  "TAT Breach":            "hsl(0, 70%, 45%)",
  "Exclusion":             "hsl(355, 70%, 45%)",
  "Medical Necessity":     "hsl(180, 60%, 38%)",
  "Rate Dispute":          "hsl(195, 70%, 40%)",
  "Implant Cap":           "hsl(28, 85%, 45%)",
  "Pre-existing":          "hsl(265, 50%, 45%)",
  "PED / OPD":             "hsl(255, 50%, 48%)",
  "OPD Exclusion":         "hsl(330, 55%, 45%)",
  "Exclusion / WP":        "hsl(15, 65%, 50%)",
  "Exclusion / Cap":       "hsl(20, 70%, 48%)",
  "Regulatory Violation":  "hsl(345, 80%, 42%)",
};

// 8-level escalation ladder (Source: Escalation & TAT Matrix sheet)
export interface EscalationLevel {
  level: number;
  name: string;
  authority: string;
  tat: string;
  contact: string;
  appliesTo: string;
  expectedAction: string;
}

export const ESCALATION_LADDER: readonly EscalationLevel[] = [
  { level: 1, name: "TPA Desk",            authority: "TPA Claims Officer / Helpdesk",          tat: "1–3 days",   contact: "Phone + Email + Portal upload",     appliesTo: "All cashless denials",                       expectedAction: "Initial review and response" },
  { level: 2, name: "TPA Medical Officer", authority: "TPA's In-house Medical Reviewer",        tat: "3–5 days",   contact: "Written appeal + clinical summary", appliesTo: "Medical necessity disputes",                 expectedAction: "Medical justification review" },
  { level: 3, name: "Insurer Claims Head", authority: "Insurance Company Claims Head / CMD",    tat: "7 days",     contact: "Registered post + email",           appliesTo: "Escalation after TPA fails",                 expectedAction: "Senior review; often reverses denial" },
  { level: 4, name: "Insurer Grievance Cell", authority: "Insurer's Grievance Redressal Officer (GRO)", tat: "15 days", contact: "SLA mandated process",         appliesTo: "Any unresolved denial",                       expectedAction: "Formal grievance; binding on insurer" },
  { level: 5, name: "SLA Bima Bharosa",  authority: "SLA Online Grievance Portal (IGMS)",   tat: "30 days",    contact: "bimabharosa.irdai.gov.in",          appliesTo: "After 15-day insurer non-resolution",        expectedAction: "Regulator intervention; insurer penalized" },
  { level: 6, name: "Insurance Ombudsman", authority: "Office of Insurance Ombudsman (Regional)", tat: "30–90 days", contact: "In-person / Written",             appliesTo: "Claims up to ₹50 lakhs",                     expectedAction: "Binding award on insurer" },
  { level: 7, name: "Consumer Forum",      authority: "District / State Consumer Disputes Redressal Forum", tat: "90–180 days", contact: "Legal filing",          appliesTo: "All disputes; compensation claim possible",  expectedAction: "Court order; compensation + claim" },
  { level: 8, name: "Civil Court",         authority: "High Court / Supreme Court (writ in extreme cases)", tat: "1–5 years", contact: "Through lawyer",            appliesTo: "Policy/systemic issues; constitutional rights", expectedAction: "Judicial verdict; precedent setting" },
];

// SLA Circulars & Acts to cite in appeals (Source: Escalation & TAT Matrix sheet)
export interface IrdaiCircular {
  name: string;
  reference: string;
  year: string;
  appliesTo: string;
  mandate: string;
  hospitalAction: string;
}

export const SLA_CIRCULARS: readonly IrdaiCircular[] = [
  { name: "SLA Health Insurance Regulations", reference: "SLA/HLT/REG/REG/029/06/2016", year: "2016",          appliesTo: "All health claims",         mandate: "Standardize claim process; no rejection on technicalities",        hospitalAction: "Always cite in delay/document deficiency appeals" },
  { name: "Mental Health Care Act",             reference: "MHCA 2017 – Section 21(4)",     year: "2017",          appliesTo: "Psychiatric claims",        mandate: "Parity with physical illness; insurer must cover mental health",   hospitalAction: "Quote in every psychiatric denial; file SLA complaint" },
  { name: "SLA Mental Health Circular",       reference: "SLA/HLT/REG/CIR/194/09/2018", year: "2018",          appliesTo: "Mental health coverage",    mandate: "Insurers must cover mental illness same as physical",              hospitalAction: "Mandatory coverage; insurer penalized for non-compliance" },
  { name: "SLA Daycare List",                 reference: "SLA Standard Daycare Procedures List", year: "2016 (revised)", appliesTo: "Day-care procedures", mandate: "List of 541 daycare procedures to be covered",                  hospitalAction: "Cite for dialysis, chemo, endoscopy, etc." },
  { name: "SLA Moratorium Clause",            reference: "8-Year Moratorium – SLA Regulations", year: "2016",  appliesTo: "PED disputes",              mandate: "After 8 continuous yrs of policy – no PED denial allowed",         hospitalAction: "Use in long-standing policy PED disputes" },
  { name: "NPPA Price Cap",                     reference: "National Pharmaceutical Pricing Authority – Device Cap", year: "2017 (revised)", appliesTo: "Implants, stents", mandate: "Price ceiling on cardiac stents, ortho implants",        hospitalAction: "Submit NPPA compliance to counter implant cost denial" },
];
