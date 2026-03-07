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
    sessionId: string;
    reason: string;
}
export interface Thread {
    id: bigint;
    categoryId: bigint;
    postCount: bigint;
    title: string;
    thumbnailUrl?: string;
    creatorSessionId: string;
    lastActivity: bigint;
    createdAt: bigint;
    isClosed: boolean;
    isArchived: boolean;
    thumbnailType: string;
}
export interface Post {
    id: bigint;
    isDeleted: boolean;
    content: string;
    createdAt: bigint;
    mediaUrl?: string;
    authorSessionId: string;
    mediaType: string;
    threadId: bigint;
}
export interface UserProfile {
    username: string;
    avatarUrl?: string;
    sessionId: string;
}
export interface Category {
    id: bigint;
    name: string;
}
export interface backendInterface {
    addCategory(name: string): Promise<Category>;
    banUser(sessionId: string, reason: string): Promise<Ban>;
    createPost(threadId: bigint, authorSessionId: string, content: string, mediaUrl: string | null, mediaType: string): Promise<Post>;
    createThread(title: string, categoryId: bigint, creatorSessionId: string, thumbnailUrl: string | null, thumbnailType: string): Promise<Thread>;
    deleteCategory(id: bigint): Promise<boolean>;
    deletePost(id: bigint): Promise<Post>;
    getAllPosts(): Promise<Array<Post>>;
    getAllProfiles(): Promise<Array<UserProfile>>;
    getAllThreads(): Promise<Array<Thread>>;
    getArchivedThreads(): Promise<Array<Thread>>;
    getBans(): Promise<Array<Ban>>;
    getCategories(): Promise<Array<Category>>;
    getPostsByThread(threadId: bigint): Promise<Array<Post>>;
    getProfile(sessionId: string): Promise<UserProfile | null>;
    getThread(id: bigint): Promise<Thread | null>;
    getThreads(): Promise<Array<Thread>>;
    initialize(): Promise<void>;
    isBanned(sessionId: string): Promise<boolean>;
    isUsernameTaken(username: string): Promise<boolean>;
    logAction(_action: string): Promise<void>;
    registerUser(sessionId: string, username: string): Promise<{
        __kind__: "ok";
        ok: UserProfile;
    } | {
        __kind__: "err";
        err: string;
    }>;
    setAvatar(sessionId: string, avatarUrl: string | null): Promise<{
        __kind__: "ok";
        ok: UserProfile;
    } | {
        __kind__: "err";
        err: string;
    }>;
    start(): Promise<void>;
    unbanUser(sessionId: string): Promise<boolean>;
    updateThread(id: bigint, isClosed: boolean, isArchived: boolean): Promise<boolean>;
    updateUsername(sessionId: string, newUsername: string): Promise<{
        __kind__: "ok";
        ok: UserProfile;
    } | {
        __kind__: "err";
        err: string;
    }>;
}
