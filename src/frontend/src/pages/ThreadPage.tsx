import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerUpLeft,
  ExternalLink,
  Film,
  Flag,
  Image,
  ImagePlus,
  Link2,
  Lock,
  SendHorizontal,
  SmilePlus,
  Trash2,
  Tv2,
  Twitter,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { Category, Post, Thread, UserProfile } from "../backendApi";
import GifPicker from "../components/GifPicker";
import LevelBadge from "../components/LevelBadge";
import VoiceMessagePlayer from "../components/VoiceMessagePlayer";
import VoiceRecorder from "../components/VoiceRecorder";
import {
  type MediaType,
  detectMediaType,
  getSessionId,
  isThreadLive,
  joinThread,
  leaveThread,
} from "../store";
import {
  aggregateReactions,
  buildReplyMapFromPosts,
  encodeReactionContent,
  encodeReplyContent,
  indexMyReactions,
  parseReactionContent,
  parseReplyContent,
} from "../utils/backendReactions";
import {
  getReplyMap,
  recordThreadVisit,
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
// OG Metadata cache (module-level, avoids re-fetching)
// ──────────────────────────────────────────────
const ogMetadataCache = new Map<string, backendApi.OgMetadata>();

// ──────────────────────────────────────────────
// Timeout helper — ensures OG fetches never hang forever
// ──────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👎"] as const;

const REPORT_REASONS = [
  "Spam",
  "Harassment",
  "Misinformation",
  "Inappropriate Content",
  "Other",
] as const;

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

function extractRumbleVideoId(url: string): string | null {
  // 1. Already an embed URL: rumble.com/embed/{id}/
  const embedMatch = url.match(/rumble\.com\/embed\/([a-zA-Z0-9_-]+)/);
  if (embedMatch) return embedMatch[1];

  // 2. Video page: rumble.com/v{id}-{title}.html → use "v{id}" as slug
  const videoPageMatch = url.match(/rumble\.com\/(v[a-zA-Z0-9]+-[^/?]+)/);
  if (videoPageMatch) {
    // Extract just the v{id} portion before the first dash after "v"
    const slug = videoPageMatch[1];
    const vIdMatch = slug.match(/^(v[a-zA-Z0-9]+)/);
    return vIdMatch ? vIdMatch[1] : slug;
  }

  // 3. Short video URL: rumble.com/v{id}
  const shortMatch = url.match(/rumble\.com\/(v[a-zA-Z0-9]+)/);
  if (shortMatch) return shortMatch[1];

  return null;
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

// Returns true if a URL should be rendered as an embed (not a link preview)
function isEmbedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "twitch.tv" ||
      host === "twitter.com" ||
      host === "x.com" ||
      host === "rumble.com" ||
      host === "reddit.com"
    );
  } catch {
    return false;
  }
}

// Extract the first URL from text that is a link-preview candidate (not an embed)
function extractFirstLinkPreviewUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s]+)/gi);
  if (!match) return null;
  for (const url of match) {
    if (!isEmbedUrl(url)) return url;
  }
  return null;
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
// Reddit URL title extractor (frontend-only fallback)
// ──────────────────────────────────────────────
function extractRedditTitleFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    // /r/{sub}/comments/{id}/{title_slug}/
    const match = pathname.match(/\/r\/([^/]+)\/comments\/[^/]+\/([^/]+)/);
    if (match) {
      const subreddit = match[1];
      const titleSlug = match[2];
      const humanTitle = decodeURIComponent(titleSlug)
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return humanTitle ? `${humanTitle} (r/${subreddit})` : `r/${subreddit}`;
    }
    const subMatch = pathname.match(/\/r\/([^/]+)/);
    if (subMatch) return `r/${subMatch[1]}`;
  } catch {
    /* ignore */
  }
  return null;
}

// ──────────────────────────────────────────────
// Reddit Embed
// ──────────────────────────────────────────────
interface RedditPostData {
  title: string;
  subreddit: string;
  thumbnail: string | null;
  body: string | null;
}

