// Multi-provider AI router for the AI Center.
// Supports: anthropic, openai, openrouter, google (gemini).
// Inputs: tool, formData, providerId, model, attachmentPaths[]
// Pulls API key from public.ai_providers, downloads PDF/image attachments
// from the ai-attachments bucket, extracts text, builds the right prompt,
// calls the model, and logs the result to public.ai_generations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Tool =
  | "appeal_letter"
  | "query_reply"
  | "discharge_summary"
  | "insurer_email";

interface RequestBody {
  tool: Tool;
  providerId: string;
  model?: string;
  formData: Record<string, unknown>;
  attachmentPaths?: string[]; // storage paths in ai-attachments bucket
  claimId?: string | null;
}

const SYSTEM_PROMPTS: Record<Tool, string> = {
  appeal_letter: `You are a senior Hospital Insurance Desk specialist in India who drafts denial appeals for cashless claim rejections.

Write a strong, clinically and technically correct APPEAL LETTER addressed to the TPA/Insurer claims review committee.

Mandatory structure:
1. Subject line referencing claim number, patient, and amount
2. Salutation
3. Paragraph 1 — restate the denial reason as cited by the TPA, with date
4. Paragraph 2 — clinical justification (use the discharge summary, diagnosis ICD code, treatment given, investigations) explaining why the treatment was medically necessary and admissible
5. Paragraph 3 — policy/contract justification: cite IRDAI (Health Insurance) Regulations 2016 sections, common exclusion clauses if applicable, and any prior approval/pre-auth references
6. Paragraph 4 — list of documents enclosed (discharge summary, investigation reports, prescription, bills, denial letter copy)
7. Paragraph 5 — explicit ask: reconsider and approve full claimed amount within 7 working days, failing which the matter will be escalated to IRDAI Bima Bharosa portal
8. Sign-off block: Hospital Insurance Desk, contact, date

Use Indian English (₹, "kindly", "regards"). Keep the body under 400 words. Output plain text only — no markdown bullets, no asterisks, no headers like "Subject:" prefixes (write the subject as the first line).`,

  query_reply: `You are a clinical documentation expert who drafts replies to TPA/Insurer queries on cashless claims to MAXIMISE first-pass approval.

Write a structured QUERY REPLY that:
1. Opens with claim reference + patient + admission dates
2. Restates each query point raised by the TPA (numbered 1, 2, 3…)
3. Answers each point with: clinical reasoning + supporting document/investigation reference + ICD/CPT code where relevant + treating doctor's note summary
4. Cites IRDAI (Health Insurance) Regulations 2016 — Reg 31 (claim settlement timelines) where appropriate
5. Lists enclosed documents
6. Closes with a polite request for approval at the earliest

Tone: factual, medically precise, respectful, no padding. Indian English. Plain text under 350 words. No markdown.`,

  discharge_summary: `You are a NABH-accredited hospital documentation specialist creating discharge summaries optimised for insurance approval (NABH + IRDAI compliant).

Generate a DISCHARGE SUMMARY with these sections (each as a labelled block):
- Patient Demographics (Name, Age/Sex, IP No, MRN)
- Admission Date / Discharge Date / Length of Stay
- Department / Treating Consultant
- Provisional & Final Diagnosis (with ICD-10 codes)
- Chief Complaints & History of Present Illness
- Past Medical / Surgical History
- Examination Findings on Admission
- Investigations (lab, imaging — list with values where given)
- Treatment Given (medications with generic names, dosage, route; procedures performed with CPT where applicable)
- Hospital Course Summary
- Condition at Discharge
- Discharge Medications & Advice
- Follow-up Plan

Be clinically precise; never invent values not provided — if a field was not provided, write "[To be filled by treating physician]". Plain text, no markdown.`,

  insurer_email: `You are a senior Revenue Cycle Management executive at an Indian hospital writing professional emails to TPAs/Insurers.

Compose a polished email body (no Subject/From/To headers — write subject as the first line "Subject: …") that:
- Opens with a polite greeting referencing the TPA team
- States the purpose clearly (follow-up / escalation / reconciliation / meeting request — based on EMAIL PURPOSE input)
- References specific claim numbers, patient names, amounts, dates
- Cites IRDAI 30-day settlement guideline if claim is overdue beyond 30 days
- Has a specific, time-bound ask
- Closes with a professional sign-off block (Hospital Insurance Desk, contact details, date)

Indian English, ₹ symbol, under 250 words, plain text.`,
};

