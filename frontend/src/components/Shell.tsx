import { useEffect, useState } from "react";
import { Activity, BarChart3, Check, Database, FilePenLine, Loader2, LogOut, MessageSquarePlus, MoreHorizontal, Pencil, Plug, Trash2, Users, X, type LucideIcon } from "lucide-react";
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
    { id: "integrations", label: "Integrations", icon: Plug },
    ...(isAdmin
      ? [
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
  const [menu, setMenu] = useState<{ id: number; up: boolean } | null>(null);

  // Close the options menu on any click outside the row that owns it, on
  // Escape, and while the chat list scrolls.
  useEffect(() => {
    if (menu === null) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-chat-menu]")) return;
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  function toggleMenu(id: number, anchor: HTMLElement) {
    setMenu((current) => {
      if (current?.id === id) return null;
      // Flip the menu above the button when there is no room below, so the
      // bottom of the list never clips it.
      const up = anchor.getBoundingClientRect().bottom + 96 > window.innerHeight;
      return { id, up };
    });
  }

  function startRename(session: ChatSession) {
    setMenu(null);
    setRenamingId(session.id);
    setRenameDraft(session.title);
  }

  function startDelete(session: ChatSession) {
    setMenu(null);
    setDeletingId(session.id);
  }

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
        className={`focus-ring flex w-full items-center gap-2.5 rounded-lg border border-brand-200 bg-teal-soft px-3 py-2 text-left text-[13px] font-semibold text-teal-dark transition hover:border-brand-300 hover:bg-brand-100 ${orgName ? "mt-4" : "mt-6"}`}
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
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 pb-2" onScroll={() => setMenu(null)}>
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
                    isActive ? "bg-white font-medium text-navy shadow-sm" : "text-navy-soft hover:text-navy"
                  } ${isDeleting ? "!bg-rose-500/10 !text-rose-600" : ""}`}
                  key={session.id}
                >
                  <button
                    className="min-w-0 flex-1 py-2 pl-3 pr-2 text-left text-[13px]"
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
                    <>
                      <button
                        aria-expanded={menu?.id === session.id}
                        aria-haspopup="menu"
                        aria-label={`Options for ${session.title}`}
                        className={`mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-navy/10 hover:text-navy ${
                          menu?.id === session.id ? "bg-navy/10 text-navy opacity-100" : "opacity-50 group-hover:opacity-100"
                        }`}
                        data-chat-menu=""
                        onClick={(event) => toggleMenu(session.id, event.currentTarget)}
                        type="button"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menu?.id === session.id && (
                        <div
                          className={`absolute right-1.5 z-20 w-36 overflow-hidden rounded-lg border border-navy/10 bg-white py-1 shadow-lift ${
                            menu.up ? "bottom-8" : "top-8"
                          }`}
                          data-chat-menu=""
                          role="menu"
                        >
                          <button
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-navy-soft transition hover:bg-navy/5 hover:text-navy"
                            onClick={() => startRename(session)}
                            role="menuitem"
                            type="button"
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-rose-600 transition hover:bg-rose-500/10"
                            onClick={() => startDelete(session)}
                            role="menuitem"
                            type="button"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </>
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

