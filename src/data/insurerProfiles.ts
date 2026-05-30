// Extended insurer / TPA master profile.
// Holds the full operating profile: addresses, escalation matrix, hospital SPOC,
// renewal dates, last visit notes, and active escalations. Wired into the
// TPA / Insurers page profile drawer.

export type Mode = "Online Portal" | "Courier" | "Email" | "Hybrid";
export type Relation = "Excellent" | "Good" | "Average" | "Strained";

export interface EscalationContact {
  level: "L1" | "L2" | "L3";
  name: string;
  designation: string;
  email: string;
  phone: string;
  responseHours: number; // committed response SLA in hours
}

export type SubmissionStatus = "Not Submitted" | "Submitted" | "Acknowledged" | "Rejected";

export interface DocumentSubmission {
  mode: "Online Portal" | "Courier" | "Email" | "In-Person";
  date: string;
  status: SubmissionStatus;
  reference?: string; // courier AWB / portal ack ID
  submittedBy?: string;
}

export interface InsurerDocument {
  id: string;
  type: "MOU" | "Tariff" | "Empanelment" | "Rate Card" | "Addendum" | "Other";
  name: string;
  effectiveDate: string;
  expiryDate: string | null;
  url?: string;
  fileSize?: string;
  uploadedOn?: string;
  lastSubmission?: DocumentSubmission | null;
}

export interface PortalCredentials {
  username: string;
  password: string; // demo only — would be vault-backed in production
  lastRotated: string;
  notes?: string;
}

export interface VisitLog {
  date: string;
  by: string; // hospital SPOC name
  mode: "In-person" | "Virtual" | "Call";
  discussion: string;
}

export interface Escalation {
  id: string;
  raisedOn: string;
  raisedBy: "Hospital" | "TPA";
  subject: string;
  status: "Open" | "In Progress" | "Resolved";
  ageDays: number;
}

export interface InsurerProfile {
  id: number;
  name: string;
  type: "tpa" | "insurer";
  status: "active" | "pending_renewal" | "lapsed" | "terminated";

  // Operational metrics
  openClaims: number;
  outstanding: number;
  avgTat: number;
  paymentTat: number; // committed payment TAT in days

  // Addresses
  hoAddress: string;
  branchAddress: string;
  docSubmissionAddress: string;
  submissionMode: Mode;
  helplineNumber: string;
  portalUrl: string;

  // Agreement dates
  mouStart: string;
  mouEnd: string;
  tariffEffective: string;
  tariffRenewal: string;

  // People
  escalationMatrix: EscalationContact[];
  hospitalSpoc: {
    name: string;
    role: string;
    email: string;
    phone: string;
  };
  relation: Relation;

  // Activity
  lastVisit: VisitLog | null;
  documents: InsurerDocument[];
  escalations: Escalation[];
  portalCredentials?: PortalCredentials;
}