function buildUserPrompt(tool: Tool, fd: Record<string, unknown>, attachmentText: string): string {
  const ctx = Object.entries(fd)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ").toUpperCase()}: ${v}`)
    .join("\n");

  const attach = attachmentText
    ? `\n\n--- ATTACHED DOCUMENT TEXT (use as primary clinical/factual source) ---\n${attachmentText.slice(0, 18000)}\n--- END ATTACHMENT ---`
    : "";

  const headers: Record<Tool, string> = {
    appeal_letter: "Draft an appeal letter using the following case details.",
    query_reply: "Draft a query reply using the following case details.",
    discharge_summary: "Generate a discharge summary using the following clinical inputs.",
    insurer_email: "Compose an insurer email using the following case details.",
  };

  return `${headers[tool]}\n\n--- CASE DETAILS ---\n${ctx}\n--- END CASE DETAILS ---${attach}`;
}

// ---------------- Provider routers ----------------

async function callAnthropic(apiKey: string, model: string, system: string, user: string) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Anthropic ${resp.status}`);
  return {
    text: (data.content?.[0]?.text ?? "") as string,
    promptTokens: data.usage?.input_tokens ?? null,
    completionTokens: data.usage?.output_tokens ?? null,
  };
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string, baseUrl = "https://api.openai.com/v1") {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `OpenAI ${resp.status}`);
  return {
    text: (data.choices?.[0]?.message?.content ?? "") as string,
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
  };
}

async function callOpenRouter(apiKey: string, model: string, system: string, user: string) {
  return callOpenAI(apiKey, model, system, user, "https://openrouter.ai/api/v1");
}

async function callGoogle(apiKey: string, model: string, system: string, user: string) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    },
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Google ${resp.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return {
    text,
    promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
    completionTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
  };
}

// ---------------- Attachment OCR via Lovable AI Gateway (Gemini) ----------------

async function extractAttachmentText(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
): Promise<string> {
  if (!paths?.length) return "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return "";

  const parts: string[] = [];
  for (const p of paths) {
    try {
      const { data, error } = await supabase.storage.from("ai-attachments").download(p);
      if (error || !data) continue;
      const buf = new Uint8Array(await data.arrayBuffer());
      // base64 encode
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      const mime =
        ext === "pdf" ? "application/pdf" :
        ext === "png" ? "image/png" :
        ext === "webp" ? "image/webp" :
        ext === "heic" ? "image/heic" :
        "image/jpeg";

      // Use Lovable AI Gateway with Gemini Flash for free OCR/extraction
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract ALL text content from this document verbatim — denial reasons, query points, clinical details, amounts, dates, claim numbers, ICD codes. Preserve structure. Output plain text only.",
                },
                { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
              ],
            },
          ],
        }),
      });
      const j = await r.json();
      const t = j?.choices?.[0]?.message?.content ?? "";
      if (t) parts.push(`### ${p.split("/").pop()}\n${t}`);
    } catch (e) {
      console.error("attachment extract failed", p, e);
    }
  }
  return parts.join("\n\n");
}

