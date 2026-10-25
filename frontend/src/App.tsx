import { useEffect, useState, type ReactNode } from "react";
import { Notice } from "./components/Cards";
import { Icon, type IconName } from "./components/Icon";
import { LoginScreen } from "./components/LoginScreen";
import { API_BASE_URL } from "./api";
import { DataContext, useAppData, useDataSource } from "./data";
import { clock } from "./format";
import { setMode, useMode } from "./mode";
import { CallHistory } from "./pages/CallHistory";
import { Incidents } from "./pages/Incidents";
import { Overview } from "./pages/Overview";
import { Responders } from "./pages/Responders";
import { Settings } from "./pages/Settings";
import { lastHref, navigate, useRoute, type Page } from "./router";

const NAV: { page: Page; label: string; icon: IconName }[] = [
  { page: "overview", label: "Overview", icon: "home" },
  { page: "incidents", label: "Incidents", icon: "bell" },
  { page: "responders", label: "Responders", icon: "users" },
  { page: "history", label: "Call history", icon: "clock" },
  { page: "settings", label: "Settings", icon: "settings" },
];

const TITLES: Record<Page, [string, string]> = {
  overview: ["Operations overview", "Your response network, at a glance."],
  incidents: ["Dispatch workspace", "Review, assign and track incidents."],
  responders: ["Responders", "Units by service and availability."],
  history: ["Call history", "Every intake call and its record."],
  settings: ["Settings", "Data source and workspace options."],
};

export default function App() {
  const mode = useMode();
  const [operator, setOperator] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("relay4.operator");
    } catch {
      return null;
    }
  });

  if (!operator) {
    return <LoginScreen onLogin={setOperator} />;
  }

  const logout = () => {
    try {
      sessionStorage.removeItem("relay4.operator");
    } catch {
      // Session storage may be unavailable; the in-memory state still logs out.
    }
    setOperator(null);
  };

  // Remount on mode change so no live state leaks into demo mode or the other way round.
  return <Root key={`${mode}:${operator}`} mode={mode} operator={operator} onLogout={logout} />;
}

function Root({ mode, operator, onLogout }: { mode: ReturnType<typeof useMode>; operator: string; onLogout: () => void }) {
  const data = useDataSource(mode);
  return (
    <DataContext.Provider value={data}>
      <Layout operator={operator} onLogout={onLogout} />
    </DataContext.Provider>
  );
}

function Layout({ operator, onLogout }: { operator: string; onLogout: () => void }) {
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, subtitle] = TITLES[route.page];

  // Move focus to the page heading on navigation so screen readers announce the new page.
  useEffect(() => {
    document.getElementById("page-title")?.focus({ preventScroll: true });
    document.title = `${title} · Relay4`;
  }, [route.page, title]);

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Skip to content
      </a>
      <aside className={`side${menuOpen ? " open" : ""}`}>
        <div className="side-top">
          <a className="logo" href="#/overview" aria-label="Relay4 overview">
            RELAY<span>4</span>
          </a>
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="side-nav" aria-label="Menu">
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        </div>
        <nav id="side-nav" aria-label="Main">
          {NAV.map((item) => (
            <a key={item.page} href={lastHref(item.page)} aria-current={route.page === item.page ? "page" : undefined} onClick={() => setMenuOpen(false)}>
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>
        <p className="side-foot">v{__APP_VERSION__}</p>
      </aside>

      <main id="main" tabIndex={-1}>
        <Header title={title} subtitle={subtitle} operator={operator} onLogout={onLogout} />
        <ModeBanner />
        {route.page === "overview" && <Overview />}
        {route.page === "incidents" && <Incidents />}
        {route.page === "responders" && <Responders />}
        {route.page === "history" && <CallHistory />}
        {route.page === "settings" && <Settings />}
      </main>
    </div>
  );
}

function Header({ title, subtitle, operator, onLogout }: { title: string; subtitle: string; operator: string; onLogout: () => void }) {
  return (
    <header className="page-head">
      <div>
        <h1 id="page-title" tabIndex={-1}>{title}</h1>
        <p className="page-sub">
          <span>{subtitle}</span>
        </p>
      </div>
      <div className="head-right">
        <button className="icon-btn" onClick={() => {
          navigate("incidents", { focus: "search" });
        }} aria-label="Search incidents">
          <Icon name="search" />
        </button>
        <div className="user">
          <span className="avatar" aria-hidden="true">{operator.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{operator}</strong>
            <span className="muted small">Operator</span>
          </span>
        </div>
        <button className="btn small" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

function ModeBanner() {
  const { mode, connection, lastSync, error } = useAppData();
  let notice: ReactNode = null;
  if (mode === "demo") {
    notice = (
      <Notice tone="demo" title="Demo mode: synthetic data" action={<button className="btn small" onClick={() => setMode("live")}>Switch to live backend</button>}>
        Incidents, units, positions, recordings and assignments are made up and stay in this browser. No responder is contacted.
      </Notice>
    );
  } else if (connection === "offline") {
    notice = (
      <Notice tone="error" title={`Can't reach the Relay4 backend at ${API_BASE_URL}`}>
        {error}. {lastSync ? `Showing data last received at ${clock(new Date(lastSync).toISOString())}.` : "No data received yet."} Retrying every 4 s.
      </Notice>
    );
  }
  return notice && <div className="banner">{notice}</div>;
}
