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
import LevelBadge from "./components/LevelBadge";
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
          backgroundColor: "#f8f9fa",
          borderBottomColor: "#e5e7eb",
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-2">
          {/* Site name */}
          <Link
            to="/"
            className="transition-colors shrink-0"
            style={{
              fontFamily: "'Jersey 10', monospace",
              fontSize: "2.25rem",
              fontWeight: "normal",
              letterSpacing: 0,
              color: "#2563eb",
              lineHeight: 1,
            }}
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
                    color: active ? "#2563eb" : "#6b7280",
                  }}
                  data-ocid="nav.link"
                >
                  <span className="hidden sm:inline">[ {link.label} ]</span>
                  <span className="sm:hidden">[ {link.label} ]</span>
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
                width: 34,
                height: 34,
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid #e5e7eb",
                cursor: "pointer",
                flexShrink: 0,
              }}
              onClick={() => setSettingsOpen(true)}
              data-ocid="header.avatar"
            />

            {/* Username + Level Badge */}
            <div className="hidden sm:flex items-center gap-1.5">
              <span
                className="font-mono text-xs"
                style={{ color: "#6b7280" }}
                data-ocid="header.username"
              >
                {profile?.username ?? sessionId}
              </span>
              {profile?.level && <LevelBadge level={profile.level} />}
            </div>

            {/* Settings gear */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded transition-colors hover:bg-black/5"
              style={{ color: "#9ca3af" }}
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
      // Award daily activity points
      backendApi.checkDailyActivity(sessionId).then((p) => {
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
        backgroundColor: "#ffffff",
        color: "#111827",
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
          style={{ borderColor: "#f3f4f6" }}
        >
          <p className="font-mono text-xs" style={{ color: "#9ca3af" }}>
            <Link
              to="/admin"
              className="transition-colors hover:opacity-70"
              style={{ color: "#9ca3af" }}
              data-ocid="footer.admin.link"
            >
              Admin
            </Link>
          </p>
          <p className="font-mono text-xs" style={{ color: "#9ca3af" }}>
            © {new Date().getFullYear()} Chattr. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors"
              style={{ color: "#9ca3af" }}
            >
              caffeine.ai
            </a>
          </p>
        </footer>
      )}
      <Toaster
        theme="light"
        toastOptions={{
          style: {
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            color: "#111827",
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