function RedditEmbed({ url }: { url: string }) {
  // Immediately derive title from URL slug — no network needed, always works
  const urlSlugTitle = extractRedditTitleFromUrl(url) ?? "Reddit post";

  const [postData, setPostData] = useState<RedditPostData>({
    title: urlSlugTitle,
    subreddit: (() => {
      try {
        const m = new URL(url).pathname.match(/\/r\/([^/]+)/);
        return m ? `r/${m[1]}` : "";
      } catch {
        return "";
      }
    })(),
    thumbnail: null,
    body: null,
  });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("ready");

  useEffect(() => {
    let cancelled = false;
    // Set slug-derived title immediately so it's visible right away
    const slugTitle = extractRedditTitleFromUrl(url) ?? "Reddit post";
    const subreddit = (() => {
      try {
        const m = new URL(url).pathname.match(/\/r\/([^/]+)/);
        return m ? `r/${m[1]}` : "";
      } catch {
        return "";
      }
    })();
    setPostData({ title: slugTitle, subreddit, thumbnail: null, body: null });
    setStatus("ready");

    // Try to enrich with OG metadata (image + possibly better title)
    backendApi
      .fetchOgMetadata(url)
      .then((meta) => {
        if (!cancelled) {
          setPostData({
            title: meta.title && meta.title.length > 5 ? meta.title : slugTitle,
            subreddit,
            thumbnail: meta.imageUrl ?? null,
            body: meta.description ?? null,
          });
        }
      })
      .catch(() => {
        /* keep slug title */
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
    <div
      style={{
        maxWidth: 320,
        borderRadius: 10,
        backgroundColor: "#1a1a1a",
        border: "1px solid #2a2a2a",
        overflow: "hidden",
      }}
    >
      {status === "loading" ? (
        <div style={{ padding: "10px 12px" }}>
          <span className="font-mono text-[11px]" style={{ color: "#555" }}>
            Loading Reddit post…
          </span>
        </div>
      ) : postData ? (
        <>
          {postData.thumbnail && (
            <img
              src={postData.thumbnail}
              alt="Post thumbnail"
              style={{
                width: "100%",
                height: 120,
                objectFit: "cover",
                display: "block",
              }}
            />
          )}
          <div style={{ padding: "10px 12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="#ff4500"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <circle cx="10" cy="10" r="10" fill="#ff4500" />
                <path
                  d="M16.67 10a1.46 1.46 0 0 0-2.47-1 7.12 7.12 0 0 0-3.85-1.23l.65-3.08 2.13.45a1 1 0 1 0 .14-.64l-2.38-.5a.26.26 0 0 0-.31.2l-.73 3.44a7.14 7.14 0 0 0-3.89 1.23 1.46 1.46 0 1 0-1.61 2.39 2.87 2.87 0 0 0 0 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 0 0 0-.44 1.46 1.46 0 0 0 .57-1.26zM7.27 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.58 2.71a3.58 3.58 0 0 1-2.85.89 3.58 3.58 0 0 1-2.85-.89.23.23 0 0 1 .33-.33 3.15 3.15 0 0 0 2.52.71 3.15 3.15 0 0 0 2.52-.71.23.23 0 0 1 .33.33zm-.16-1.71a1 1 0 1 1 1-1 1 1 0 0 1-1 1z"
                  fill="white"
                />
              </svg>
              {postData.subreddit && (
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "#ff450022",
                    color: "#ff6633",
                    border: "1px solid #ff450033",
                  }}
                >
                  {postData.subreddit}
                </span>
              )}
            </div>
            <p
              className="font-mono text-xs leading-snug mb-2"
              style={{ color: "#e0e0e0", fontWeight: 600 }}
            >
              {postData.title}
            </p>
            {postData.body && (
              <p
                className="font-mono text-[11px] leading-relaxed mb-3"
                style={{ color: "#888" }}
              >
                {postData.body}
                {postData.body.length >= 200 ? "…" : ""}
              </p>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] underline"
              style={{ color: "#ff4500" }}
            >
              View on Reddit →
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────
// Link Preview Card (iMessage-style)
// ──────────────────────────────────────────────
function LinkPreviewCard({
  url,
  preloadedMeta,
}: {
  url: string;
  preloadedMeta?: backendApi.OgMetadata;
}) {
  const [meta, setMeta] = useState<backendApi.OgMetadata | null>(
    preloadedMeta ?? null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    preloadedMeta ? "ready" : "loading",
  );

  useEffect(() => {
    // If preloaded data was provided, use it immediately — no fetch needed
    if (preloadedMeta) {
      setMeta(preloadedMeta);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    // Check cache first
    if (ogMetadataCache.has(url)) {
      const cached = ogMetadataCache.get(url)!;
      setMeta(cached);
      setStatus("ready");
      return;
    }

    const fetchFn = url.includes("rumble.com")
      ? backendApi.fetchRumbleOgMetadata
      : backendApi.fetchOgMetadata;

    withTimeout(fetchFn(url), 10_000)
      .then((data) => {
        if (cancelled) return;
        ogMetadataCache.set(url, data);
        setMeta(data);
        setStatus(
          data.title || data.description || data.imageUrl ? "ready" : "error",
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [url, preloadedMeta]);

  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  // Prefer siteName from metadata, fall back to hostname
  const siteLabel = meta?.siteName ?? hostname;

  // Fallback: just show the URL as a link
  if (status === "error") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-2 font-mono text-xs break-all underline"
        style={{ color: "#4a9e5c" }}
      >
        {url}
      </a>
    );
  }

  if (status === "loading") {
    return (
      <div
        className="flex items-center gap-2 mt-2 rounded-xl px-3 py-2"
        style={{
          backgroundColor: "#1a1a1a",
          border: "1px solid #2a2a2a",
          maxWidth: 320,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 8,
            backgroundColor: "#2a2a2a",
            flexShrink: 0,
          }}
        />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div
            style={{
              height: 10,
              borderRadius: 4,
              backgroundColor: "#2a2a2a",
              width: "70%",
            }}
          />
          <div
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "#222",
              width: "90%",
            }}
          />
          <div
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "#1e1e1e",
              width: "50%",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 mt-2 rounded-xl overflow-hidden transition-opacity hover:opacity-80"
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #2a2a2a",
        maxWidth: 320,
        textDecoration: "none",
      }}
    >
      {meta?.imageUrl && (
        <img
          src={meta.imageUrl}
          alt={meta.title ?? hostname}
          style={{
            width: 60,
            height: 60,
            objectFit: "cover",
            flexShrink: 0,
            display: "block",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div
        className="flex flex-col justify-center py-2 px-1 min-w-0 flex-1"
        style={{ paddingLeft: meta?.imageUrl ? 0 : 12 }}
      >
        {meta?.title && (
          <p
            className="font-mono text-[12px] font-bold leading-snug mb-0.5 truncate"
            style={{ color: "#e0e0e0" }}
          >
            {meta.title}
          </p>
        )}
        {meta?.description && (
          <p
            className="font-mono text-[11px] leading-snug mb-0.5"
            style={{
              color: "#888",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {meta.description}
          </p>
        )}
        <p className="font-mono text-[10px]" style={{ color: "#555" }}>
          {siteLabel}
        </p>
      </div>
    </a>
  );
}

// ──────────────────────────────────────────────
// Media type icon + label
// ──────────────────────────────────────────────
function MediaTypeChip({ mediaType }: { mediaType: MediaType }) {
  const configs: Record<
    Exclude<
      MediaType,
      "text" | "uploaded_image" | "gif" | "voice" | "reaction"
    >,
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
    rumble: {
      icon: (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h4c2.21 0 4 1.79 4 4 0 1.1-.45 2.1-1.17 2.83L17 18h-2.24l-1.5-2H11v-2zm0-4h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2v4z" />
        </svg>
      ),
      label: "Rumble",
      color: "#85c742",
    },
    reddit: {
      icon: (
        <svg
          width="11"
          height="11"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="10" />
          <path
            d="M16.67 10a1.46 1.46 0 0 0-2.47-1 7.12 7.12 0 0 0-3.85-1.23l.65-3.08 2.13.45a1 1 0 1 0 .14-.64l-2.38-.5a.26.26 0 0 0-.31.2l-.73 3.44a7.14 7.14 0 0 0-3.89 1.23 1.46 1.46 0 1 0-1.61 2.39 2.87 2.87 0 0 0 0 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 0 0 0-.44 1.46 1.46 0 0 0 .57-1.26zM7.27 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.58 2.71a3.58 3.58 0 0 1-2.85.89 3.58 3.58 0 0 1-2.85-.89.23.23 0 0 1 .33-.33 3.15 3.15 0 0 0 2.52.71 3.15 3.15 0 0 0 2.52-.71.23.23 0 0 1 .33.33zm-.16-1.71a1 1 0 1 1 1-1 1 1 0 0 1-1 1z"
            fill="white"
          />
        </svg>
      ),
      label: "Reddit",
      color: "#ff4500",
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

  if (
    mediaType === "text" ||
    mediaType === "uploaded_image" ||
    mediaType === "gif" ||
    mediaType === "voice" ||
    mediaType === "reaction"
  )
    return null;
  const cfg = configs[mediaType];
  if (!cfg) return null;
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
// PiP / Pop-out button for video embeds
// ──────────────────────────────────────────────
function PipButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Pop out video"
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        zIndex: 10,
        background: "rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 6,
        padding: 4,
        color: "#fff",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ExternalLink size={12} />
    </button>
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
      <div style={{ position: "relative", maxWidth: 320 }}>
        <PipButton
          onClick={() =>
            window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank")
          }
        />
        <div
          className="rounded overflow-hidden"
          style={{ paddingBottom: "56.25%", height: 0, position: "relative" }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="absolute inset-0 w-full h-full border-0 rounded"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
          />
        </div>
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
      <div style={{ position: "relative", maxWidth: 320 }}>
        <PipButton
          onClick={() =>
            window.open(
              channel ? `https://www.twitch.tv/${channel}` : url,
              "_blank",
            )
          }
        />
        <div
          className="rounded overflow-hidden"
          style={{ paddingBottom: "56.25%", height: 0, position: "relative" }}
        >
          <iframe
            src={src}
            className="absolute inset-0 w-full h-full border-0 rounded"
            allowFullScreen
            title="Twitch stream"
          />
        </div>
      </div>
    );
  }

  if (mediaType === "twitter") {
    return <TwitterEmbed url={url} />;
  }

  if (mediaType === "video") {
    return <VideoWithPip url={url} />;
  }

  if (mediaType === "rumble") {
    const videoId = extractRumbleVideoId(url);
    if (!videoId) {
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
      <div style={{ position: "relative", maxWidth: 320 }}>
        <PipButton onClick={() => window.open(url, "_blank")} />
        <div
          className="rounded overflow-hidden"
          style={{ paddingBottom: "56.25%", height: 0, position: "relative" }}
        >
          <iframe
            src={`https://rumble.com/embed/${videoId}/?pub=4`}
            className="absolute inset-0 w-full h-full border-0 rounded"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            title="Rumble video"
            referrerPolicy="no-referrer-when-downgrade"
            frameBorder="0"
          />
        </div>
      </div>
    );
  }

  if (mediaType === "reddit") {
    return <RedditEmbed url={url} />;
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
// Native video with PiP support
// ──────────────────────────────────────────────
function VideoWithPip({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  async function handlePip() {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {
      // PiP not supported or blocked — open in new tab
      window.open(url, "_blank");
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <PipButton onClick={handlePip} />
      {/* biome-ignore lint/a11y/useMediaCaption: user-provided video content */}
      <video
        ref={videoRef}
        src={url}
        controls
        className="rounded"
        style={{ maxWidth: 280, maxHeight: 240 }}
      />
    </div>
  );
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
  /** Aggregated reaction counts for this post (from backend posts) */
  counts: Record<string, number>;
  /** Map of emoji → reaction-post-id for the current user's reactions on this post */
  myReactions: Map<string, string>;
  /** Force re-render from parent */
  reactionVersion: number;
  onReactionChange: () => void;
}

function ReactionRow({
  threadId,
  postId,
  sessionId,
  isOwn,
  counts,
  myReactions,
  onReactionChange,
}: ReactionRowProps) {
  const activeEmojis = REACTION_EMOJIS.filter((e) => (counts[e] ?? 0) > 0);

  async function toggleReaction(emoji: string) {
    const existingPostId = myReactions.get(emoji);
    if (existingPostId) {
      // Remove: delete the reaction post
      try {
        await backendApi.deletePost(BigInt(existingPostId));
      } catch {
        // ignore — will resync on next poll
      }
    } else {
      // Add: create a reaction post
      try {
        const content = encodeReactionContent(sessionId, emoji, postId);
        await backendApi.createPost(
          BigInt(threadId),
          sessionId,
          content,
          null,
          "reaction",
          null,
        );
      } catch {
        // ignore
      }
    }
    onReactionChange();
  }

  if (activeEmojis.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-1 flex-wrap mt-1 ${isOwn ? "justify-end" : "justify-start"}`}
    >
      {/* Active reaction pills */}
      {activeEmojis.map((emoji) => {
        const count = counts[emoji] ?? 0;
        const mine = myReactions.has(emoji);
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
    </div>
  );
}

// ──────────────────────────────────────────────
// Report Modal (for messages)
// ──────────────────────────────────────────────
interface ReportModalProps {
  open: boolean;
  onClose: () => void;
}

function ReportModal({ open, onClose }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  function handleSubmit() {
    if (!selectedReason) {
      toast.error("Please select a reason");
      return;
    }
    toast.success("Message reported");
    setSelectedReason(null);
    onClose();
  }

  function handleClose() {
    setSelectedReason(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent
        style={{
          backgroundColor: "#1a1a1a",
          border: "1px solid #2a2a2a",
          color: "#e0e0e0",
          maxWidth: 400,
        }}
        data-ocid="report.dialog"
      >
        <DialogHeader>
          <DialogTitle
            className="font-mono text-sm"
            style={{ color: "#e0e0e0" }}
          >
            Report message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="font-mono text-xs mb-3" style={{ color: "#888" }}>
            Select a reason for reporting this message:
          </p>
          {REPORT_REASONS.map((reason, i) => {
            const isSelected = selectedReason === reason;
            return (
              <button
                type="button"
                key={reason}
                onClick={() => setSelectedReason(reason)}
                className="w-full text-left px-3 py-2.5 rounded-xl font-mono text-sm transition-all"
                style={{
                  backgroundColor: isSelected ? "#4a9e5c18" : "#111",
                  border: `1px solid ${isSelected ? "#4a9e5c" : "#2a2a2a"}`,
                  color: isSelected ? "#6abd7c" : "#ccc",
                }}
                data-ocid={`report.reason.radio.${i + 1}`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "#4a9e5c" : "#444"}`,
                      backgroundColor: isSelected ? "#4a9e5c" : "transparent",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: "#fff",
                        }}
                      />
                    )}
                  </div>
                  {reason}
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="font-mono text-xs"
            style={{ color: "#888", border: "1px solid #2a2a2a" }}
            data-ocid="report.cancel_button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason}
            className="font-mono text-xs disabled:opacity-40"
            style={{
              backgroundColor: selectedReason ? "#4a9e5c" : "#1a1a1a",
              color: selectedReason ? "#fff" : "#555",
              border: "none",
            }}
            data-ocid="report.submit_button"
          >
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────
// Report Chat Modal
// ──────────────────────────────────────────────
interface ReportChatModalProps {
  open: boolean;
  threadId: string;
  sessionId: string;
  onClose: () => void;
}

function ReportChatModal({
  open,
  threadId,
  sessionId,
  onClose,
}: ReportChatModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!selectedReason) {
      toast.error("Please select a reason");
      return;
    }
    setSubmitting(true);
    try {
      await backendApi.reportThread(
        BigInt(threadId),
        sessionId,
        selectedReason,
      );
      toast.success("Chat reported");
      setSelectedReason(null);
      onClose();
    } catch {
      toast.error("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSelectedReason(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent
        style={{
          backgroundColor: "#1a1a1a",
          border: "1px solid #2a2a2a",
          color: "#e0e0e0",
          maxWidth: 400,
        }}
        data-ocid="report_chat.dialog"
      >
        <DialogHeader>
          <DialogTitle
            className="font-mono text-sm"
            style={{ color: "#e0e0e0" }}
          >
            Report this chat
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="font-mono text-xs mb-3" style={{ color: "#888" }}>
            Select a reason for reporting this chat:
          </p>
          {REPORT_REASONS.map((reason, i) => {
            const isSelected = selectedReason === reason;
            return (
              <button
                type="button"
                key={reason}
                onClick={() => setSelectedReason(reason)}
                className="w-full text-left px-3 py-2.5 rounded-xl font-mono text-sm transition-all"
                style={{
                  backgroundColor: isSelected ? "#4a9e5c18" : "#111",
                  border: `1px solid ${isSelected ? "#4a9e5c" : "#2a2a2a"}`,
                  color: isSelected ? "#6abd7c" : "#ccc",
                }}
                data-ocid={`report_chat.reason.radio.${i + 1}`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "#4a9e5c" : "#444"}`,
                      backgroundColor: isSelected ? "#4a9e5c" : "transparent",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: "#fff",
                        }}
                      />
                    )}
                  </div>
                  {reason}
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="font-mono text-xs"
            style={{ color: "#888", border: "1px solid #2a2a2a" }}
            data-ocid="report_chat.cancel_button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason || submitting}
            className="font-mono text-xs disabled:opacity-40"
            style={{
              backgroundColor: selectedReason ? "#4a9e5c" : "#1a1a1a",
              color: selectedReason ? "#fff" : "#555",
              border: "none",
            }}
            data-ocid="report_chat.submit_button"
          >
            {submitting ? "Submitting…" : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────
// Message Context Menu
// ──────────────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  post: Post;
}

interface MessageContextMenuProps {
  state: ContextMenuState;
  threadId: string;
  sessionId: string;
  onClose: () => void;
  onReply: (post: Post) => void;
  onReport: () => void;
  onDelete: () => void;
  onBookmark: (postId: bigint) => void;
}

function MessageContextMenu({
  state,
  threadId,
  sessionId,
  onClose,
  onReply,
  onReport,
  onDelete,
  onBookmark,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Adjust position so menu doesn't overflow viewport
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = state.x;
    let y = state.y;
    if (x + rect.width > vw) x = vw - rect.width - 8;
    if (y + rect.height > vh) y = vh - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setPos({ x, y });
  }, [state.x, state.y]);

  function handleCopyText() {
    navigator.clipboard.writeText(state.post.content ?? "").then(() => {
      toast.success("Copied");
    });
    onClose();
  }

  function handleShare() {
    const url = `${window.location.origin}/thread/${threadId}#post-${String(state.post.id)}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied");
    });
    onClose();
  }

  function handleReply() {
    onReply(state.post);
    onClose();
  }

  function handleReport() {
    onReport();
    onClose();
  }

  function handleBookmark() {
    onBookmark(state.post.id);
    onClose();
  }

  async function handleConfirmDelete() {
    try {
      await backendApi.deletePost(BigInt(state.post.id));
      toast.success("Message deleted");
      onDelete();
      onClose();
    } catch {
      toast.error("Failed to delete message");
    }
  }

  const isOwnPost = state.post.authorSessionId === sessionId;

  const menuItems = [
    {
      icon: <CornerUpLeft size={13} />,
      label: "Reply",
      onClick: handleReply,
      danger: false,
    },
    {
      icon: <Copy size={13} />,
      label: "Copy Text",
      onClick: handleCopyText,
      danger: false,
    },
    {
      icon: <Link2 size={13} />,
      label: "Share",
      onClick: handleShare,
      danger: false,
    },
    {
      icon: <Bookmark size={13} />,
      label: "Bookmark",
      onClick: handleBookmark,
      danger: false,
    },
    {
      icon: <Flag size={13} />,
      label: "Report",
      onClick: handleReport,
      danger: true,
    },
    ...(isOwnPost
      ? [
          {
            icon: <Trash2 size={13} />,
            label: "Delete",
            onClick: () => setConfirmDelete(true),
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        style={{ background: "transparent" }}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
        style={{
          left: pos.x,
          top: pos.y,
          backgroundColor: "#1e1e1e",
          border: "1px solid #2a2a2a",
          minWidth: 160,
          boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        }}
        data-ocid="thread.context_menu"
      >
        {confirmDelete ? (
          /* Delete confirmation state */
          <div className="px-3.5 py-3 flex flex-col gap-2.5">
            <p className="font-mono text-xs" style={{ color: "#ccc" }}>
              Delete this message?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-2.5 py-1.5 rounded-lg font-mono text-xs transition-colors hover:bg-white/5"
                style={{
                  color: "#888",
                  border: "1px solid #2a2a2a",
                }}
                data-ocid="thread.delete_cancel_button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 px-2.5 py-1.5 rounded-lg font-mono text-xs transition-colors"
                style={{
                  backgroundColor: "#e05555",
                  color: "#fff",
                  border: "none",
                }}
                data-ocid="thread.delete_confirm_button"
              >
                Yes, delete
              </button>
            </div>
          </div>
        ) : (
          menuItems.map((item, i) => (
            <button
              type="button"
              key={item.label}
              onClick={item.onClick}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 font-mono text-xs text-left transition-colors hover:bg-white/5"
              style={{
                color: item.danger ? "#e05555" : "#ccc",
                borderBottom:
                  i < menuItems.length - 1 ? "1px solid #2a2a2a" : "none",
              }}
            >
              <span style={{ color: item.danger ? "#e05555" : "#666" }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))
        )}
      </div>
    </>
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
  reactionVersion: number;
  /** Aggregated reaction counts: postId → emoji → count */
  reactionMap: Map<string, Record<string, number>>;
  /** My reactions index: postId → emoji → reaction-post-id */
  myReactionIndex: Map<string, Map<string, string>>;
  onReactionChange: () => void;
  onContextMenu: (
    e: React.MouseEvent | { clientX: number; clientY: number },
    post: Post,
  ) => void;
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
  reactionVersion,
  reactionMap,
  myReactionIndex,
  onReactionChange,
  onContextMenu,
}: ChatBubbleProps) {
  const isOwn = post.authorSessionId === sessionId;
  const authorProfile = profileMap.get(post.authorSessionId);
  const displayName = authorProfile?.username ?? post.authorSessionId;
  const avatarSrc =
    authorProfile?.avatarUrl ?? generatePixelAvatar(post.authorSessionId, 28);
  const createdAtMs = backendApi.nsToMs(post.createdAt);
  const mediaType = post.mediaType as MediaType;
  const postIdStr = String(post.id);

  // Long press for mobile context menu
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchMoved = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    // Don't intercept touches on interactive children
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("img")
    )
      return;

    touchMoved.current = false;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current && touchStartPos.current) {
        onContextMenu(
          {
            clientX: touchStartPos.current.x,
            clientY: touchStartPos.current.y,
          },
          post,
        );
      }
    }, 500);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > 8 || dy > 8) {
        touchMoved.current = true;
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    onContextMenu(e, post);
  }

  // Parse reply reference and display content from post content
  const { replyToPostId: embeddedReplyId, displayContent } = parseReplyContent(
    post.content,
  );
  // Prefer backend-embedded reply ID, fall back to localStorage replyMap
  const replyToPostId = embeddedReplyId ?? replyMap[postIdStr] ?? null;
  const replyToPost = replyToPostId
    ? posts.find((p) => String(p.id) === replyToPostId)
    : null;
  const replyAuthorProfile = replyToPost
    ? profileMap.get(replyToPost.authorSessionId)
    : null;
  const replyAuthorName =
    replyAuthorProfile?.username ?? replyToPost?.authorSessionId ?? "";
  // Display content with reply prefix stripped
  const visibleContent = displayContent;

  // Hook must be called unconditionally before any early returns
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const reactionBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownOpenUpward, setDropdownOpenUpward] = useState(true);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!showReactionPicker) return;
    function handleOutside(e: MouseEvent) {
      if (
        reactionPickerRef.current &&
        !reactionPickerRef.current.contains(e.target as Node)
      ) {
        setShowReactionPicker(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showReactionPicker]);

  // Detect direction when picker opens
  function handleReactionBtnClick() {
    if (!showReactionPicker && reactionBtnRef.current) {
      const rect = reactionBtnRef.current.getBoundingClientRect();
      const dropdownHeight = 252; // approx max height of 6 items
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropdownOpenUpward(
        spaceAbove >= dropdownHeight || spaceAbove > spaceBelow,
      );
    }
    setShowReactionPicker((v) => !v);
  }

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

  const hasMedia =
    !!post.mediaUrl && mediaType !== "text" && mediaType !== "voice";
  const isInlineImage =
    post.mediaUrl &&
    (mediaType === "uploaded_image" ||
      mediaType === "image" ||
      mediaType === "gif");

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
        alignSelf: "flex-start",
        marginTop: 2,
      }}
    />
  );

  const REACTION_LABELS: Record<string, string> = {
    "👍": "Like",
    "❤️": "Love",
    "😂": "Haha",
    "😮": "Wow",
    "😢": "Sad",
    "👎": "Dislike",
  };

  const reactionTrigger = (
    <div ref={reactionPickerRef} className="relative self-start mt-1">
      <button
        ref={reactionBtnRef}
        type="button"
        onClick={handleReactionBtnClick}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
        style={{
          backgroundColor: showReactionPicker
            ? "#4a9e5c28"
            : "rgba(255,255,255,0.04)",
          border: showReactionPicker
            ? "1px solid #4a9e5c66"
            : "1px solid rgba(255,255,255,0.08)",
          color: showReactionPicker ? "#6abd7c" : "#666",
        }}
        title="Add reaction"
        data-ocid="thread.reaction_picker_button"
      >
        <SmilePlus size={14} />
      </button>

      {showReactionPicker && (
        <div
          className="absolute z-30 flex flex-col py-1 rounded-xl shadow-lg overflow-y-auto"
          style={{
            backgroundColor: "#1e1e1e",
            border: "1px solid #2a2a2a",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            ...(dropdownOpenUpward
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            maxHeight: 240,
            minWidth: 110,
            ...(isOwn ? { right: 0 } : { left: 0 }),
          }}
        >
          {REACTION_EMOJIS.map((emoji) => {
            const isActive = (myReactionIndex.get(postIdStr) ?? new Map()).has(
              emoji,
            );
            return (
              <button
                type="button"
                key={emoji}
                onClick={async () => {
                  setShowReactionPicker(false);
                  const myReactions =
                    myReactionIndex.get(postIdStr) ?? new Map();
                  const existingPostId = myReactions.get(emoji);
                  if (existingPostId) {
                    try {
                      await backendApi.deletePost(BigInt(existingPostId));
                    } catch {
                      // ignore
                    }
                  } else {
                    try {
                      const content = encodeReactionContent(
                        sessionId,
                        emoji,
                        postIdStr,
                      );
                      await backendApi.createPost(
                        BigInt(threadId),
                        sessionId,
                        content,
                        null,
                        "reaction",
                        null,
                      );
                    } catch {
                      // ignore
                    }
                  }
                  onReactionChange();
                }}
                className="flex items-center gap-2 px-3 py-2 transition-all hover:bg-white/10 font-mono text-xs"
                style={{
                  color: isActive ? "#6abd7c" : "#ccc",
                  backgroundColor: isActive ? "#4a9e5c10" : "transparent",
                }}
                title={REACTION_LABELS[emoji] ?? emoji}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
                <span style={{ color: isActive ? "#6abd7c" : "#888" }}>
                  {REACTION_LABELS[emoji] ?? emoji}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`flex items-start gap-2 mb-2 group ${isOwn ? "flex-row-reverse" : "flex-row"}`}
      data-ocid={`thread.post.item.${index}`}
      id={`post-${postIdStr}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={handleContextMenu}
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Avatar — top-aligned with username */}
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
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 16,
                  border: "1px solid #2d6b3a",
                }
              : {
                  backgroundColor: "#1e1e1e",
                  borderTopLeftRadius: 4,
                  borderBottomLeftRadius: 16,
                  border: "1px solid #2a2a2a",
                }
          }
        >
          {/* Author label */}
          <div
            className={`font-mono text-[10px] font-bold mb-0.5 flex items-center gap-1 flex-wrap ${isOwn ? "justify-end" : "justify-start"}`}
            style={{ color: isOwn ? "#6abd7c" : "#4a9e5c" }}
          >
            {authorProfile?.level && <LevelBadge level={authorProfile.level} />}
            <span>
              {displayName}
              {isOwn && <span className="ml-1 opacity-60">(you)</span>}
            </span>
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
                  ? parseReplyContent(replyToPost.content).displayContent.slice(
                      0,
                      80,
                    )
                  : "[media]"}
              </p>
            </div>
          )}

          {/* Text content with @mention highlights */}
          {visibleContent && (
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap break-words"
              style={{ color: isOwn ? "#d4edda" : "#e0e0e0" }}
            >
              {renderMentions(visibleContent, myUsername)}
            </p>
          )}

          {/* Voice message player */}
          {mediaType === "voice" && post.mediaUrl && (
            <VoiceMessagePlayer
              src={post.mediaUrl}
              isOwn={isOwn}
              durationMs={undefined}
            />
          )}

          {/* Inline image thumbnail */}
          {isInlineImage && post.mediaUrl && (
            <InlineImageThumbnail src={post.mediaUrl} index={index} />
          )}

          {/* Link preview card (replaces CollapsibleMedia for "link" type) */}
          {hasMedia &&
            !isInlineImage &&
            mediaType === "link" &&
            post.mediaUrl && (
              <LinkPreviewCard
                url={post.mediaUrl}
                preloadedMeta={post.linkPreview ?? undefined}
              />
            )}

          {/* Collapsible media (for non-link, non-image media) */}
          {hasMedia && !isInlineImage && mediaType !== "link" && (
            <CollapsibleMedia
              url={post.mediaUrl!}
              mediaType={mediaType}
              index={index}
              isOwn={isOwn}
            />
          )}

          {/* Timestamp row (no reply button — reply via context menu) */}
          <div
            className={`flex items-center gap-1.5 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}
          >
            <span
              className="font-mono text-[10px]"
              style={{ color: isOwn ? "#6abd7c88" : "#555" }}
            >
              {formatTime(createdAtMs)} · {timeAgo(createdAtMs)}
            </span>
          </div>
        </div>

        {/* Reaction pills (below the bubble) */}
        <ReactionRow
          threadId={threadId}
          postId={postIdStr}
          sessionId={sessionId}
          isOwn={isOwn}
          counts={reactionMap.get(postIdStr) ?? {}}
          myReactions={myReactionIndex.get(postIdStr) ?? new Map()}
          reactionVersion={reactionVersion}
          onReactionChange={onReactionChange}
        />
      </div>

      {/* Reaction trigger button — left of bubble for others, right for own */}
      {reactionTrigger}
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
  if (
    !url ||
    mediaType === "text" ||
    mediaType === "uploaded_image" ||
    mediaType === "gif"
  )
    return null;

  // For "link" type, show a mini link preview card using OG metadata
  if (mediaType === "link") {
    return (
      <div
        className="flex items-start gap-2 px-3 pt-2 pb-1"
        data-ocid="thread.inline_preview_panel"
      >
        <LinkPreviewMini url={url} />
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors mt-1"
          style={{ backgroundColor: "#2a2a2a", color: "#888" }}
          aria-label="Dismiss media preview"
          data-ocid="thread.inline_preview_dismiss_button"
        >
          <X size={10} />
        </button>
      </div>
    );
  }

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
// Mini link preview (for compose bar inline preview)
// ──────────────────────────────────────────────
function LinkPreviewMini({ url }: { url: string }) {
  const [meta, setMeta] = useState<backendApi.OgMetadata | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    if (ogMetadataCache.has(url)) {
      const cached = ogMetadataCache.get(url)!;
      setMeta(cached);
      setStatus("ready");
      return;
    }

    const fetchFn = url.includes("rumble.com")
      ? backendApi.fetchRumbleOgMetadata
      : backendApi.fetchOgMetadata;

    withTimeout(fetchFn(url), 10_000)
      .then((data) => {
        if (cancelled) return;
        ogMetadataCache.set(url, data);
        setMeta(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  return (
    <div
      className="flex items-center gap-2 flex-1 rounded-lg px-2.5 py-1.5"
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid #2a2a2a",
        minWidth: 0,
      }}
    >
      {status === "ready" && meta?.imageUrl && (
        <img
          src={meta.imageUrl}
          alt={meta.title ?? hostname}
          style={{
            width: 36,
            height: 36,
            objectFit: "cover",
            borderRadius: 4,
            flexShrink: 0,
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {status === "loading" && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 4,
            backgroundColor: "#2a2a2a",
            flexShrink: 0,
          }}
        />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        {status === "ready" && meta?.title ? (
          <span
            className="font-mono text-[11px] font-bold truncate"
            style={{ color: "#e0e0e0" }}
          >
            {meta.title}
          </span>
        ) : (
          <span
            className="font-mono text-[10px] truncate"
            style={{ color: "#888" }}
          >
            {truncateUrl(url, 48)}
          </span>
        )}
        <span className="font-mono text-[10px]" style={{ color: "#555" }}>
          {hostname}
        </span>
      </div>
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
  const [titleCollapsed, setTitleCollapsed] = useState(false);
  const [titleIsMultiLine, setTitleIsMultiLine] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Visible posts (reaction posts filtered out)
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  // Backend-derived reaction data
  const [reactionMap, setReactionMap] = useState<
    Map<string, Record<string, number>>
  >(new Map());
  const [myReactionIndex, setMyReactionIndex] = useState<
    Map<string, Map<string, string>>
  >(new Map());
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

  // Media popover (image upload / GIF picker)
  const [mediaPopoverOpen, setMediaPopoverOpen] = useState(false);
  const [mediaPopoverTab, setMediaPopoverTab] = useState<"image" | "gif">(
    "image",
  );
  const mediaButtonRef = useRef<HTMLButtonElement>(null);
  const mediaPopoverRef = useRef<HTMLDivElement>(null);

  // Reply state
  const [replyToPost, setReplyToPost] = useState<Post | null>(null);
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});

  // Reactions version (trigger re-render of reaction rows)
  const [reactionVersion, setReactionVersion] = useState(0);

  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  // Report chat modal state
  const [reportChatModalOpen, setReportChatModalOpen] = useState(false);
  // Thread bookmark / report filled state
  const [threadBookmarked, setThreadBookmarked] = useState(false);
  const [threadReported, setThreadReported] = useState(false);

  // Voice recording state
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  // ── Floating indicators state ──
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingMentionPostId, setPendingMentionPostId] = useState<
    string | null
  >(null);

  const sessionId = getSessionId();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevPostCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Use refs so scroll/poll callbacks always read current values without stale closures
  const isAtBottomRef = useRef(true);
  const myUsernameRef = useRef<string | undefined>(undefined);
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRestoredRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
    isAtBottomRef.current = true;
  }, []);

  const loadData = useCallback(async () => {
    const [t, rawPosts, cats, profiles] = await Promise.all([
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

    // Split reaction posts from visible posts
    const visiblePosts = rawPosts.filter(
      (p) => p.mediaType !== "reaction" && !p.isDeleted,
    );
    // Keep deleted visible posts too (for tombstone display)
    const visiblePostsWithDeleted = rawPosts.filter(
      (p) => p.mediaType !== "reaction",
    );

    // ── Unread / mention tracking ──
    const newTotal = visiblePostsWithDeleted.length;
    const prevTotal = prevPostCountRef.current;
    if (newTotal > prevTotal && !isAtBottomRef.current) {
      const newPosts = visiblePostsWithDeleted.slice(prevTotal);
      const countToAdd = newPosts.filter((p) => !p.isDeleted).length;
      if (countToAdd > 0) {
        setUnreadCount((c) => c + countToAdd);
      }

      // Check for @mentions of my username in the new posts
      const username = myUsernameRef.current;
      if (username) {
        const mentionPattern = new RegExp(`@${username}\\b`, "i");
        for (let i = newPosts.length - 1; i >= 0; i--) {
          const p = newPosts[i];
          if (!p.isDeleted && p.content && mentionPattern.test(p.content)) {
            setPendingMentionPostId(String(p.id));
            break;
          }
        }
      }
    }

    setPosts(visiblePostsWithDeleted);
    setCategories(cats);

    // Aggregate reactions from backend reaction posts
    const newReactionMap = aggregateReactions(rawPosts);
    setReactionMap(newReactionMap);

    // Build my reaction index (for toggle state)
    const newMyIndex = indexMyReactions(rawPosts, sessionId);
    setMyReactionIndex(newMyIndex);

    // Build reply map from backend post content (merged with localStorage fallback)
    const backendReplyMap = buildReplyMapFromPosts(visiblePosts);
    const localMap = getReplyMap();
    setReplyMap({ ...localMap, ...backendReplyMap });

    const map = new Map<string, UserProfile>();
    for (const p of profiles) {
      map.set(p.sessionId, p);
    }
    setProfileMap(map);
  }, [threadIdBig, sessionId]);

  // Reply map is loaded in loadData (merged from backend + localStorage)

  // Record thread visit for mention badge tracking
  useEffect(() => {
    recordThreadVisit(threadIdStr);
  }, [threadIdStr]);

  // Record view (unique per session) on mount
  useEffect(() => {
    const viewKey = `chattr_view_${threadIdStr}`;
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, "1");
      backendApi.recordView(threadIdBig, sessionId).catch(() => {});
    }
  }, [threadIdBig, threadIdStr, sessionId]);

  // Detect whether the title wraps to more than one line
  // biome-ignore lint/correctness/useExhaustiveDependencies: titleCollapsed changes layout so we re-measure; intentional
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => {
      const lineHeight =
        Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
      setTitleIsMultiLine(el.scrollHeight > lineHeight * 1.5);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [thread?.title, titleCollapsed]);

  // Auto-scroll only when the current user sends a message
  useEffect(() => {
    if (posts.length > prevPostCountRef.current) {
      const newestPost = posts[posts.length - 1];
      const isOwnMessage = newestPost?.authorSessionId === sessionId;
      if (isOwnMessage) {
        scrollToBottom();
      }
    }
    prevPostCountRef.current = posts.length;
  }, [posts, scrollToBottom, sessionId]);

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
      // Save scroll position on unmount
      if (scrollContainerRef.current) {
        sessionStorage.setItem(
          `chattr_scroll_${threadIdStr}`,
          String(scrollContainerRef.current.scrollTop),
        );
      }
    };
  }, [threadIdNum, sessionId, loadData, threadIdStr]);

  // Restore scroll position on first thread load (or scroll to bottom on first visit)
  useEffect(() => {
    if (!thread || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const saved = sessionStorage.getItem(`chattr_scroll_${threadIdStr}`);
    if (saved && scrollContainerRef.current) {
      const pos = Number(saved);
      if (pos > 0) {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = pos;
          }
        });
        return;
      }
    }
    // No saved position — scroll to bottom on first visit
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [thread, threadIdStr]);

  // Track scroll position for floating indicators
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function handleScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const atBottom = distanceFromBottom < 100;

      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom;
      }

      if (atBottom) {
        setUnreadCount(0);
      }

      // Debounced scroll position save
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = setTimeout(() => {
        sessionStorage.setItem(
          `chattr_scroll_${threadIdStr}`,
          String(container.scrollTop),
        );
      }, 300);

      // Check if mention post is now visible
      if (pendingMentionPostId) {
        const el = document.getElementById(`post-${pendingMentionPostId}`);
        if (el) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const isVisible =
            elRect.top >= containerRect.top &&
            elRect.bottom <= containerRect.bottom + 80;
          if (isVisible) {
            setPendingMentionPostId(null);
          }
        }
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [pendingMentionPostId, threadIdStr]);

  // Close context menu on scroll
  useEffect(() => {
    function handleScroll() {
      setContextMenu(null);
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  // Close media popover on outside click
  useEffect(() => {
    if (!mediaPopoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        mediaButtonRef.current?.contains(e.target as Node) ||
        mediaPopoverRef.current?.contains(e.target as Node)
      )
        return;
      setMediaPopoverOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mediaPopoverOpen]);

  // My username for mention highlights
  const myProfile = profileMap.get(sessionId);
  const myUsername = myProfile?.username;
  // Keep ref in sync so loadData callback can always read the latest username
  myUsernameRef.current = myUsername;

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

  async function handleGifSelect(gifUrl: string) {
    setMediaPopoverOpen(false);

    const banned = await backendApi.isBanned(sessionId);
    if (banned) {
      toast.error("You are banned from posting.");
      return;
    }

    setSubmitting(true);
    try {
      await backendApi.createPost(
        threadIdBig,
        sessionId,
        "",
        gifUrl,
        "gif",
        null,
      );
      await loadData();
    } catch {
      toast.error("Failed to send GIF");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBubbleContextMenu(
    e: React.MouseEvent | { clientX: number; clientY: number },
    post: Post,
  ) {
    setContextMenu({
      x: (e as React.MouseEvent).clientX,
      y: (e as React.MouseEvent).clientY,
      post,
    });
  }

  async function handleBookmarkMessage(postId: bigint) {
    try {
      await backendApi.addBookmark(sessionId, "message", postId);
      toast.success("Message bookmarked");
    } catch {
      toast.error("Failed to bookmark");
    }
  }

  async function handleBookmarkThread() {
    try {
      await backendApi.addBookmark(sessionId, "thread", threadIdBig);
      setThreadBookmarked(true);
      toast.success("Chat bookmarked");
    } catch {
      toast.error("Failed to bookmark");
    }
  }

  async function handleVoiceMessage(audioDataUrl: string, _durationMs: number) {
    const banned = await backendApi.isBanned(sessionId);
    if (banned) {
      toast.error("You are banned from posting.");
      return;
    }
    setSubmitting(true);
    try {
      await backendApi.createPost(
        threadIdBig,
        sessionId,
        "",
        audioDataUrl,
        "voice",
        null,
      );
      await loadData();
    } catch {
      toast.error("Failed to send voice message");
    } finally {
      setSubmitting(false);
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

      // Determine if we need to fetch & store a link preview.
      // Only fetch for "link" type (non-embed URLs). Embed types
      // (youtube, twitch, twitter, rumble, reddit) don't use link previews.
      let linkPreview: backendApi.OgMetadata | null = null;
      const previewUrlCandidate =
        finalMediaType === "link" && finalMediaUrl
          ? finalMediaUrl
          : extractFirstLinkPreviewUrl(content.trim());

      if (previewUrlCandidate) {
        // Use cache if available to avoid duplicate backend calls
        if (ogMetadataCache.has(previewUrlCandidate)) {
          linkPreview = ogMetadataCache.get(previewUrlCandidate)!;
        } else {
          try {
            const fetchFn = previewUrlCandidate.includes("rumble.com")
              ? backendApi.fetchRumbleOgMetadata
              : backendApi.fetchOgMetadata;
            linkPreview = await withTimeout(
              fetchFn(previewUrlCandidate),
              10_000,
            );
            if (linkPreview) {
              ogMetadataCache.set(previewUrlCandidate, linkPreview);
            }
          } catch {
            // Non-blocking — send without preview if fetch fails
            linkPreview = null;
          }
        }
      }

      // Encode reply reference into content (backend-persisted)
      const finalContent = replyToPost
        ? encodeReplyContent(String(replyToPost.id), content.trim())
        : content.trim();

      const newPost = await backendApi.createPost(
        threadIdBig,
        sessionId,
        finalContent,
        finalMediaUrl,
        finalMediaType,
        linkPreview,
      );

      // Award points for posting
      backendApi.awardPoints(sessionId, 5n).catch(() => {});

      // Also store reply mapping in localStorage as fallback for old clients
      if (replyToPost && newPost) {
        const newPostId = String(newPost.id);
        const replyToPostIdStr = String(replyToPost.id);
        storeReply(newPostId, replyToPostIdStr);
        setReplyMap((prev) => ({ ...prev, [newPostId]: replyToPostIdStr }));
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
  const creatorProfile = profileMap.get(thread.creatorSessionId);
  const creatorName = creatorProfile?.username ?? thread.creatorSessionId;
  const createdAtMs = backendApi.nsToMs(thread.createdAt);

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
            {/* ── Row 1: category tag (left) + live indicator (right) ── */}
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
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
                  className="font-mono text-[10px] ml-0.5"
                  style={{ color: "#555" }}
                >
                  {Number(thread.postCount)}
                </span>
              </div>
            </div>

            {/* ── Row 2: title + chevron (only when multi-line or collapsed) ── */}
            <div className="flex items-start gap-1">
              <h1
                ref={titleRef}
                className={`font-semibold text-base leading-snug flex-1 min-w-0${titleCollapsed ? " truncate" : ""}`}
                style={{ color: "#e0e0e0" }}
              >
                {thread.title}
              </h1>
              {(titleIsMultiLine || titleCollapsed) && (
                <button
                  type="button"
                  onClick={() => setTitleCollapsed((v) => !v)}
                  className="shrink-0 p-0.5 rounded transition-colors hover:bg-white/5 mt-0.5"
                  style={{ color: "#555" }}
                  aria-label={
                    titleCollapsed ? "Show full title" : "Collapse title"
                  }
                  data-ocid="thread.title_toggle"
                >
                  {titleCollapsed ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronUp size={13} />
                  )}
                </button>
              )}
            </div>

            {/* ── Row 3: creator username + timestamp + bookmark/report (right) ── */}
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="font-mono"
                style={{ fontSize: "0.75rem", color: "#444" }}
              >
                {creatorName}
              </span>
              <span
                className="font-mono"
                style={{ fontSize: "0.75rem", color: "#333" }}
              >
                {timeAgo(createdAtMs)}
              </span>
              <div className="flex items-center gap-0.5 ml-auto">
                <button
                  type="button"
                  onClick={handleBookmarkThread}
                  className="p-1 rounded transition-colors hover:bg-white/5"
                  style={{ color: threadBookmarked ? "#f0c040" : "#444" }}
                  aria-label="Bookmark this chat"
                  data-ocid="thread.bookmark_button"
                >
                  <Bookmark
                    size={12}
                    fill={threadBookmarked ? "#f0c040" : "none"}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReportChatModalOpen(true);
                    setThreadReported(true);
                  }}
                  className="p-1 rounded transition-colors hover:bg-white/5"
                  style={{ color: threadReported ? "#c0392b" : "#444" }}
                  aria-label="Report this chat"
                  data-ocid="thread.report_chat_button"
                >
                  <Flag size={12} fill={threadReported ? "#c0392b" : "none"} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable message list ──────────────────────── */}
      <div
        ref={scrollContainerRef}
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
                  reactionVersion={reactionVersion}
                  reactionMap={reactionMap}
                  myReactionIndex={myReactionIndex}
                  onReactionChange={() => {
                    setReactionVersion((v) => v + 1);
                    // Reload data shortly after to pick up the new reaction post
                    setTimeout(() => loadData(), 300);
                  }}
                  onContextMenu={handleBubbleContextMenu}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Floating indicators (Telegram-style) ── */}
        {(unreadCount > 0 || pendingMentionPostId) && (
          <div
            style={{
              position: "sticky",
              bottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "flex-end",
              paddingRight: 16,
              pointerEvents: "none",
              zIndex: 30,
            }}
          >
            {/* @Mention button — stacked above unread button */}
            {pendingMentionPostId && (
              <button
                type="button"
                onClick={() => {
                  scrollToPost(pendingMentionPostId);
                  // Clear after a delay to allow scroll + visibility check to run
                  setTimeout(() => {
                    setPendingMentionPostId(null);
                  }, 800);
                }}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 transition-all"
                style={{
                  backgroundColor: "#1e1e1e",
                  border: "1px solid #2a2a2a",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                  pointerEvents: "auto",
                  color: "#4a9e5c",
                  cursor: "pointer",
                }}
                aria-label="Jump to mention"
                data-ocid="thread.scroll_to_mention_button"
              >
                <span
                  className="font-mono text-sm font-bold"
                  style={{ color: "#4a9e5c" }}
                >
                  @
                </span>
              </button>
            )}

            {/* New messages button */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 transition-all"
                style={{
                  backgroundColor: "#1e1e1e",
                  border: "1px solid #2a2a2a",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                  pointerEvents: "auto",
                  cursor: "pointer",
                }}
                aria-label={`${unreadCount} new message${unreadCount > 1 ? "s" : ""} — scroll to bottom`}
                data-ocid="thread.scroll_to_bottom_button"
              >
                <ChevronDown size={16} style={{ color: "#4a9e5c" }} />
                <span
                  className="font-mono text-xs font-bold"
                  style={{ color: "#ffffff" }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              </button>
            )}
          </div>
        )}
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
              {/* Combined media button (image + GIF) */}
              <div className="relative shrink-0">
                <button
                  ref={mediaButtonRef}
                  type="button"
                  onClick={() => {
                    setMediaPopoverOpen((v) => !v);
                    setMediaPopoverTab("image");
                  }}
                  className="p-2 rounded-full transition-colors"
                  style={{
                    color:
                      uploadedImage || mediaPopoverOpen ? "#4a9e5c" : "#555",
                    backgroundColor:
                      uploadedImage || mediaPopoverOpen
                        ? "#4a9e5c18"
                        : "transparent",
                  }}
                  aria-label="Media"
                  data-ocid="thread.media_button"
                >
                  <ImagePlus size={16} />
                </button>

                {/* Media popover */}
                {mediaPopoverOpen && (
                  <div
                    ref={mediaPopoverRef}
                    className="absolute z-50"
                    style={{
                      bottom: "calc(100% + 8px)",
                      left: 0,
                    }}
                    data-ocid="thread.media_popover"
                  >
                    <div
                      className="flex flex-col rounded-xl overflow-hidden shadow-2xl"
                      style={{
                        backgroundColor: "#111",
                        border: "1px solid #2a2a2a",
                        minWidth: 160,
                        boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
                      }}
                    >
                      {/* Tab bar */}
                      {mediaPopoverTab === "image" && (
                        <div
                          className="flex items-center gap-1 px-2 pt-2 pb-1"
                          style={{ borderBottom: "1px solid #1e1e1e" }}
                        >
                          <button
                            type="button"
                            onClick={() => setMediaPopoverTab("image")}
                            className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-all"
                            style={{
                              backgroundColor: "#4a9e5c18",
                              color: "#4a9e5c",
                              border: "1px solid #4a9e5c44",
                            }}
                          >
                            📎 Image
                          </button>
                          <button
                            type="button"
                            onClick={() => setMediaPopoverTab("gif")}
                            className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-all"
                            style={{
                              backgroundColor: "transparent",
                              color: "#555",
                              border: "1px solid transparent",
                            }}
                          >
                            GIF
                          </button>
                        </div>
                      )}

                      {/* Image tab */}
                      {mediaPopoverTab === "image" && (
                        <button
                          type="button"
                          onClick={() => {
                            fileInputRef.current?.click();
                            setMediaPopoverOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-3 font-mono text-xs text-left transition-colors hover:bg-white/5"
                          style={{ color: "#ccc" }}
                          data-ocid="thread.image_upload_button"
                        >
                          <ImagePlus size={13} style={{ color: "#4a9e5c" }} />
                          Upload image
                        </button>
                      )}

                      {/* GIF tab */}
                      {mediaPopoverTab === "gif" && (
                        <GifPicker
                          onSelect={handleGifSelect}
                          onClose={() => setMediaPopoverOpen(false)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {/* Text input — hidden while voice recording */}
              {!isVoiceRecording && (
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
              )}

              {/* While recording, show spacer so mic button stays right-aligned */}
              {isVoiceRecording && <div className="flex-1" />}

              {/* Send button (when there's content) OR Mic button (idle) */}
              {canSend ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="shrink-0 p-2.5 rounded-full transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: "#4a9e5c",
                    color: "#fff",
                  }}
                  aria-label="Send message"
                  data-ocid="thread.send_button"
                >
                  <SendHorizontal size={16} />
                </button>
              ) : (
                <VoiceRecorder
                  disabled={submitting}
                  onSend={handleVoiceMessage}
                  onCancel={() => setIsVoiceRecording(false)}
                  onRecordingStateChange={setIsVoiceRecording}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          state={contextMenu}
          threadId={threadIdStr}
          sessionId={sessionId}
          onClose={() => setContextMenu(null)}
          onReply={(post) => {
            setReplyToPost(post);
            setContextMenu(null);
          }}
          onReport={() => {
            setReportModalOpen(true);
          }}
          onDelete={() => loadData()}
          onBookmark={handleBookmarkMessage}
        />
      )}

      {/* Report Message Modal */}
      <ReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
      />

      {/* Report Chat Modal */}
      <ReportChatModal
        open={reportChatModalOpen}
        threadId={threadIdStr}
        sessionId={sessionId}
        onClose={() => setReportChatModalOpen(false)}
      />
    </div>
  );
}
