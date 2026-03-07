// ============================================================
// backendApi.ts — thin async wrapper around the Motoko backend
// ============================================================

import type { backendInterface } from "./backend";
import { createActorWithConfig } from "./config";

// ─── Types re-exported ────────────────────────────────────────
export type { Ban, Category, Post, Thread } from "./backend";

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

// ─── Seed / initialize ────────────────────────────────────────
export async function seedCategories(): Promise<void> {
  try {
    const actor = await getActor();
    await actor.initialize();
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
  creatorDisplayId: string,
) {
  const actor = await getActor();
  return actor.createThread(title, categoryId, creatorDisplayId);
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
  authorDisplayId: string,
  content: string,
  mediaUrl: string | null,
  mediaType: string,
) {
  const actor = await getActor();
  return actor.createPost(
    threadId,
    authorDisplayId,
    content,
    mediaUrl,
    mediaType,
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

export async function banUser(displayId: string, reason: string) {
  const actor = await getActor();
  return actor.banUser(displayId, reason);
}

export async function unbanUser(displayId: string): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.unbanUser(displayId);
  } catch {
    return false;
  }
}

export async function isBanned(displayId: string): Promise<boolean> {
  try {
    const actor = await getActor();
    return await actor.isBanned(displayId);
  } catch {
    return false;
  }
}
