import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Trash2, UserPlus, X, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiRequest } from "../lib/api";
import { Member } from "../types/api";

type Props = {
  token: string;
  currentUserId: number;
};

type Feedback = { kind: "success" | "error"; text: string };
type MemberRole = "member" | "admin";

type MemberFormData = {
  email: string;
  password: string;
  role: MemberRole;
};

const EMPTY_FORM: MemberFormData = { email: "", password: "", role: "member" };

export function Members({ token, currentUserId }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<MemberFormData>({ ...EMPTY_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiRequest<Member[]>("/organizations/members", {}, token)
      .then((items) => {
        if (!cancelled) setMembers(items);
      })
      .catch((err) => {
        if (!cancelled) setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not load members" });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (isAdding) return;
    if (form.password.length < 8) {
      setFeedback({ kind: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setFeedback(null);
    setIsAdding(true);
    try {
      const created = await apiRequest<Member>("/organizations/members", {
        method: "POST",
        body: JSON.stringify(form)
      }, token);
      setMembers((items) => [...items, created]);
      setForm({ ...EMPTY_FORM });
      setShowPassword(false);
      const roleLabel = created.role === "admin" ? "Admin" : "Member";
      setFeedback({ kind: "success", text: `${created.email} (${roleLabel}) can now sign in with the email and password you set.` });
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not add the user" });
    } finally {
      setIsAdding(false);
    }
  }

  async function removeMember(member: Member) {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await apiRequest(`/organizations/members/${member.id}`, { method: "DELETE" }, token);
      setMembers((items) => items.filter((item) => item.id !== member.id));
      setFeedback({ kind: "success", text: `${member.email} was removed from the workspace.` });
      setRemovingId(null);
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not remove the user" });
      setRemovingId(null);
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="dot-grid mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="space-y-7">
      <PageHeader
        eyebrow="Team"
        title="Members"
        description="Add colleagues to your workspace. Set them as an Admin or Member, configure their password, and collaborate on database querying."
      />
      {feedback && <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />}
      <AddMemberCard form={form} isAdding={isAdding} showPassword={showPassword} onShowPassword={setShowPassword} onFieldChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} onSubmit={addMember} />
      <MemberList
        currentUserId={currentUserId}
        isLoading={isLoading}
        isRemoving={isRemoving}
        members={members}
        removingId={removingId}
        onRemove={removeMember}
        onRemoveRequest={setRemovingId}
      />
      </section>
    </div>
  );
}

function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const styles = feedback.kind === "success"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/25 bg-rose-500/10 text-rose-300";
  const icon = feedback.kind === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />;
  return (
    <div
      className={`animate-fade-up flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="leading-6">{feedback.text}</p>
      <button
        aria-label="Dismiss message"
        className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
        onClick={onDismiss}
        type="button"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function AddMemberCard({
  form,
  isAdding,
  showPassword,
  onShowPassword,
  onFieldChange,
  onSubmit
}: {
  form: MemberFormData;
  isAdding: boolean;
  showPassword: boolean;
  onShowPassword: (visible: boolean) => void;
  onFieldChange: <K extends keyof MemberFormData>(key: K, value: MemberFormData[K]) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="card animate-fade-up overflow-hidden" onSubmit={onSubmit}>
      <div className="flex items-center gap-3 border-b border-line p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
          <UserPlus size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Add a workspace user</h2>
          <p className="text-xs text-ink-soft">Choose their role and password — share their login details securely.</p>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="label">Email</span>
          <input
            autoComplete="off"
            className="field"
            placeholder="colleague@company.com"
            required
            type="email"
            value={form.email}
            onChange={(event) => onFieldChange("email", event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Role</span>
          <select
            className="field"
            value={form.role}
            onChange={(event) => onFieldChange("role", event.target.value as MemberRole)}
          >
            <option value="member">Member (Queries & Data Exploration)</option>
            <option value="admin">Admin (Full Workspace Management)</option>
          </select>
        </label>
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="label">Password</span>
          <span className="relative block">
            <input
              autoComplete="new-password"
              className="field pr-11"
              minLength={8}
              placeholder="At least 8 characters"
              required
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => onFieldChange("password", event.target.value)}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink-soft"
              onClick={() => onShowPassword(!showPassword)}
              type="button"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-line bg-white/[0.03] px-6 py-4">
        <p className="hidden text-xs text-ink-soft sm:block">
          {form.role === "admin"
            ? "Admins can add databases, integrations, and manage other workspace members."
            : "Members can run queries and explore schemas, but cannot modify workspace settings."}
        </p>
        <button className="btn-accent !h-10 w-full sm:w-auto" disabled={isAdding} type="submit">
          {isAdding ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
          {isAdding ? "Adding…" : form.role === "admin" ? "Add admin" : "Add member"}
        </button>
      </div>
    </form>
  );
}

function MemberList({
  currentUserId,
  isLoading,
  isRemoving,
  members,
  removingId,
  onRemove,
  onRemoveRequest
}: {
  currentUserId: number;
  isLoading: boolean;
  isRemoving: boolean;
  members: Member[];
  removingId: number | null;
  onRemove: (member: Member) => void;
  onRemoveRequest: (id: number | null) => void;
}) {
  return (
    <div className="card animate-fade-up overflow-hidden">
      <div className="border-b border-line px-6 py-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Workspace users</h2>
        <p className="text-xs text-ink-soft">
          {members.length} user{members.length === 1 ? "" : "s"} · Admins manage databases, integrations, and users; members can chat and explore data.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-ink-faint">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            const isConfirming = removingId === member.id;
            return (
              <li className="flex items-center gap-3 px-6 py-3.5" key={member.id}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-xs font-bold uppercase text-brand-300">
                  {member.email.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{member.email}</span>
                  <span className="block text-[11px] text-ink-faint">
                    {member.role === "admin" ? "Admin" : "Member"}
                    {isSelf ? " · you" : ""}
                  </span>
                </span>
                <span
                  className={`status-pill shrink-0 ${
                    member.role === "admin" ? "pill-info" : ""
                  }`}
                >
                  {member.role === "admin" ? "admin" : "member"}
                </span>
                {!isSelf && (
                  isConfirming ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs font-medium text-rose-300">Remove?</span>
                      <button
                        className="grid h-8 w-8 place-items-center rounded-md bg-rose-600 text-white transition hover:bg-rose-500"
                        disabled={isRemoving}
                        onClick={() => onRemove(member)}
                        title="Confirm remove"
                        type="button"
                      >
                        {isRemoving ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
                      </button>
                      <button
                        aria-label="Keep member"
                        className="grid h-8 w-8 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink-soft"
                        onClick={() => onRemoveRequest(null)}
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ) : (
                    <button
                      aria-label={`Remove ${member.email}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line text-ink-faint transition hover:border-rose-500/25 hover:bg-rose-500/10 hover:text-rose-300"
                      onClick={() => onRemoveRequest(member.id)}
                      title={member.role === "admin" ? "Remove admin" : "Remove member"}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
