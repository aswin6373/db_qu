import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Cpu, ExternalLink, Eye, EyeOff, Loader2, MessageCircle, Plug, ShieldCheck, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiRequest } from "../lib/api";
import { AIIntegration } from "../types/api";

type Props = { token: string; isAdmin?: boolean };

type Feedback = { kind: "success" | "error"; text: string };

type WhatsAppStatus = { ready: boolean; charts: boolean; number?: string | null };

type WhatsAppPairing = { paired: boolean; number_tail?: string | null };

type Provider =
  | "gemini"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "groq"
  | "mistral"
  | "xai"
  | "openrouter"
  | "perplexity"
  | "together"
  | "ollama"
  | "custom";

type ProviderConfig = {
  id: Provider;
  name: string;
  category: "Major Foundation Models" | "High-Speed & Open-Source Cloud" | "Self-Hosted & Custom";
  badge?: string;
  blurb: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyUrl?: string;
  modelPlaceholder: string;
  needsKey: boolean;
  needsBaseUrl: boolean;
  baseUrlLabel?: string;
  baseUrlPlaceholder?: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    category: "Major Foundation Models",
    badge: "Free Tier Available",
    blurb: "Google's state-of-the-art multimodal AI with massive context window and fast SQL generation.",
    keyLabel: "Gemini API key",
    keyPlaceholder: "AIzaSy…",
    keyUrl: "https://aistudio.google.com/apikey",
    modelPlaceholder: "gemini-2.0-flash (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "openai",
    name: "OpenAI (GPT-4o)",
    category: "Major Foundation Models",
    badge: "Industry Standard",
    blurb: "OpenAI's flagship models including GPT-4o, GPT-4o-mini, and reasoning models.",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-proj-…",
    keyUrl: "https://platform.openai.com/api-keys",
    modelPlaceholder: "gpt-4o-mini (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "Major Foundation Models",
    badge: "Top Coding & Analysis",
    blurb: "Claude 3.5 Sonnet & Haiku with exceptional reasoning and SQL query precision.",
    keyLabel: "Anthropic API key",
    keyPlaceholder: "sk-ant-api03-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    modelPlaceholder: "claude-3-5-sonnet-20241022 (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "High-Speed & Open-Source Cloud",
    badge: "Ultra Low Cost",
    blurb: "DeepSeek-V3 and DeepSeek-R1 offering top-tier intelligence at unbeatable prices.",
    keyLabel: "DeepSeek API key",
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
    modelPlaceholder: "deepseek-chat (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "groq",
    name: "Groq (Ultra-Fast LPU)",
    category: "High-Speed & Open-Source Cloud",
    badge: "Instant Responses",
    blurb: "Sub-second inference for open models (Llama 3.3 70B, Mixtral, DeepSeek-R1).",
    keyLabel: "Groq API key",
    keyPlaceholder: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    modelPlaceholder: "llama-3.3-70b-versatile (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    category: "High-Speed & Open-Source Cloud",
    badge: "European Sovereign AI",
    blurb: "Mistral Large, Codestral, and Mistral Small optimized for speed and code generation.",
    keyLabel: "Mistral API key",
    keyPlaceholder: "…",
    keyUrl: "https://console.mistral.ai/api-keys",
    modelPlaceholder: "mistral-large-latest (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    category: "Major Foundation Models",
    badge: "Real-time Insight",
    blurb: "xAI's frontier Grok-2 reasoning and language models.",
    keyLabel: "xAI API key",
    keyPlaceholder: "xai-…",
    keyUrl: "https://console.x.ai/",
    modelPlaceholder: "grok-2-latest (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "High-Speed & Open-Source Cloud",
    badge: "200+ Models in 1 Key",
    blurb: "Single unified API key accessing models from Anthropic, Meta, DeepSeek, Google, and more.",
    keyLabel: "OpenRouter API key",
    keyPlaceholder: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/keys",
    modelPlaceholder: "anthropic/claude-3.5-sonnet (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "perplexity",
    name: "Perplexity AI",
    category: "High-Speed & Open-Source Cloud",
    badge: "Search & Synthesis",
    blurb: "Sonar models with real-time web-grounded analysis.",
    keyLabel: "Perplexity API key",
    keyPlaceholder: "pplx-…",
    keyUrl: "https://www.perplexity.ai/settings/api",
    modelPlaceholder: "sonar (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "together",
    name: "Together AI",
    category: "High-Speed & Open-Source Cloud",
    badge: "Open Model Cloud",
    blurb: "High-throughput cloud hosting for Llama 3.3, Qwen 2.5, and open-source foundation models.",
    keyLabel: "Together API key",
    keyPlaceholder: "…",
    keyUrl: "https://api.together.xyz/settings/api-keys",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo (default)",
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    id: "ollama",
    name: "Ollama (Self-Hosted / Local)",
    category: "Self-Hosted & Custom",
    badge: "100% Private & Free",
    blurb: "Runs on your local machine or private VPC. No external API key required.",
    keyLabel: "API key (not required)",
    keyPlaceholder: "Not required",
    modelPlaceholder: "qwen2.5-coder (default)",
    needsKey: false,
    needsBaseUrl: true,
    baseUrlLabel: "Ollama server URL",
    baseUrlPlaceholder: "http://127.0.0.1:11434",
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    category: "Self-Hosted & Custom",
    badge: "vLLM / LiteLLM / Azure",
    blurb: "Connect any self-hosted proxy, Azure OpenAI gateway, vLLM, LM Studio, or LocalAI endpoint.",
    keyLabel: "API Key (if required by your endpoint)",
    keyPlaceholder: "Optional or Bearer token",
    modelPlaceholder: "custom-model-name",
    needsKey: false,
    needsBaseUrl: true,
    baseUrlLabel: "API Base URL (e.g. https://proxy.yourdomain.com/v1)",
    baseUrlPlaceholder: "https://your-api-gateway.com/v1",
  },
];

