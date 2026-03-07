// ============================================================
// Anonymous Imageboard — Data Store
// All data persists via localStorage. No backend calls.
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

export interface Category {
  id: number;
  name: string;
  color?: string;
}

export interface Thread {
  id: number;
  title: string;
  categoryId: number;
  creatorDisplayId: string;
  createdAt: number;
  lastActivity: number;
  isArchived: boolean;
  isClosed: boolean;
  postCount: number;
}

export interface Post {
  id: number;
  threadId: number;
  authorDisplayId: string;
  content: string;
  mediaUrl?: string;
  mediaType: MediaType;
  createdAt: number;
  isDeleted: boolean;
}

export interface Ban {
  displayId: string;
  reason: string;
  timestamp: number;
}

// ---------------------------------------------------------------
// Keys
// ---------------------------------------------------------------
const KEYS = {
  categories: "ib_categories",
  threads: "ib_threads",
  posts: "ib_posts",
  bans: "ib_bans",
  sessionId: "ib_session_id",
};

// ---------------------------------------------------------------
// Session ID
// ---------------------------------------------------------------
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
  let id = localStorage.getItem(KEYS.sessionId);
  if (!id) {
    id = generateSessionId();
    localStorage.setItem(KEYS.sessionId, id);
  }
  return id;
}

// ---------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------
function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------
// Categories
// ---------------------------------------------------------------
export function getCategories(): Category[] {
  return load<Category[]>(KEYS.categories) ?? [];
}

export function saveCategories(cats: Category[]): void {
  save(KEYS.categories, cats);
}

export function addCategory(name: string): Category {
  const cats = getCategories();
  const newCat: Category = {
    id: Date.now(),
    name,
  };
  cats.push(newCat);
  saveCategories(cats);
  return newCat;
}

export function deleteCategory(id: number): void {
  const cats = getCategories().filter((c) => c.id !== id);
  saveCategories(cats);
}

// ---------------------------------------------------------------
// Threads
// ---------------------------------------------------------------
export function getThreads(): Thread[] {
  return load<Thread[]>(KEYS.threads) ?? [];
}

export function saveThreads(threads: Thread[]): void {
  save(KEYS.threads, threads);
}

export function getThread(id: number): Thread | undefined {
  return getThreads().find((t) => t.id === id);
}

export function createThread(title: string, categoryId: number): Thread {
  const threads = getThreads();
  const sessionId = getSessionId();
  const now = Date.now();
  const thread: Thread = {
    id: now,
    title,
    categoryId,
    creatorDisplayId: sessionId,
    createdAt: now,
    lastActivity: now,
    isArchived: false,
    isClosed: false,
    postCount: 0,
  };
  threads.unshift(thread);
  saveThreads(threads);
  return thread;
}

export function updateThread(id: number, updates: Partial<Thread>): void {
  const threads = getThreads().map((t) =>
    t.id === id ? { ...t, ...updates } : t,
  );
  saveThreads(threads);
}

export function deleteThread(id: number): void {
  saveThreads(getThreads().filter((t) => t.id !== id));
}

// ---------------------------------------------------------------
// Posts
// ---------------------------------------------------------------
export function getPosts(): Post[] {
  return load<Post[]>(KEYS.posts) ?? [];
}

export function savePosts(posts: Post[]): void {
  save(KEYS.posts, posts);
}

export function getPostsByThread(threadId: number): Post[] {
  return getPosts().filter((p) => p.threadId === threadId);
}

export function createPost(
  threadId: number,
  content: string,
  mediaUrl?: string,
  mediaType: MediaType = "text",
): Post {
  const posts = getPosts();
  const sessionId = getSessionId();
  const now = Date.now();
  const post: Post = {
    id: now,
    threadId,
    authorDisplayId: sessionId,
    content,
    mediaUrl,
    mediaType,
    createdAt: now,
    isDeleted: false,
  };
  posts.push(post);
  savePosts(posts);

  // Update thread post count and lastActivity
  updateThread(threadId, {
    postCount: posts.filter((p) => p.threadId === threadId).length,
    lastActivity: now,
  });

  return post;
}

export function deletePost(id: number): void {
  const posts = getPosts().map((p) =>
    p.id === id ? { ...p, isDeleted: true } : p,
  );
  savePosts(posts);
}

// ---------------------------------------------------------------
// Bans
// ---------------------------------------------------------------
export function getBans(): Ban[] {
  return load<Ban[]>(KEYS.bans) ?? [];
}

export function saveBans(bans: Ban[]): void {
  save(KEYS.bans, bans);
}

export function banUser(displayId: string, reason: string): Ban {
  const bans = getBans();
  const ban: Ban = { displayId, reason, timestamp: Date.now() };
  // Replace if already banned
  const idx = bans.findIndex((b) => b.displayId === displayId);
  if (idx >= 0) {
    bans[idx] = ban;
  } else {
    bans.push(ban);
  }
  saveBans(bans);
  return ban;
}

export function unbanUser(displayId: string): void {
  saveBans(getBans().filter((b) => b.displayId !== displayId));
}

export function isBanned(displayId: string): boolean {
  return getBans().some((b) => b.displayId === displayId);
}

// ---------------------------------------------------------------
// In-memory presence map
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
// Auto-detect media type from URL
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

// ---------------------------------------------------------------
// Seed data — runs once on first load
// ---------------------------------------------------------------
const SEED_DONE_KEY = "ib_seeded_v3";

export function seedIfNeeded(): void {
  if (localStorage.getItem(SEED_DONE_KEY)) return;

  // Ensure session ID exists
  getSessionId();

  // Categories
  const categories: Category[] = [
    { id: 1, name: "Politics" },
    { id: 2, name: "Art" },
    { id: 3, name: "Entertainment" },
    { id: 4, name: "Technology" },
    { id: 5, name: "Sports" },
    { id: 6, name: "Random" },
  ];
  saveCategories(categories);

  // Start with no threads or posts — users create their own content
  saveThreads([]);
  savePosts([]);

  localStorage.setItem(SEED_DONE_KEY, "1");
}
