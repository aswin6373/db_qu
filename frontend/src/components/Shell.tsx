import { useEffect, useMemo, useState } from "react";
import { Activity, Check, Database, FilePenLine, Loader2, LogOut, MessageSquarePlus, MoreHorizontal, Pencil, Plug, Plus, Search, Trash2, Users, X, type LucideIcon } from "lucide-react";
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col bg-side p-3 lg:flex">
        <SidebarContent
          active={active}
          connections={connections}
          isAdmin={isAdmin}
          orgName={orgName}
          onLogout={onLogout}
          onNavigate={onActive}
          onRequestNewChat={requestNewChat}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu" ref={drawerRef}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-side p-3 shadow-lift">
            <SidebarContent
              active={active}
              connections={connections}
              isAdmin={isAdmin}
              orgName={orgName}
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
      <header className="sticky top-0 z-20 border-b border-line bg-canvas lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <button aria-label="Open menu" className="btn-ghost -ml-2" onClick={() => setDrawerOpen(true)} type="button">
            <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
          <strong className="font-display text-[17px] font-semibold text-ink">
            {active === "chat" ? "QueryMind" : PAGE_TITLES[active] ?? "QueryMind"}
          </strong>
          <div className="w-8" />
        </div>
      </header>

      <main className="lg:pl-[272px]">
        {active === "chat" ? <div className="app-frame">{children}</div> : children}
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

  function go(id: string) {
    onActive(id);
    setDrawerOpen(false);
  }
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  connections: "Connections",
  changes: "Changes",
  integrations: "Integrations",
  members: "Members"
};

function SidebarContent({
  active,
  connections,
  isAdmin,
  orgName,
  onLogout,
  onNavigate,
  onRequestNewChat
}: {
  active: string;
  connections: Connection[];
  isAdmin: boolean;
  orgName?: string;
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
  const [search, setSearch] = useState("");

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

  const nav: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: Activity },
    { id: "connections", label: "Connections", icon: Database },
    { id: "changes", label: "Changes", icon: FilePenLine },
    { id: "integrations", label: "Integrations", icon: Plug },
    ...(isAdmin ? [{ id: "members", label: "Members", icon: Users as LucideIcon }] : [])
  ];

  // Chats whose title matches the search box, newest first.
  const visibleSessions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? sessions.filter((session) => session.title.toLowerCase().includes(needle))
      : sessions;
    return [...list].sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime());
  }, [sessions, search]);

  const groups = useMemo(() => groupByRecency(visibleSessions), [visibleSessions]);

  return (
    <>
      {/* Brand */}
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <button className="flex items-center gap-2.5 rounded-lg py-1 text-left" onClick={() => onNavigate("dashboard")} type="button">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/15">
            <LogoMark className="h-5 w-5" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">QueryMind</span>
        </button>
      </div>

      {/* New chat */}
      <button
        className="focus-ring mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-ink transition hover:bg-white/5"
        onClick={onRequestNewChat}
        type="button"
      >
        <Plus size={16} className="text-ink-soft" /> New chat
      </button>

      {/* Search */}
      <label className="relative mt-2 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
        <input
          className="h-9 w-full rounded-lg border border-transparent bg-white/5 pl-9 pr-3 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-line-strong focus:bg-white/[0.07]"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats"
          value={search}
        />
      </label>

      <nav className="mt-3 space-y-0.5">
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

      {/* Chat history */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Chats</p>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 pr-0.5" onScroll={() => setMenu(null)}>
          {isLoading ? (
            <div className="flex justify-center py-8 text-ink-faint">
              <Loader2 className="animate-spin" size={18} />
            </div>
          ) : visibleSessions.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs leading-5 text-ink-faint">
              {search ? "No chats match that search." : "No chats yet. Start one above."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                {group.label && <p className="px-3 pb-1 text-[11px] font-medium text-ink-faint">{group.label}</p>}
                <div className="space-y-0.5">
                  {group.items.map((session) => {
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
                            className="h-8 w-full rounded-lg border border-line-strong bg-white/[0.06] px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
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
                          isActive ? "bg-white/10 text-ink" : "text-ink-soft hover:bg-white/5 hover:text-ink"
                        } ${isDeleting ? "!bg-rose-500/10 !text-rose-300" : ""}`}
                        key={session.id}
                      >
                        <button
                          className="min-w-0 flex-1 py-1.5 pl-3 pr-2 text-left text-[13px]"
                          onClick={() => selectSession(session)}
                          title={session.title}
                          type="button"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            {isWhatsApp && (
                              <span className="inline-flex shrink-0 items-center justify-center rounded bg-emerald-500/15 p-0.5 text-emerald-300 ring-1 ring-emerald-500/25" title="WhatsApp conversation">
                                <WhatsAppIcon className="h-3 w-3" />
                              </span>
                            )}
                            <span className="truncate">{displayTitle}</span>
                          </span>
                        </button>
                        {isDeleting ? (
                          <span className="flex items-center gap-1 pr-2">
                            <button
                              aria-label="Confirm delete"
                              className="grid h-7 w-7 place-items-center rounded-md bg-rose-500 text-white transition hover:bg-rose-400"
                              disabled={busySessionId !== null}
                              onClick={() => removeSession(session)}
                              type="button"
                            >
                              {busySessionId === session.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                            </button>
                            <button
                              aria-label="Keep chat"
                              className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink"
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
                              className={`mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink ${
                                menu?.id === session.id ? "bg-white/10 text-ink opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}
                              data-chat-menu=""
                              onClick={(event) => toggleMenu(session.id, event.currentTarget)}
                              type="button"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {menu?.id === session.id && (
                              <div
                                className={`absolute right-1.5 z-20 w-36 overflow-hidden rounded-lg border border-line-strong bg-raise py-1 shadow-lift ${
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
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom: workspace + sign out */}
      <div className="mt-3 border-t border-line pt-3">
        {confirmingLogout ? (
          <div className="flex items-center gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-400"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={15} /> Sign out
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
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 rounded-lg px-2 py-1.5">
              {orgName && (
                <>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Workspace</p>
                  <p className="truncate text-[13px] font-medium text-ink">{orgName}</p>
                </>
              )}
            </div>
            <button
              aria-label="Sign out"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-white/10 hover:text-ink"
              onClick={() => setConfirmingLogout(true)}
              title="Sign out"
              type="button"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* Bucket sessions the way chat apps do: Today, Yesterday, the last week, then
   everything older. Sessions without timestamps land in Older. */
function groupByRecency(sessions: ChatSession[]): Array<{ label: string; items: ChatSession[] }> {
  const buckets: Record<string, ChatSession[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const session of sessions) {
    const time = new Date(session.updated_at ?? session.created_at ?? 0).getTime();
    if (!time) {
      buckets.Older.push(session);
    } else if (time >= startOfToday) {
      buckets.Today.push(session);
    } else if (time >= startOfToday - 86_400_000) {
      buckets.Yesterday.push(session);
    } else if (time >= startOfToday - 7 * 86_400_000) {
      buckets["Previous 7 days"].push(session);
    } else {
      buckets.Older.push(session);
    }
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function WhatsAppIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}