const EMPTY_FORM = { provider: "gemini" as Provider, api_key: "", model: "", base_url: "" };

export function Integrations({ token, isAdmin = false }: Props) {
  const [current, setCurrent] = useState<AIIntegration | null>(null);
  const [isLoading, setIsLoading] = useState(isAdmin);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showKey, setShowKey] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [pairing, setPairing] = useState<WhatsAppPairing | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Public endpoint — no token needed; admins and members see the same state.
    apiRequest<WhatsAppStatus>("/whatsapp/status")
      .then((data) => {
        if (!cancelled) setWhatsapp(data);
      })
      .catch(() => {
        if (!cancelled) setWhatsapp({ ready: false, charts: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Personal pairing state for the signed-in account (separate from whether
    // the bot itself is live — "Connected" must mean THIS user linked a number).
    apiRequest<WhatsAppPairing>("/whatsapp/my-status", {}, token)
      .then((data) => {
        if (!cancelled) setPairing(data);
      })
      .catch(() => {
        if (!cancelled) setPairing(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const botReady = whatsapp?.ready === true;
  const personallyPaired = pairing?.paired === true;

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiRequest<AIIntegration>("/organizations/integrations", {}, token)
      .then((data) => {
        if (!cancelled) setCurrent(data);
      })
      .catch((err) => {
        if (!cancelled) setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not load integrations" });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  const activeProvider = PROVIDERS.find((provider) => provider.id === form.provider) ?? PROVIDERS[0];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (isSaving) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      const body: Record<string, string> = {
        provider: form.provider,
        model: form.model
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      if (form.provider === "ollama" && form.base_url.trim()) body.base_url = form.base_url.trim();
      const updated = await apiRequest<AIIntegration>("/organizations/integrations", {
        method: "PUT",
        body: JSON.stringify(body)
      }, token);
      setCurrent(updated);
      // Keep the provider the user just connected; clear only the secrets.
      setForm({ ...EMPTY_FORM, provider: (updated.provider as Provider) ?? form.provider });
      setShowKey(false);
      setFeedback({ kind: "success", text: `AI provider connected. Chats in this workspace now use your own ${updated.provider} key.` });
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not save the integration" });
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      const updated = await apiRequest<AIIntegration>("/organizations/integrations", { method: "DELETE" }, token);
      setCurrent(updated);
      setConfirmingRemove(false);
      setFeedback({ kind: "success", text: "Disconnected. The workspace is back on the platform default AI." });
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not disconnect" });
      setConfirmingRemove(false);
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow={isAdmin ? "Settings" : "Apps & Services"}
        title="Integrations"
        description={
          isAdmin
            ? "Bring your own AI key. Connect the provider that powers SQL generation for this workspace — your key stays encrypted and is never shared with other workspaces."
            : "Connect external services to your QueryMind workspace. Link your WhatsApp account to ask database questions directly from your phone."
        }
      />

      {feedback && (
        <div
          className={`animate-fade-up flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
            feedback.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          <span className="mt-0.5 shrink-0">{feedback.kind === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
          <p className="leading-6">{feedback.text}</p>
          <button
            aria-label="Dismiss message"
            className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
            onClick={() => setFeedback(null)}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Current AI Provider status - Admins only */}
      {isAdmin && (
        <div className="card animate-fade-up flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <span className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
              <Cpu size={20} />
            </span>
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <Loader2 className="animate-spin text-slate-400" size={18} />
              ) : current?.provider ? (
                <>
                  <p className="text-sm font-semibold text-slate-900">
                    Using your own {current.provider.charAt(0).toUpperCase() + current.provider.slice(1)} key
                    {current.key_hint ? <span className="ml-2 font-mono text-xs text-slate-400">{current.key_hint}</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    All chats in this workspace run on your key.{current.model ? ` Model: ${current.model}.` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-900">Using the platform default AI</p>
                  <p className="text-xs text-slate-500">Connect your own key below to control the provider, model, and billing yourself.</p>
                </>
              )}
            </div>
          </div>
          {current?.provider && (
            <div className="flex shrink-0 items-center gap-2 pl-14 sm:pl-0">
              {confirmingRemove ? (
                <>
                  <span className="text-xs font-medium text-rose-600">Disconnect?</span>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-700 disabled:opacity-60"
                    disabled={isRemoving}
                    onClick={remove}
                    title="Confirm disconnect"
                    type="button"
                  >
                    {isRemoving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  </button>
                  <button
                    aria-label="Cancel"
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setConfirmingRemove(false)}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </>
              ) : (
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => setConfirmingRemove(true)}
                  type="button"
                >
                  <Trash2 size={13} /> Disconnect
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* WhatsApp AI chat - Available to all members */}
      <div className="card animate-fade-up flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
          <span className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">
            <MessageCircle size={20} />
          </span>
          <div className="min-w-0 flex-1">
            {whatsapp === null ? (
              <Loader2 className="animate-spin text-slate-400" size={18} />
            ) : !botReady ? (
              <>
                <p className="text-sm font-semibold text-slate-900">WhatsApp AI chat</p>
                <p className="text-xs text-slate-500">
                  {isAdmin
                    ? "Not connected yet. Set the WHATSAPP_* environment variables on the backend (Meta Cloud API access token, phone number ID, verify token, app secret) and point the Meta webhook at /whatsapp/webhook."
                    : "WhatsApp AI chat is currently not configured for this workspace. Please ask an admin to enable it."}
                </p>
              </>
            ) : personallyPaired ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  WhatsApp AI chat is live
                  {whatsapp.charts ? (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      charts on
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  Your number{pairing?.number_tail ? ` ···${pairing.number_tail}` : ""} is linked —
                  ask questions about the connected database and answers arrive as chat messages
                  with tables and charts. Say "help" in the chat for examples.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900">WhatsApp AI chat is available</p>
                <p className="text-xs text-slate-500">
                  Your WhatsApp number isn't linked to your account yet. Tap "Open WhatsApp", send{" "}
                  <span className="font-mono">hi</span> to the bot, and you'll get a one-time login
                  link that connects this account.
                </p>
              </>
            )}
          </div>
        </div>
        {whatsapp !== null && botReady && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-14 sm:pl-0">
            {whatsapp.number && (
              <a
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                href={`https://wa.me/${whatsapp.number}?text=hi`}
                rel="noreferrer"
                target="_blank"
              >
                <MessageCircle size={13} /> Open WhatsApp
              </a>
            )}
            {pairing !== null && (
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  personallyPaired ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${personallyPaired ? "bg-emerald-500" : "bg-amber-400"}`}
                />
                {personallyPaired
                  ? `Connected${pairing?.number_tail ? ` ···${pairing.number_tail}` : ""}`
                  : "Not linked"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Connect AI form - Admins only */}
      {isAdmin && (
        <form className="card animate-fade-up overflow-hidden" onSubmit={save}>
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-cream p-6">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
              <Plug size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Connect an AI provider</h2>
              <p className="text-xs text-slate-500">You create the key on the provider's website — we never see your provider account.</p>
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-7">
            {/* Selection Box for AI Provider */}
            <div className="space-y-3">
              <label className="block">
                <span className="label flex items-center justify-between">
                  <span>Select AI Provider</span>
                  <span className="text-[11px] font-normal text-slate-400">{PROVIDERS.length} providers supported</span>
                </span>
                <select
                  className="field cursor-pointer font-semibold text-slate-800 bg-white"
                  value={form.provider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as Provider;
                    setForm({
                      provider: nextProvider,
                      api_key: "",
                      model: "",
                      base_url: nextProvider === "ollama" ? "http://127.0.0.1:11434" : ""
                    });
                    setShowKey(false);
                  }}
                >
                  {Array.from(new Set(PROVIDERS.map((p) => p.category))).map((category) => (
                    <optgroup key={category} label={`── ${category} ──`}>
                      {PROVIDERS.filter((p) => p.category === category).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.badge ? `(${p.badge})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* Selected Provider Overview Banner */}
              <div className="rounded-xl border border-navy/10 bg-cream/60 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-navy">{activeProvider.name}</strong>
                    {activeProvider.badge && (
                      <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal-dark">
                        {activeProvider.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-navy-soft">{activeProvider.blurb}</p>
                </div>
                {activeProvider.keyUrl && (
                  <a
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-teal hover:underline"
                    href={activeProvider.keyUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Get API Key <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>

            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              <label className="block">
                <span className="label">{activeProvider.keyLabel}</span>
                <span className="relative block">
                  <input
                    autoComplete="off"
                    className="field pr-11 font-mono text-xs"
                    placeholder={activeProvider.keyPlaceholder}
                    required={activeProvider.needsKey}
                    type={showKey ? "text" : "password"}
                    value={form.api_key}
                    onChange={(event) => setForm({ ...form, api_key: event.target.value })}
                  />
                  <button
                    aria-label={showKey ? "Hide key" : "Show key"}
                    className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setShowKey((visible) => !visible)}
                    type="button"
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
                {!activeProvider.needsKey && (
                  <span className="mt-1.5 block text-xs text-slate-400">Leave empty for {activeProvider.name}.</span>
                )}
              </label>

              <label className="block">
                <span className="label">Model (Optional)</span>
                <input
                  className="field font-mono"
                  placeholder={activeProvider.modelPlaceholder}
                  value={form.model}
                  onChange={(event) => setForm({ ...form, model: event.target.value })}
                />
                <span className="mt-1.5 block text-xs text-slate-400">Placeholder: {activeProvider.modelPlaceholder}</span>
              </label>

              {activeProvider.needsBaseUrl && (
                <label className="block md:col-span-2">
                  <span className="label">{activeProvider.baseUrlLabel || "Server Base URL"}</span>
                  <input
                    className="field font-mono"
                    placeholder={activeProvider.baseUrlPlaceholder || "http://your-server:11434"}
                    required
                    value={form.base_url}
                    onChange={(event) => setForm({ ...form, base_url: event.target.value })}
                  />
                </label>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 text-sm">
              <ShieldCheck className="mt-0.5 shrink-0 text-brand-600" size={16} />
              <span className="text-xs leading-5 text-slate-500">
                Your key is encrypted before storage and used only for this workspace's AI requests. Members never see it —
                they just chat normally. Disconnect anytime to fall back to the platform default.
              </span>
            </label>
          </div>

          <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <button className="btn-accent !h-10 w-full sm:w-auto" disabled={isSaving} type="submit">
              {isSaving ? <Loader2 className="animate-spin" size={15} /> : <Plug size={15} />}
              {isSaving ? "Connecting…" : current?.provider ? "Update integration" : "Connect provider"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