// ---------------- Main handler ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const t0 = Date.now();
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { tool, providerId, model, formData, attachmentPaths = [], claimId } = body;
  if (!tool || !providerId || !formData) {
    return new Response(JSON.stringify({ error: "tool, providerId, formData required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch provider record
  const { data: prov, error: provErr } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("id", providerId)
    .maybeSingle();

  if (provErr || !prov) {
    return new Response(JSON.stringify({ error: "AI provider not found. Add an API key in Settings → AI Providers." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!prov.is_active) {
    return new Response(JSON.stringify({ error: `Provider "${prov.display_name}" is disabled.` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const useModel = model || prov.default_model || defaultModelFor(prov.provider);
  const system = SYSTEM_PROMPTS[tool];

  try {
    // 1) Extract attachment text (if any)
    const attachmentText = await extractAttachmentText(supabase, attachmentPaths);

    // 2) Build user prompt
    const userPrompt = buildUserPrompt(tool, formData, attachmentText);

    // 3) Route to provider
    let result: { text: string; promptTokens: number | null; completionTokens: number | null };
    switch (prov.provider) {
      case "anthropic": result = await callAnthropic(prov.api_key, useModel, system, userPrompt); break;
      case "openai":    result = await callOpenAI(prov.api_key, useModel, system, userPrompt); break;
      case "openrouter":result = await callOpenRouter(prov.api_key, useModel, system, userPrompt); break;
      case "google":    result = await callGoogle(prov.api_key, useModel, system, userPrompt); break;
      default: throw new Error(`Unknown provider: ${prov.provider}`);
    }

    const duration = Date.now() - t0;
    const totalTokens = (result.promptTokens ?? 0) + (result.completionTokens ?? 0);

    // 4) Update provider counters
    await supabase
      .from("ai_providers")
      .update({
        last_used_at: new Date().toISOString(),
        total_calls: (prov.total_calls ?? 0) + 1,
        total_tokens: (prov.total_tokens ?? 0) + totalTokens,
      })
      .eq("id", providerId);

    // 5) Log generation (with OCR text so the timeline can show it)
    const { data: genRow } = await supabase.from("ai_generations").insert({
      tool,
      provider: prov.provider,
      model: useModel,
      claim_id: claimId ?? null,
      input_summary: shortSummary(formData),
      attachments_count: attachmentPaths.length,
      output: result.text,
      ocr_text: attachmentText || null,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      status: "success",
      duration_ms: duration,
    }).select("id").maybeSingle();

    // 6) If linked to a claim → append a structured event to the comm timeline
    if (claimId) {
      const toolLabel = tool.replace(/_/g, " ");
      const attachments = attachmentPaths.map((p) => ({
        name: p.split("/").pop() ?? p,
        path: p,
      }));
      await supabase.from("discrepancy_action_log").insert({
        claim_id: claimId,
        action_type: "ai_draft_generated",
        channel: "ai",
        tone: tool,
        subject: `AI ${toolLabel} draft`,
        body_preview: result.text.slice(0, 500),
        attachments,
        ai_generation_id: genRow?.id ?? null,
        notes: `Provider: ${prov.display_name} · ${useModel}`,
      });
    }

    return new Response(
      JSON.stringify({
        output: result.text,
        model: useModel,
        provider: prov.provider,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: duration,
        attachmentsExtracted: attachmentPaths.length,
        generationId: genRow?.id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await supabase.from("ai_generations").insert({
      tool, provider: prov.provider, model: useModel,
      claim_id: claimId ?? null,
      input_summary: shortSummary(formData),
      attachments_count: attachmentPaths.length,
      status: "error", error_message: msg,
      duration_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function defaultModelFor(provider: string): string {
  switch (provider) {
    case "anthropic":  return "claude-sonnet-4-5-20250929";
    case "openai":     return "gpt-5-mini";
    case "openrouter": return "anthropic/claude-sonnet-4.5";
    case "google":     return "gemini-2.5-flash";
    default:           return "gpt-5-mini";
  }
}

function shortSummary(fd: Record<string, unknown>): string {
  const keys = ["patient_name", "claim_reference", "tpa_insurer", "denied_amount", "claimed_amount", "email_purpose"];
  return keys.filter((k) => fd[k]).map((k) => `${k}=${fd[k]}`).join(" · ").slice(0, 240);
}