export const insurerProfiles: InsurerProfile[] = [
  {
    id: 1,
    name: "Medi Assist Insurance TPA India Pvt Ltd",
    type: "tpa",
    status: "active",
    openClaims: 18,
    outstanding: 2850000,
    avgTat: 28,
    paymentTat: 30,
    hoAddress: "Tower D, IBC Knowledge Park, 4/1 Bannerghatta Road, Bengaluru 560029",
    branchAddress: "5th Floor, Capitale Tower, Anna Salai, Chennai 600002",
    docSubmissionAddress: "Medi Assist – Claims Cell, Capitale Tower, 5th Flr, Chennai 600002",
    submissionMode: "Online Portal",
    helplineNumber: "1800-425-9449",
    portalUrl: "https://providers.mediassist.in",
    mouStart: "2024-04-01",
    mouEnd: "2026-03-31",
    tariffEffective: "2024-04-01",
    tariffRenewal: "2026-03-31",
    escalationMatrix: [
      { level: "L1", name: "Mr. Rajesh Sharma", designation: "Claims Manager", email: "rajesh.sharma@mediassist.in", phone: "+91 98765 43210", responseHours: 24 },
      { level: "L2", name: "Ms. Lakshmi Iyer", designation: "Regional Head – South", email: "lakshmi.iyer@mediassist.in", phone: "+91 98456 11223", responseHours: 48 },
      { level: "L3", name: "Mr. Vikram Bhatt", designation: "VP – Provider Relations", email: "vikram.bhatt@mediassist.in", phone: "+91 99001 23456", responseHours: 72 },
    ],
    hospitalSpoc: { name: "Ms. Anita Verma", role: "Sr. Billing Executive", email: "anita.v@hospital.in", phone: "+91 98201 11111" },
    relation: "Good",
    lastVisit: { date: "2025-03-12", by: "Ms. Anita Verma", mode: "In-person", discussion: "Reviewed Q1 pendency. Agreed to weekly bulk discharge file sharing. Tariff revision discussion scheduled for April." },
    documents: [
      { id: "d1", type: "MOU", name: "Master MOU 2024-2026", effectiveDate: "2024-04-01", expiryDate: "2026-03-31", fileSize: "2.4 MB", uploadedOn: "2024-04-02",
        lastSubmission: { mode: "Online Portal", date: "2024-04-02", status: "Acknowledged", reference: "MA-PRT-88412", submittedBy: "Anita Verma" } },
      { id: "d2", type: "Tariff", name: "Rate Card v3.2", effectiveDate: "2024-04-01", expiryDate: "2026-03-31", fileSize: "1.1 MB", uploadedOn: "2024-04-05",
        lastSubmission: { mode: "Online Portal", date: "2024-04-05", status: "Acknowledged", reference: "MA-PRT-88455", submittedBy: "Anita Verma" } },
      { id: "d3", type: "Empanelment", name: "Empanelment Letter", effectiveDate: "2024-04-01", expiryDate: null, fileSize: "640 KB", uploadedOn: "2024-04-10",
        lastSubmission: { mode: "Email", date: "2024-04-10", status: "Submitted", reference: "EM-2024-0410", submittedBy: "Anita Verma" } },
    ],
    escalations: [
      { id: "e1", raisedOn: "2025-04-08", raisedBy: "Hospital", subject: "Cashless approval delay > 6 hrs on 4 claims", status: "In Progress", ageDays: 13 },
      { id: "e2", raisedOn: "2025-03-28", raisedBy: "TPA", subject: "Discharge summary handwriting clarity", status: "Resolved", ageDays: 24 },
    ],
    portalCredentials: { username: "AHMC-MA-9921", password: import.meta.env.VITE_INSURER_MEDIASSIST_PORTAL_PASSWORD ?? "", lastRotated: "2025-01-15", notes: "Reset every 90 days. Shared with billing leads only." },
  },
  {
    id: 2,
    name: "Star Health and Allied Insurance Co Ltd",
    type: "insurer",
    status: "active",
    openClaims: 8,
    outstanding: 1200000,
    avgTat: 22,
    paymentTat: 21,
    hoAddress: "No.1, New Tank Street, Valluvar Kottam High Road, Nungambakkam, Chennai 600034",
    branchAddress: "2nd Floor, Spencer Plaza, Anna Salai, Chennai 600002",
    docSubmissionAddress: "Star Health Claims Hub, Nungambakkam, Chennai 600034",
    submissionMode: "Hybrid",
    helplineNumber: "044-69006900",
    portalUrl: "https://www.starhealth.in/provider",
    mouStart: "2024-01-01",
    mouEnd: "2025-12-31",
    tariffEffective: "2024-01-01",
    tariffRenewal: "2025-12-31",
    escalationMatrix: [
      { level: "L1", name: "Ms. Priya Menon", designation: "Sr. Claims Officer", email: "priya.m@starhealth.in", phone: "+91 87654 32109", responseHours: 24 },
      { level: "L2", name: "Mr. Karthik Subramanian", designation: "Claims Manager", email: "karthik.s@starhealth.in", phone: "+91 98410 55667", responseHours: 48 },
      { level: "L3", name: "Dr. Anand Roy", designation: "AVP Operations", email: "anand.roy@starhealth.in", phone: "+91 98401 99887", responseHours: 72 },
    ],
    hospitalSpoc: { name: "Mr. Sandeep Rao", role: "Insurance Desk Lead", email: "sandeep.r@hospital.in", phone: "+91 98202 22222" },
    relation: "Excellent",
    lastVisit: { date: "2025-04-02", by: "Mr. Sandeep Rao", mode: "Virtual", discussion: "TAT trending at 22d, target 18d. Star to share rejection reason codes for last 90 days." },
    documents: [
      { id: "d4", type: "MOU", name: "Provider MOU 2024", effectiveDate: "2024-01-01", expiryDate: "2025-12-31", fileSize: "1.8 MB", uploadedOn: "2024-01-03",
        lastSubmission: { mode: "Online Portal", date: "2024-01-03", status: "Acknowledged", reference: "SH-PRT-22119", submittedBy: "Sandeep Rao" } },
      { id: "d5", type: "Tariff", name: "Star Tariff Sheet", effectiveDate: "2024-01-01", expiryDate: "2025-12-31", fileSize: "920 KB", uploadedOn: "2024-01-08",
        lastSubmission: { mode: "Online Portal", date: "2024-01-08", status: "Acknowledged", reference: "SH-PRT-22290", submittedBy: "Sandeep Rao" } },
    ],
    escalations: [],
    portalCredentials: { username: "AHMC.STAR.7841", password: import.meta.env.VITE_INSURER_STAR_PORTAL_PASSWORD ?? "", lastRotated: "2024-12-01" },
  },
  {
    id: 3,
    name: "Family Health Plan Insurance TPA Limited",
    type: "tpa",
    status: "active",
    openClaims: 7,
    outstanding: 980000,
    avgTat: 32,
    paymentTat: 45,
    hoAddress: "Srinilaya Cyber Spazio, Road #2, Banjara Hills, Hyderabad 500034",
    branchAddress: "FHPL Office, T Nagar, Chennai 600017",
    docSubmissionAddress: "FHPL Claims, Srinilaya Cyber Spazio, Banjara Hills, Hyderabad 500034",
    submissionMode: "Courier",
    helplineNumber: "1800-425-4033",
    portalUrl: "https://www.fhpl.net",
    mouStart: "2023-07-01",
    mouEnd: "2025-06-30",
    tariffEffective: "2023-07-01",
    tariffRenewal: "2025-06-30",
    escalationMatrix: [
      { level: "L1", name: "Mr. Venkat Reddy", designation: "Claims Head", email: "venkat.r@fhpl.net", phone: "+91 76543 21098", responseHours: 24 },
      { level: "L2", name: "Ms. Shobha Rao", designation: "Operations Manager", email: "shobha.r@fhpl.net", phone: "+91 90001 23344", responseHours: 48 },
      { level: "L3", name: "Mr. Mahesh Pillai", designation: "Director Claims", email: "mahesh.p@fhpl.net", phone: "+91 90002 99887", responseHours: 96 },
    ],
    hospitalSpoc: { name: "Ms. Anita Verma", role: "Sr. Billing Executive", email: "anita.v@hospital.in", phone: "+91 98201 11111" },
    relation: "Average",
    lastVisit: { date: "2025-02-18", by: "Ms. Anita Verma", mode: "In-person", discussion: "TAT slipping to 32d. FHPL committed to dedicated coordinator. Pending courier ack issue raised." },
    documents: [
      { id: "d6", type: "MOU", name: "FHPL MOU", effectiveDate: "2023-07-01", expiryDate: "2025-06-30", fileSize: "1.5 MB", uploadedOn: "2023-07-04",
        lastSubmission: { mode: "Courier", date: "2023-07-05", status: "Acknowledged", reference: "BLR-CR-99812", submittedBy: "Anita Verma" } },
      { id: "d7", type: "Tariff", name: "Tariff Annexure A", effectiveDate: "2023-07-01", expiryDate: "2025-06-30", fileSize: "780 KB", uploadedOn: "2023-07-04",
        lastSubmission: { mode: "Courier", date: "2023-07-05", status: "Submitted", reference: "BLR-CR-99813" } },
    ],
    escalations: [
      { id: "e3", raisedOn: "2025-04-15", raisedBy: "Hospital", subject: "5 claims pending > 45 days post submission", status: "Open", ageDays: 6 },
    ],
  },
  {
    id: 4,
    name: "Vidal Health Insurance TPA Private Limited",
    type: "tpa",
    status: "pending_renewal",
    openClaims: 4,
    outstanding: 620000,
    avgTat: 38,
    paymentTat: 60,
    hoAddress: "Tower 2, RMZ Millennia, Perungudi, Chennai 600096",
    branchAddress: "Vidal Office, Indiranagar, Bengaluru 560038",
    docSubmissionAddress: "Vidal Health TPA – Claims, RMZ Millennia, Chennai 600096",
    submissionMode: "Online Portal",
    helplineNumber: "1860-425-0251",
    portalUrl: "https://www.vidalhealthtpa.com",
    mouStart: "2023-06-15",
    mouEnd: "2025-06-15",
    tariffEffective: "2023-06-15",
    tariffRenewal: "2025-06-15",
    escalationMatrix: [
      { level: "L1", name: "Ms. Anjali Nair", designation: "Regional Manager", email: "anjali.n@vidalhealth.com", phone: "+91 65432 10987", responseHours: 24 },
      { level: "L2", name: "Mr. Praveen Kumar", designation: "Claims Lead", email: "praveen.k@vidalhealth.com", phone: "+91 99008 11223", responseHours: 48 },
      { level: "L3", name: "Mr. Ramesh Iyer", designation: "VP Provider Network", email: "ramesh.i@vidalhealth.com", phone: "+91 99009 55667", responseHours: 72 },
    ],
    hospitalSpoc: { name: "Mr. Sandeep Rao", role: "Insurance Desk Lead", email: "sandeep.r@hospital.in", phone: "+91 98202 22222" },
    relation: "Strained",
    lastVisit: { date: "2025-01-30", by: "Mr. Sandeep Rao", mode: "Call", discussion: "Renewal pending. Vidal asked for revised tariff proposal. Outstanding pending > 60 days flagged." },
    documents: [
      { id: "d8", type: "MOU", name: "Vidal MOU 2023", effectiveDate: "2023-06-15", expiryDate: "2025-06-15", fileSize: "1.2 MB", uploadedOn: "2023-06-18",
        lastSubmission: { mode: "Online Portal", date: "2023-06-18", status: "Acknowledged", reference: "VHT-PRT-55012", submittedBy: "Sandeep Rao" } },
    ],
    escalations: [
      { id: "e4", raisedOn: "2025-04-10", raisedBy: "Hospital", subject: "Payment overdue – ₹6.2L pending > 60 days", status: "In Progress", ageDays: 11 },
      { id: "e5", raisedOn: "2025-04-01", raisedBy: "TPA", subject: "Pre-auth requests missing investigation reports", status: "Open", ageDays: 20 },
    ],
    portalCredentials: { username: "AHMC_VIDAL_4421", password: import.meta.env.VITE_INSURER_VIDAL_PORTAL_PASSWORD ?? "", lastRotated: "2024-06-15", notes: "Renewal pending — credentials may expire with MOU." },
  },
  {
    id: 5,
    name: "HDFC ERGO General Insurance",
    type: "insurer",
    status: "active",
    openClaims: 2,
    outstanding: 175000,
    avgTat: 18,
    paymentTat: 30,
    hoAddress: "1st Floor, HDFC House, 165-166 Backbay Reclamation, Churchgate, Mumbai 400020",
    branchAddress: "HDFC ERGO Office, Nungambakkam, Chennai 600034",
    docSubmissionAddress: "HDFC ERGO Claims Hub, Backbay Reclamation, Mumbai 400020",
    submissionMode: "Online Portal",
    helplineNumber: "022-62346234",
    portalUrl: "https://www.hdfcergo.com/provider",
    mouStart: "2024-07-01",
    mouEnd: "2026-06-30",
    tariffEffective: "2024-07-01",
    tariffRenewal: "2026-06-30",
    escalationMatrix: [
      { level: "L1", name: "Mr. Suresh Gupta", designation: "Claims Processing", email: "suresh.g@hdfcergo.com", phone: "+91 54321 09876", responseHours: 24 },
      { level: "L2", name: "Ms. Neeta Shah", designation: "Claims Manager", email: "neeta.s@hdfcergo.com", phone: "+91 99300 44556", responseHours: 48 },
      { level: "L3", name: "Mr. Arvind Mehra", designation: "AVP – Health Claims", email: "arvind.m@hdfcergo.com", phone: "+91 99301 88990", responseHours: 72 },
    ],
    hospitalSpoc: { name: "Ms. Anita Verma", role: "Sr. Billing Executive", email: "anita.v@hospital.in", phone: "+91 98201 11111" },
    relation: "Excellent",
    lastVisit: { date: "2025-04-05", by: "Ms. Anita Verma", mode: "Virtual", discussion: "Best-in-class TAT (18d). Discussed e-NOC integration roadmap for Q3." },
    documents: [
      { id: "d9", type: "MOU", name: "HDFC ERGO Provider Agreement", effectiveDate: "2024-07-01", expiryDate: "2026-06-30", fileSize: "2.1 MB", uploadedOn: "2024-07-03",
        lastSubmission: { mode: "Online Portal", date: "2024-07-03", status: "Acknowledged", reference: "HDFCE-PRT-77410", submittedBy: "Anita Verma" } },
      { id: "d10", type: "Tariff", name: "Tariff – Tier 1", effectiveDate: "2024-07-01", expiryDate: "2026-06-30", fileSize: "1.0 MB", uploadedOn: "2024-07-05",
        lastSubmission: { mode: "Online Portal", date: "2024-07-05", status: "Acknowledged", reference: "HDFCE-PRT-77488", submittedBy: "Anita Verma" } },
    ],
    escalations: [],
    portalCredentials: { username: "AHMC-HDFCE-1102", password: import.meta.env.VITE_INSURER_HDFCERGO_PORTAL_PASSWORD ?? "", lastRotated: "2025-02-10" },
  },
  {
    id: 6,
    name: "Paramount Health Services & Insurance TPA",
    type: "tpa",
    status: "active",
    openClaims: 3,
    outstanding: 340000,
    avgTat: 16,
    paymentTat: 21,
    hoAddress: "Plot No. A-442, Road No. 28, MIDC Industrial Area, Wagle Estate, Thane West 400604",
    branchAddress: "Paramount Office, Mount Road, Chennai 600002",
    docSubmissionAddress: "Paramount Claims, Wagle Estate, Thane West 400604",
    submissionMode: "Online Portal",
    helplineNumber: "1800-226-655",
    portalUrl: "https://www.paramounttpa.com",
    mouStart: "2023-12-01",
    mouEnd: "2025-11-30",
    tariffEffective: "2023-12-01",
    tariffRenewal: "2025-11-30",
    escalationMatrix: [
      { level: "L1", name: "Mr. Arun Joshi", designation: "Claims Executive", email: "arun.j@paramounttpa.com", phone: "+91 43210 98765", responseHours: 24 },
      { level: "L2", name: "Ms. Deepa Kulkarni", designation: "Claims Lead", email: "deepa.k@paramounttpa.com", phone: "+91 98200 33445", responseHours: 48 },
      { level: "L3", name: "Mr. Sanjay Deshmukh", designation: "GM Operations", email: "sanjay.d@paramounttpa.com", phone: "+91 98201 77889", responseHours: 72 },
    ],
    hospitalSpoc: { name: "Mr. Sandeep Rao", role: "Insurance Desk Lead", email: "sandeep.r@hospital.in", phone: "+91 98202 22222" },
    relation: "Good",
    lastVisit: { date: "2025-03-22", by: "Mr. Sandeep Rao", mode: "In-person", discussion: "Stable. Discussed adding 4 new procedure codes to tariff." },
    documents: [
      { id: "d11", type: "MOU", name: "Paramount MOU", effectiveDate: "2023-12-01", expiryDate: "2025-11-30", fileSize: "1.4 MB", uploadedOn: "2023-12-04",
        lastSubmission: { mode: "Online Portal", date: "2023-12-04", status: "Acknowledged", reference: "PMT-PRT-33012" } },
      { id: "d12", type: "Tariff", name: "Procedure Tariff Sheet", effectiveDate: "2023-12-01", expiryDate: "2025-11-30", fileSize: "850 KB", uploadedOn: "2023-12-04",
        lastSubmission: { mode: "Online Portal", date: "2023-12-04", status: "Acknowledged", reference: "PMT-PRT-33013" } },
    ],
    escalations: [],
    portalCredentials: { username: "AHMC.PMT.6601", password: import.meta.env.VITE_INSURER_PARAMOUNT_PORTAL_PASSWORD ?? "", lastRotated: "2024-09-12" },
  },
  {
    id: 7,
    name: "Reliance General Insurance Co. Ltd",
    type: "insurer",
    status: "active",
    openClaims: 2,
    outstanding: 0,
    avgTat: 20,
    paymentTat: 30,
    hoAddress: "Reliance Centre, 19 Walchand Hirachand Marg, Ballard Estate, Mumbai 400001",
    branchAddress: "Reliance Office, Egmore, Chennai 600008",
    docSubmissionAddress: "Reliance General Claims, Ballard Estate, Mumbai 400001",
    submissionMode: "Online Portal",
    helplineNumber: "022-48903009",
    portalUrl: "https://www.reliancegeneral.co.in",
    mouStart: "2024-02-01",
    mouEnd: "2026-01-31",
    tariffEffective: "2024-02-01",
    tariffRenewal: "2026-01-31",
    escalationMatrix: [
      { level: "L1", name: "Ms. Kavya Desai", designation: "Claims Officer", email: "kavya.d@reliancegeneral.co.in", phone: "+91 98203 45678", responseHours: 24 },
      { level: "L2", name: "Mr. Rohit Kapoor", designation: "Claims Manager", email: "rohit.k@reliancegeneral.co.in", phone: "+91 98204 56789", responseHours: 48 },
      { level: "L3", name: "Ms. Sunita Pandey", designation: "Head – Health Claims", email: "sunita.p@reliancegeneral.co.in", phone: "+91 98205 67890", responseHours: 72 },
    ],
    hospitalSpoc: { name: "Ms. Anita Verma", role: "Sr. Billing Executive", email: "anita.v@hospital.in", phone: "+91 98201 11111" },
    relation: "Good",
    lastVisit: { date: "2025-03-08", by: "Ms. Anita Verma", mode: "Call", discussion: "Zero outstanding. Discussed onboarding new policy bouquet from Q2." },
    documents: [
      { id: "d13", type: "MOU", name: "Reliance Provider MOU", effectiveDate: "2024-02-01", expiryDate: "2026-01-31", fileSize: "1.6 MB", uploadedOn: "2024-02-05",
        lastSubmission: { mode: "Online Portal", date: "2024-02-05", status: "Acknowledged", reference: "RGI-PRT-44120", submittedBy: "Anita Verma" } },
    ],
    escalations: [],
    portalCredentials: { username: "AHMC-RGI-9012", password: import.meta.env.VITE_INSURER_RELIANCE_PORTAL_PASSWORD ?? "", lastRotated: "2024-11-20" },
  },
  {
    id: 8,
    name: "Safeway Insurance TPA Private Limited",
    type: "tpa",
    status: "active",
    openClaims: 2,
    outstanding: 450000,
    avgTat: 35,
    paymentTat: 45,
    hoAddress: "C-145, Sector 63, Noida 201307",
    branchAddress: "Safeway Office, Anna Nagar, Chennai 600040",
    docSubmissionAddress: "Safeway Claims, C-145, Sector 63, Noida 201307",
    submissionMode: "Courier",
    helplineNumber: "0120-4549900",
    portalUrl: "https://www.safewaytpa.in",
    mouStart: "2023-09-01",
    mouEnd: "2025-08-31",
    tariffEffective: "2023-09-01",
    tariffRenewal: "2025-08-31",
    escalationMatrix: [
      { level: "L1", name: "Mr. Imran Khan", designation: "Claims Officer", email: "imran.k@safewaytpa.in", phone: "+91 99887 76655", responseHours: 24 },
      { level: "L2", name: "Ms. Pooja Aggarwal", designation: "Claims Manager", email: "pooja.a@safewaytpa.in", phone: "+91 99887 11223", responseHours: 48 },
      { level: "L3", name: "Mr. Rakesh Bansal", designation: "Director Operations", email: "rakesh.b@safewaytpa.in", phone: "+91 99887 99001", responseHours: 96 },
    ],
    hospitalSpoc: { name: "Mr. Sandeep Rao", role: "Insurance Desk Lead", email: "sandeep.r@hospital.in", phone: "+91 98202 22222" },
    relation: "Average",
    lastVisit: { date: "2025-02-25", by: "Mr. Sandeep Rao", mode: "Call", discussion: "Highlighted 35d TAT vs 30d SLA. Safeway agreed to digital submission pilot." },
    documents: [
      { id: "d14", type: "MOU", name: "Safeway Provider MOU", effectiveDate: "2023-09-01", expiryDate: "2025-08-31", fileSize: "1.3 MB", uploadedOn: "2023-09-04",
        lastSubmission: { mode: "Courier", date: "2023-09-05", status: "Submitted", reference: "DTDC-77129", submittedBy: "Sandeep Rao" } },
      { id: "d15", type: "Tariff", name: "Tariff Sheet 2023", effectiveDate: "2023-09-01", expiryDate: "2025-08-31", fileSize: "920 KB", uploadedOn: "2023-09-04",
        lastSubmission: { mode: "Courier", date: "2023-09-05", status: "Rejected", reference: "DTDC-77130", submittedBy: "Sandeep Rao" } },
    ],
    escalations: [
      { id: "e6", raisedOn: "2025-04-12", raisedBy: "Hospital", subject: "Courier ack pending for 12 claims", status: "Open", ageDays: 9 },
    ],
  },
];

export function getInsurerProfile(id: number): InsurerProfile | undefined {
  return insurerProfiles.find((p) => p.id === id);
}
