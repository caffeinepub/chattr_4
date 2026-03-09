// ============================================================
// backendApi.ts — thin async wrapper around the Motoko backend
// ============================================================

import type { backendInterface } from "./backend";
import { createActorWithConfig } from "./config";

// ─── Types re-exported ────────────────────────────────────────
export type {
  Ban,
  Bookmark,
  Category,
  Post,
  Thread,
  ThreadReport,
  UserProfile,
} from "./backend";

// ─── Lazy actor singleton ─────────────────────────────────────
let _actor: backendInterface | null = null;

async function getActor(): Promise<backendInterface> {
  if (!_actor) {
    _actor = await createActorWithConfig();
  }
  return _actor;
}

// ─── Timestamp conversion helper ──────────────────────────────
// Backend timestamps are nanoseconds (bigint). Convert to ms for Date/display.
export function nsToMs(ns: bigint): number {
  return Number(ns) / 1_000_000;
}

// ─── Canonical category list ──────────────────────────────────
const CANONICAL_CATEGORIES = [
  "General",
  "Politics",
  "Science",
  "Technology",
  "Entertainment",
  "Sports",
  "Gaming",
  "Music",
  "Art",
  "Finance",
  "Education",
  "Religion",
  "Random",
];

// ─── Seed / initialize ────────────────────────────────────────
export async function seedCategories(): Promise<void> {
  try {
    const actor = await getActor();
    await actor.initialize();
  } catch {
    // Fire and forget — ignore errors
  }
}

// ─── Sync categories to canonical list (idempotent) ───────────
export async function syncCategoriesToCanonical(): Promise<void> {
  try {
    const actor = await getActor();
    // Run initialize first in case it's a fresh canister
    try {
      await actor.initialize();
    } catch {
      /* ignore */
    }

    const existing = await actor.getCategories();

    // Deduplicate: keep only the first occurrence of each name, delete the rest
    const seenNames = new Set<string>();
    for (const cat of existing) {
      if (seenNames.has(cat.name)) {
        // Duplicate — delete it
        try {
          await actor.deleteCategory(cat.id);
        } catch {
          /* ignore */
        }
      } else {
        seenNames.add(cat.name);
      }
    }

    // Re-fetch after deduplication
    const deduped = await actor.getCategories();
    const existingNames = deduped.map((c) => c.name);

    // Add missing canonical categories
    for (const name of CANONICAL_CATEGORIES) {
      if (!existingNames.includes(name)) {
        try {
          await actor.addCategory(name);
        } catch {
          /* ignore */
        }
      }
    }

    // Remove categories not in canonical list
    for (const cat of deduped) {
      if (!CANONICAL_CATEGORIES.includes(cat.name)) {
        try {
          await actor.deleteCategory(cat.id);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    // Fire and forget — ignore errors
  }
}

// ─── Categories ───────────────────────────────────────────────
export async function getCategories() {
  try {
    const actor = await getActor();
    return await actor.getCategories();
  } catch {
    return [];
  }
}

export async function addCategory(name: string) {
  const actor = await getActor();
  return actor.addCategory(name);
}

export async function deleteCategory(id: bigint): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.deleteCategory(id);
  } catch {
    return false;
  }
}

// ─── Threads ──────────────────────────────────────────────────
export async function getThreads() {
  try {
    const actor = await getActor();
    return await actor.getThreads();
  } catch {
    return [];
  }
}

export async function getAllThreads() {
  try {
    const actor = await getActor();
    return await actor.getAllThreads();
  } catch {
    return [];
  }
}

export async function getArchivedThreads() {
  try {
    const actor = await getActor();
    return await actor.getArchivedThreads();
  } catch {
    return [];
  }
}

export async function getThread(id: bigint) {
  try {
    const actor = await getActor();
    return await actor.getThread(id);
  } catch {
    return null;
  }
}

export async function createThread(
  title: string,
  categoryId: bigint,
  creatorSessionId: string,
  thumbnailUrl: string | null,
  thumbnailType: string,
) {
  const actor = await getActor();
  return actor.createThread(
    title,
    categoryId,
    creatorSessionId,
    thumbnailUrl,
    thumbnailType,
  );
}

export async function updateThread(
  id: bigint,
  isClosed: boolean,
  isArchived: boolean,
): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.updateThread(id, isClosed, isArchived);
  } catch {
    return false;
  }
}

// ─── Posts ────────────────────────────────────────────────────
export async function getPostsByThread(threadId: bigint) {
  try {
    const actor = await getActor();
    return await actor.getPostsByThread(threadId);
  } catch {
    return [];
  }
}

export async function getAllPosts() {
  try {
    const actor = await getActor();
    return await actor.getAllPosts();
  } catch {
    return [];
  }
}

export async function createPost(
  threadId: bigint,
  authorSessionId: string,
  content: string,
  mediaUrl: string | null,
  mediaType: string,
  linkPreview: OgMetadata | null = null,
) {
  const actor = await getActor();
  return actor.createPost(
    threadId,
    authorSessionId,
    content,
    mediaUrl,
    mediaType,
    linkPreview,
  );
}

export async function deletePost(id: bigint) {
  const actor = await getActor();
  return actor.deletePost(id);
}

// ─── Bans ─────────────────────────────────────────────────────
export async function getBans() {
  try {
    const actor = await getActor();
    return await actor.getBans();
  } catch {
    return [];
  }
}

export async function banUser(sessionId: string, reason: string) {
  const actor = await getActor();
  return actor.banUser(sessionId, reason);
}

