import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Cpu, Eye, EyeOff, Loader2, MessageCircle, Plug, ShieldCheck, Trash2, X, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiRequest } from "../lib/api";
import { AIIntegration } from "../types/api";

type Props = { token: string };

type Feedback = { kind: "success" | "error"; text: string };

type WhatsAppStatus = { ready: boolean; charts: boolean; number?: string | null };

type Provider = "gemini" | "openai" | "ollama";

const PROVIDERS: Array<{
  id: Provider;
  name: string;
  blurb: string;
  keyLabel: string;
  keyPlaceholder: string;
  modelPlaceholder: string;
  needsKey: boolean;
  needsBaseUrl: boolean;
}> = [
  {
    id: "gemini",
    name: "Google Gemini",
    blurb: "Free tier available. Create a key at aistudio.google.com/apikey.",
    keyLabel: "Gemini API key",
    keyPlaceholder: "AIza…",
    modelPlaceholder: "gemini-2.0-flash (optional)",
    needsKey: true,
    needsBaseUrl: false
  },
  {
    id: "openai",
    name: "OpenAI",
    blurb: "Paid per usage. Create a key at platform.openai.com/api-keys.",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-…",
    modelPlaceholder: "gpt-4o-mini (optional)",
    needsKey: true,
    needsBaseUrl: false
  },
  {
    id: "ollama",
    name: "Ollama (self-hosted)",
    blurb: "Free and private — runs on your own server. No API key needed.",
    keyLabel: "API key (not required)",
    keyPlaceholder: "Not required",
    modelPlaceholder: "qwen3:8b (optional)",
    needsKey: false,
    needsBaseUrl: true
  }
];

const EMPTY_FORM = { provider: "gemini" as Provider, api_key: "", model: "", base_url: "" };

export function Integrations({ token }: Props) {
  const [current, setCurrent] = useState<AIIntegration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showKey, setShowKey] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);

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
  }, [token]);

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
        eyebrow="Settings"
        title="Integrations"
        description="Bring your own AI key. Connect the provider that powers SQL generation for this workspace — your key stays encrypted and is never shared with other workspaces."
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

      {/* Current status */}
      <div className="card animate-fade-up flex flex-wrap items-center gap-4 p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
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
        {current?.provider && (
          <div className="flex shrink-0 items-center gap-2">
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

      {/* WhatsApp AI chat */}
      <div className="card animate-fade-up flex flex-wrap items-center gap-4 p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">
          <MessageCircle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {whatsapp === null ? (
            <Loader2 className="animate-spin text-slate-400" size={18} />
          ) : whatsapp.ready ? (
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
                Message your bot's WhatsApp number to ask questions about the connected database —
                answers arrive as chat messages with tables and charts. Say "help" in the chat for
                examples. Tap "Open WhatsApp" to start chatting right away.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-900">WhatsApp AI chat</p>
              <p className="text-xs text-slate-500">
                Not connected yet. Set the WHATSAPP_* environment variables on the backend (Meta
                Cloud API access token, phone number ID, verify token, app secret, organization ID)
                and point the Meta webhook at <span className="font-mono">/whatsapp/webhook</span>.
              </p>
            </>
          )}
        </div>
        {whatsapp !== null && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {whatsapp.ready && whatsapp.number && (
              <a
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                href={`https://wa.me/${whatsapp.number}?text=hi`}
                rel="noreferrer"
                target="_blank"
              >
                <MessageCircle size={13} /> Open WhatsApp
              </a>
            )}
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                whatsapp.ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${whatsapp.ready ? "bg-emerald-500" : "bg-slate-400"}`} />
              {whatsapp.ready ? "Connected" : "Not connected"}
            </span>
          </div>
        )}
      </div>

      {/* Connect form */}
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
          <div className="grid gap-2.5 sm:grid-cols-3">
            {PROVIDERS.map((provider) => (
              <button
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  form.provider === provider.id
                    ? "border-teal bg-teal-soft/60 shadow-sm"
                    : "border-slate-200 bg-white hover:border-teal/40"
                }`}
                key={provider.id}
                onClick={() =>
                  setForm((currentForm) => ({
                    // Switching providers must not carry over the previous
                    // provider's key, model, or server URL.
                    provider: provider.id,
                    api_key: "",
                    model: "",
                    base_url: ""
                  }))
                }
                type="button"
              >
                <span className="block text-sm font-bold text-slate-800">{provider.name}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{provider.blurb}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <label className="block">
              <span className="label">{activeProvider.keyLabel}</span>
              <span className="relative block">
                <input
                  autoComplete="off"
                  className="field pr-11"
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
              <span className="label">Model</span>
              <input
                className="field font-mono"
                placeholder={activeProvider.modelPlaceholder}
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
              />
              <span className="mt-1.5 block text-xs text-slate-400">Optional — uses a sensible default when empty.</span>
            </label>

            {activeProvider.needsBaseUrl && (
              <label className="block md:col-span-2">
                <span className="label">Ollama server URL</span>
                <input
                  className="field font-mono"
                  placeholder="http://your-server:11434"
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
    </section>
  );
}
