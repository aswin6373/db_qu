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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-canvas p-5 lg:flex">
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-canvas p-5 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button aria-label="Close menu" className="rounded-lg p-2 text-ink-soft transition hover:bg-white/5 hover:text-ink" onClick={() => setDrawerOpen(false)} type="button">
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
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <button aria-label="Open menu" className="btn-ghost -ml-2 text-ink" onClick={() => setDrawerOpen(true)} type="button">
            <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
          <strong className="text-sm font-bold text-ink">{current?.label ?? (active === "chat" ? "AI Chat" : "QueryMind")}</strong>
          <div className="w-8" />
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="sticky top-0 z-10 hidden h-14 items-center border-b border-line bg-canvas/75 backdrop-blur lg:flex">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-8">
            <p className="text-sm font-medium text-ink-soft">{current?.label ?? (active === "chat" ? "AI Chat" : "QueryMind")}</p>
            {orgName && <p className="text-xs font-medium text-ink-soft">Workspace · {orgName}</p>}
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
        className={`focus-ring flex w-full items-center gap-2.5 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-2 text-left text-[13px] font-semibold text-brand-300 transition hover:border-brand-500/60 hover:bg-brand-500/20 ${orgName ? "mt-4" : "mt-6"}`}
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
      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-line pt-4">
        <p className="eyebrow px-2 pb-2 text-ink-faint">Chats</p>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 pb-2" onScroll={() => setMenu(null)}>
          {isLoading ? (
            <div className="flex justify-center py-8 text-ink-faint">
              <Loader2 className="animate-spin" size={18} />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-5 text-ink-soft">
              No chats yet. Start a conversation and it will appear here.
            </p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeId && active === "chat";
              const isRenaming = renamingId === session.id;
              const isDeleting = deletingId === session.id;
              const isWhatsApp = session.title.toLowerCase().startsWith("whatsapp");
              const displayTitle = isWhatsApp
                ? session.title.replace(/^whatsapp\s*[·:-]\s*/i, "").trim() || "WhatsApp Chat"
                : session.title;

              if (isRenaming) {
                return (
                  <div className="px-1 py-0.5" key={session.id}>
                    <input
                      autoFocus
                      className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-brand-500"
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
                    isActive ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                  } ${isDeleting ? "!bg-rose-500/10 !text-rose-300" : ""}`}
                  key={session.id}
                >
                  <button
                    className="min-w-0 flex-1 py-2 pl-3 pr-2 text-left text-[13px]"
                    onClick={() => selectSession(session)}
                    title={session.title}
                    type="button"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {isWhatsApp && (
                        <span className="inline-flex shrink-0 items-center justify-center rounded bg-emerald-500/15 p-0.5 text-emerald-300 ring-1 ring-emerald-500/40" title="WhatsApp conversation">
                          <WhatsAppIcon className="h-3 w-3" />
                        </span>
                      )}
                      <span className="truncate">{displayTitle}</span>
                    </span>
                    {session.connection_name && (
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium text-brand-300/80">
                        <Database size={10} className="shrink-0" /> {session.connection_name}
                      </span>
                    )}
                  </button>
                  {isDeleting ? (
                    <span className="flex items-center gap-1 pr-2">
                      <button
                        aria-label="Confirm delete"
                        className="grid h-8 w-8 place-items-center rounded-md bg-rose-600 text-white transition hover:bg-rose-500"
                        disabled={busySessionId !== null}
                        onClick={() => removeSession(session)}
                        type="button"
                      >
                        {busySessionId === session.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                      </button>
                      <button
                        aria-label="Keep chat"
                        className="grid h-8 w-8 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink"
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
                        className={`mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink ${
                          menu?.id === session.id ? "bg-white/10 text-ink opacity-100" : "opacity-50 group-hover:opacity-100"
                        }`}
                        data-chat-menu=""
                        onClick={(event) => toggleMenu(session.id, event.currentTarget)}
                        type="button"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menu?.id === session.id && (
                        <div
                          className={`absolute right-1.5 z-20 w-36 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lift ${
                            menu.up ? "bottom-8" : "top-8"
                          }`}
                          data-chat-menu=""
                          role="menu"
                        >
                          <button
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-soft transition hover:bg-white/5 hover:text-ink"
                            onClick={() => startRename(session)}
                            role="menuitem"
                            type="button"
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-rose-300 transition hover:bg-rose-500/10"
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

      <div className="mt-4 border-t border-line pt-3">
        {confirmingLogout ? (
          <div className="flex items-center gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={15} /> Confirm sign out
            </button>
            <button
              aria-label="Cancel sign out"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-white/10 hover:text-ink"
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
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-line">
        <LogoMark className="h-7 w-7" />
      </span>
      <div>
        <strong className="block text-sm font-bold tracking-tight text-ink">QueryMind</strong>
        <p className="text-[11px] text-ink-soft">Production console</p>
      </div>
    </div>
  );
}

function OrgChip({ name }: { name: string }) {
  return (
    <div className="mt-6 truncate rounded-xl border border-line bg-surface/60 px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-soft">Workspace</p>
      <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
    </div>
  );
}

function WhatsAppIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

