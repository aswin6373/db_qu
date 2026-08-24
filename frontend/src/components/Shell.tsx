import { useState } from "react";
import { Activity, BarChart3, Database, History, LogOut, MessageSquare, X } from "lucide-react";

type Props = {
  active: string;
  onActive: (value: string) => void;
  onLogout: () => void;
  orgName?: string;
  children: React.ReactNode;
};

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "connections", label: "Connection", icon: Database },
  { id: "chat", label: "AI Chat", icon: MessageSquare },
  { id: "history", label: "History", icon: History }
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
        <Brand />
        {orgName && <OrgChip name={orgName} />}
        <nav className="mt-6 flex-1 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${active === item.id ? "nav-item-active" : ""}`}
                onClick={() => onActive(item.id)}
                type="button"
              >
                <Icon size={17} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-white/10 pt-4">
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
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy p-5 shadow-lift">
            <div className="flex items-center justify-between">
              <Brand />
              <button aria-label="Close menu" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" onClick={() => setDrawerOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            {orgName && <OrgChip name={orgName} />}
            <nav className="mt-6 flex-1 space-y-1">
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${active === item.id ? "nav-item-active" : ""}`}
                    onClick={() => go(item.id)}
                    type="button"
                  >
                    <Icon size={17} /> {item.label}
                  </button>
                );
              })}
            </nav>
            <button className="btn-ghost w-full justify-start text-slate-300 hover:bg-white/5 hover:text-white" onClick={onLogout} type="button">
              <LogOut size={16} /> Sign out
            </button>
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
          <strong className="text-sm font-bold text-navy">{current?.label ?? "QueryMind"}</strong>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy text-teal-soft">
            <Activity size={15} />
          </span>
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="sticky top-0 z-10 hidden h-14 items-center border-b border-navy/10 bg-cream/75 backdrop-blur lg:flex">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-8">
            <p className="text-sm font-medium text-navy-soft">{current?.label}</p>
            {orgName && <p className="text-xs font-medium text-navy-soft/70">Workspace · {orgName}</p>}
          </div>
        </div>
        <div className="dot-grid mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
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
