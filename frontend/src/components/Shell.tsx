import { BarChart3, Database, History, LogOut, MessageSquare } from "lucide-react";

type Props = {
  active: string;
  onActive: (value: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
};

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "connections", label: "Connections", icon: Database },
  { id: "chat", label: "AI Chat", icon: MessageSquare },
  { id: "history", label: "History", icon: History }
];

export function Shell({ active, onActive, onLogout, children }: Props) {
  return (
    <div className="min-h-screen bg-[#f7f9f8]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white p-4 md:block">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded bg-forest text-white">
            <Database size={18} />
          </span>
          <strong className="text-lg">QueryMind</strong>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm ${active === item.id ? "bg-mist text-forest" : "text-slate-700 hover:bg-slate-100"}`}
                onClick={() => onActive(item.id)}
                type="button"
                title={item.label}
              >
                <Icon size={17} /> {item.label}
              </button>
            );
          })}
        </nav>
        <button className="absolute bottom-4 left-4 flex items-center gap-2 rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={onLogout} type="button">
          <LogOut size={17} /> Logout
        </button>
      </aside>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white p-3 md:hidden">
        <div className="flex items-center justify-between">
          <strong>QueryMind</strong>
          <button className="rounded p-2" onClick={onLogout} title="Logout" type="button">
            <LogOut size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`grid h-10 place-items-center rounded ${active === item.id ? "bg-mist text-forest" : "text-slate-600"}`}
                onClick={() => onActive(item.id)}
                title={item.label}
                type="button"
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:ml-64 md:px-8">{children}</main>
    </div>
  );
}
