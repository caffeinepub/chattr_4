import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CornerUpLeft,
  Film,
  Image,
  ImagePlus,
  Link2,
  Lock,
  SendHorizontal,
  Tv2,
  Twitter,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { Category, Post, Thread, UserProfile } from "../backendApi";
import {
  type MediaType,
  detectMediaType,
  getSessionId,
  isThreadLive,
  joinThread,
  leaveThread,
} from "../store";
import {
  addReaction,
  getReactionCounts,
  getReactions,
  getReplyMap,
  hasReaction,
  recordThreadVisit,
  removeReaction,
  storeReply,
} from "../utils/localReactions";
import { generatePixelAvatar } from "../utils/pixelAvatar";

// TypeScript declaration for Twitter widgets
declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (el?: HTMLElement) => Promise<HTMLElement[]>;
      };
    };
  }
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👎"] as const;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatTime(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

function extractTwitchChannel(url: string): string | null {
  const match = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  return match ? match[1] : null;
}

function truncateUrl(url: string, max = 48): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max)}…`;
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s]+)/i);
  return match ? match[1] : null;
}

function scrollToPost(postId: string): void {
  document
    .getElementById(`post-${postId}`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Parse @mentions in content and render highlighted spans
function renderMentions(
  content: string,
  myUsername: string | undefined,
): React.ReactNode {
  // Split on @word boundaries — produces stable parts from immutable content
  const parts = content.split(/(@\w+)/g).map((part, i) => ({
    text: part,
    uid: `${i}-${part}`,
  }));

  return parts.map(({ text, uid }) => {
    if (text.startsWith("@")) {
      const mentioned = text.slice(1);
      if (myUsername && mentioned.toLowerCase() === myUsername.toLowerCase()) {
        return (
          <span key={uid} style={{ color: "#4a9e5c", fontWeight: 600 }}>
            {text}
          </span>
        );
      }
      return (
        <span key={uid} style={{ color: "#8ecf9a" }}>
          {text}
        </span>
      );
    }
    return <span key={uid}>{text}</span>;
  });
}

// ──────────────────────────────────────────────
// Image Lightbox
// ──────────────────────────────────────────────
function ImageLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
      data-ocid="thread.lightbox"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 rounded-full transition-colors"
        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
        aria-label="Close image"
        data-ocid="thread.lightbox_close_button"
      >
        <X size={18} />
      </button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation only */}
      <img
        src={src}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 8,
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// Inline Image Thumbnail
// ──────────────────────────────────────────────
function InlineImageThumbnail({
  src,
  index,
}: {
  src: string;
  index: number;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="mt-2 block"
        aria-label="View full image"
        data-ocid={`thread.image_thumbnail.${index}`}
      >
        <img
          src={src}
          alt="Attachment"
          style={{
            maxWidth: 220,
            maxHeight: 220,
            objectFit: "cover",
            borderRadius: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            cursor: "pointer",
            display: "block",
          }}
          loading="lazy"
        />
      </button>

      {lightboxOpen && (
        <ImageLightbox src={src} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

// ──────────────────────────────────────────────
// Twitter / X Embed (oEmbed approach)
// ──────────────────────────────────────────────
function TwitterEmbed({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<
    "loading" | "injected" | "ready" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }

    fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&theme=dark&omit_script=true`,
    )
      .then((res) => {
        if (!res.ok) throw new Error("oEmbed fetch failed");
        return res.json() as Promise<{ html: string }>;
      })
      .then((data) => {
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = data.html;
        setStatus("injected");

        function activateWidgets() {
          if (cancelled || !containerRef.current) return;
          const twttr = window.twttr;
          if (twttr?.widgets?.load) {
            twttr.widgets
              .load(containerRef.current)
              .then(() => {
                if (!cancelled) setStatus("ready");
              })
              .catch(() => {
                if (!cancelled) setStatus("ready");
              });
          } else {
            setTimeout(() => {
              if (!cancelled) setStatus("ready");
            }, 2500);
          }
        }

        const existingScript = document.getElementById(
          "twitter-widgets-script",
        );
        if (!existingScript) {
          const script = document.createElement("script");
          script.id = "twitter-widgets-script";
          script.src = "https://platform.twitter.com/widgets.js";
          script.async = true;
          script.charset = "utf-8";
          script.onload = activateWidgets;
          document.body.appendChild(script);
        } else {
          setTimeout(activateWidgets, 50);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (status === "error") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs break-all underline"
        style={{ color: "#4a9e5c" }}
      >
        {url}
      </a>
    );
  }

  return (
    <div style={{ maxWidth: 320, minWidth: 260 }}>
      {(status === "loading" || status === "injected") && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            backgroundColor: "#1a1a1a",
            border: "1px solid #2a2a2a",
          }}
        >
          <span className="font-mono text-[11px]" style={{ color: "#555" }}>
            Loading tweet…
          </span>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}