export async function unbanUser(sessionId: string): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.unbanUser(sessionId);
  } catch {
    return false;
  }
}

export async function isBanned(sessionId: string): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.isBanned(sessionId);
  } catch {
    return false;
  }
}

// ─── User Profiles ────────────────────────────────────────────
export async function registerUser(sessionId: string, username: string) {
  const actor = await getActor();
  return actor.registerUser(sessionId, username);
}

export async function updateUsername(sessionId: string, newUsername: string) {
  const actor = await getActor();
  return actor.updateUsername(sessionId, newUsername);
}

export async function setAvatar(sessionId: string, avatarUrl: string | null) {
  const actor = await getActor();
  return actor.setAvatar(sessionId, avatarUrl);
}

export async function getProfile(sessionId: string) {
  try {
    const actor = await getActor();
    return await actor.getProfile(sessionId);
  } catch {
    return null;
  }
}

export async function getAllProfiles() {
  try {
    const actor = await getActor();
    return await actor.getAllProfiles();
  } catch {
    return [];
  }
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.isUsernameTaken(username);
  } catch {
    return false;
  }
}

// ─── Rumble thumbnail (via backend HTTP outcall) ───────────────
export async function fetchRumbleThumbnail(
  url: string,
): Promise<string | null> {
  try {
    const actor = await getActor();
    return await actor.fetchRumbleThumbnail(url);
  } catch {
    return null;
  }
}

// ─── OG metadata (via backend HTTP outcall) ────────────────────
export type OgMetadata = {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
};

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  try {
    const actor = await getActor();
    return await actor.fetchOgMetadata(url);
  } catch {
    return {};
  }
}

// ─── Rumble OG metadata (uses browser-like User-Agent via backend) ──
export async function fetchRumbleOgMetadata(url: string): Promise<OgMetadata> {
  try {
    const actor = await getActor();
    return await actor.fetchRumbleOgMetadata(url);
  } catch {
    return {};
  }
}

// ─── Microlink fetch (for Rumble + general URLs) ─────────────────
// Uses the public Microlink API (no key needed, free tier).
// Handles CORS and bot-detection automatically from Microlink's servers.
// Only use for URLs that are NOT YouTube, Twitch, Reddit, or Twitter/X.
export async function fetchMicrolinkMetadata(url: string): Promise<OgMetadata> {
  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) return {};
    const json = await res.json();
    if (json.status !== "success" || !json.data) return {};
    const d = json.data;
    return {
      title: d.title ?? undefined,
      description: d.description ?? undefined,
      imageUrl: d.image?.url ?? d.screenshot?.url ?? undefined,
      siteName: d.publisher ?? d.author ?? undefined,
    };
  } catch {
    return {};
  }
}

// ─── Twitch thumbnail (CDN-only, no scraping) ─────────────────
// Twitch blocks server-side scrapers. We detect the URL type in the
// frontend and build the CDN thumbnail URL directly -- no backend call needed.
export function fetchTwitchThumbnail(url: string): Promise<string | null> {
  // VOD link: twitch.tv/videos/{id} — no reliable public thumbnail, use generic fallback
  const vodMatch = url.match(/twitch\.tv\/videos\/(\d+)/i);
  if (vodMatch) {
    // Generic Twitch placeholder — no public VOD thumbnail CDN without an API key
    return Promise.resolve(null);
  }

  // Channel link: twitch.tv/{channel}
  const channelMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (channelMatch) {
    const channel = channelMatch[1].toLowerCase();
    // Skip reserved paths that aren't channel names
    if (
      ["videos", "directory", "settings", "login", "signup"].includes(channel)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-640x360.jpg`,
    );
  }

  return Promise.resolve(null);
}

// ─── View tracking ────────────────────────────────────────────
export async function recordView(
  threadId: bigint,
  sessionId: string,
): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.recordView(threadId, sessionId);
  } catch {
    return false;
  }
}

// ─── Thread reports ───────────────────────────────────────────
export async function reportThread(
  threadId: bigint,
  sessionId: string,
  reason: string,
) {
  const actor = await getActor();
  return actor.reportThread(threadId, sessionId, reason);
}

export async function getThreadReports() {
  try {
    const actor = await getActor();
    return await actor.getThreadReports();
  } catch {
    return [];
  }
}

// ─── Points & leveling ────────────────────────────────────────
export async function awardPoints(sessionId: string, points: bigint) {
  try {
    const actor = await getActor();
    return await actor.awardPoints(sessionId, points);
  } catch {
    return null;
  }
}

export async function checkDailyActivity(sessionId: string) {
  try {
    const actor = await getActor();
    return await actor.checkDailyActivity(sessionId);
  } catch {
    return null;
  }
}

// ─── Bookmarks ────────────────────────────────────────────────
export async function addBookmark(
  sessionId: string,
  targetType: string,
  targetId: bigint,
) {
  const actor = await getActor();
  return actor.addBookmark(sessionId, targetType, targetId);
}

export async function removeBookmark(
  sessionId: string,
  bookmarkId: bigint,
): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.removeBookmark(sessionId, bookmarkId);
  } catch {
    return false;
  }
}

export async function getBookmarks(sessionId: string) {
  try {
    const actor = await getActor();
    return await actor.getBookmarks(sessionId);
  } catch {
    return [];
  }
}

// ─── Sorted threads (by composite activity score) ─────────────
export async function getSortedThreads() {
  try {
    const actor = await getActor();
    return await actor.getSortedThreads();
  } catch {
    return [];
  }
}
