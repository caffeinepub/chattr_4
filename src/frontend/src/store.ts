// ============================================================
// store.ts — session ID, media type detection, in-memory presence
// All persistent data is now in the Motoko backend (see backendApi.ts)
// ============================================================

export type MediaType =
  | "text"
  | "image"
  | "link"
  | "video"
  | "youtube"
  | "twitch"
  | "twitter"
  | "uploaded_image";

// ---------------------------------------------------------------
// Session ID (localStorage only — not backend data)
// ---------------------------------------------------------------
const SESSION_KEY = "ib_session_id";

function generateSessionId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateSessionId();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------
// In-memory presence map (per-tab, not persisted)
// ---------------------------------------------------------------
const presenceMap = new Map<number, Set<string>>();

export function joinThread(threadId: number, sessionId: string): void {
  if (!presenceMap.has(threadId)) {
    presenceMap.set(threadId, new Set());
  }
  presenceMap.get(threadId)!.add(sessionId);
}

export function leaveThread(threadId: number, sessionId: string): void {
  presenceMap.get(threadId)?.delete(sessionId);
}

export function getPresenceCount(threadId: number): number {
  return presenceMap.get(threadId)?.size ?? 0;
}

export function isThreadLive(threadId: number): boolean {
  return (presenceMap.get(threadId)?.size ?? 0) > 0;
}

// ---------------------------------------------------------------
// Media type detection from URL
// ---------------------------------------------------------------
export function detectMediaType(url: string): MediaType {
  if (!url.trim()) return "text";
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  if (lower.includes("twitch.tv")) return "twitch";
  if (lower.includes("twitter.com") || lower.includes("x.com"))
    return "twitter";
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/.test(lower)) return "image";
  if (/\.(mp4|webm|ogg|mov|avi)(\?|$)/.test(lower)) return "video";
  if (url.startsWith("http")) return "link";
  return "text";
}
