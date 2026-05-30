// AI-enhance a follow-up email draft using Lovable AI Gateway.
// Receives the current draft body + tone + context (TPA, claim count,
// outstanding amount) and returns a polished version in the requested tone.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type Tone = "formal" | "urgent" | "irdai" | "friendly";

interface RequestBody {
  tone: Tone;
  format: "text" | "html";
  insurerName: string;
  hospitalName?: string;
  claimCount: number;
  totalOutstanding: number;
  oldestDays?: number;
  breachCount?: number;
  currentBody?: string;
  claims?: Array<{
    claim_number: string;
    patient_name: string;
    outstanding_amount: number;
    days_since_claim: number;
    claim_status: string;
  }>;
  mode?: "enhance" | "regenerate";
}

const TONE_GUIDE: Record<Tone, string> = {
  formal:
    "Write a polite, formal corporate follow-up. Respectful, structured, no exclamation marks. Suitable for an established business relationship.",
  urgent:
    "Write an assertive, time-sensitive escalation. Convey urgency without being rude. Make clear that delays are unacceptable and reference contractual TAT.",
  irdai:
    "Write a strict regulatory notice citing IRDAI 30-day claim settlement guidelines. Reference IRDAI (Health Insurance) Regulations 2016 and warn of regulatory escalation if not resolved within 7 days.",
  friendly:
    "Write a warm, conversational reminder that maintains relationship while gently nudging for action. Use a collegial tone and acknowledge their workload.",
};

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.tone || !body.insurerName || typeof body.claimCount !== "number") {
    return new Response(
      JSON.stringify({
        error: "tone, insurerName, claimCount required",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const tone = TONE_GUIDE[body.tone] ?? TONE_GUIDE.formal;
  const fmt = body.format === "html" ? "HTML" : "plain text";
  const hospital = body.hospitalName ?? "the Hospital";

  const claimsTable = (body.claims ?? [])
    .slice(0, 10)
    .map(
      (c, i) =>
        `${i + 1}. ${c.claim_number} | ${c.patient_name} | ${inr(c.outstanding_amount)} | ${c.days_since_claim}d | ${c.claim_status}`,
    )
    .join("\n");

  const context = `
INSURER / TPA: ${body.insurerName}
HOSPITAL: ${hospital}
PENDING CLAIMS: ${body.claimCount}
TOTAL OUTSTANDING: ${inr(body.totalOutstanding)}
OLDEST PENDING: ${body.oldestDays ?? 0} days
IRDAI BREACHES (>15d): ${body.breachCount ?? 0}

CLAIMS (top 10):
${claimsTable || "—"}
`.trim();

  const systemPrompt = `You are a senior Revenue Cycle Management (RCM) executive at an Indian hospital writing a follow-up email to a TPA / Insurer about pending claim settlements.

Write the email body ONLY in ${fmt} format. Do NOT include To/From/Subject headers. Do NOT include a sign-off block (the system appends it). Do NOT mention "AI" or "generated".

TONE GUIDANCE: ${tone}

Always include:
- Greeting referencing the TPA contact team
- 1-2 paragraph context referencing pending claim count and outstanding amount
- A clearly formatted summary line (bullet or table) listing total claims, total outstanding, oldest age, IRDAI breaches if > 0
- A specific request: process within X days, share UTR
- Mention that an Excel attachment with full claim-wise breakdown is enclosed

Keep it under 250 words. Use Indian English conventions (₹, "kindly", "regards").`;

  const userPrompt =
    body.mode === "enhance" && body.currentBody
      ? `Refine the following draft email to match the requested tone. Keep all factual data accurate.\n\n--- CURRENT DRAFT ---\n${body.currentBody}\n--- END DRAFT ---\n\n--- CONTEXT ---\n${context}`
      : `Compose a fresh follow-up email body using the context below.\n\n--- CONTEXT ---\n${context}`;

  try {
    const resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(
        JSON.stringify({
          error: "Rate limit reached. Please try again in a moment.",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (resp.status === 402) {
      return new Response(
        JSON.stringify({
          error:
            "AI credits exhausted. Add funds in Lovable Settings → Workspace → Usage.",
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(
        JSON.stringify({ error: `AI gateway error ${resp.status}: ${t}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ body: content.trim() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
