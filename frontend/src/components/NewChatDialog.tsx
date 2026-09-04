import { useState } from "react";
import { Database, Loader2, X } from "lucide-react";
import { useChatSessions } from "./ChatSessionsContext";
import { useDialog } from "../lib/useDialog";
import type { Connection } from "../types/api";

type Props = {
  connections: Connection[];
  onClose: () => void;
  onSuccess?: () => void;
};

export function NewChatDialog({ connections, onClose, onSuccess }: Props) {
  const { ensureSession, openSession } = useChatSessions();
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog(onClose);

  async function pick(connection: Connection) {
    if (creatingId !== null) return;
    setCreatingId(connection.id);
    setError(null);
    try {
      const id = await ensureSession(connection.id);
      openSession(id);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the chat");
      setCreatingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Choose a database for the new chat" ref={dialogRef}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="card animate-fade-up relative w-full max-w-md overflow-hidden p-0 shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">New chat</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Pick a database — this chat stays linked to it.
            </p>
          </div>
          <button aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-white/10 hover:text-ink" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[320px] space-y-1 overflow-y-auto p-2.5">
          {connections.map((connection) => {
            const isCreating = creatingId === connection.id;
            return (
              <button
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  isCreating
                    ? "border-brand-500/60 bg-brand-500/10"
                    : "border-transparent hover:border-line hover:bg-white/5"
                } disabled:cursor-wait`}
                disabled={creatingId !== null}
                key={connection.id}
                onClick={() => pick(connection)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
                  {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{connection.name}</span>
                  <span className="block truncate font-mono text-[11px] text-ink-faint">
                    {connection.database_name} · {connection.host}
                  </span>
                </span>
                {isCreating && <span className="shrink-0 text-[11px] font-medium text-brand-300">Creating…</span>}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mx-4 mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">{error}</p>
        )}
      </div>
    </div>
  );
}
