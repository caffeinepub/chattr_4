// ============================================================
// localReactions.ts — localStorage helpers for reactions, replies,
// last-visit timestamps (for mention badges)
// ============================================================

const REACTIONS_KEY = "chattr_reactions";
const REPLIES_KEY = "chattr_replies";
const LAST_VISIT_KEY = "chattr_last_visit";

// ─── Reaction storage ─────────────────────────────────────────
// Shape: Record<threadId, Record<postId, string[]>>
// Each string entry is "sessionId:emoji"

function loadReactions(): Record<string, Record<string, string[]>> {
  try {
    const raw = localStorage.getItem(REACTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReactions(data: Record<string, Record<string, string[]>>): void {
  localStorage.setItem(REACTIONS_KEY, JSON.stringify(data));
}

export function getReactions(threadId: string): Record<string, string[]> {
  const all = loadReactions();
  return all[threadId] ?? {};
}

export function addReaction(
  threadId: string,
  postId: string,
  sessionId: string,
  emoji: string,
): void {
  const all = loadReactions();
  if (!all[threadId]) all[threadId] = {};
  if (!all[threadId][postId]) all[threadId][postId] = [];
  const entry = `${sessionId}:${emoji}`;
  if (!all[threadId][postId].includes(entry)) {
    all[threadId][postId].push(entry);
  }
  saveReactions(all);
}

export function removeReaction(
  threadId: string,
  postId: string,
  sessionId: string,
  emoji: string,
): void {
  const all = loadReactions();
  if (!all[threadId]?.[postId]) return;
  const entry = `${sessionId}:${emoji}`;
  all[threadId][postId] = all[threadId][postId].filter((e) => e !== entry);
  saveReactions(all);
}

export function hasReaction(
  threadId: string,
  postId: string,
  sessionId: string,
  emoji: string,
): boolean {
  const all = loadReactions();
  return (all[threadId]?.[postId] ?? []).includes(`${sessionId}:${emoji}`);
}

export function getReactionCounts(
  threadId: string,
  postId: string,
): Record<string, number> {
  const all = loadReactions();
  const entries = all[threadId]?.[postId] ?? [];
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    const emoji = entry.slice(colonIdx + 1);
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  }
  return counts;
}

// ─── Reply storage ────────────────────────────────────────────
// Shape: Record<postId, replyToPostId>  (both as strings)

function loadReplies(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REPLIES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReplies(data: Record<string, string>): void {
  localStorage.setItem(REPLIES_KEY, JSON.stringify(data));
}

export function getReplyMap(): Record<string, string> {
  return loadReplies();
}

export function storeReply(postId: string, replyToPostId: string): void {
  const data = loadReplies();
  data[postId] = replyToPostId;
  saveReplies(data);
}

export function getReplyToPostId(postId: string): string | null {
  return loadReplies()[postId] ?? null;
}

// ─── Last-visit timestamps ────────────────────────────────────
// Shape: Record<threadId, lastVisitedTimestampMs>

function loadLastVisit(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_VISIT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordThreadVisit(threadId: string): void {
  const data = loadLastVisit();
  data[threadId] = Date.now();
  localStorage.setItem(LAST_VISIT_KEY, JSON.stringify(data));
}

export function getLastVisit(threadId: string): number {
  return loadLastVisit()[threadId] ?? 0;
}

export function getAllLastVisits(): Record<string, number> {
  return loadLastVisit();
}
