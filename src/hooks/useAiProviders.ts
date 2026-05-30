import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProviderKind = "anthropic" | "openai" | "openrouter" | "google";

export interface AiProviderRow {
  id: string;
  provider: ProviderKind;
  display_name: string;
  api_key: string;
  default_model: string | null;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
  last_used_at: string | null;
  total_calls: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

export const PROVIDER_META: Record<ProviderKind, {
  label: string;
  hint: string;
  keyHelp: string;
  models: { id: string; label: string }[];
}> = {
  anthropic: {
    label: "Anthropic Claude",
    hint: "Best for clinical reasoning & long appeals.",
    keyHelp: "Get key from console.anthropic.com → API Keys",
    models: [
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (recommended)" },
      { id: "claude-opus-4-1-20250805",   label: "Claude Opus 4.1 (highest quality)" },
      { id: "claude-haiku-4-5-20250930",  label: "Claude Haiku 4.5 (fast & cheap)" },
    ],
  },
  openai: {
    label: "OpenAI GPT",
    hint: "Strong all-rounder for emails & summaries.",
    keyHelp: "Get key from platform.openai.com → API Keys",
    models: [
      { id: "gpt-5",      label: "GPT-5 (highest quality)" },
      { id: "gpt-5-mini", label: "GPT-5 Mini (recommended)" },
      { id: "gpt-5-nano", label: "GPT-5 Nano (fast & cheap)" },
      { id: "gpt-4o",     label: "GPT-4o" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    hint: "Single key, access 100+ models incl. Claude/Gemini.",
    keyHelp: "Get key from openrouter.ai/keys",
    models: [
      { id: "anthropic/claude-sonnet-4.5",  label: "Claude Sonnet 4.5 via OpenRouter" },
      { id: "openai/gpt-5",                 label: "GPT-5 via OpenRouter" },
      { id: "google/gemini-2.5-pro",        label: "Gemini 2.5 Pro via OpenRouter" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
  },
  google: {
    label: "Google Gemini",
    hint: "Great for OCR & multimodal document analysis.",
    keyHelp: "Get key from aistudio.google.com → Get API Key",
    models: [
      { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro (recommended)" },
      { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash (fast)" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    ],
  },
};

export function useAiProviders() {
  const [providers, setProviders] = useState<AiProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_providers")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setProviders((data ?? []) as AiProviderRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const defaultProvider = providers.find((p) => p.is_default && p.is_active)
    ?? providers.find((p) => p.is_active)
    ?? null;

  return { providers, defaultProvider, loading, reload: load };
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}
