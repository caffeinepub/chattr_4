import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface UserProfile {
    daysActive: bigint;
    username: string;
    lastActiveDate: bigint;
    level: string;
    avatarUrl?: string;
    sessionId: string;
    points: bigint;
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
    reportCount: bigint;
    thumbnailUrl?: string;
    creatorSessionId: string;
    lastActivity: bigint;
    createdAt: bigint;
    isClosed: boolean;
    isArchived: boolean;
    viewCount: bigint;
    thumbnailType: string;
}
export interface Bookmark {
    id: bigint;
    createdAt: bigint;
    targetType: string;
    sessionId: string;
    targetId: bigint;
}
export interface http_header {
    value: string;
    name: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface Ban {
    timestamp: bigint;
    sessionId: string;
    reason: string;
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
export interface ThreadReport {
    id: bigint;
    reporterSessionId: string;
    createdAt: bigint;
    threadId: bigint;
    reason: string;
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
export interface Category {
    id: bigint;
    name: string;
}
export interface backendInterface {
    addBookmark(sessionId: string, targetType: string, targetId: bigint): Promise<Bookmark>;
    addCategory(name: string): Promise<Category>;
    awardPoints(sessionId: string, points: bigint): Promise<UserProfile | null>;
    banUser(sessionId: string, reason: string): Promise<Ban>;
    checkDailyActivity(sessionId: string): Promise<UserProfile>;
    createPost(threadId: bigint, authorSessionId: string, content: string, mediaUrl: string | null, mediaType: string, linkPreview: OgMetadata | null): Promise<Post>;
    createThread(title: string, categoryId: bigint, creatorSessionId: string, thumbnailUrl: string | null, thumbnailType: string): Promise<Thread>;
    deleteCategory(id: bigint): Promise<boolean>;
    deletePost(id: bigint): Promise<Post>;
    fetchOgMetadata(url: string): Promise<OgMetadata>;
    fetchRedditPostTitle(url: string): Promise<string | null>;
    fetchRumbleOgMetadata(url: string): Promise<OgMetadata>;
    fetchRumbleThumbnail(url: string): Promise<string | null>;
    fetchTwitchThumbnail(url: string): Promise<string | null>;
    getAllPosts(): Promise<Array<Post>>;
    getAllProfiles(): Promise<Array<UserProfile>>;
    getAllThreads(): Promise<Array<Thread>>;
    getArchivedThreads(): Promise<Array<Thread>>;
    getBans(): Promise<Array<Ban>>;
    getBookmarks(sessionId: string): Promise<Array<Bookmark>>;
    getCategories(): Promise<Array<Category>>;
    getPostsByThread(threadId: bigint): Promise<Array<Post>>;
    getProfile(sessionId: string): Promise<UserProfile | null>;
    getSortedThreads(): Promise<Array<Thread>>;
    getThread(id: bigint): Promise<Thread | null>;
    getThreadReports(): Promise<Array<ThreadReport>>;
    getThreads(): Promise<Array<Thread>>;
    initialize(): Promise<void>;
    isBanned(sessionId: string): Promise<boolean>;
    isUsernameTaken(username: string): Promise<boolean>;
    logAction(_action: string): Promise<void>;
    recordView(threadId: bigint, sessionId: string): Promise<boolean>;
    registerUser(sessionId: string, username: string): Promise<{
        __kind__: "ok";
        ok: UserProfile;
    } | {
        __kind__: "err";
        err: string;
    }>;
    removeBookmark(_sessionId: string, bookmarkId: bigint): Promise<boolean>;
    reportThread(threadId: bigint, sessionId: string, reason: string): Promise<ThreadReport>;
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
