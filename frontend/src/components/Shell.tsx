import { useState } from "react";
import { Activity, BarChart3, Check, Database, Loader2, LogOut, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { useChatSessions } from "./ChatSessionsContext";
import type { ChatSession } from "../types/api";

type Props = {
  active: string;
  onActive: (value: string) => void;
  onLogout: () => void;
  orgName?: string;
  children: React.ReactNode;
};

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "connections", label: "Connection", icon: Database }
];

export function Shell({ active, onActive, onLogout, orgName, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = nav.find((item) => item.id === active);

  function go(id: string) {
    onActive(id);
    setDrawerOpen(false);
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy p-5 shadow-sidebar lg:flex">
        <SidebarContent active={active} orgName={orgName} onLogout={onLogout} onNavigate={onActive} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy p-5 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button aria-label="Close menu" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" onClick={() => setDrawerOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            <SidebarContent
              active={active}
              orgName={orgName}
              onLogout={() => {
                setDrawerOpen(false);
                onLogout();
              }}
              onNavigate={go}
            />
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b border-navy/10 bg-cream/85 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <button aria-label="Open menu" className="btn-ghost -ml-2 text-navy" onClick={() => setDrawerOpen(true)} type="button">
            <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
          <strong className="text-sm font-bold text-navy">{current?.label ?? (active === "chat" ? "AI Chat" : "QueryMind")}</strong>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy text-teal-soft">
            <Activity size={15} />
          </span>
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="sticky top-0 z-10 hidden h-14 items-center border-b border-navy/10 bg-cream/75 backdrop-blur lg:flex">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-8">
            <p className="text-sm font-medium text-navy-soft">{current?.label ?? (active === "chat" ? "AI Chat" : "QueryMind")}</p>
            {orgName && <p className="text-xs font-medium text-navy-soft/70">Workspace · {orgName}</p>}
          </div>
        </div>
        {active === "chat" ? (
          <div className="h-[calc(100vh-3.5rem)]">{children}</div>
        ) : (
          <div className="dot-grid mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">{children}</div>
        )}
      </main>
    </div>
  );
}

function SidebarContent({
  active,
  orgName,
  onLogout,
  onNavigate
}: {
  active: string;
  orgName?: string;
  onLogout: () => void;
  onNavigate: (id: string) => void;
}) {
  const { sessions, isLoading, activeId, newChat, openSession, renameSession, deleteSession } = useChatSessions();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function startNewChat() {
    newChat();
    onNavigate("chat");
  }

  function selectSession(session: ChatSession) {
    if (renamingId !== null || deletingId !== null) return;
    openSession(session.id);
    onNavigate("chat");
  }

  async function saveRename(session: ChatSession) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title || title === session.title) return;
    try {
      await renameSession(session, title);
    } catch {
      return;
    }
  }

  async function removeSession(session: ChatSession) {
    setDeletingId(null);
    try {
      await deleteSession(session);
    } catch {
      return;
    }
  }

  return (
    <>
      <div className="hidden lg:block">
        <Brand />
        {orgName && <OrgChip name={orgName} />}
      </div>

      {/* New chat — top of the sidebar */}
      <button className={`btn-accent w-full ${orgName ? "mt-4" : "mt-6"}`} onClick={startNewChat} type="button">
        <MessageSquarePlus size={16} /> New chat
      </button>

      <nav className="mt-4 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? "nav-item-active" : ""}`}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon size={17} /> {item.label}
            </button>
          );
        })}
      </nav>

      {/* Chat history — bottom section */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-white/10 pt-4">
        <p className="eyebrow px-2 pb-2 text-slate-400">Chats</p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 pb-2">
          {isLoading ? (
            <div className="flex justify-center py-8 text-slate-500">
              <Loader2 className="animate-spin" size={18} />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-5 text-slate-500">
              No chats yet. Start a conversation and it will appear here.
            </p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeId && active === "chat";
              const isRenaming = renamingId === session.id;
              const isDeleting = deletingId === session.id;

              if (isRenaming) {
                return (
                  <div className="px-1 py-0.5" key={session.id}>
                    <input
                      autoFocus
                      className="h-9 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal"
                      onBlur={() => saveRename(session)}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveRename(session);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      value={renameDraft}
                    />
                  </div>
                );
              }

              return (
                <div
                  className={`group relative flex items-center rounded-lg transition ${
                    isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                  } ${isDeleting ? "!bg-rose-500/15 text-rose-300" : ""}`}
                  key={session.id}
                >
                  <button
                    className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm"
                    onClick={() => selectSession(session)}
                    title={session.title}
                    type="button"
                  >
                    {session.title}
                  </button>
                  {isDeleting ? (
                    <span className="flex items-center gap-1 pr-2">
                      <button
                        aria-label="Confirm delete"
                        className="grid h-7 w-7 place-items-center rounded-md bg-rose-600 text-white transition hover:bg-rose-700"
                        onClick={() => removeSession(session)}
                        type="button"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        aria-label="Keep chat"
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
                        onClick={() => setDeletingId(null)}
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 pr-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        aria-label={`Rename ${session.title}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          setRenamingId(session.id);
                          setRenameDraft(session.title);
                        }}
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        aria-label={`Delete ${session.title}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-rose-400"
                        onClick={() => setDeletingId(session.id)}
                        type="button"
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2 rounded-lg bg-teal/15 px-3 py-2 text-xs font-medium text-teal-soft">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
          </span>
          All systems operational
        </div>
        <button className="btn-ghost w-full justify-start hover:bg-white/5 hover:text-white" onClick={onLogout} type="button">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal text-white shadow-lg shadow-teal/30">
        <Database size={19} />
      </span>
      <div>
        <strong className="block text-[15px] font-bold tracking-tight text-white">QueryMind</strong>
        <p className="text-xs text-slate-400">Production console</p>
      </div>
    </div>
  );
}

function OrgChip({ name }: { name: string }) {
  return (
    <div className="mt-6 truncate rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Workspace</p>
      <p className="truncate text-sm font-semibold text-white">{name}</p>
    </div>
  );
}
