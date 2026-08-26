import { useEffect, useState } from "react";
import { Activity, BarChart3, Check, Database, FilePenLine, Loader2, LogOut, MessageSquarePlus, Pencil, Plug, Trash2, Users, X, type LucideIcon } from "lucide-react";
import { NewChatDialog } from "./NewChatDialog";
import { LogoMark } from "./LogoMark";
import { useChatSessions } from "./ChatSessionsContext";
import { useDialog } from "../lib/useDialog";
import type { ChatSession, Connection } from "../types/api";

type NavItem = { id: string; label: string; icon: LucideIcon };

type Props = {
  active: string;
  onActive: (value: string) => void;
  onLogout: () => void;
  orgName?: string;
  connections: Connection[];
  isAdmin: boolean;
  children: React.ReactNode;
};

export function Shell({ active, onActive, onLogout, orgName, connections, isAdmin, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { newChat } = useChatSessions();
  const drawerRef = useDialog(() => setDrawerOpen(false));

  // Close the drawer if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    if (!drawerOpen) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => media.matches && setDrawerOpen(false);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [drawerOpen]);

  const nav: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "connections", label: "Connections", icon: Database },
    { id: "changes", label: "Changes", icon: FilePenLine },
    ...(isAdmin
      ? [
          { id: "integrations", label: "Integrations", icon: Plug },
          { id: "members", label: "Members", icon: Users }
        ]
      : [])
  ];
  const current = nav.find((item) => item.id === active);

  function go(id: string) {
    onActive(id);
    setDrawerOpen(false);
  }

  function requestNewChat() {
    setDrawerOpen(false);
    if (connections.length === 0) {
      // Nothing to pick yet — the chat page guides them to connect a database.
      newChat();
      onActive("chat");
      return;
    }
    // Drop any open conversation so picking a database starts a genuinely new chat.
    newChat();
    setPickerOpen(true);
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-navy/10 bg-cream p-5 lg:flex">
        <SidebarContent
          active={active}
          nav={nav}
          orgName={orgName}
          connections={connections}
          onLogout={onLogout}
          onNavigate={onActive}
          onRequestNewChat={requestNewChat}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu" ref={drawerRef}>
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-navy/10 bg-cream p-5 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button aria-label="Close menu" className="rounded-lg p-2 text-navy-soft transition hover:bg-navy/5 hover:text-navy" onClick={() => setDrawerOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            <SidebarContent
              active={active}
              nav={nav}
              orgName={orgName}
              connections={connections}
              onLogout={() => {
                setDrawerOpen(false);
                onLogout();
              }}
              onNavigate={go}
              onRequestNewChat={requestNewChat}
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
          <div className="app-frame">{children}</div>
        ) : (
          <div className="dot-grid mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">{children}</div>
        )}
      </main>

      {pickerOpen && (
        <NewChatDialog
          connections={connections}
          onClose={() => setPickerOpen(false)}
          onSuccess={() => {
            onActive("chat");
            setDrawerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SidebarContent({
  active,
  nav,
  orgName,
  connections,
  onLogout,
  onNavigate,
  onRequestNewChat
}: {
  active: string;
  nav: NavItem[];
  orgName?: string;
  connections: Connection[];
  onLogout: () => void;
  onNavigate: (id: string) => void;
  onRequestNewChat: () => void;
}) {
  const { sessions, isLoading, activeId, openSession, renameSession, deleteSession } = useChatSessions();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busySessionId, setBusySessionId] = useState<number | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  function startNewChat() {
    onRequestNewChat();
  }

  function selectSession(session: ChatSession) {
    if (renamingId !== null || deletingId !== null || busySessionId !== null) return;
    openSession(session.id);
    onNavigate("chat");
  }

  async function saveRename(session: ChatSession) {
    if (busySessionId !== null) return;
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title || title === session.title) return;
    setBusySessionId(session.id);
    try {
      await renameSession(session, title);
    } catch {
      return;
    } finally {
      setBusySessionId(null);
    }
  }

  async function removeSession(session: ChatSession) {
    if (busySessionId !== null) return;
    setDeletingId(null);
    setBusySessionId(session.id);
    try {
      await deleteSession(session);
    } catch {
      return;
    } finally {
      setBusySessionId(null);
    }
  }

  return (
    <>
      <div className="hidden lg:block">
        <Brand />
        {orgName && <OrgChip name={orgName} />}
      </div>

      {/* New chat — top of the sidebar */}
      <button
        className={`focus-ring flex w-full items-center gap-2.5 rounded-lg bg-teal px-3 py-2 text-left text-[13px] font-semibold text-white shadow-md shadow-teal/25 transition hover:bg-teal-dark ${orgName ? "mt-4" : "mt-6"}`}
        onClick={startNewChat}
        type="button"
      >
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
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </nav>

      {/* Chat history — bottom section */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-navy/10 pt-4">
        <p className="eyebrow px-2 pb-2 text-navy-soft/60">Chats</p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 pb-2">
          {isLoading ? (
            <div className="flex justify-center py-8 text-slate-400">
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
                      className="h-9 w-full rounded-lg border border-navy/15 bg-white px-3 text-[13px] text-navy outline-none placeholder:text-slate-400 focus:border-teal"
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
                    isActive ? "bg-navy/[0.07] font-medium text-navy" : "text-navy-soft hover:bg-navy/5 hover:text-navy"
                  } ${isDeleting ? "!bg-rose-500/10 !text-rose-600" : ""}`}
                  key={session.id}
                >
                  <button
                    className="min-w-0 flex-1 px-3 py-2 text-left text-[13px]"
                    onClick={() => selectSession(session)}
                    title={session.title}
                    type="button"
                  >
                    <span className="block truncate">{session.title}</span>
                    {session.connection_name && (
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium text-brand-700/80">
                        <Database size={10} className="shrink-0" /> {session.connection_name}
                      </span>
                    )}
                  </button>
                  {isDeleting ? (
                    <span className="flex items-center gap-1 pr-2">
                      <button
                        aria-label="Confirm delete"
                        className="grid h-8 w-8 place-items-center rounded-md bg-rose-600 text-white transition hover:bg-rose-700"
                        disabled={busySessionId !== null}
                        onClick={() => removeSession(session)}
                        type="button"
                      >
                        {busySessionId === session.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                      </button>
                      <button
                        aria-label="Keep chat"
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-navy/10 hover:text-navy"
                        disabled={busySessionId !== null}
                        onClick={() => setDeletingId(null)}
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <span className="reveal-touch flex items-center gap-0.5 pr-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        aria-label={`Rename ${session.title}`}
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-navy/10 hover:text-navy"
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
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-navy/10 hover:text-rose-600"
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

      <div className="mt-4 border-t border-navy/10 pt-3">
        {confirmingLogout ? (
          <div className="flex items-center gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={15} /> Confirm sign out
            </button>
            <button
              aria-label="Cancel sign out"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-navy/10 hover:text-navy"
              onClick={() => setConfirmingLogout(false)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button className="btn-ghost w-full justify-start" onClick={() => setConfirmingLogout(true)} type="button">
            <LogOut size={15} /> Sign out
          </button>
        )}
      </div>
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy shadow-card">
        <LogoMark className="h-7 w-7" />
      </span>
      <div>
        <strong className="block text-sm font-bold tracking-tight text-navy">QueryMind</strong>
        <p className="text-[11px] text-navy-soft">Production console</p>
      </div>
    </div>
  );
}

function OrgChip({ name }: { name: string }) {
  return (
    <div className="mt-6 truncate rounded-xl border border-navy/10 bg-white/60 px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-navy-soft/70">Workspace</p>
      <p className="truncate text-[13px] font-semibold text-navy">{name}</p>
    </div>
  );
}

