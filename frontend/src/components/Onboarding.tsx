import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Database, Eye, EyeOff, Loader2, PlugZap, ShieldCheck, UserRound } from "lucide-react";
import { NumberField } from "./NumberField";
import { LogoMark } from "./LogoMark";
import { apiRequest } from "../lib/api";

type Props = {
  token: string;
  organizationName?: string;
  onComplete: () => void;
};

type Feedback = { kind: "success" | "error"; text: string };

const STEPS = [
  { id: 1, label: "Your details", icon: UserRound },
  { id: 2, label: "Connect database", icon: Database },
  { id: 3, label: "Ready", icon: CheckCircle2 }
];

export function Onboarding({ token, organizationName, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [workspace, setWorkspace] = useState(organizationName ?? "");
  const [form, setForm] = useState({
    name: "",
    db_type: "mysql" as "mysql" | "postgres",
    host: "",
    port: 3306,
    username: "",
    password: "",
    database_name: "",
    ssl_mode: "PREFERRED",
    test_live: true,
    ssh_host: null as string | null,
    ssh_port: 22,
    ssh_username: null as string | null,
    ssh_password: null as string | null
  });
  const defaultPort = form.db_type === "postgres" ? 5432 : 3306;
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectedName, setConnectedName] = useState("");
  const [showSshTunnel, setShowSshTunnel] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);

  function toggleSshTunnel(enabled: boolean) {
    setShowSshTunnel(enabled);
    if (!enabled) {
      // Drop any half-entered tunnel values so they never reach the backend.
      setForm((current) => ({ ...current, ssh_host: null, ssh_port: 22, ssh_username: null, ssh_password: null }));
    }
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    try {
      localStorage.setItem(
        "querymind_profile",
        JSON.stringify({ fullName, useCase, organizationName: workspace })
      );
    } catch {
      /* storage unavailable — onboarding continues regardless */
    }
    setStep(2);
  }

  async function connectDatabase(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      // Shared client: consistent errors plus the global auth-expired handler.
      await apiRequest<unknown>("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setConnectedName(form.name);
      setFeedback(null);
      setStep(3);
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 sm:px-6 sm:py-10">
      {/* Sticky brand bar — logo always on top, any screen size */}
      <header className="sticky top-0 z-30 -mx-4 mb-6 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15">
            <LogoMark className="h-5 w-5" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Query<span className="text-brand-400">Mind</span>
          </span>
        </div>
        <p className="text-[13px] text-ink-faint">
          {step > 2 ? "All set" : `Step ${step} of 2`}
        </p>
      </header>

      <div className="mx-auto max-w-xl">
        {/* Progress */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((item, index) => {
            const Icon = item.icon;
            const done = step > item.id;
            const current = step === item.id;
            return (
              <li className="flex flex-1 items-center gap-2" key={item.id}>
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-medium transition ${
                    done
                      ? "border-brand-500 bg-brand-500 text-white"
                      : current
                        ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                        : "border-line bg-transparent text-ink-faint"
                  }`}
                >
                  {done ? <Check size={15} /> : <Icon size={15} />}
                </span>
                <span
                  className={`hidden text-[13px] font-medium sm:block ${
                    current ? "text-ink" : done ? "text-brand-300" : "text-ink-faint"
                  }`}
                >
                  {item.label}
                </span>
                {index < STEPS.length - 1 && (
                  <span className={`h-px flex-1 ${done ? "bg-brand-500/60" : "bg-line"}`} />
                )}
              </li>
            );
          })}
        </ol>

        {/* Step 1: details */}
        {step === 1 && (
          <form className="card animate-fade-up p-5 sm:p-8" onSubmit={saveDetails}>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Set up your workspace</h1>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="label">Workspace name</span>
                <input className="field" placeholder="Acme Analytics" required value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
              </label>
              <label className="block">
                <span className="label">Your name</span>
                <input className="field" placeholder="Aswin Kumar" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <div>
                <span className="label">What will you use QueryMind for?</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {["Explore data", "Build reports", "Manage operations", "Learn SQL"].map((option) => (
                    <button
                      className={`rounded-full border px-4 py-1.5 text-sm transition ${
                        useCase === option
                          ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                          : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
                      }`}
                      key={option}
                      onClick={() => setUseCase(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="btn-primary mt-7 w-full" type="submit">
              Continue <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* Step 2: connect database */}
        {step === 2 && (
          <form className="card animate-fade-up p-5 sm:p-8" onSubmit={connectDatabase}>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Connect your database</h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              One live connection unlocks the workspace. Your password is encrypted before it is stored.
            </p>

            <div className="mt-6 space-y-6">
              <section>
                <h3 className="eyebrow mb-3 text-ink-faint">Connection</h3>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Display name</span>
                    <input className="field" placeholder="Production database" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Database type</span>
                    <select
                      className="field"
                      value={form.db_type}
                      onChange={(event) => {
                        const db_type = event.target.value as "mysql" | "postgres";
                        setForm({ ...form, db_type, port: db_type === "postgres" ? 5432 : 3306 });
                      }}
                    >
                      <option value="mysql">MySQL / MariaDB</option>
                      <option value="postgres">PostgreSQL</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Host</span>
                    <input
                      className="field font-mono"
                      placeholder={showSshTunnel ? "127.0.0.1 or db.internal" : `${form.db_type === "postgres" ? "postgresql" : "mysql"}.example.com`}
                      required
                      value={form.host}
                      onChange={(event) => setForm({ ...form, host: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="label">Port</span>
                    <NumberField className="field" fallback={defaultPort} max={65535} min={1} onCommit={(port) => setForm({ ...form, port })} value={form.port} />
                  </label>
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <h3 className="eyebrow mb-3 text-ink-faint">Credentials</h3>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Username</span>
                    <input className="field font-mono" placeholder="querymind_user" required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Password</span>
                    <input className="field" placeholder="••••••••" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
                  </label>
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <h3 className="eyebrow mb-3 text-ink-faint">Security</h3>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Database name</span>
                    <input className="field font-mono" placeholder="my_database" required value={form.database_name} onChange={(event) => setForm({ ...form, database_name: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Encryption (SSL)</span>
                    <select className="field" value={form.ssl_mode} onChange={(event) => setForm({ ...form, ssl_mode: event.target.value })}>
                      <option value="PREFERRED">Auto — use SSL if available</option>
                      <option value="REQUIRED">Required — cloud providers</option>
                      <option value="DISABLED">Disabled — local only</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 rounded-xl border border-line bg-white/[0.02]">
                  <label className="flex cursor-pointer items-center gap-3 p-3.5 text-sm" htmlFor="onboarding-ssh-tunnel-toggle">
                    <input checked={showSshTunnel} className="h-4 w-4 accent-brand-500" id="onboarding-ssh-tunnel-toggle" onChange={(event) => toggleSshTunnel(event.target.checked)} type="checkbox" />
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      <ShieldCheck size={15} /> Connect via SSH tunnel
                    </span>
                  </label>

                  {showSshTunnel && (
                    <div className="grid gap-x-5 gap-y-4 border-t border-line p-3.5 sm:grid-cols-2">
                      <label className="block">
                        <span className="label">SSH Host</span>
                        <input className="field font-mono" placeholder="bastion.mycompany.com" required={showSshTunnel} value={form.ssh_host ?? ""} onChange={(event) => setForm({ ...form, ssh_host: event.target.value })} />
                      </label>
                      <label className="block">
                        <span className="label">SSH Port</span>
                        <NumberField className="field" fallback={22} max={65535} min={1} onCommit={(ssh_port) => setForm({ ...form, ssh_port })} value={form.ssh_port} />
                      </label>
                      <label className="block">
                        <span className="label">SSH Username</span>
                        <input className="field font-mono" placeholder="ec2-user" required={showSshTunnel} value={form.ssh_username ?? ""} onChange={(event) => setForm({ ...form, ssh_username: event.target.value })} />
                      </label>
                      <label className="block">
                        <span className="label">SSH Password / Private Key</span>
                        <span className="relative block">
                          {(showSshPassword || (form.ssh_password ?? "").startsWith("-----")) ? (
                            <textarea
                              className="field h-auto min-h-[44px] resize-y py-3 pr-11 font-mono text-[13px] leading-5"
                              placeholder="Paste SSH private key (-----BEGIN...) or password"
                              required={showSshTunnel}
                              rows={1}
                              value={form.ssh_password ?? ""}
                              onChange={(event) => setForm({ ...form, ssh_password: event.target.value })}
                            />
                          ) : (
                            <input
                              className="field pr-11"
                              placeholder="Password, or paste a private key"
                              required={showSshTunnel}
                              type="password"
                              value={form.ssh_password ?? ""}
                              onChange={(event) => setForm({ ...form, ssh_password: event.target.value })}
                            />
                          )}
                          <button
                            aria-label={showSshPassword ? "Hide SSH secret" : "Show SSH secret"}
                            className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink"
                            onClick={() => setShowSshPassword((visible) => !visible)}
                            type="button"
                          >
                            {showSshPassword || (form.ssh_password ?? "").startsWith("-----") ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
                  <input checked={Boolean(form.test_live)} className="h-4 w-4 accent-brand-500" onChange={(event) => setForm({ ...form, test_live: event.target.checked })} type="checkbox" />
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <ShieldCheck size={15} /> Test live connection before saving
                  </span>
                </label>
              </section>
            </div>

            {feedback && (
              <p className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">{feedback.text}</p>
            )}

            <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={() => setStep(1)} type="button">
                <ArrowLeft size={15} /> Back
              </button>
              <button className="btn-primary sm:min-w-44" disabled={saving} type="submit">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <PlugZap size={16} />}
                {saving ? "Testing & connecting…" : "Connect & finish"}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: done */}
        {step === 3 && (
          <div className="card animate-fade-up p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
              <CheckCircle2 size={26} />
            </span>
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">You're all set!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
              <strong className="text-ink">{connectedName}</strong> is connected and your schema is mapped. Your
              workspace is ready — head in and ask your first question.
            </p>
            <button className="btn-primary mx-auto mt-7" onClick={onComplete} type="button">
              Enter workspace <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
