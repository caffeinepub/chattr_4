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
import { Bookmark, Eye, Flag, MessageSquare } from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { Category, Post, Thread } from "../backendApi";
import LevelBadge from "../components/LevelBadge";
import { detectMediaType, getSessionId } from "../store";
import { getAllLastVisits } from "../utils/localReactions";

// ─── OG metadata cache for catalog (module-level) ────────────────
const catalogOgCache = new Map<string, backendApi.OgMetadata>();

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
  profiles: backendApi.UserProfile[];
  allPosts: Post[];
  index: number;
  mentionCount: number;
  sessionId: string;
  onClick: () => void;
  onBookmark: (threadId: bigint) => void;
  onReport: (threadId: bigint) => void;
  isBookmarked: boolean;
  isReported: boolean;
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

// ─── Tweet text data ──────────────────────────────────────────────
interface TweetCardData {
  authorName: string;
  text: string;
}

async function fetchTweetCardData(url: string): Promise<TweetCardData | null> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const resp = await fetch(oembedUrl);
    if (!resp.ok) return null;
    const data = await resp.json();
    const div = document.createElement("div");
    div.innerHTML = data.html ?? "";
    const paragraphs = div.querySelectorAll("p");
    const rawText =
      paragraphs.length > 0
        ? (paragraphs[0].textContent ?? "")
        : (div.textContent ?? "");
    const trimmed = rawText.trim().slice(0, 100);
    return {
      authorName: data.author_name ?? "X / Twitter",
      text: trimmed,
    };
  } catch {
    return null;
  }
}

