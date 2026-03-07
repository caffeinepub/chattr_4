import { Toaster } from "@/components/ui/sonner";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { seedCategories } from "./backendApi";
import AdminPage from "./pages/AdminPage";
import ArchivePage from "./pages/ArchivePage";
import CatalogPage from "./pages/CatalogPage";
import ThreadPage from "./pages/ThreadPage";
import { getSessionId } from "./store";

// ─── Header ───────────────────────────────────────────────────
function Header() {
  const state = useRouterState();
  const currentPath = state.location.pathname;
  const sessionId = getSessionId();

  const navLinks = [
    { to: "/" as const, label: "Catalog" },
    { to: "/archive" as const, label: "Archive" },
    { to: "/admin" as const, label: "Admin" },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: "#111111",
        borderBottomColor: "#2a2a2a",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
        {/* Site name */}
        <Link
          to="/"
          className="font-mono text-lg font-bold tracking-tight transition-colors"
          style={{ color: "#4a9e5c" }}
          data-ocid="nav.link"
        >
          Chattr
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-6">
          {navLinks.map((link) => {
            const active =
              currentPath === link.to ||
              (link.to !== "/" && currentPath.startsWith(link.to));
            return (
              <Link
                key={link.to}
                to={link.to}
                className="font-mono text-xs uppercase tracking-widest transition-colors"
                style={{
                  color: active ? "#4a9e5c" : "#888888",
                }}
                data-ocid="nav.link"
              >
                [ {link.label} ]
              </Link>
            );
          })}
        </nav>

        {/* Session ID */}
        <div className="font-mono text-xs" style={{ color: "#555" }}>
          ID: <span style={{ color: "#888" }}>{sessionId}</span>
        </div>
      </div>
    </header>
  );
}

// ─── Root Layout ──────────────────────────────────────────────
function RootLayout() {
  const state = useRouterState();
  const isThreadPage = state.location.pathname.startsWith("/thread/");

  return (
    <div
      className={
        isThreadPage ? "flex flex-col h-screen overflow-hidden" : "min-h-screen"
      }
      style={{ backgroundColor: "#0d0d0d", color: "#e0e0e0" }}
    >
      <Header />
      <main className={isThreadPage ? "flex-1 overflow-hidden" : ""}>
        <Outlet />
      </main>
      {!isThreadPage && (
        <footer
          className="border-t py-6 mt-12 text-center"
          style={{ borderColor: "#1a1a1a" }}
        >
          <p className="font-mono text-xs" style={{ color: "#444" }}>
            © {new Date().getFullYear()} Chattr. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors"
              style={{ color: "#555" }}
            >
              caffeine.ai
            </a>
          </p>
        </footer>
      )}
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
          },
        }}
      />
    </div>
  );
}

// ─── Routes ───────────────────────────────────────────────────
const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CatalogPage,
});

const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/thread/$id",
  component: ThreadPage,
});

const archiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/archive",
  component: ArchivePage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  threadRoute,
  archiveRoute,
  adminRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  // Fire-and-forget: seed backend categories on first load
  useEffect(() => {
    seedCategories();
  }, []);

  return <RouterProvider router={router} />;
}
