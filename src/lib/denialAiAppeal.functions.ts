/**
 * Server function: generate (or refine) a payer-specific appeal letter using
 * Lovable AI Gateway. The base template comes from the standardized denial
 * code + corrective action; AI rewrites it with payer-specific tone, cites the
 * strongest appeal angle, and tightens to ~250-300 words.
 *
 * No external API key required — uses LOVABLE_API_KEY auto-provisioned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  claimId: z.string().uuid(),
  baseSubject: z.string().min(1).max(300),
  baseBody: z.string().min(20).max(20_000),
  payer: z.string().min(1).max(200),
  denialCode: z.string().max(20).optional(),
  appealAngle: z.string().max(500).optional(),
  tone: z.enum(["formal", "firm", "conciliatory"]).default("formal"),
});

export interface AiAppealResult {
  ok: boolean;
  subject?: string;
  body?: string;
  error?: string;
}

export const generateAiAppealLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AiAppealResult> => {
    // Authorize: claim must belong to caller's org
    const { data: claim, error: cErr } = await context.supabase
      .from("claims")
      .select("id, org_id")
      .eq("id", data.claimId)
      .maybeSingle();
    if (cErr) return { ok: false, error: cErr.message };
    if (!claim) return { ok: false, error: "Claim not found or no access" };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "Lovable AI Gateway is not configured" };

    const systemPrompt =
      "You are an Indian hospital insurance recovery specialist. " +
      "Rewrite the user's appeal letter so it is: (1) addressed correctly to the named payer/TPA, " +
      "(2) leads with the strongest clinical or contractual argument, " +
      "(3) is concise (~250-300 words), professional, and cites IRDAI / policy clauses where relevant, " +
      "(4) preserves every factual detail (claim number, patient, amounts, dates). " +
      "Do NOT invent facts. Return JSON: {\"subject\":\"...\",\"body\":\"...\"}.";

    const userPrompt = [
      `Payer: ${data.payer}`,
      data.denialCode ? `Denial code: ${data.denialCode}` : "",
      data.appealAngle ? `Lead argument: ${data.appealAngle}` : "",
      `Tone: ${data.tone}`,
      "",
      "Original subject:",
      data.baseSubject,
      "",
      "Original body:",
      data.baseBody,
    ].filter(Boolean).join("\n");

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) return { ok: false, error: "AI rate-limited, please retry shortly." };
        if (resp.status === 402) return { ok: false, error: "AI credits exhausted — add credits in Settings → Workspace." };
        const t = await resp.text();
        return { ok: false, error: `AI gateway error: ${resp.status} ${t.slice(0, 200)}` };
      }
      const json = await resp.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return { ok: false, error: "AI returned empty content" };
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed?.subject !== "string" || typeof parsed?.body !== "string") {
          return { ok: false, error: "AI response missing subject/body" };
        }
        return { ok: true, subject: parsed.subject, body: parsed.body };
      } catch {
        // Fallback: treat whole content as body
        return { ok: true, subject: data.baseSubject, body: content };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "AI call failed" };
    }
  });
