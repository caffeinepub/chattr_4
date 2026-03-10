// ─── BookmarksPanel — shows bookmarked threads and messages ────────
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import { Bookmark, ExternalLink, MessageSquare, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { Bookmark as BookmarkType, Post, Thread } from "../backendApi";

interface BookmarksPanelProps {
  sessionId: string;
  onClose: () => void;
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

export default function BookmarksPanel({
  sessionId,
  onClose,
}: BookmarksPanelProps) {
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const [bms, allThreads, allPosts] = await Promise.all([
        backendApi.getBookmarks(sessionId),
        backendApi.getAllThreads(),
        backendApi.getAllPosts(),
      ]);
      setBookmarks(bms);
      setThreads(allThreads);
      setPosts(allPosts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const threadBookmarks = bookmarks.filter((b) => b.targetType === "thread");
  const messageBookmarks = bookmarks.filter((b) => b.targetType === "message");

  async function handleRemove(bookmarkId: bigint) {
    try {
      await backendApi.removeBookmark(sessionId, bookmarkId);
      toast.success("Bookmark removed");
      await loadBookmarks();
    } catch {
      toast.error("Failed to remove bookmark");
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-8"
        data-ocid="bookmarks.loading_state"
      >
        <span className="font-mono text-xs" style={{ color: "#9ca3af" }}>
          Loading bookmarks…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Bookmark size={14} style={{ color: "#2563eb" }} />
        <span
          className="font-mono text-sm font-bold"
          style={{ color: "#111827" }}
        >
          Bookmarks
        </span>
      </div>

      <Tabs defaultValue="threads">
        <TabsList
          className="font-mono text-xs w-full"
          style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
        >
          <TabsTrigger
            value="threads"
            className="font-mono text-[10px] uppercase tracking-wider flex-1"
            data-ocid="bookmarks.threads_tab"
          >
            Chats ({threadBookmarks.length})
          </TabsTrigger>
          <TabsTrigger
            value="messages"
            className="font-mono text-[10px] uppercase tracking-wider flex-1"
            data-ocid="bookmarks.messages_tab"
          >
            Messages ({messageBookmarks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="threads" className="mt-3">
          {threadBookmarks.length === 0 ? (
            <p
              className="font-mono text-xs text-center py-6"
              style={{ color: "#9ca3af" }}
              data-ocid="bookmarks.threads.empty_state"
            >
              No bookmarked chats yet.
            </p>
          ) : (
            <div className="space-y-2">
              {threadBookmarks.map((bm, i) => {
                const thread = threads.find(
                  (t) => String(t.id) === String(bm.targetId),
                );
                return (
                  <div
                    key={String(bm.id)}
                    className="flex items-start gap-2 rounded-lg p-2.5"
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                    data-ocid={`bookmarks.thread.item.${i + 1}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-mono text-xs font-medium truncate"
                        style={{ color: "#111827" }}
                      >
                        {thread?.title ?? `Chat #${String(bm.targetId)}`}
                      </p>
                      <p
                        className="font-mono text-[10px] mt-0.5"
                        style={{ color: "#9ca3af" }}
                      >
                        Saved {timeAgo(backendApi.nsToMs(bm.createdAt))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigate({
                          to: "/thread/$id",
                          params: { id: String(bm.targetId) },
                        });
                        onClose();
                      }}
                      className="p-1 rounded transition-colors hover:bg-black/5"
                      style={{ color: "#2563eb" }}
                      aria-label="Open chat"
                      data-ocid={`bookmarks.thread.open_button.${i + 1}`}
                    >
                      <ExternalLink size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(bm.id)}
                      className="p-1 rounded transition-colors hover:bg-black/5"
                      style={{ color: "#9ca3af" }}
                      aria-label="Remove bookmark"
                      data-ocid={`bookmarks.thread.delete_button.${i + 1}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-3">
          {messageBookmarks.length === 0 ? (
            <p
              className="font-mono text-xs text-center py-6"
              style={{ color: "#9ca3af" }}
              data-ocid="bookmarks.messages.empty_state"
            >
              No bookmarked messages yet.
            </p>
          ) : (
            <div className="space-y-2">
              {messageBookmarks.map((bm, i) => {
                const post = posts.find(
                  (p) => String(p.id) === String(bm.targetId),
                );
                return (
                  <div
                    key={String(bm.id)}
                    className="flex items-start gap-2 rounded-lg p-2.5"
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                    data-ocid={`bookmarks.message.item.${i + 1}`}
                  >
                    <MessageSquare
                      size={12}
                      style={{ color: "#9ca3af", flexShrink: 0, marginTop: 2 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-mono text-[11px] line-clamp-2"
                        style={{ color: "#374151" }}
                      >
                        {post?.content
                          ? post.content.slice(0, 120)
                          : `[Media message #${String(bm.targetId)}]`}
                      </p>
                      <p
                        className="font-mono text-[10px] mt-0.5"
                        style={{ color: "#9ca3af" }}
                      >
                        Saved {timeAgo(backendApi.nsToMs(bm.createdAt))}
                      </p>
                    </div>
                    {post && (
                      <button
                        type="button"
                        onClick={() => {
                          navigate({
                            to: "/thread/$id",
                            params: { id: String(post.threadId) },
                          });
                          onClose();
                        }}
                        className="p-1 rounded transition-colors hover:bg-black/5"
                        style={{ color: "#2563eb" }}
                        aria-label="Open message in chat"
                        data-ocid={`bookmarks.message.open_button.${i + 1}`}
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(bm.id)}
                      className="p-1 rounded transition-colors hover:bg-black/5"
                      style={{ color: "#9ca3af" }}
                      aria-label="Remove bookmark"
                      data-ocid={`bookmarks.message.delete_button.${i + 1}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
