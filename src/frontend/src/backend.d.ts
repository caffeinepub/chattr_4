import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Ban {
    timestamp: bigint;
    displayId: string;
    reason: string;
}
export interface Thread {
    id: bigint;
    categoryId: bigint;
    postCount: bigint;
    title: string;
    lastActivity: bigint;
    createdAt: bigint;
    creatorDisplayId: string;
    isClosed: boolean;
    isArchived: boolean;
}
export interface Post {
    id: bigint;
    isDeleted: boolean;
    content: string;
    createdAt: bigint;
    mediaUrl?: string;
    authorDisplayId: string;
    mediaType: string;
    threadId: bigint;
}
export interface Category {
    id: bigint;
    name: string;
}
export interface backendInterface {
    addCategory(name: string): Promise<Category>;
    banUser(displayId: string, reason: string): Promise<Ban>;
    createPost(threadId: bigint, authorDisplayId: string, content: string, mediaUrl: string | null, mediaType: string): Promise<Post>;
    createThread(title: string, categoryId: bigint, creatorDisplayId: string): Promise<Thread>;
    deleteCategory(id: bigint): Promise<boolean>;
    deletePost(id: bigint): Promise<Post>;
    getAllPosts(): Promise<Array<Post>>;
    getAllThreads(): Promise<Array<Thread>>;
    getArchivedThreads(): Promise<Array<Thread>>;
    getBans(): Promise<Array<Ban>>;
    getCategories(): Promise<Array<Category>>;
    getPostsByThread(threadId: bigint): Promise<Array<Post>>;
    getThread(id: bigint): Promise<Thread | null>;
    getThreads(): Promise<Array<Thread>>;
    initialize(): Promise<void>;
    isBanned(displayId: string): Promise<boolean>;
    logAction(_action: string): Promise<void>;
    start(): Promise<void>;
    unbanUser(displayId: string): Promise<boolean>;
    updateThread(id: bigint, isClosed: boolean, isArchived: boolean): Promise<boolean>;
}
