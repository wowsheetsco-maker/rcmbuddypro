// Centralised insurer / TPA contact directory.
// Sourced from Settings → Insurer Contacts (mock for now). Used by Follow-up
// Calendar to compose mailto: / wa.me messages without re-typing email/phone.

export interface InsurerContact {
  id: number;
  name: string;
  designation: string;
  provider: string; // matches FollowUpTask.tpa
  email: string;
  phone: string;
  whatsapp: string | null;
  primary: boolean;
}

export const insurerContacts: InsurerContact[] = [
  { id: 1, name: "Mr. Rajesh Sharma", designation: "Claims Manager", provider: "Medi Assist", email: "rajesh.sharma@mediassist.in", phone: "+91 98765 43210", whatsapp: "+919876543210", primary: true },
  { id: 2, name: "Ms. Priya Menon", designation: "Senior Claims Officer", provider: "Star Health", email: "priya.m@starhealth.in", phone: "+91 87654 32109", whatsapp: null, primary: true },
  { id: 3, name: "Mr. Venkat Reddy", designation: "Claims Head", provider: "FHPL", email: "venkat.r@fhpl.net", phone: "+91 76543 21098", whatsapp: "+917654321098", primary: true },
  { id: 4, name: "Ms. Anjali Nair", designation: "Regional Manager", provider: "Vidal Health", email: "anjali.n@vidalhealth.com", phone: "+91 65432 10987", whatsapp: "+916543210987", primary: true },
  { id: 5, name: "Mr. Suresh Gupta", designation: "Claims Processing", provider: "HDFC ERGO", email: "suresh.g@hdfcergo.com", phone: "+91 54321 09876", whatsapp: "+915432109876", primary: true },
  { id: 6, name: "Mr. Arun Joshi", designation: "Claims Executive", provider: "Paramount TPA", email: "arun.j@paramounttpa.com", phone: "+91 43210 98765", whatsapp: "+914321098765", primary: true },
  { id: 7, name: "Mr. Imran Khan", designation: "Claims Officer", provider: "Safeway TPA", email: "imran.k@safewaytpa.in", phone: "+91 99887 76655", whatsapp: "+919988776655", primary: true },
  { id: 8, name: "Ms. Kavita Iyer", designation: "Claims Manager", provider: "Ericson TPA", email: "kavita.i@ericsontpa.com", phone: "+91 90876 54321", whatsapp: "+919087654321", primary: true },
  { id: 9, name: "Mr. Deepak Shah", designation: "Senior Officer", provider: "MDIndia TPA", email: "deepak.s@mdindia.com", phone: "+91 88776 65544", whatsapp: "+918877665544", primary: true },
  { id: 10, name: "Ms. Neha Kapoor", designation: "Claims Lead", provider: "Health India", email: "neha.k@healthindiatpa.com", phone: "+91 77665 54433", whatsapp: "+917766554433", primary: true },
];

/** Look up the primary contact for a given TPA / insurer name (case-insensitive partial match). */
export function findContactForProvider(provider: string): InsurerContact | undefined {
  if (!provider) return undefined;
  const needle = provider.toLowerCase().trim();
  return (
    insurerContacts.find((c) => c.provider.toLowerCase() === needle) ||
    insurerContacts.find((c) => c.provider.toLowerCase().includes(needle) || needle.includes(c.provider.toLowerCase()))
  );
}
