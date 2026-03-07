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
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { syncCategoriesToCanonical } from "./backendApi";
import type { UserProfile } from "./backendApi";
import * as backendApi from "./backendApi";
import OnboardingModal from "./components/OnboardingModal";
import SettingsModal from "./components/SettingsModal";
import AdminPage from "./pages/AdminPage";
import ArchivePage from "./pages/ArchivePage";
import CatalogPage from "./pages/CatalogPage";
import ThreadPage from "./pages/ThreadPage";
import { getSessionId, isOnboarded } from "./store";
import { generatePixelAvatar } from "./utils/pixelAvatar";

// ─── Header ───────────────────────────────────────────────────
function Header({
  profile,
  sessionId,
  onProfileUpdated,
}: {
  profile: UserProfile | null;
  sessionId: string;
  onProfileUpdated: (p: UserProfile) => void;
}) {
  const state = useRouterState();
  const currentPath = state.location.pathname;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const avatarSrc = profile?.avatarUrl ?? generatePixelAvatar(sessionId, 28);

  const navLinks = [
    { to: "/" as const, label: "Catalog" },
    { to: "/archive" as const, label: "Archive" },
  ];

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          backgroundColor: "#111111",
          borderBottomColor: "#2a2a2a",
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-2">
          {/* Site name */}
          <Link
            to="/"
            className="font-mono text-base sm:text-lg font-bold tracking-tight transition-colors shrink-0"
            style={{ color: "#4a9e5c" }}
            data-ocid="nav.link"
          >
            chattr
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-4 sm:gap-5 overflow-hidden">
            {navLinks.map((link) => {
              const active =
                currentPath === link.to ||
                (link.to !== "/" && currentPath.startsWith(link.to));
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="font-mono text-xs uppercase tracking-widest transition-colors whitespace-nowrap"
                  style={{
                    color: active ? "#4a9e5c" : "#888888",
                  }}
                  data-ocid="nav.link"
                >
                  <span className="hidden sm:inline">[ {link.label} ]</span>
                  <span className="sm:hidden">{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User identity */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Avatar */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: visual only */}
            <img
              src={avatarSrc}
              alt={profile?.username ?? sessionId}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid #2a2a2a",
                cursor: "pointer",
                flexShrink: 0,
              }}
              onClick={() => setSettingsOpen(true)}
              data-ocid="header.avatar"
            />

            {/* Username */}
            <span
              className="font-mono text-xs hidden sm:block"
              style={{ color: "#888" }}
              data-ocid="header.username"
            >
              {profile?.username ?? sessionId}
            </span>

            {/* Settings gear */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded transition-colors hover:bg-white/5"
              style={{ color: "#555" }}
              aria-label="Open settings"
              data-ocid="header.settings_open_modal_button"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Settings modal */}
      {profile && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          sessionId={sessionId}
          currentProfile={profile}
          onProfileUpdated={(p) => {
            onProfileUpdated(p);
            setSettingsOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─── Root Layout ──────────────────────────────────────────────
function RootLayout() {
  const state = useRouterState();
  const isThreadPage = state.location.pathname.startsWith("/thread/");
  const sessionId = getSessionId();

  const [showOnboarding, setShowOnboarding] = useState(!isOnboarded());
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Load profile from backend on mount (after onboarding is done)
  useEffect(() => {
    if (isOnboarded()) {
      backendApi.getProfile(sessionId).then((p) => {
        if (p) setProfile(p);
      });
    }
  }, [sessionId]);

  function handleOnboardingComplete(p: UserProfile) {
    setProfile(p);
    setShowOnboarding(false);
  }

  return (
    <div
      className={
        isThreadPage ? "flex flex-col overflow-hidden" : "min-h-screen"
      }
      style={{
        backgroundColor: "#0d0d0d",
        color: "#e0e0e0",
        ...(isThreadPage ? { height: "100dvh" } : {}),
      }}
    >
      {/* Forced onboarding modal — blocks all navigation */}
      {showOnboarding && (
        <OnboardingModal
          sessionId={sessionId}
          onComplete={handleOnboardingComplete}
        />
      )}

      <Header
        profile={profile}
        sessionId={sessionId}
        onProfileUpdated={setProfile}
      />
      <main
        className={
          isThreadPage ? "flex-1 overflow-hidden min-h-0 flex flex-col" : ""
        }
      >
        <Outlet />
      </main>
      {!isThreadPage && (
        <footer
          className="border-t py-6 mt-12 text-center space-y-2"
          style={{ borderColor: "#1a1a1a" }}
        >
          <p className="font-mono text-xs" style={{ color: "#444" }}>
            <Link
              to="/admin"
              className="transition-colors hover:opacity-70"
              style={{ color: "#555" }}
              data-ocid="footer.admin.link"
            >
              Admin
            </Link>
          </p>
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
  // Fire-and-forget: sync backend categories to canonical list on first load
  useEffect(() => {
    syncCategoriesToCanonical();
  }, []);

  return <RouterProvider router={router} />;
}
