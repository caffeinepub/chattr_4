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
import * as backendApi from "../backendApi";
import type { Category, Post, Thread } from "../backendApi";
import { detectMediaType, getSessionId } from "../store";
import { getAllLastVisits } from "../utils/localReactions";

// A thread is considered "live" if it had activity within the last 10 minutes
function isThreadLive(lastActivityNs: bigint): boolean {
  const lastActivityMs = backendApi.nsToMs(lastActivityNs);
  return Date.now() - lastActivityMs < 10 * 60 * 1000;
}

const CATEGORY_COLORS: Record<string, string> = {
  General: "#5d7fa3",
  Politics: "#c0392b",
  Science: "#16a085",
  Technology: "#27ae60",
  Entertainment: "#2980b9",
  Sports: "#e67e22",
  Gaming: "#9b59b6",
  Music: "#e91e8c",
  Art: "#8e44ad",
  Finance: "#f39c12",
  Education: "#1abc9c",
  Religion: "#795548",
  Random: "#7f8c8d",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? "#555";
}

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

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

interface ThreadCardProps {
  thread: Thread;
  categories: Category[];
  index: number;
  mentionCount: number;
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

/** Thumbnail displayed at the top of a thread card */
function ThreadCardThumbnail({ thread }: { thread: Thread }) {
  const type = thread.thumbnailType;
  const url = thread.thumbnailUrl;

  if (!type || type === "none" || !url) return null;

  if (type === "image" || type === "uploaded_image") {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 6,
          marginBottom: 8,
          overflow: "hidden",
          backgroundColor: "#111",
        }}
      >
        <img
          src={url}
          alt="Thread thumbnail"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    );
  }

  if (type === "youtube") {
    const videoId = extractYouTubeId(url);
    if (!videoId) return null;
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 6,
          marginBottom: 8,
          overflow: "hidden",
          backgroundColor: "#111",
          position: "relative",
        }}
      >
        <img
          src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
          alt="YouTube thumbnail"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        {/* Play button overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              backgroundColor: "rgba(255,0,0,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="white"
              aria-hidden="true"
            >
              <polygon points="3,2 10,6 3,10" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (type === "twitter") {
    return (
      <div
        style={{
          width: "100%",
          borderRadius: 6,
          marginBottom: 8,
          backgroundColor: "#111",
          border: "1px solid #2a2a2a",
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* X logo */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="white"
          style={{ flexShrink: 0, opacity: 0.7 }}
          aria-hidden="true"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span
          className="font-mono text-xs"
          style={{ color: "#888", lineHeight: 1.4 }}
        >
          X / Twitter post
        </span>
      </div>
    );
  }

  if (type === "twitch") {
    return (
      <div
        style={{
          width: "100%",
          borderRadius: 6,
          marginBottom: 8,
          backgroundColor: "#6441a422",
          border: "1px solid #6441a455",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="#9147ff"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
        </svg>
        <span className="font-mono text-xs" style={{ color: "#9147ff" }}>
          Twitch stream
        </span>
      </div>
    );
  }

  return null;
}

function ThreadCard({
  thread,
  categories,
  index,
  mentionCount,
  onClick,
}: ThreadCardProps) {
  const category = categories.find((c) => c.id === thread.categoryId);
  const live = isThreadLive(thread.lastActivity);
  const catColor = category ? getCategoryColor(category.name) : "#555";
  const createdAtMs = backendApi.nsToMs(thread.createdAt);

  return (
    <div
      className="thread-card cursor-pointer rounded relative"
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
      {/* Mention badge */}
      {mentionCount > 0 && (
        <div
          className="absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center rounded-full font-mono text-[10px] font-bold"
          style={{
            minWidth: 18,
            height: 18,
            backgroundColor: "#4a9e5c",
            color: "#0d0d0d",
            padding: "0 5px",
            boxShadow: "0 0 8px rgba(74,158,92,0.6)",
          }}
          data-ocid={`catalog.thread.mention_badge.${index}`}
        >
          {mentionCount}
        </div>
      )}

      {/* Thumbnail */}
      <ThreadCardThumbnail thread={thread} />

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
            {Number(thread.postCount)} posts
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: "#444" }}>
            {thread.creatorSessionId}
          </span>
          <span className="font-mono text-xs" style={{ color: "#333" }}>
            {timeAgo(createdAtMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Compute mention counts per thread for posts newer than last visit
function computeMentionCounts(
  posts: Post[],
  myUsername: string | null,
  lastVisits: Record<string, number>,
): Record<string, number> {
  if (!myUsername) return {};

  const counts: Record<string, number> = {};
  const lowerUsername = myUsername.toLowerCase();

  for (const post of posts) {
    const threadIdStr = String(post.threadId);
    const lastVisit = lastVisits[threadIdStr] ?? 0;
    const postMs = backendApi.nsToMs(post.createdAt);

    if (postMs <= lastVisit) continue;
    if (!post.content) continue;

    // Check for @username mention (case-insensitive)
    const mentionPattern = new RegExp(`@${lowerUsername}\\b`, "i");
    if (mentionPattern.test(post.content)) {
      counts[threadIdStr] = (counts[threadIdStr] ?? 0) + 1;
    }
  }

  return counts;
}

// ─── Tweet preview data ───────────────────────────────────────────
interface TweetPreview {
  authorName: string;
  text: string;
}

export default function CatalogPage() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<bigint | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>(
    {},
  );

  // Media attachment state
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<string>("none");
  const [newUploadedImage, setNewUploadedImage] = useState<string | null>(null);
  const [tweetPreview, setTweetPreview] = useState<TweetPreview | null>(null);
  const [tweetLoading, setTweetLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [cats, threadList, profiles, allPosts] = await Promise.all([
      backendApi.getCategories(),
      backendApi.getThreads(),
      backendApi.getAllProfiles(),
      backendApi.getAllPosts(),
    ]);
    setCategories(cats);
    setThreads(threadList.filter((t) => !t.isArchived && !t.isClosed));
    setLoading(false);

    // Get my username for mention detection
    const myProfile = profiles.find((p) => p.sessionId === sessionId);
    const username = myProfile?.username ?? null;

    // Compute mention badges
    const lastVisits = getAllLastVisits();
    const counts = computeMentionCounts(allPosts, username, lastVisits);
    setMentionCounts(counts);
  }, [sessionId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const filteredThreads =
    selectedCategory !== null
      ? threads.filter((t) => t.categoryId === selectedCategory)
      : threads;

  // Sort by lastActivity descending
  const sortedThreads = [...filteredThreads].sort((a, b) =>
    Number(b.lastActivity - a.lastActivity),
  );

  // Handle media URL input change
  function handleMediaUrlChange(url: string) {
    setNewMediaUrl(url);
    setNewUploadedImage(null);
    setTweetPreview(null);

    if (!url.trim()) {
      setNewMediaType("none");
      return;
    }

    const detected = detectMediaType(url);
    setNewMediaType(detected);

    if (detected === "twitter") {
      fetchTweetPreview(url);
    }
  }

  async function fetchTweetPreview(url: string) {
    setTweetLoading(true);
    setTweetPreview(null);
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
      const resp = await fetch(oembedUrl);
      if (!resp.ok) throw new Error("oEmbed failed");
      const data = await resp.json();
      // Extract plain text from HTML
      const div = document.createElement("div");
      div.innerHTML = data.html ?? "";
      const paragraphs = div.querySelectorAll("p");
      const rawText =
        paragraphs.length > 0
          ? (paragraphs[0].textContent ?? "")
          : (div.textContent ?? "");
      const trimmed = rawText.trim().slice(0, 100);
      setTweetPreview({
        authorName: data.author_name ?? "Twitter",
        text: trimmed,
      });
    } catch {
      setTweetPreview({
        authorName: "X / Twitter",
        text: "Tweet preview unavailable",
      });
    } finally {
      setTweetLoading(false);
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setNewUploadedImage(dataUrl);
      setNewMediaUrl("");
      setNewMediaType("uploaded_image");
      setTweetPreview(null);
    };
    reader.readAsDataURL(file);
  }

  function clearMedia() {
    setNewMediaUrl("");
    setNewMediaType("none");
    setNewUploadedImage(null);
    setTweetPreview(null);
    setTweetLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetDialog() {
    setNewTitle("");
    setNewCategoryId("");
    clearMedia();
  }

  async function handleCreateThread() {
    if (!newTitle.trim()) {
      toast.error("Thread title is required");
      return;
    }
    if (!newCategoryId) {
      toast.error("Please select a category");
      return;
    }
    setCreating(true);
    try {
      // Determine final thumbnail URL and type
      let thumbnailUrl: string | null = null;
      let thumbnailType = "none";

      if (newUploadedImage) {
        thumbnailUrl = newUploadedImage;
        thumbnailType = "uploaded_image";
      } else if (newMediaUrl.trim() && newMediaType !== "none") {
        thumbnailUrl = newMediaUrl.trim();
        thumbnailType = newMediaType;
      }

      const thread = await backendApi.createThread(
        newTitle.trim(),
        BigInt(newCategoryId),
        sessionId,
        thumbnailUrl,
        thumbnailType,
      );

      // Create the initial media post if there's an attachment
      if (thumbnailUrl && thumbnailType !== "none") {
        try {
          await backendApi.createPost(
            thread.id,
            sessionId,
            "",
            thumbnailUrl,
            thumbnailType,
          );
        } catch {
          // Non-fatal — thread was created; just log
          console.warn("Failed to create initial media post");
        }
      }

      toast.success("Thread created");
      setShowNewThread(false);
      resetDialog();
      await loadData();
    } catch {
      toast.error("Failed to create thread");
    } finally {
      setCreating(false);
    }
  }

  // Determine whether the media attachment section has content to preview
  const hasMedia =
    newUploadedImage !== null ||
    (newMediaUrl.trim() !== "" &&
      newMediaType !== "none" &&
      newMediaType !== "text" &&
      newMediaType !== "link");

  // Compute YouTube video ID for preview
  const youtubePreviewId =
    newMediaType === "youtube" ? extractYouTubeId(newMediaUrl) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-mono text-xl font-bold"
            style={{ color: "#e0e0e0" }}
          >
            /catalog/
          </h1>
          <p className="font-mono text-xs mt-0.5" style={{ color: "#444" }}>
            {loading ? "Loading…" : `${sortedThreads.length} active chats`}
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
              key={String(cat.id)}
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

      {/* Loading state */}
      {loading ? (
        <div
          className="text-center py-20"
          style={{ color: "#444" }}
          data-ocid="catalog.thread.loading_state"
        >
          <p className="font-mono text-sm">Loading threads…</p>
        </div>
      ) : sortedThreads.length === 0 ? (
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
              key={String(thread.id)}
              thread={thread}
              categories={categories}
              index={i + 1}
              mentionCount={mentionCounts[String(thread.id)] ?? 0}
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
      <Dialog
        open={showNewThread}
        onOpenChange={(open) => {
          setShowNewThread(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent
          style={{
            backgroundColor: "#1a1a1a",
            border: "1px solid #2a2a2a",
            color: "#e0e0e0",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
          data-ocid="new_thread.dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-mono" style={{ color: "#4a9e5c" }}>
              New Thread
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
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

            {/* Category */}
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
                      key={String(cat.id)}
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

            {/* ─── Media Attachment ─── */}
            <div>
              <div
                className="font-mono text-xs uppercase tracking-wider mb-1.5 block"
                style={{ color: "#888" }}
              >
                Media Attachment{" "}
                <span style={{ color: "#555", textTransform: "none" }}>
                  (optional)
                </span>
              </div>

              {/* URL input */}
              {!newUploadedImage && (
                <Input
                  placeholder="Paste image, YouTube, Twitch, or X/Twitter URL..."
                  value={newMediaUrl}
                  onChange={(e) => handleMediaUrlChange(e.target.value)}
                  className="font-mono text-sm mb-2"
                  style={{
                    backgroundColor: "#0d0d0d",
                    border: "1px solid #2a2a2a",
                    color: "#e0e0e0",
                  }}
                  data-ocid="new_thread.media_url_input"
                />
              )}

              {/* Upload button */}
              {!newUploadedImage && !newMediaUrl && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-mono text-xs"
                    style={{
                      backgroundColor: "#0d0d0d",
                      border: "1px solid #2a2a2a",
                      color: "#888",
                    }}
                    data-ocid="new_thread.upload_button"
                  >
                    ↑ Upload image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              )}

              {/* ─── Preview section ─── */}
              {hasMedia && (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 6,
                    border: "1px solid #2a2a2a",
                    padding: "8px",
                    backgroundColor: "#0d0d0d",
                    position: "relative",
                  }}
                >
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={clearMedia}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      background: "rgba(0,0,0,0.6)",
                      border: "none",
                      borderRadius: "50%",
                      width: 20,
                      height: 20,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#aaa",
                      fontSize: 11,
                      lineHeight: 1,
                      zIndex: 2,
                    }}
                    data-ocid="new_thread.media_remove_button"
                    aria-label="Remove media"
                  >
                    ✕
                  </button>

                  {/* Uploaded image preview */}
                  {newUploadedImage && (
                    <img
                      src={newUploadedImage}
                      alt="Upload preview"
                      style={{
                        maxHeight: 120,
                        maxWidth: "100%",
                        borderRadius: 4,
                        display: "block",
                        objectFit: "contain",
                      }}
                    />
                  )}

                  {/* URL-based image preview */}
                  {!newUploadedImage && newMediaType === "image" && (
                    <img
                      src={newMediaUrl}
                      alt="Media preview"
                      style={{
                        maxHeight: 120,
                        maxWidth: "100%",
                        borderRadius: 4,
                        display: "block",
                        objectFit: "contain",
                      }}
                    />
                  )}

                  {/* YouTube preview */}
                  {newMediaType === "youtube" && youtubePreviewId && (
                    <div
                      style={{ position: "relative", display: "inline-block" }}
                    >
                      <img
                        src={`https://img.youtube.com/vi/${youtubePreviewId}/mqdefault.jpg`}
                        alt="YouTube preview"
                        style={{
                          maxHeight: 120,
                          maxWidth: "100%",
                          borderRadius: 4,
                          display: "block",
                          objectFit: "cover",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(0,0,0,0.3)",
                          borderRadius: 4,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            backgroundColor: "rgba(255,0,0,0.85)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            fill="white"
                            aria-hidden="true"
                          >
                            <polygon points="3,2 10,6 3,10" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Twitch preview */}
                  {newMediaType === "twitch" && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: "#6441a422",
                        border: "1px solid #6441a455",
                        borderRadius: 4,
                        padding: "6px 10px",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="#9147ff"
                        aria-hidden="true"
                      >
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                      </svg>
                      <span
                        className="font-mono text-xs"
                        style={{ color: "#9147ff" }}
                      >
                        Twitch stream
                      </span>
                    </div>
                  )}

                  {/* Twitter/X preview */}
                  {newMediaType === "twitter" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        backgroundColor: "#111",
                        border: "1px solid #2a2a2a",
                        borderRadius: 4,
                        padding: "8px 10px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="white"
                          style={{ opacity: 0.7, flexShrink: 0 }}
                          aria-hidden="true"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        {tweetLoading ? (
                          <span
                            className="font-mono text-xs"
                            style={{ color: "#555" }}
                          >
                            Loading…
                          </span>
                        ) : (
                          <span
                            className="font-mono text-xs font-semibold"
                            style={{ color: "#aaa" }}
                          >
                            {tweetPreview?.authorName ?? "X / Twitter"}
                          </span>
                        )}
                      </div>
                      {!tweetLoading && tweetPreview?.text && (
                        <p
                          className="font-mono text-xs"
                          style={{
                            color: "#888",
                            lineHeight: 1.5,
                            margin: 0,
                          }}
                        >
                          {tweetPreview.text}
                          {tweetPreview.text.length >= 100 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowNewThread(false);
                resetDialog();
              }}
              className="font-mono text-xs"
              style={{ color: "#888" }}
              data-ocid="new_thread.cancel_button"
              disabled={creating}
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
              disabled={creating}
              data-ocid="new_thread.submit_button"
            >
              {creating ? "Creating…" : "Create Thread"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