// ──────────────────────────────────────────────
// Media type icon + label
// ──────────────────────────────────────────────
function MediaTypeChip({ mediaType }: { mediaType: MediaType }) {
  const configs: Record<
    Exclude<MediaType, "text" | "uploaded_image">,
    { icon: React.ReactNode; label: string; color: string }
  > = {
    youtube: {
      icon: <Film size={11} />,
      label: "YouTube",
      color: "#ff4040",
    },
    twitch: {
      icon: <Tv2 size={11} />,
      label: "Twitch",
      color: "#9146ff",
    },
    twitter: {
      icon: <Twitter size={11} />,
      label: "X / Twitter",
      color: "#1da1f2",
    },
    image: {
      icon: <Image size={11} />,
      label: "Image",
      color: "#4a9e5c",
    },
    video: {
      icon: <Video size={11} />,
      label: "Video",
      color: "#e67e22",
    },
    link: {
      icon: <Link2 size={11} />,
      label: "Link",
      color: "#888",
    },
  };

  if (mediaType === "text" || mediaType === "uploaded_image") return null;
  const cfg = configs[mediaType];
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded"
      style={{
        color: cfg.color,
        backgroundColor: `${cfg.color}20`,
        border: `1px solid ${cfg.color}44`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ──────────────────────────────────────────────
// Full media embed (shown when expanded)
// ──────────────────────────────────────────────
function MediaEmbed({ url, mediaType }: { url: string; mediaType: MediaType }) {
  if (mediaType === "youtube") {
    const videoId = extractYouTubeId(url);
    if (!videoId)
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs break-all"
          style={{ color: "#4a9e5c" }}
        >
          {url}
        </a>
      );
    return (
      <div
        className="relative rounded overflow-hidden"
        style={{ paddingBottom: "56.25%", height: 0, maxWidth: 320 }}
      >
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          className="absolute inset-0 w-full h-full border-0 rounded"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video"
        />
      </div>
    );
  }

  if (mediaType === "twitch") {
    const channel = extractTwitchChannel(url);
    const parent = window.location.hostname;
    const src = channel
      ? `https://player.twitch.tv/?channel=${channel}&parent=${parent}&muted=true`
      : url;
    return (
      <div
        className="relative rounded overflow-hidden"
        style={{ paddingBottom: "56.25%", height: 0, maxWidth: 320 }}
      >
        <iframe
          src={src}
          className="absolute inset-0 w-full h-full border-0 rounded"
          allowFullScreen
          title="Twitch stream"
        />
      </div>
    );
  }

  if (mediaType === "twitter") {
    return <TwitterEmbed url={url} />;
  }

  if (mediaType === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user-provided video content
      <video
        src={url}
        controls
        className="rounded"
        style={{ maxWidth: 280, maxHeight: 240 }}
      />
    );
  }

  if (mediaType === "link") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs break-all underline"
        style={{ color: "#4a9e5c" }}
      >
        {url}
      </a>
    );
  }

  return null;
}