// ─── Twitter thumbnail card ───────────────────────────────────────
function TwitterThumbnailCard({ url }: { url: string }) {
  const [cardData, setCardData] = useState<TweetCardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTweetCardData(url).then((data) => {
      if (!cancelled) {
        setCardData(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 6,
        marginBottom: 8,
        backgroundColor: "#111",
        border: "1px solid #2a2a2a",
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
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
        {loading ? (
          <span className="font-mono text-[10px]" style={{ color: "#555" }}>
            Loading tweet…
          </span>
        ) : (
          <span
            className="font-mono text-[10px] font-semibold"
            style={{ color: "#aaa" }}
          >
            {cardData?.authorName ?? "X / Twitter"}
          </span>
        )}
      </div>
      {!loading && cardData?.text && (
        <p
          className="font-mono text-[11px] leading-snug"
          style={{
            color: "#bbb",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            margin: 0,
          }}
        >
          {cardData.text}
          {cardData.text.length >= 100 ? "…" : ""}
        </p>
      )}
      {!loading && !cardData && (
        <span className="font-mono text-[10px]" style={{ color: "#555" }}>
          X / Twitter post
        </span>
      )}
    </div>
  );
}

// ─── Timeout helper ───────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

// ─── Rumble thumbnail card (OG metadata via backend outcall) ─────
function RumbleThumbnailCard({ url }: { url: string }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setThumbUrl(null);

    // Use Microlink to fetch Rumble thumbnails — handles CORS and bot detection server-side
    withTimeout(backendApi.fetchMicrolinkMetadata(url), 15_000)
      .then((meta) => {
        if (!cancelled) {
          setThumbUrl(meta.imageUrl ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThumbUrl(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 6,
          marginBottom: 8,
          backgroundColor: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="font-mono text-[10px]" style={{ color: "#555" }}>
          Loading…
        </span>
      </div>
    );
  }

  if (thumbUrl) {
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
          src={thumbUrl}
          alt="Rumble video thumbnail"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
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
              backgroundColor: "rgba(133,199,66,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden="true"
            >
              <polygon points="6,4 20,12 6,20" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // Fallback badge when no thumbnail found
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 6,
        marginBottom: 8,
        backgroundColor: "#85c74222",
        border: "1px solid #85c74255",
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
        fill="#85c742"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h4c2.21 0 4 1.79 4 4 0 1.1-.45 2.1-1.17 2.83L17 18h-2.24l-1.5-2H11v-2zm0-4h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2v4z" />
      </svg>
      <span className="font-mono text-xs" style={{ color: "#85c742" }}>
        Rumble video
      </span>
    </div>
  );
}

// ─── Twitch thumbnail card (CDN-only, no backend scraping) ──────
// Twitch blocks server scrapers. We build the CDN thumbnail URL directly.
function TwitchThumbnailCard({ url }: { url: string }) {
  // Compute the thumbnail URL synchronously — no async needed
  const thumbUrl = (() => {
    // Skip VOD links (no public CDN thumbnail without API key)
    if (/twitch\.tv\/videos\//i.test(url)) return null;
    const channelMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
    if (!channelMatch) return null;
    const channel = channelMatch[1].toLowerCase();
    if (
      ["videos", "directory", "settings", "login", "signup"].includes(channel)
    )
      return null;
    return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-640x360.jpg`;
  })();

  const [imgError, setImgError] = useState(false);
  const finalThumb = imgError ? null : thumbUrl;

  if (finalThumb) {
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
          src={finalThumb}
          alt="Twitch stream thumbnail"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
          onError={() => setImgError(true)}
        />
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
              backgroundColor: "rgba(100,65,164,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden="true"
            >
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // Fallback badge
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

// ─── Generic link thumbnail card (uses backend OG outcall) ────────
function LinkThumbnailCard({ url }: { url: string }) {
  const [meta, setMeta] = useState<backendApi.OgMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (catalogOgCache.has(url)) {
      setMeta(catalogOgCache.get(url)!);
      setLoading(false);
      return;
    }

    // Use Microlink for all general link thumbnails (handles CORS + bot detection)
    withTimeout(backendApi.fetchMicrolinkMetadata(url), 15_000)
      .then((data) => {
        if (!cancelled) {
          catalogOgCache.set(url, data);
          setMeta(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMeta(null);
          setLoading(false);
        }
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

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 6,
          marginBottom: 8,
          backgroundColor: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="font-mono text-[10px]" style={{ color: "#555" }}>
          Loading…
        </span>
      </div>
    );
  }

  if (meta?.imageUrl) {
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
          src={meta.imageUrl}
          alt={meta.title ?? hostname}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "6px 8px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          }}
        >
          <span className="font-mono text-[10px]" style={{ color: "#ccc" }}>
            {hostname}
          </span>
        </div>
      </div>
    );
  }

  // Fallback: text card
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 6,
        marginBottom: 8,
        backgroundColor: "#111",
        border: "1px solid #2a2a2a",
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#888"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span
          className="font-mono text-[10px] font-semibold"
          style={{ color: "#888" }}
        >
          {hostname}
        </span>
      </div>
      {meta?.title && (
        <p
          className="font-mono text-[11px] leading-snug"
          style={{
            color: "#bbb",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            margin: 0,
          }}
        >
          {meta.title}
        </p>
      )}
    </div>
  );
}

// ─── Extract a human-readable title from a Reddit URL ────────────
function extractRedditTitleFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    // /r/{sub}/comments/{id}/{title_slug}/
    const match = pathname.match(/\/r\/([^/]+)\/comments\/[^/]+\/([^/]+)/);
    if (match) {
      const subreddit = match[1];
      const titleSlug = match[2];
      // Convert underscores/hyphens to spaces, decode URI, title-case
      const humanTitle = decodeURIComponent(titleSlug)
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return humanTitle ? `${humanTitle} (r/${subreddit})` : `r/${subreddit}`;
    }
    // Just /r/{sub}
    const subMatch = pathname.match(/\/r\/([^/]+)/);
    if (subMatch) return `r/${subMatch[1]}`;
  } catch {
    /* ignore */
  }
  return null;
}

// ─── Reddit card for catalog thumbnail ───────────────────────────
function RedditThumbnailCard({ url }: { url: string }) {
  // Extract title from URL slug immediately (reliable, no network needed)
  const urlTitle = extractRedditTitleFromUrl(url);
  const [title, setTitle] = useState<string | null>(urlTitle);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Always set URL slug title immediately as a fallback
    setTitle(extractRedditTitleFromUrl(url) ?? "Reddit post");

    // Try backend OG metadata for image and possibly a cleaner title (10s timeout)
    withTimeout(backendApi.fetchOgMetadata(url), 10_000)
      .then((meta) => {
        if (!cancelled) {
          // Prefer OG title if it looks more complete than URL slug
          if (meta.title && meta.title.length > 5) {
            setTitle(meta.title);
          }
          setImageUrl(meta.imageUrl ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // If we have an image, show 16:9 thumbnail with Reddit logo overlay + title below
  if (!loading && imageUrl) {
    return (
      <div
        style={{
          width: "100%",
          borderRadius: 6,
          marginBottom: 8,
          backgroundColor: "#111",
          border: "1px solid #2a2a2a",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <img
            src={imageUrl}
            alt="Reddit post"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="#ff4500"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="10" fill="#ff4500" />
              <path
                d="M16.67 10a1.46 1.46 0 0 0-2.47-1 7.12 7.12 0 0 0-3.85-1.23l.65-3.08 2.13.45a1 1 0 1 0 .14-.64l-2.38-.5a.26.26 0 0 0-.31.2l-.73 3.44a7.14 7.14 0 0 0-3.89 1.23 1.46 1.46 0 1 0-1.61 2.39 2.87 2.87 0 0 0 0 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 0 0 0-.44 1.46 1.46 0 0 0 .57-1.26zM7.27 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.58 2.71a3.58 3.58 0 0 1-2.85.89 3.58 3.58 0 0 1-2.85-.89.23.23 0 0 1 .33-.33 3.15 3.15 0 0 0 2.52.71 3.15 3.15 0 0 0 2.52-.71.23.23 0 0 1 .33.33zm-.16-1.71a1 1 0 1 1 1-1 1 1 0 0 1-1 1z"
                fill="white"
              />
            </svg>
          </div>
        </div>
        {title && (
          <div style={{ padding: "6px 10px" }}>
            <p
              className="font-mono text-[11px] leading-snug"
              style={{
                color: "#bbb",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                margin: 0,
              }}
            >
              {title}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Text-only card (no image)
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 6,
        marginBottom: 8,
        backgroundColor: "#111",
        border: "1px solid #2a2a2a",
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        {/* Reddit alien logo (Snoo) */}
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
        <span
          className="font-mono text-[10px] font-semibold"
          style={{ color: "#ff4500" }}
        >
          Reddit
        </span>
      </div>
      {loading ? (
        <span className="font-mono text-[10px]" style={{ color: "#555" }}>
          Loading post…
        </span>
      ) : title ? (
        <p
          className="font-mono text-[11px] leading-snug"
          style={{
            color: "#bbb",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            margin: 0,
          }}
        >
          {title}
        </p>
      ) : (
        <span className="font-mono text-[10px]" style={{ color: "#555" }}>
          Reddit post
        </span>
      )}
    </div>
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
    return <TwitterThumbnailCard url={url} />;
  }

  if (type === "twitch") {
    return <TwitchThumbnailCard url={url} />;
  }

  if (type === "rumble") {
    return <RumbleThumbnailCard url={url} />;
  }

  if (type === "reddit") {
    return <RedditThumbnailCard url={url} />;
  }

  if (type === "link") {
    return <LinkThumbnailCard url={url} />;
  }

  return null;
}

function ThreadCard({
  thread,
  categories,
  profiles,
  allPosts,
  index,
  mentionCount,
  onClick,
  onBookmark,
  onReport,
  isBookmarked,
  isReported,
}: ThreadCardProps) {
  const category = categories.find((c) => c.id === thread.categoryId);
  const live = isThreadLive(thread.lastActivity);
  const catColor = category ? getCategoryColor(category.name) : "#555";
  const createdAtMs = backendApi.nsToMs(thread.createdAt);
  const creatorProfile = profiles.find(
    (p) => p.sessionId === thread.creatorSessionId,
  );
  const creatorName = creatorProfile?.username ?? thread.creatorSessionId;

  // Live user count: distinct session IDs posting in last 10 mins
  const tenMinsAgo = Date.now() - 10 * 60 * 1000;
  const liveUsers = new Set(
    allPosts
      .filter(
        (p) =>
          String(p.threadId) === String(thread.id) &&
          backendApi.nsToMs(p.createdAt) > tenMinsAgo,
      )
      .map((p) => p.authorSessionId),
  ).size;

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

      {/* Category + Live + live user count */}
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
          {liveUsers > 0 && (
            <span
              className="font-mono text-[0.75rem]"
              style={{ color: "#555" }}
            >
              {liveUsers}
            </span>
          )}
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
      <div className="flex items-center justify-between gap-2">
        {/* Left: username + timestamp */}
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {creatorProfile?.level && <LevelBadge level={creatorProfile.level} />}
          <span
            className="font-mono text-xs truncate"
            style={{ color: "#444" }}
          >
            {creatorName}
          </span>
          <span
            className="font-mono text-xs shrink-0"
            style={{ color: "#333" }}
          >
            {timeAgo(createdAtMs)}
          </span>
        </div>

        {/* Right: post count icon + view count icon + bookmark + report */}
        <div
          className="flex items-center gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {/* Post count */}
          {Number(thread.postCount) > 0 && (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[10px] px-1 py-0.5 rounded"
              style={{ color: "#444" }}
              title={`${Number(thread.postCount)} posts`}
            >
              <MessageSquare size={11} />
              {Number(thread.postCount)}
            </span>
          )}
          {/* View count */}
          {Number(thread.viewCount) > 0 && (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[10px] px-1 py-0.5 rounded"
              style={{ color: "#444" }}
              title={`${Number(thread.viewCount)} views`}
            >
              <Eye size={11} />
              {Number(thread.viewCount)}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBookmark(thread.id);
            }}
            className="p-1 rounded transition-colors hover:bg-white/5"
            style={{ color: isBookmarked ? "#f0c040" : "#444" }}
            data-ocid={`catalog.thread.bookmark_button.${index}`}
            aria-label="Bookmark this chat"
          >
            <Bookmark size={11} fill={isBookmarked ? "#f0c040" : "none"} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReport(thread.id);
            }}
            className="p-1 rounded transition-colors hover:bg-white/5"
            style={{ color: isReported ? "#c0392b" : "#444" }}
            data-ocid={`catalog.thread.report_button.${index}`}
            aria-label="Report this chat"
          >
            <Flag size={11} fill={isReported ? "#c0392b" : "none"} />
          </button>
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

// ─── Report reasons ───────────────────────────────────────────────
const CATALOG_REPORT_REASONS = [
  "Spam",
  "Harassment",
  "Misinformation",
  "Inappropriate Content",
  "Other",
] as const;

// ─── Report Chat Modal (catalog) ─────────────────────────────────
interface CatalogReportModalProps {
  open: boolean;
  threadId: bigint | null;
  sessionId: string;
  onClose: () => void;
}

function CatalogReportModal({
  open,
  threadId,
  sessionId,
  onClose,
}: CatalogReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!selectedReason || !threadId) return;
    setSubmitting(true);
    try {
      await backendApi.reportThread(threadId, sessionId, selectedReason);
      toast.success("Chat reported");
      setSelectedReason("");
      onClose();
    } catch {
      toast.error("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedReason("");
          onClose();
        }
      }}
    >
      <DialogContent
        style={{
          backgroundColor: "#1a1a1a",
          border: "1px solid #2a2a2a",
          color: "#e0e0e0",
        }}
        data-ocid="catalog_report_chat.dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-mono" style={{ color: "#c0392b" }}>
            Report this chat
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="font-mono text-xs" style={{ color: "#888" }}>
            Select a reason for reporting this chat:
          </p>
          <div className="space-y-2">
            {CATALOG_REPORT_REASONS.map((reason, i) => (
              <label
                key={reason}
                className="flex items-center gap-2 cursor-pointer"
                data-ocid={`catalog_report_chat.reason.radio.${i + 1}`}
              >
                <input
                  type="radio"
                  name="catalog-report-reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)}
                  style={{ accentColor: "#c0392b" }}
                />
                <span
                  className="font-mono text-sm"
                  style={{ color: "#e0e0e0" }}
                >
                  {reason}
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedReason("");
              onClose();
            }}
            className="font-mono text-xs"
            style={{ color: "#555" }}
            data-ocid="catalog_report_chat.cancel_button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason || submitting}
            className="font-mono text-xs"
            style={{
              backgroundColor: "#c0392b",
              color: "#fff",
              opacity: !selectedReason || submitting ? 0.5 : 1,
            }}
            data-ocid="catalog_report_chat.submit_button"
          >
            {submitting ? "Submitting…" : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tweet preview data ───────────────────────────────────────────
interface TweetPreview {
  authorName: string;
  text: string;
}

// ─── Reddit preview data for dialog ──────────────────────────────
interface DialogRedditPreview {
  title: string;
  subreddit: string;
}

export default function CatalogPage() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<backendApi.UserProfile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<bigint | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>(
    {},
  );

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportThreadId, setReportThreadId] = useState<bigint | null>(null);

  // Per-thread bookmark / report filled state (keyed by thread id string)
  const [bookmarkedThreadIds, setBookmarkedThreadIds] = useState<Set<string>>(
    new Set(),
  );
  const [reportedThreadIds, setReportedThreadIds] = useState<Set<string>>(
    new Set(),
  );

  // Media attachment state
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<string>("none");
  const [newUploadedImage, setNewUploadedImage] = useState<string | null>(null);
  const [tweetPreview, setTweetPreview] = useState<TweetPreview | null>(null);
  const [tweetLoading, setTweetLoading] = useState(false);
  const [redditPreview, setRedditPreview] =
    useState<DialogRedditPreview | null>(null);
  const [redditLoading, setRedditLoading] = useState(false);
  const [linkOgMeta, setLinkOgMeta] = useState<backendApi.OgMetadata | null>(
    null,
  );
  const [linkOgLoading, setLinkOgLoading] = useState(false);
  const [rumbleOgMeta, setRumbleOgMeta] =
    useState<backendApi.OgMetadata | null>(null);
  const [rumbleOgLoading, setRumbleOgLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [cats, sortedThreadList, profileList, posts] = await Promise.all([
      backendApi.getCategories(),
      backendApi.getSortedThreads(),
      backendApi.getAllProfiles(),
      backendApi.getAllPosts(),
    ]);
    setCategories(cats);
    setThreads(sortedThreadList.filter((t) => !t.isArchived && !t.isClosed));
    setProfiles(profileList);
    setAllPosts(posts);
    setLoading(false);

    // Get my username for mention detection
    const myProfile = profileList.find((p) => p.sessionId === sessionId);
    const username = myProfile?.username ?? null;

    // Compute mention badges
    const lastVisits = getAllLastVisits();
    const counts = computeMentionCounts(posts, username, lastVisits);
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

  // Already sorted by composite activity score from backend
  const sortedThreads = filteredThreads;

  // Only show categories that have at least one active thread
  const categoriesWithThreads = categories.filter((cat) =>
    threads.some((t) => t.categoryId === cat.id),
  );

  // Bookmark a thread
  async function handleBookmarkThread(threadId: bigint) {
    try {
      await backendApi.addBookmark(sessionId, "thread", threadId);
      setBookmarkedThreadIds((prev) => new Set([...prev, String(threadId)]));
      toast.success("Chat bookmarked");
    } catch {
      toast.error("Failed to bookmark");
    }
  }

  // Open report modal for a thread
  function handleReportThread(threadId: bigint) {
    setReportedThreadIds((prev) => new Set([...prev, String(threadId)]));
    setReportThreadId(threadId);
    setReportModalOpen(true);
  }

  // Handle media URL input change
  function handleMediaUrlChange(url: string) {
    setNewMediaUrl(url);
    setNewUploadedImage(null);
    setTweetPreview(null);
    setRedditPreview(null);
    setLinkOgMeta(null);
    setRumbleOgMeta(null);

    if (!url.trim()) {
      setNewMediaType("none");
      return;
    }

    const detected = detectMediaType(url);
    setNewMediaType(detected);

    if (detected === "twitter") {
      fetchTweetPreview(url);
    } else if (detected === "reddit") {
      fetchDialogRedditPreview(url);
    } else if (detected === "rumble") {
      fetchRumblePreview(url);
    } else if (detected === "link") {
      fetchLinkOgPreview(url);
    }
  }

  async function fetchLinkOgPreview(url: string) {
    setLinkOgLoading(true);
    setLinkOgMeta(null);
    try {
      const data = await backendApi.fetchMicrolinkMetadata(url);
      catalogOgCache.set(url, data);
      setLinkOgMeta(data);
    } catch {
      setLinkOgMeta({});
    } finally {
      setLinkOgLoading(false);
    }
  }

  async function fetchRumblePreview(url: string) {
    setRumbleOgLoading(true);
    setRumbleOgMeta(null);
    try {
      // Use Microlink — handles CORS and Rumble's bot detection
      const data = await backendApi.fetchMicrolinkMetadata(url);
      setRumbleOgMeta(data);
    } catch {
      setRumbleOgMeta({});
    } finally {
      setRumbleOgLoading(false);
    }
  }

  async function fetchDialogRedditPreview(url: string) {
    setRedditLoading(true);
    // Set slug-derived title immediately
    const slugTitle = extractRedditTitleFromUrl(url) ?? "Reddit post";
    setRedditPreview({ title: slugTitle, subreddit: "" });
    try {
      const meta = await backendApi.fetchOgMetadata(url);
      if (meta.title && meta.title.length > 5) {
        setRedditPreview({ title: meta.title, subreddit: "" });
      }
    } catch {
      // Keep slug title
    } finally {
      setRedditLoading(false);
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
    setRedditPreview(null);
    setRedditLoading(false);
    setLinkOgMeta(null);
    setLinkOgLoading(false);
    setRumbleOgMeta(null);
    setRumbleOgLoading(false);
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

        // For Rumble, resolve the real og:image thumbnail URL via Microlink so room cards display it
        if (newMediaType === "rumble") {
          try {
            const ogData =
              (rumbleOgMeta?.imageUrl ? rumbleOgMeta : null) ??
              (await backendApi.fetchMicrolinkMetadata(thumbnailUrl));
            if (ogData.imageUrl) {
              thumbnailUrl = ogData.imageUrl;
              thumbnailType = "image";
            }
          } catch {
            // Keep original URL as fallback
          }
        }
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

      toast.success("Chat created");
      // Award points for creating a chat
      backendApi.awardPoints(sessionId, 10n).catch(() => {});
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
      newMediaType !== "text");

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
          data-ocid="catalog.new_chat_button"
        >
          + New Chat
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
        {categoriesWithThreads.map((cat) => {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
          {sortedThreads.map((thread, i) => (
            <ThreadCard
              key={String(thread.id)}
              thread={thread}
              categories={categories}
              profiles={profiles}
              allPosts={allPosts}
              index={i + 1}
              mentionCount={mentionCounts[String(thread.id)] ?? 0}
              sessionId={sessionId}
              onClick={() =>
                navigate({
                  to: "/thread/$id",
                  params: { id: String(thread.id) },
                })
              }
              onBookmark={handleBookmarkThread}
              onReport={handleReportThread}
              isBookmarked={bookmarkedThreadIds.has(String(thread.id))}
              isReported={reportedThreadIds.has(String(thread.id))}
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
          data-ocid="new_chat.dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-mono" style={{ color: "#4a9e5c" }}>
              New Chat
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
                placeholder="Chat title..."
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
                    maxHeight: "200px",
                    overflowY: "auto",
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
                  placeholder="Paste image, YouTube, Twitch, Rumble, Reddit, or X/Twitter URL..."
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

                  {/* Rumble preview */}
                  {newMediaType === "rumble" && (
                    <div style={{ width: "100%" }}>
                      {rumbleOgLoading && (
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "16/9",
                            backgroundColor: "#1a1a1a",
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            className="font-mono text-xs"
                            style={{ color: "#555" }}
                          >
                            Loading Rumble preview…
                          </span>
                        </div>
                      )}
                      {!rumbleOgLoading && rumbleOgMeta?.imageUrl && (
                        <div style={{ width: "100%" }}>
                          <div
                            style={{
                              width: "100%",
                              aspectRatio: "16/9",
                              borderRadius: 4,
                              overflow: "hidden",
                              position: "relative",
                            }}
                          >
                            <img
                              src={rumbleOgMeta.imageUrl}
                              alt={rumbleOgMeta.title ?? "Rumble video"}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          </div>
                          {rumbleOgMeta.title && (
                            <p
                              className="font-mono text-xs mt-1"
                              style={{ color: "#aaa", margin: "4px 0 0" }}
                            >
                              {rumbleOgMeta.title}
                            </p>
                          )}
                        </div>
                      )}
                      {!rumbleOgLoading && !rumbleOgMeta?.imageUrl && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            backgroundColor: "#85c74222",
                            border: "1px solid #85c74255",
                            borderRadius: 4,
                            padding: "6px 10px",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="#85c742"
                            aria-hidden="true"
                            style={{ flexShrink: 0 }}
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h4c2.21 0 4 1.79 4 4 0 1.1-.45 2.1-1.17 2.83L17 18h-2.24l-1.5-2H11v-2zm0-4h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2v4z" />
                          </svg>
                          <span
                            className="font-mono text-xs"
                            style={{ color: "#85c742" }}
                          >
                            Rumble video
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reddit preview */}
                  {newMediaType === "reddit" && (
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
                        {redditLoading ? (
                          <span
                            className="font-mono text-xs"
                            style={{ color: "#555" }}
                          >
                            Loading…
                          </span>
                        ) : (
                          <>
                            <span
                              className="font-mono text-xs font-semibold"
                              style={{ color: "#ff4500" }}
                            >
                              Reddit
                            </span>
                            {redditPreview?.subreddit && (
                              <span
                                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: "#ff450022",
                                  color: "#ff6633",
                                  border: "1px solid #ff450033",
                                }}
                              >
                                {redditPreview.subreddit}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {!redditLoading && redditPreview?.title && (
                        <p
                          className="font-mono text-xs"
                          style={{ color: "#888", lineHeight: 1.5, margin: 0 }}
                        >
                          {redditPreview.title.slice(0, 100)}
                          {redditPreview.title.length > 100 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Generic link preview (OG metadata) */}
                  {newMediaType === "link" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        backgroundColor: "#111",
                        border: "1px solid #2a2a2a",
                        borderRadius: 4,
                        padding: "8px 10px",
                      }}
                    >
                      {linkOgLoading ? (
                        <>
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 4,
                              backgroundColor: "#2a2a2a",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            className="font-mono text-xs"
                            style={{ color: "#555" }}
                          >
                            Loading preview…
                          </span>
                        </>
                      ) : (
                        <>
                          {linkOgMeta?.imageUrl && (
                            <img
                              src={linkOgMeta.imageUrl}
                              alt={linkOgMeta.title ?? "Link preview"}
                              style={{
                                width: 44,
                                height: 44,
                                objectFit: "cover",
                                borderRadius: 4,
                                flexShrink: 0,
                              }}
                              onError={(e) => {
                                (
                                  e.currentTarget as HTMLImageElement
                                ).style.display = "none";
                              }}
                            />
                          )}
                          <div style={{ minWidth: 0 }}>
                            {linkOgMeta?.title && (
                              <p
                                className="font-mono text-xs font-semibold truncate"
                                style={{ color: "#e0e0e0", margin: 0 }}
                              >
                                {linkOgMeta.title}
                              </p>
                            )}
                            <p
                              className="font-mono text-[10px] truncate"
                              style={{ color: "#555", margin: 0 }}
                            >
                              {(() => {
                                try {
                                  return new URL(newMediaUrl).hostname.replace(
                                    /^www\./,
                                    "",
                                  );
                                } catch {
                                  return newMediaUrl;
                                }
                              })()}
                            </p>
                          </div>
                        </>
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
              {creating ? "Creating…" : "Create Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Chat Modal */}
      <CatalogReportModal
        open={reportModalOpen}
        threadId={reportThreadId}
        sessionId={sessionId}
        onClose={() => {
          setReportModalOpen(false);
          setReportThreadId(null);
        }}
      />
    </div>
  );
}
