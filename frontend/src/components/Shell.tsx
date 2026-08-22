import { BarChart3, Database, History, LogOut, MessageSquare, ServerCog } from "lucide-react";

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
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-white p-5 md:block">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-forest text-white shadow-sm">
            <Database size={18} />
          </span>
          <div>
            <strong className="text-lg text-ink">QueryMind</strong>
            <p className="text-xs text-steel">Production console</p>
          </div>
        </div>
        <div className="mb-5 rounded-lg border border-line bg-paper p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ServerCog className="text-forest" size={16} />
            Local AI active
          </div>
          <p className="mt-1 text-xs leading-5 text-steel">Ollama Qwen routes natural language through validated SQL.</p>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition ${active === item.id ? "bg-mist text-forest" : "text-steel hover:bg-paper hover:text-ink"}`}
                onClick={() => onActive(item.id)}
                type="button"
                title={item.label}
              >
                <Icon size={17} /> {item.label}
              </button>
            );
          })}
        </nav>
        <button className="absolute bottom-5 left-5 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-steel hover:bg-paper hover:text-ink" onClick={onLogout} type="button">
          <LogOut size={17} /> Logout
        </button>
      </aside>
      <header className="sticky top-0 z-10 border-b border-line bg-white p-3 md:hidden">
        <div className="flex items-center justify-between">
          <strong>QueryMind</strong>
          <button className="rounded p-2" onClick={onLogout} title="Logout" type="button">
            <LogOut size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-md bg-paper p-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`grid h-10 place-items-center rounded-md ${active === item.id ? "bg-white text-forest shadow-sm" : "text-steel"}`}
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
      <main className="mx-auto max-w-7xl px-4 py-6 md:ml-72 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
