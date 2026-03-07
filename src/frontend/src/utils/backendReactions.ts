// ============================================================
// backendReactions.ts — reactions and reply-to stored on-chain
//
// Reactions: hidden "reaction" posts with content = "SESSION:EMOJI:TARGETPOSTID"
// Reply-to:  encoded in post content as prefix "\x00reply:POSTID\x00"
// ============================================================

import type { Post } from "../backendApi";

// ─── Reply prefix codec ───────────────────────────────────────
const REPLY_PREFIX = "\x00reply:";
const REPLY_SUFFIX = "\x00";

/**
 * Encode a reply reference into a content string.
 * The prefix is invisible to normal text (null-byte delimited) and stripped before display.
 */
export function encodeReplyContent(
  replyToPostId: string,
  textContent: string,
): string {
  return `${REPLY_PREFIX}${replyToPostId}${REPLY_SUFFIX}${textContent}`;
}

/**
 * Parse a reply-to post ID and the actual display content from a stored content string.
 * Returns { replyToPostId, displayContent }.
 */
export function parseReplyContent(content: string): {
  replyToPostId: string | null;
  displayContent: string;
} {
  if (!content.startsWith(REPLY_PREFIX)) {
    return { replyToPostId: null, displayContent: content };
  }
  const afterPrefix = content.slice(REPLY_PREFIX.length);
  const suffixIdx = afterPrefix.indexOf(REPLY_SUFFIX);
  if (suffixIdx === -1) {
    return { replyToPostId: null, displayContent: content };
  }
  const replyToPostId = afterPrefix.slice(0, suffixIdx);
  const displayContent = afterPrefix.slice(suffixIdx + REPLY_SUFFIX.length);
  return { replyToPostId, displayContent };
}

// ─── Reaction post codec ──────────────────────────────────────
// content format: "SESSION:EMOJI:TARGETPOSTID"

export function encodeReactionContent(
  sessionId: string,
  emoji: string,
  targetPostId: string,
): string {
  return `${sessionId}:${emoji}:${targetPostId}`;
}

export function parseReactionContent(content: string): {
  sessionId: string;
  emoji: string;
  targetPostId: string;
} | null {
  // Split on first two colons only — session IDs can't contain colons but emoji can span multi-char
  const firstColon = content.indexOf(":");
  if (firstColon === -1) return null;
  const sessionId = content.slice(0, firstColon);
  const rest = content.slice(firstColon + 1);
  // The next segment is emoji, last segment is targetPostId
  // Find last colon to split emoji from targetPostId
  const lastColon = rest.lastIndexOf(":");
  if (lastColon === -1) return null;
  const emoji = rest.slice(0, lastColon);
  const targetPostId = rest.slice(lastColon + 1);
  if (!sessionId || !emoji || !targetPostId) return null;
  return { sessionId, emoji, targetPostId };
}

// ─── Aggregate reaction counts from posts array ──────────────────

/**
 * Build a map from postId → Record<emoji, count> by scanning all reaction posts.
 */
export function aggregateReactions(
  posts: Post[],
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  for (const post of posts) {
    if (post.mediaType !== "reaction" || post.isDeleted) continue;
    const parsed = parseReactionContent(post.content);
    if (!parsed) continue;
    const { emoji, targetPostId } = parsed;
    if (!result.has(targetPostId)) result.set(targetPostId, {});
    const map = result.get(targetPostId)!;
    map[emoji] = (map[emoji] ?? 0) + 1;
  }
  return result;
}

/**
 * Build a map from postId → Set<"SESSION:EMOJI"> for quick "did I react?" checks.
 * Also returns the reaction post ID so we can delete it on toggle-off.
 */
export function indexMyReactions(
  posts: Post[],
  sessionId: string,
): Map<string, Map<string, string>> {
  // result: targetPostId → (emoji → reaction-post-id)
  const result = new Map<string, Map<string, string>>();
  for (const post of posts) {
    if (post.mediaType !== "reaction" || post.isDeleted) continue;
    const parsed = parseReactionContent(post.content);
    if (!parsed || parsed.sessionId !== sessionId) continue;
    const { emoji, targetPostId } = parsed;
    if (!result.has(targetPostId)) result.set(targetPostId, new Map());
    result.get(targetPostId)!.set(emoji, String(post.id));
  }
  return result;
}

/**
 * Build the full reply map from post contents (for posts that were submitted
 * with the backend-persisted encoding).  Returns postId → replyToPostId.
 */
export function buildReplyMapFromPosts(posts: Post[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const post of posts) {
    if (post.isDeleted || post.mediaType === "reaction") continue;
    const { replyToPostId } = parseReplyContent(post.content);
    if (replyToPostId) {
      map[String(post.id)] = replyToPostId;
    }
  }
  return map;
}
