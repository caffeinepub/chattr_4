import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import * as backendApi from "../backendApi";
import type { Category, Thread, UserProfile } from "../backendApi";

function timeAgo(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Politics: "#c0392b",
  Art: "#8e44ad",
  Entertainment: "#2980b9",
  Technology: "#27ae60",
  Sports: "#e67e22",
  Random: "#7f8c8d",
};

interface ArchiveCardProps {
  thread: Thread;
  categories: Category[];
  profiles: UserProfile[];
  index: number;
  onClick: () => void;
}

function ArchiveCard({
  thread,
  categories,
  profiles,
  index,
  onClick,
}: ArchiveCardProps) {
  const category = categories.find((c) => c.id === thread.categoryId);
  const catColor = category
    ? (CATEGORY_COLORS[category.name] ?? "#9ca3af")
    : "#9ca3af";
  const lastActivityMs = backendApi.nsToMs(thread.lastActivity);
  const creatorProfile = profiles.find(
    (p) => p.sessionId === thread.creatorSessionId,
  );
  const creatorName = creatorProfile?.username ?? thread.creatorSessionId;

  return (
    <div
      className="thread-card cursor-pointer rounded"
      style={{
        backgroundColor: "#f8f9fa",
        border: "1px solid #222",
        padding: "12px",
        opacity: 0.8,
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      // biome-ignore lint/a11y/useSemanticElements: card component requires div container
      role="button"
      tabIndex={0}
      data-ocid={`archive.thread.item.${index}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-mono text-xs px-2 py-0.5 rounded"
          style={{
            backgroundColor: `${catColor}15`,
            color: `${catColor}aa`,
            border: `1px solid ${catColor}22`,
          }}
        >
          {category?.name ?? "Unknown"}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: "#f3f4f6",
              color: "#6b7280",
              border: "1px solid #33333366",
            }}
          >
            {thread.isArchived ? "ARCHIVED" : "CLOSED"}
          </span>
        </div>
      </div>

      <h3
        className="font-sans text-sm font-medium mb-3 leading-snug"
        style={{
          color: "#6b7280",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {thread.title}
      </h3>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs" style={{ color: "#9ca3af" }}>
          {Number(thread.postCount)} posts
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: "#9ca3af" }}>
            {creatorName}
          </span>
          <span className="font-mono text-xs" style={{ color: "#e5e7eb" }}>
            {timeAgo(lastActivityMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<Thread[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [cats, threads, allProfiles] = await Promise.all([
      backendApi.getCategories(),
      backendApi.getArchivedThreads(),
      backendApi.getAllProfiles(),
    ]);
    setCategories(cats);
    setArchivedThreads(threads);
    setProfiles(allProfiles);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered =
    selectedCategory !== null
      ? archivedThreads.filter((t) => t.categoryId === selectedCategory)
      : archivedThreads;

  const sorted = [...filtered].sort((a, b) =>
    Number(b.lastActivity - a.lastActivity),
  );

  // Only show categories that have at least one archived thread
  const categoriesWithThreads = categories.filter((cat) =>
    archivedThreads.some((t) => t.categoryId === cat.id),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="font-mono text-xl font-bold"
          style={{ color: "#111827" }}
        >
          /archive/
        </h1>
        <p className="font-mono text-xs mt-1" style={{ color: "#9ca3af" }}>
          {loading
            ? "Loading…"
            : `${sorted.length} archived threads — read-only`}
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          className="font-mono text-xs px-3 py-1.5 rounded uppercase tracking-wider transition-all"
          style={{
            backgroundColor: selectedCategory === null ? "#eff6ff" : "#f8f9fa",
            border: `1px solid ${selectedCategory === null ? "#2563eb" : "#e5e7eb"}`,
            color: selectedCategory === null ? "#2563eb" : "#6b7280",
          }}
          onClick={() => setSelectedCategory(null)}
          data-ocid="archive.category.tab"
        >
          All
        </button>
        {categoriesWithThreads.map((cat) => {
          const color = CATEGORY_COLORS[cat.name] ?? "#9ca3af";
          const active = selectedCategory === cat.id;
          return (
            <button
              type="button"
              key={String(cat.id)}
              className="font-mono text-xs px-3 py-1.5 rounded uppercase tracking-wider transition-all"
              style={{
                backgroundColor: active ? `${color}15` : "#f8f9fa",
                border: `1px solid ${active ? `${color}44` : "#e5e7eb"}`,
                color: active ? `${color}aa` : "#9ca3af",
              }}
              onClick={() => setSelectedCategory(cat.id)}
              data-ocid="archive.category.tab"
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Divider with archive warning */}
      <div
        className="flex items-center gap-3 mb-6 font-mono text-xs"
        style={{ color: "#9ca3af" }}
      >
        <div style={{ flex: 1, height: 1, backgroundColor: "#f3f4f6" }} />
        <span>ARCHIVED CONTENT — VIEWING ONLY</span>
        <div style={{ flex: 1, height: 1, backgroundColor: "#f3f4f6" }} />
      </div>

      {/* Thread list */}
      {loading ? (
        <div
          className="text-center py-20"
          style={{ color: "#9ca3af" }}
          data-ocid="archive.thread.loading_state"
        >
          <p className="font-mono text-sm">Loading archive…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="text-center py-20"
          style={{ color: "#9ca3af" }}
          data-ocid="archive.thread.empty_state"
        >
          <p className="font-mono text-sm">Archive is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
          {sorted.map((thread, i) => (
            <ArchiveCard
              key={String(thread.id)}
              thread={thread}
              categories={categories}
              profiles={profiles}
              index={i + 1}
              onClick={() =>
                navigate({
                  to: "/thread/$id",
                  params: { id: String(thread.id) },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
