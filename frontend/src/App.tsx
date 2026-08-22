import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { Shell } from "./components/Shell";
import { apiRequest } from "./lib/api";
import { Chat } from "./pages/Chat";
import { Connections } from "./pages/Connections";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Connection, Dashboard as DashboardType } from "./types/api";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("querymind_token") ?? "");
  const [active, setActive] = useState("dashboard");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dashboard, setDashboard] = useState<DashboardType | null>(null);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem("querymind_token", token);
    refreshAll();
  }, [token]);

  async function refreshAll() {
    if (!token) return;
    const [connectionData, dashboardData] = await Promise.all([
      apiRequest<Connection[]>("/connections", {}, token).catch(() => []),
      apiRequest<DashboardType>("/organizations/dashboard", {}, token).catch(() => null)
    ]);
    setConnections(connectionData);
    setDashboard(dashboardData);
  }

  function logout() {
    localStorage.removeItem("querymind_token");
    setToken("");
  }

  if (!token) {
    return <AuthPanel onToken={setToken} />;
  }

  return (
    <Shell active={active} onActive={setActive} onLogout={logout}>
      {active === "dashboard" && <Dashboard dashboard={dashboard} />}
      {active === "connections" && <Connections token={token} connections={connections} onRefresh={refreshAll} />}
      {active === "chat" && <Chat token={token} connections={connections} onActivity={refreshAll} />}
      {active === "history" && <History dashboard={dashboard} />}
    </Shell>
  );
}
