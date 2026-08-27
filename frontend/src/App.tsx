import { useEffect, useRef, useState } from "react";
import { ChatSessionsProvider } from "./components/ChatSessionsContext";
import { Onboarding } from "./components/Onboarding";
import { Shell } from "./components/Shell";
import { apiRequest } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { LandingPage } from "./pages/LandingPage";
import { Chat } from "./pages/Chat";
import { Changes } from "./pages/Changes";
import { Connections } from "./pages/Connections";
import { Dashboard } from "./pages/Dashboard";
import { Integrations } from "./pages/Integrations";
import { Members } from "./pages/Members";
import { Connection, CurrentUser, Dashboard as DashboardType, DatabaseSchema, SchemaInsights } from "./types/api";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("querymind_token") ?? "");
  const [unauthView, setUnauthView] = useState<"landing" | "login" | "register">("landing");
  const [active, setActive] = useState("dashboard");
  const [booted, setBooted] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingOrg, setOnboardingOrg] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dashboard, setDashboard] = useState<DashboardType | null>(null);
  const [schemas, setSchemas] = useState<Record<number, DatabaseSchema>>({});
  const [insights, setInsights] = useState<Record<number, SchemaInsights>>({});

  const isAdmin = user?.role === "admin";

  // Bumped on every identity change (login/logout/401). In-flight refreshes
  // from a previous session discard their results instead of writing another
  // workspace's data over the current one.
  const authGenerationRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let cancelled = false;
    apiRequest<CurrentUser>("/auth/me", {}, token)
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setBooted(true);
      return;
    }
    try {
      localStorage.setItem("querymind_token", token);
    } catch {
      // Storage can throw in private/Lockdown modes; the app still works,
      // sessions just won't survive a reload.
    }
    if (!onboarding) {
      refreshAll();
    } else {
      setBooted(true);
    }
  }, [token, onboarding]);

  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current !== active && active === "dashboard" && token && !onboarding) {
      refreshAll();
    }
    prevActive.current = active;
  }, [active, token, onboarding]);

  useEffect(() => {
    if (!token || onboarding) return;
    function handleVisible() {
      if (document.visibilityState === "visible") refreshDashboard();
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && active === "dashboard") refreshDashboard();
    }, 30_000);
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [token, onboarding, active]);

  useEffect(() => {
    function resetState() {
      localStorage.removeItem("querymind_token");
      setToken("");
      setUser(null);
      setDashboard(null);
      setConnections([]);
      setSchemas({});
      setInsights({});
      setActive("dashboard");
    }

    function handleAuthExpired() {
      authGenerationRef.current += 1;
      resetState();
    }

    // Another tab logged out — drop the stale session here too.
    function handleStorage(event: StorageEvent) {
      if (event.key === "querymind_token" && event.newValue === null) {
        handleAuthExpired();
      }
    }

    window.addEventListener("querymind:auth-expired", handleAuthExpired);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("querymind:auth-expired", handleAuthExpired);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  async function refreshDashboard() {
    const generation = authGenerationRef.current;
    const currentToken = token;
    if (!currentToken) return;
    const dashboardData = await apiRequest<DashboardType>("/organizations/dashboard", {}, currentToken).catch(() => null);
    if (authGenerationRef.current !== generation) return;
    if (dashboardData) {
      setDashboard(dashboardData);
    }
  }

  async function refreshAll() {
    const generation = authGenerationRef.current;
    const currentToken = token;
    if (!currentToken) return;
    try {
      const [connectionData] = await Promise.all([
        apiRequest<Connection[]>("/connections", {}, currentToken).catch(() => []),
        refreshDashboard()
      ]);
      if (authGenerationRef.current !== generation) return;
      setConnections(connectionData);
      if (connectionData.length === 0) {
        setSchemas({});
        setInsights({});
        return;
      }
      const schemaEntries = await Promise.all(
        connectionData.map(async (connection) => {
          const schema = await apiRequest<DatabaseSchema>(`/connections/${connection.id}/schema`, {}, currentToken).catch(() => null);
          return [connection.id, schema] as const;
        })
      );
      const insightEntries = await Promise.all(
        connectionData.map(async (connection) => {
          const insight = await apiRequest<SchemaInsights>(`/connections/${connection.id}/insights`, {}, currentToken).catch(() => null);
          return [connection.id, insight] as const;
        })
      );
      if (authGenerationRef.current !== generation) return;
      setSchemas(Object.fromEntries(schemaEntries.filter(([, schema]) => schema !== null)) as Record<number, DatabaseSchema>);
      setInsights(Object.fromEntries(insightEntries.filter(([, insight]) => insight !== null)) as Record<number, SchemaInsights>);
    } finally {
      setBooted(true);
    }
  }

  function logout() {
    authGenerationRef.current += 1;
    localStorage.removeItem("querymind_token");
    setUnauthView("landing");
    setToken("");
  }

  function handleAuth(newToken: string, options?: { onboard?: boolean; organizationName?: string }) {
    authGenerationRef.current += 1;
    setBooted(false);
    setOnboarding(Boolean(options?.onboard));
    setOnboardingOrg(options?.organizationName);
    setActive("dashboard");
    setToken(newToken);
  }

  function finishOnboarding() {
    setBooted(false);
    setOnboarding(false);
    setActive("dashboard");
  }

  if (!token) {
    if (unauthView === "login" || unauthView === "register") {
      return (
        <AuthPage
          initialMode={unauthView}
          onBack={() => setUnauthView("landing")}
          onToken={handleAuth}
        />
      );
    }
    return <LandingPage onNavigateAuth={(mode) => setUnauthView(mode)} />;
  }

  if (onboarding) {
    return (
      <Onboarding
        onComplete={finishOnboarding}
        organizationName={onboardingOrg}
        token={token}
      />
    );
  }

  if (!booted) {
    return <BootSplash />;
  }

  return (
    <ChatSessionsProvider token={token}>
      <Shell
        active={active}
        connections={connections}
        isAdmin={isAdmin}
        onActive={setActive}
        onLogout={logout}
        orgName={dashboard?.organization.name}
      >
        {active === "dashboard" && <Dashboard connections={connections} dashboard={dashboard} insights={insights} schemas={schemas} onOpenConnections={() => setActive("connections")} />}
        {active === "connections" && <Connections isAdmin={isAdmin} token={token} connections={connections} insights={insights} schemas={schemas} onRefresh={refreshAll} />}
        {active === "chat" && <Chat token={token} connections={connections} onActivity={refreshAll} onOpenConnections={() => setActive("connections")} />}
        {active === "changes" && <Changes token={token} />}
        {active === "integrations" && <Integrations isAdmin={isAdmin} token={token} />}
        {active === "members" && isAdmin && user && <Members currentUserId={user.id} token={token} />}
      </Shell>
    </ChatSessionsProvider>
  );
}

function BootSplash() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950">
      <div className="flex flex-col items-center gap-5">
        <span className="grid h-14 w-14 animate-pulse-soft place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-xl shadow-brand-600/30">
          <svg fill="none" height="26" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="26">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5V19A9 3 0 0 0 21 19V5" />
            <path d="M3 12A9 3 0 0 0 21 12" />
          </svg>
        </span>
        <p className="text-sm font-medium text-slate-400">Preparing your workspace…</p>
      </div>
    </div>
  );
}
