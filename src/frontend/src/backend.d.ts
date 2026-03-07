import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface http_header {
    value: string;
    name: string;
}
export interface Category {
    id: bigint;
    name: string;
}
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
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
export interface OgMetadata {
    title?: string;
    description?: string;
    siteName?: string;
    imageUrl?: string;
}
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
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
    linkPreview?: OgMetadata;
}
export interface Ban {
    timestamp: bigint;
    sessionId: string;
    reason: string;
}
export interface UserProfile {
    username: string;
    avatarUrl?: string;
    sessionId: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface backendInterface {
    addCategory(name: string): Promise<Category>;
    banUser(sessionId: string, reason: string): Promise<Ban>;
    createPost(threadId: bigint, authorSessionId: string, content: string, mediaUrl: string | null, mediaType: string, linkPreview: OgMetadata | null): Promise<Post>;
    createThread(title: string, categoryId: bigint, creatorSessionId: string, thumbnailUrl: string | null, thumbnailType: string): Promise<Thread>;
    deleteCategory(id: bigint): Promise<boolean>;
    deletePost(id: bigint): Promise<Post>;
    /**
     * / * Fetches Open Graph metadata (title, description, image) from any URL.
     * /    * Returns null fields if not found.
     */
    fetchOgMetadata(url: string): Promise<OgMetadata>;
    fetchRedditPostTitle(url: string): Promise<string | null>;
    fetchRumbleThumbnail(url: string): Promise<string | null>;
    /**
     * / * Fetches only the og:image Open Graph tag from a Twitch channel/stream.
     * /    * Returns ?Text (null if not found).
     */
    fetchTwitchThumbnail(url: string): Promise<string | null>;
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
    transform(input: TransformationInput): Promise<TransformationOutput>;
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
