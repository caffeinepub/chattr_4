import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type Category,
  type Thread,
  createThread,
  getCategories,
  getPresenceCount,
  getThreads,
  isThreadLive,
} from "../store";

const CATEGORY_COLORS: Record<string, string> = {
  Politics: "#c0392b",
  Art: "#8e44ad",
  Entertainment: "#2980b9",
  Technology: "#27ae60",
  Sports: "#e67e22",
  Random: "#7f8c8d",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? "#555";
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Stable random user count per thread per page load
function useStableUserCounts(threads: Thread[]): Map<number, number> {
  const countsRef = useRef<Map<number, number>>(new Map());

  for (const t of threads) {
    if (!countsRef.current.has(t.id)) {
      const presence = getPresenceCount(t.id);
      const extra = Math.floor(Math.random() * 12);
      countsRef.current.set(t.id, presence + extra);
    }
  }

  return countsRef.current;
}

interface ThreadCardProps {
  thread: Thread;
  categories: Category[];
  userCounts: Map<number, number>;
  index: number;
  onClick: () => void;
}

function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className={live ? "animate-pulse-live" : ""}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: live ? "#4a9e5c" : "#444",
        boxShadow: live ? "0 0 6px #4a9e5c" : "none",
      }}
    />
  );
}

function ThreadCard({
  thread,
  categories,
  userCounts,
  index,
  onClick,
}: ThreadCardProps) {
  const category = categories.find((c) => c.id === thread.categoryId);
  const userCount =
    (userCounts.get(thread.id) ?? 0) + getPresenceCount(thread.id);
  const live = isThreadLive(thread.id) || userCount > 0;
  const catColor = category ? getCategoryColor(category.name) : "#555";

  return (
    <div
      className="thread-card cursor-pointer rounded"
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #2a2a2a",
        padding: "12px",
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      // biome-ignore lint/a11y/useSemanticElements: card component requires div container
      role="button"
      tabIndex={0}
      data-ocid={`catalog.thread.item.${index}`}
    >
      {/* Category + Live */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-mono text-xs px-2 py-0.5 rounded"
          style={{
            backgroundColor: `${catColor}22`,
            color: catColor,
            border: `1px solid ${catColor}44`,
          }}
        >
          {category?.name ?? "Unknown"}
        </span>
        <div className="flex items-center gap-1.5">
          <LiveDot live={live} />
          <span
            className="font-mono text-xs uppercase"
            style={{
              color: live ? "#4a9e5c" : "#444",
              letterSpacing: "0.08em",
            }}
          >
            {live ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3
        className="font-sans text-sm font-medium mb-3 leading-snug"
        style={{
          color: "#e0e0e0",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {thread.title}
      </h3>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs" style={{ color: "#555" }}>
            {thread.postCount} posts
          </span>
          <span className="font-mono text-xs" style={{ color: "#555" }}>
            {userCount} {userCount === 1 ? "user" : "users"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: "#444" }}>
            {thread.creatorDisplayId}
          </span>
          <span className="font-mono text-xs" style={{ color: "#333" }}>
            {timeAgo(thread.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");

  const loadData = useCallback(() => {
    setCategories(getCategories());
    setThreads(getThreads().filter((t) => !t.isArchived));
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const userCounts = useStableUserCounts(threads);

  const filteredThreads = selectedCategory
    ? threads.filter((t) => t.categoryId === selectedCategory)
    : threads;

  // Sort by lastActivity descending
  const sortedThreads = [...filteredThreads].sort(
    (a, b) => b.lastActivity - a.lastActivity,
  );

  function handleCreateThread() {
    if (!newTitle.trim()) {
      toast.error("Thread title is required");
      return;
    }
    if (!newCategoryId) {
      toast.error("Please select a category");
      return;
    }
    createThread(newTitle.trim(), Number.parseInt(newCategoryId));
    toast.success("Thread created");
    setShowNewThread(false);
    setNewTitle("");
    setNewCategoryId("");
    loadData();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-mono text-xl font-bold"
            style={{ color: "#e0e0e0" }}
          >
            /board/
          </h1>
          <p className="font-mono text-xs mt-0.5" style={{ color: "#444" }}>
            {sortedThreads.length} active threads
          </p>
        </div>
        <Button
          onClick={() => setShowNewThread(true)}
          className="font-mono text-xs uppercase tracking-wider"
          style={{
            backgroundColor: "#1a1a1a",
            border: "1px solid #4a9e5c",
            color: "#4a9e5c",
          }}
          data-ocid="catalog.new_thread_button"
        >
          + New Thread
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          className="font-mono text-xs px-3 py-1.5 rounded uppercase tracking-wider transition-all"
          style={{
            backgroundColor:
              selectedCategory === null ? "#4a9e5c22" : "#1a1a1a",
            border: `1px solid ${selectedCategory === null ? "#4a9e5c" : "#2a2a2a"}`,
            color: selectedCategory === null ? "#4a9e5c" : "#888",
          }}
          onClick={() => setSelectedCategory(null)}
          data-ocid="catalog.category.tab"
        >
          All
        </button>
        {categories.map((cat) => {
          const color = getCategoryColor(cat.name);
          const active = selectedCategory === cat.id;
          return (
            <button
              type="button"
              key={cat.id}
              className="font-mono text-xs px-3 py-1.5 rounded uppercase tracking-wider transition-all"
              style={{
                backgroundColor: active ? `${color}22` : "#1a1a1a",
                border: `1px solid ${active ? color : "#2a2a2a"}`,
                color: active ? color : "#888",
              }}
              onClick={() => setSelectedCategory(cat.id)}
              data-ocid="catalog.category.tab"
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Thread grid */}
      {sortedThreads.length === 0 ? (
        <div
          className="text-center py-20"
          style={{ color: "#444" }}
          data-ocid="catalog.thread.empty_state"
        >
          <p className="font-mono text-sm">No threads found.</p>
          <p className="font-mono text-xs mt-2">Be the first to start one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedThreads.map((thread, i) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              categories={categories}
              userCounts={userCounts}
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

      {/* New Thread Dialog */}
      <Dialog open={showNewThread} onOpenChange={setShowNewThread}>
        <DialogContent
          style={{
            backgroundColor: "#1a1a1a",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
          }}
          data-ocid="new_thread.dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-mono" style={{ color: "#4a9e5c" }}>
              New Thread
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label
                htmlFor="new-thread-title"
                className="font-mono text-xs uppercase tracking-wider mb-1.5 block"
                style={{ color: "#888" }}
              >
                Title
              </label>
              <Input
                id="new-thread-title"
                placeholder="Thread title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateThread()}
                className="font-mono text-sm"
                style={{
                  backgroundColor: "#0d0d0d",
                  border: "1px solid #2a2a2a",
                  color: "#e0e0e0",
                }}
                data-ocid="new_thread.title_input"
              />
            </div>

            <div>
              <label
                htmlFor="new-thread-category"
                className="font-mono text-xs uppercase tracking-wider mb-1.5 block"
                style={{ color: "#888" }}
              >
                Category
              </label>
              <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                <SelectTrigger
                  className="font-mono text-sm"
                  style={{
                    backgroundColor: "#0d0d0d",
                    border: "1px solid #2a2a2a",
                    color: newCategoryId ? "#e0e0e0" : "#555",
                  }}
                  data-ocid="new_thread.category_select"
                >
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                  }}
                >
                  {categories.map((cat) => (
                    <SelectItem
                      key={cat.id}
                      value={String(cat.id)}
                      className="font-mono text-sm"
                      style={{ color: "#e0e0e0" }}
                    >
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewThread(false)}
              className="font-mono text-xs"
              style={{ color: "#888" }}
              data-ocid="new_thread.cancel_button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateThread}
              className="font-mono text-xs uppercase tracking-wider"
              style={{
                backgroundColor: "#4a9e5c",
                color: "#0d0d0d",
              }}
              data-ocid="new_thread.submit_button"
            >
              Create Thread
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