// ──────────────────────────────────────────────
// Collapsible media preview (Telegram-style)
// ──────────────────────────────────────────────
function CollapsibleMedia({
  url,
  mediaType,
  index,
  isOwn,
}: {
  url: string;
  mediaType: MediaType;
  index: number;
  isOwn: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 rounded px-2.5 py-1.5 transition-colors w-full text-left"
        style={{
          backgroundColor: isOwn ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.05)",
          border: isOwn
            ? "1px solid rgba(74,158,92,0.25)"
            : "1px solid rgba(255,255,255,0.08)",
          maxWidth: 300,
        }}
        data-ocid={`thread.media_expand_button.${index}`}
        aria-expanded={expanded}
      >
        <MediaTypeChip mediaType={mediaType} />
        <span
          className="font-mono text-[10px] flex-1 truncate"
          style={{ color: "#888" }}
        >
          {truncateUrl(url)}
        </span>
        <span style={{ color: "#666", flexShrink: 0 }}>
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2">
          <MediaEmbed url={url} mediaType={mediaType} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Reaction Row
// ──────────────────────────────────────────────
interface ReactionRowProps {
  threadId: string;
  postId: string;
  sessionId: string;
  isOwn: boolean;
  /** Force re-render from parent */
  reactionVersion: number;
  onReactionChange: () => void;
}

function ReactionRow({
  threadId,
  postId,
  sessionId,
  isOwn,
  onReactionChange,
}: ReactionRowProps) {
  const [showPicker, setShowPicker] = useState(false);
  const counts = getReactionCounts(threadId, postId);
  const activeEmojis = REACTION_EMOJIS.filter((e) => (counts[e] ?? 0) > 0);

  function toggleReaction(emoji: string) {
    if (hasReaction(threadId, postId, sessionId, emoji)) {
      removeReaction(threadId, postId, sessionId, emoji);
    } else {
      addReaction(threadId, postId, sessionId, emoji);
    }
    setShowPicker(false);
    onReactionChange();
  }

  return (
    <div
      className={`flex items-center gap-1 flex-wrap mt-1 ${isOwn ? "justify-end" : "justify-start"}`}
    >
      {/* Active reaction pills */}
      {activeEmojis.map((emoji) => {
        const count = counts[emoji] ?? 0;
        const mine = hasReaction(threadId, postId, sessionId, emoji);
        return (
          <button
            type="button"
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            className="inline-flex items-center gap-0.5 font-mono text-[11px] px-1.5 py-0.5 rounded-full transition-all"
            style={{
              backgroundColor: mine ? "#4a9e5c28" : "rgba(255,255,255,0.06)",
              border: mine
                ? "1px solid #4a9e5c66"
                : "1px solid rgba(255,255,255,0.1)",
              color: mine ? "#6abd7c" : "#aaa",
              lineHeight: 1,
            }}
            title={mine ? "Remove reaction" : "Add reaction"}
          >
            <span style={{ fontSize: 12 }}>{emoji}</span>
            <span>{count}</span>
          </button>
        );
      })}

      {/* Add reaction (+) button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="inline-flex items-center justify-center font-mono text-[11px] w-6 h-6 rounded-full transition-all"
          style={{
            backgroundColor: showPicker
              ? "#4a9e5c28"
              : "rgba(255,255,255,0.04)",
            border: showPicker
              ? "1px solid #4a9e5c66"
              : "1px solid rgba(255,255,255,0.08)",
            color: "#666",
          }}
          title="Add reaction"
          data-ocid="thread.reaction_picker_button"
        >
          +
        </button>

        {showPicker && (
          <div
            className="absolute z-30 flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-lg"
            style={{
              backgroundColor: "#1e1e1e",
              border: "1px solid #2a2a2a",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              bottom: "calc(100% + 6px)",
              ...(isOwn ? { right: 0 } : { left: 0 }),
              whiteSpace: "nowrap",
            }}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className="text-base leading-none p-1 rounded-lg transition-all hover:bg-white/10"
                style={{
                  filter: hasReaction(threadId, postId, sessionId, emoji)
                    ? "drop-shadow(0 0 4px #4a9e5c)"
                    : "none",
                }}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Chat bubble
// ──────────────────────────────────────────────
interface ChatBubbleProps {
  post: Post;
  index: number;
  profileMap: Map<string, UserProfile>;
  threadId: string;
  sessionId: string;
  myUsername: string | undefined;
  replyMap: Record<string, string>;
  posts: Post[];
  onReply: (post: Post) => void;
  reactionVersion: number;
  onReactionChange: () => void;
}

function ChatBubble({
  post,
  index,
  profileMap,
  threadId,
  sessionId,
  myUsername,
  replyMap,
  posts,
  onReply,
  reactionVersion,
  onReactionChange,
}: ChatBubbleProps) {
  const isOwn = post.authorSessionId === sessionId;
  const authorProfile = profileMap.get(post.authorSessionId);
  const displayName = authorProfile?.username ?? post.authorSessionId;
  const avatarSrc =
    authorProfile?.avatarUrl ?? generatePixelAvatar(post.authorSessionId, 28);
  const createdAtMs = backendApi.nsToMs(post.createdAt);
  const mediaType = post.mediaType as MediaType;
  const postIdStr = String(post.id);

  // Long press for mobile reply
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showReplyBtn, setShowReplyBtn] = useState(false);

  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => {
      setShowReplyBtn(true);
      setTimeout(() => setShowReplyBtn(false), 3000);
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  // Reply reference
  const replyToPostId = replyMap[postIdStr] ?? null;
  const replyToPost = replyToPostId
    ? posts.find((p) => String(p.id) === replyToPostId)
    : null;
  const replyAuthorProfile = replyToPost
    ? profileMap.get(replyToPost.authorSessionId)
    : null;
  const replyAuthorName =
    replyAuthorProfile?.username ?? replyToPost?.authorSessionId ?? "";

  if (post.isDeleted) {
    return (
      <div
        className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}
        data-ocid={`thread.post.item.${index}`}
        id={`post-${postIdStr}`}
      >
        <span
          className="font-mono text-xs italic px-3 py-1.5"
          style={{ color: "#444" }}
        >
          [deleted]
        </span>
      </div>
    );
  }

  const hasMedia = !!post.mediaUrl && mediaType !== "text";
  const isInlineImage =
    post.mediaUrl && (mediaType === "uploaded_image" || mediaType === "image");

  const avatarEl = (
    <img
      src={avatarSrc}
      alt={displayName}
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        alignSelf: "flex-end",
        marginBottom: 2,
      }}
    />
  );

  return (
    <div
      className={`flex items-end gap-2 mb-2 group ${isOwn ? "flex-row-reverse" : "flex-row"}`}
      data-ocid={`thread.post.item.${index}`}
      id={`post-${postIdStr}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Avatar */}
      {avatarEl}

      {/* Bubble + reactions column */}
      <div
        className={`flex flex-col max-w-[72%] sm:max-w-[60%] ${isOwn ? "items-end" : "items-start"}`}
      >
        {/* Bubble */}
        <div
          className="rounded-2xl px-3.5 py-2.5 w-full"
          style={
            isOwn
              ? {
                  backgroundColor: "#1a4d26",
                  borderBottomRightRadius: 4,
                  border: "1px solid #2d6b3a",
                }
              : {
                  backgroundColor: "#1e1e1e",
                  borderBottomLeftRadius: 4,
                  border: "1px solid #2a2a2a",
                }
          }
        >
          {/* Author label */}
          <div
            className={`font-mono text-[10px] font-bold mb-0.5 ${isOwn ? "text-right" : "text-left"}`}
            style={{ color: isOwn ? "#6abd7c" : "#4a9e5c" }}
          >
            {displayName}
            {isOwn && <span className="ml-1 opacity-60">(you)</span>}
          </div>

          {/* Reply quote */}
          {replyToPost && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: scroll action
            <div
              className="mb-2 rounded-lg px-2.5 py-1.5 cursor-pointer"
              style={{
                backgroundColor: isOwn
                  ? "rgba(0,0,0,0.25)"
                  : "rgba(255,255,255,0.05)",
                borderLeft: "3px solid #4a9e5c",
              }}
              onClick={() => scrollToPost(replyToPostId!)}
            >
              <p
                className="font-mono text-[10px] font-bold mb-0.5"
                style={{ color: "#4a9e5c" }}
              >
                {replyAuthorName}
              </p>
              <p
                className="font-mono text-[10px] leading-snug line-clamp-2"
                style={{ color: "#888" }}
              >
                {replyToPost.content
                  ? replyToPost.content.slice(0, 80)
                  : "[media]"}
              </p>
            </div>
          )}

          {/* Text content with @mention highlights */}
          {post.content && (
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap break-words"
              style={{ color: isOwn ? "#d4edda" : "#e0e0e0" }}
            >
              {renderMentions(post.content, myUsername)}
            </p>
          )}

          {/* Inline image thumbnail */}
          {isInlineImage && post.mediaUrl && (
            <InlineImageThumbnail src={post.mediaUrl} index={index} />
          )}

          {/* Collapsible media */}
          {hasMedia && !isInlineImage && (
            <CollapsibleMedia
              url={post.mediaUrl!}
              mediaType={mediaType}
              index={index}
              isOwn={isOwn}
            />
          )}

          {/* Timestamp + reply button row */}
          <div
            className={`flex items-center gap-1.5 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}
          >
            <span
              className="font-mono text-[10px]"
              style={{ color: isOwn ? "#6abd7c88" : "#555" }}
            >
              {formatTime(createdAtMs)} · {timeAgo(createdAtMs)}
            </span>
            {/* Desktop: hover-visible reply button */}
            <button
              type="button"
              onClick={() => onReply(post)}
              className={`p-0.5 rounded transition-all ${showReplyBtn ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{ color: "#4a9e5c" }}
              title="Reply"
              data-ocid="thread.reply_button"
            >
              <CornerUpLeft size={11} />
            </button>
          </div>
        </div>

        {/* Reaction row (below the bubble) */}
        <ReactionRow
          threadId={threadId}
          postId={postIdStr}
          sessionId={sessionId}
          isOwn={isOwn}
          reactionVersion={reactionVersion}
          onReactionChange={onReactionChange}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Inline Media Preview (shown above compose input while typing)
// ──────────────────────────────────────────────
function InlineMediaPreview({
  url,
  mediaType,
  onDismiss,
}: {
  url: string;
  mediaType: MediaType;
  onDismiss: () => void;
}) {
  if (!url || mediaType === "text" || mediaType === "uploaded_image")
    return null;

  let thumbnail: React.ReactNode = null;

  if (mediaType === "image") {
    thumbnail = (
      <img
        src={url}
        alt="Preview"
        style={{
          height: 48,
          width: 48,
          objectFit: "cover",
          borderRadius: 6,
          flexShrink: 0,
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  } else if (mediaType === "youtube") {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      thumbnail = (
        <img
          src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
          alt="YouTube thumbnail"
          style={{
            height: 48,
            width: 72,
            objectFit: "cover",
            borderRadius: 6,
            flexShrink: 0,
          }}
        />
      );
    } else {
      thumbnail = <MediaTypeChip mediaType={mediaType} />;
    }
  } else {
    thumbnail = <MediaTypeChip mediaType={mediaType} />;
  }

  return (
    <div
      className="flex items-center gap-2 px-3 pt-2 pb-1"
      data-ocid="thread.inline_preview_panel"
    >
      <div
        className="flex items-center gap-2 flex-1 rounded-lg px-2.5 py-1.5"
        style={{
          backgroundColor: "#1a1a1a",
          border: "1px solid #2a2a2a",
          minWidth: 0,
        }}
      >
        {thumbnail}
        <span
          className="font-mono text-[10px] flex-1 truncate"
          style={{ color: "#888" }}
        >
          {truncateUrl(url, 52)}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
        style={{ backgroundColor: "#2a2a2a", color: "#888" }}
        aria-label="Dismiss media preview"
        data-ocid="thread.inline_preview_dismiss_button"
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Reply Preview Bar (shown above compose when replying)
// ──────────────────────────────────────────────
function ReplyPreviewBar({
  post,
  profileMap,
  onCancel,
}: {
  post: Post;
  profileMap: Map<string, UserProfile>;
  onCancel: () => void;
}) {
  const authorProfile = profileMap.get(post.authorSessionId);
  const displayName = authorProfile?.username ?? post.authorSessionId;
  const preview = post.content ? post.content.slice(0, 80) : "[media]";

  return (
    <div
      className="flex items-center gap-2 px-3 pt-2 pb-1"
      data-ocid="thread.reply_preview_panel"
    >
      <div
        className="flex items-start gap-2 flex-1 rounded-lg px-2.5 py-1.5"
        style={{
          backgroundColor: "#1a1a1a",
          borderLeft: "3px solid #4a9e5c",
          border: "1px solid #2a2a2a",
          borderLeftWidth: 3,
          borderLeftColor: "#4a9e5c",
          minWidth: 0,
        }}
      >
        <CornerUpLeft
          size={12}
          style={{ color: "#4a9e5c", flexShrink: 0, marginTop: 2 }}
        />
        <div className="min-w-0">
          <p
            className="font-mono text-[10px] font-bold"
            style={{ color: "#4a9e5c" }}
          >
            {displayName}
          </p>
          <p
            className="font-mono text-[10px] truncate"
            style={{ color: "#888" }}
          >
            {preview}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
        style={{ backgroundColor: "#2a2a2a", color: "#888" }}
        aria-label="Cancel reply"
        data-ocid="thread.reply_preview_cancel_button"
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// @Mention Autocomplete Dropdown
// ──────────────────────────────────────────────
interface MentionDropdownProps {
  query: string;
  profileMap: Map<string, UserProfile>;
  onSelect: (username: string) => void;
}

function MentionDropdown({
  query,
  profileMap,
  onSelect,
}: MentionDropdownProps) {
  const candidates = Array.from(profileMap.values())
    .filter(
      (p) => p.username?.toLowerCase().startsWith(query.toLowerCase()) ?? false,
    )
    .slice(0, 5);

  if (candidates.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-3 right-3 mb-1 rounded-xl overflow-hidden shadow-xl z-40"
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #2a2a2a",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
      }}
      data-ocid="thread.mention_dropdown"
    >
      {candidates.map((profile) => {
        const avatarSrc =
          profile.avatarUrl ?? generatePixelAvatar(profile.sessionId, 24);
        return (
          <button
            type="button"
            key={profile.sessionId}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5"
            onClick={() => onSelect(profile.username)}
            data-ocid="thread.mention_dropdown_item"
          >
            <img
              src={avatarSrc}
              alt={profile.username}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
            <span className="font-mono text-xs" style={{ color: "#e0e0e0" }}>
              @{profile.username}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function ThreadPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const threadIdBig = BigInt(id ?? "0");
  const threadIdNum = Number(threadIdBig);
  const threadIdStr = String(threadIdBig);

  const [thread, setThread] = useState<Thread | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [content, setContent] = useState("");
  const [inlineMediaUrl, setInlineMediaUrl] = useState("");
  const [inlineMediaType, setInlineMediaType] = useState<MediaType>("text");
  const [submitting, setSubmitting] = useState(false);

  // Image upload state
  const [uploadedImage, setUploadedImage] = useState<{
    dataUrl: string;
    name: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Reply state
  const [replyToPost, setReplyToPost] = useState<Post | null>(null);
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});

  // Reactions version (trigger re-render of reaction rows)
  const [reactionVersion, setReactionVersion] = useState(0);

  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const sessionId = getSessionId();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevPostCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadData = useCallback(async () => {
    const [t, newPosts, cats, profiles] = await Promise.all([
      backendApi.getThread(threadIdBig),
      backendApi.getPostsByThread(threadIdBig),
      backendApi.getCategories(),
      backendApi.getAllProfiles(),
    ]);

    if (t === null) {
      setNotFound(true);
    } else {
      setThread(t);
    }
    setPosts(newPosts);
    setCategories(cats);

    const map = new Map<string, UserProfile>();
    for (const p of profiles) {
      map.set(p.sessionId, p);
    }
    setProfileMap(map);
  }, [threadIdBig]);

  // Load reply map from localStorage
  useEffect(() => {
    setReplyMap(getReplyMap());
  }, []);

  // Record thread visit for mention badge tracking
  useEffect(() => {
    recordThreadVisit(threadIdStr);
  }, [threadIdStr]);

  // Auto-scroll when new posts arrive
  useEffect(() => {
    if (posts.length > prevPostCountRef.current) {
      scrollToBottom();
    }
    prevPostCountRef.current = posts.length;
  }, [posts.length, scrollToBottom]);

  useEffect(() => {
    loadData();
    joinThread(threadIdNum, sessionId);

    heartbeatRef.current = setInterval(() => {
      joinThread(threadIdNum, sessionId);
    }, 15000);

    pollRef.current = setInterval(loadData, 3000);

    return () => {
      leaveThread(threadIdNum, sessionId);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [threadIdNum, sessionId, loadData]);

  // Scroll on mount
  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  // My username for mention highlights
  const myProfile = profileMap.get(sessionId);
  const myUsername = myProfile?.username;

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    try {
      const dataUrl = await readFileAsBase64(file);
      setUploadedImage({ dataUrl, name: file.name });
    } catch {
      toast.error("Failed to read image");
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
    e.target.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith("image/"));
    if (imageFile) {
      await handleImageFile(imageFile);
    } else if (files.length > 0) {
      toast.error("Only image files can be dropped here");
    }
  }

  function handleContentChange(val: string) {
    setContent(val);

    // Detect media URL
    const found = extractFirstUrl(val);
    if (found) {
      setInlineMediaUrl(found);
      setInlineMediaType(detectMediaType(found));
    } else {
      setInlineMediaUrl("");
      setInlineMediaType("text");
    }

    // Detect @mention being typed (from cursor)
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? val.length;
    const textToCursor = val.slice(0, cursor);
    const mentionMatch = textToCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
    } else {
      setMentionQuery(null);
    }
  }

  function handleMentionSelect(username: string) {
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    // Replace @partial with @username + space
    const newBefore = before.replace(/@\w*$/, `@${username} `);
    const newContent = newBefore + after;
    setContent(newContent);
    setMentionQuery(null);
    // Re-focus and move cursor after inserted text
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(newBefore.length, newBefore.length);
    });
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && mentionQuery !== null) {
      e.preventDefault();
      setMentionQuery(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const canSend =
    content.trim() !== "" || uploadedImage !== null || inlineMediaUrl !== "";

  async function handleSubmit() {
    if (!canSend) {
      toast.error("Message, media URL, or image required");
      return;
    }

    const banned = await backendApi.isBanned(sessionId);
    if (banned) {
      toast.error("You are banned from posting.");
      return;
    }

    setSubmitting(true);
    try {
      let finalMediaUrl: string | null = null;
      let finalMediaType: MediaType = "text";

      if (uploadedImage) {
        finalMediaUrl = uploadedImage.dataUrl;
        finalMediaType = "uploaded_image";
      } else if (inlineMediaUrl) {
        finalMediaUrl = inlineMediaUrl;
        finalMediaType = inlineMediaType;
      }

      const newPost = await backendApi.createPost(
        threadIdBig,
        sessionId,
        content.trim(),
        finalMediaUrl,
        finalMediaType,
      );

      // Store reply mapping if replying
      if (replyToPost && newPost) {
        const newPostId = String(newPost.id);
        const replyToPostId = String(replyToPost.id);
        storeReply(newPostId, replyToPostId);
        setReplyMap((prev) => ({ ...prev, [newPostId]: replyToPostId }));
      }

      setContent("");
      setUploadedImage(null);
      setInlineMediaUrl("");
      setInlineMediaType("text");
      setReplyToPost(null);
      setMentionQuery(null);
      await loadData();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Thread not found ──
  if (notFound) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="font-mono text-sm" style={{ color: "#444" }}>
          Thread not found.
        </p>
        <Button
          variant="ghost"
          onClick={() => navigate({ to: "/" })}
          className="mt-4 font-mono text-xs"
          style={{ color: "#888" }}
        >
          ← Back to catalog
        </Button>
      </div>
    );
  }

  if (!thread) {
    return (
      <div
        className="flex items-center justify-center h-full"
        data-ocid="thread.loading_state"
      >
        <p className="font-mono text-sm" style={{ color: "#444" }}>
          Loading…
        </p>
      </div>
    );
  }

  const category = categories.find((c) => c.id === thread.categoryId);
  const catColor = category
    ? (CATEGORY_COLORS[category.name] ?? "#555")
    : "#555";
  const live = isThreadLive(threadIdNum);

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      style={{ backgroundColor: "#0d0d0d" }}
    >
      {/* ── Compact thread header ──────────────────────── */}
      <div
        className="shrink-0 border-b"
        style={{
          backgroundColor: "#111111",
          borderBottomColor: "#2a2a2a",
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="shrink-0 p-1.5 rounded transition-colors hover:bg-white/5"
            style={{ color: "#888" }}
            data-ocid="thread.back_button"
            aria-label="Back to catalog"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                className="font-semibold text-sm leading-snug truncate"
                style={{ color: "#e0e0e0" }}
              >
                {thread.title}
              </h1>
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
                style={{
                  backgroundColor: `${catColor}22`,
                  color: catColor,
                  border: `1px solid ${catColor}44`,
                }}
              >
                {category?.name ?? "Unknown"}
              </span>
              {thread.isClosed && (
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: "#c0392b22",
                    color: "#c0392b",
                    border: "1px solid #c0392b44",
                  }}
                >
                  CLOSED
                </span>
              )}
              {thread.isArchived && (
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: "#77777722",
                    color: "#777",
                    border: "1px solid #77777744",
                  }}
                >
                  ARCHIVED
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={live ? "animate-pulse" : ""}
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: live ? "#4a9e5c" : "#444",
                boxShadow: live ? "0 0 5px #4a9e5c" : "none",
              }}
            />
            <span
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{ color: live ? "#4a9e5c" : "#444" }}
            >
              {live ? "LIVE" : "OFFLINE"}
            </span>
            <span
              className="font-mono text-[10px] ml-1"
              style={{ color: "#555" }}
            >
              {Number(thread.postCount)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Scrollable message list ──────────────────────── */}
      <div
        className="flex-1 overflow-y-auto pt-4 relative"
        style={{
          paddingBottom: thread.isClosed ? "56px" : "8px",
        }}
        onDragEnter={thread.isClosed ? undefined : handleDragEnter}
        onDragLeave={thread.isClosed ? undefined : handleDragLeave}
        onDragOver={thread.isClosed ? undefined : handleDragOver}
        onDrop={thread.isClosed ? undefined : handleDrop}
        data-ocid="thread.upload_dropzone"
      >
        {isDragging && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            style={{
              backgroundColor: "rgba(74,158,92,0.08)",
              border: "2px dashed #4a9e5c44",
            }}
          >
            <div
              className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl"
              style={{
                backgroundColor: "rgba(0,0,0,0.7)",
                border: "1px dashed #4a9e5c88",
              }}
            >
              <ImagePlus size={28} style={{ color: "#4a9e5c" }} />
              <span
                className="font-mono text-sm font-medium"
                style={{ color: "#4a9e5c" }}
              >
                Drop image to share
              </span>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto px-3">
          {posts.length === 0 ? (
            <div
              className="flex items-center justify-center h-32"
              data-ocid="thread.post.empty_state"
            >
              <p className="font-mono text-sm" style={{ color: "#333" }}>
                No messages yet. Say something.
              </p>
            </div>
          ) : (
            <>
              {posts.map((post, i) => (
                <ChatBubble
                  key={String(post.id)}
                  post={post}
                  index={i + 1}
                  profileMap={profileMap}
                  threadId={threadIdStr}
                  sessionId={sessionId}
                  myUsername={myUsername}
                  replyMap={replyMap}
                  posts={posts}
                  onReply={setReplyToPost}
                  reactionVersion={reactionVersion}
                  onReactionChange={() => setReactionVersion((v) => v + 1)}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Fixed compose bar ────────────────────────────── */}
      {thread.isClosed ? (
        <div
          className="shrink-0 border-t"
          style={{
            backgroundColor: "#111",
            borderTopColor: "#2a2a2a",
          }}
          data-ocid="thread.compose_bar"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-center px-4 py-3">
            <Lock size={13} style={{ color: "#555", marginRight: 8 }} />
            <span className="font-mono text-xs" style={{ color: "#555" }}>
              This thread is closed — no new messages
            </span>
          </div>
        </div>
      ) : (
        <div
          className="shrink-0 border-t"
          style={{
            backgroundColor: "#111111",
            borderTopColor: "#2a2a2a",
          }}
          data-ocid="thread.compose_bar"
        >
          <div className="max-w-3xl mx-auto relative">
            {/* @Mention dropdown (above compose bar) */}
            {mentionQuery !== null && (
              <MentionDropdown
                query={mentionQuery}
                profileMap={profileMap}
                onSelect={handleMentionSelect}
              />
            )}

            {/* Reply preview */}
            {replyToPost && (
              <ReplyPreviewBar
                post={replyToPost}
                profileMap={profileMap}
                onCancel={() => setReplyToPost(null)}
              />
            )}

            {/* Staged image preview */}
            {uploadedImage && (
              <div className="flex items-start gap-2 px-3 pt-2.5 pb-1">
                <div className="relative inline-block">
                  <img
                    src={uploadedImage.dataUrl}
                    alt="Staged upload"
                    style={{
                      width: 60,
                      height: 60,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid #2d6b3a",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setUploadedImage(null)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "#c0392b", color: "#fff" }}
                    aria-label="Remove staged image"
                  >
                    <X size={10} />
                  </button>
                </div>
                <span
                  className="font-mono text-[10px] mt-1 truncate max-w-48"
                  style={{ color: "#555" }}
                >
                  {uploadedImage.name}
                </span>
              </div>
            )}

            {/* Inline media preview (auto-detected URL) */}
            {inlineMediaUrl && inlineMediaType !== "text" && (
              <InlineMediaPreview
                url={inlineMediaUrl}
                mediaType={inlineMediaType}
                onDismiss={() => {
                  setInlineMediaUrl("");
                  setInlineMediaType("text");
                }}
              />
            )}

            {/* Main input row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 p-2 rounded-full transition-colors"
                style={{
                  color: uploadedImage ? "#4a9e5c" : "#555",
                  backgroundColor: uploadedImage ? "#4a9e5c18" : "transparent",
                }}
                aria-label="Upload image"
                data-ocid="thread.image_upload_button"
              >
                <ImagePlus size={16} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {/* Text input */}
              <Input
                ref={inputRef}
                placeholder={replyToPost ? "Write a reply…" : "Message…"}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="flex-1 h-10 border-0 focus-visible:ring-1 text-sm"
                style={{
                  backgroundColor: "#1e1e1e",
                  color: "#e0e0e0",
                  borderRadius: 20,
                  paddingLeft: 16,
                  paddingRight: 16,
                  fontSize: 16,
                }}
                disabled={submitting}
                data-ocid="thread.message_input"
              />

              {/* Send button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !canSend}
                className="shrink-0 p-2.5 rounded-full transition-colors disabled:opacity-40"
                style={{
                  backgroundColor: canSend ? "#4a9e5c" : "#1e1e1e",
                  color: canSend ? "#fff" : "#444",
                }}
                aria-label="Send message"
                data-ocid="thread.send_button"
              >
                <SendHorizontal size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
