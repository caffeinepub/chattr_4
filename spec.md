# Chattr

## Current State

The app is a fully functional anonymous imageboard/chatroom with:
- Catalog page (thread grid with category filters, new thread dialog)
- Thread/chatroom page (WhatsApp-style chat bubbles, fixed compose bar, collapsible media embeds, image upload, Twitter oEmbed)
- Archive page (closed/archived threads)
- Admin page (password-gated: manage threads, posts, bans, categories)

**Critical problem**: All data (threads, posts, categories, bans) is stored in localStorage. Each user's browser has its own isolated state. Rooms created by User A are invisible to User B and vice versa.

The backend `main.mo` has type definitions only -- no public endpoints, no stable storage.

## Requested Changes (Diff)

### Add
- Motoko backend stable storage for: categories, threads, posts, bans
- Public backend query endpoints: getCategories, getThreads, getThread, getPostsByThread, getArchivedThreads
- Public backend update endpoints: createThread, createPost, deletePost (soft delete), updateThread (close/archive/reopen), addCategory, deleteCategory, banUser, unbanUser, isBanned
- Frontend `backendApi.ts` service layer that wraps all backend calls
- Polling on catalog, thread, and archive pages to fetch fresh data from backend every 3-5 seconds

### Modify
- `store.ts`: keep only session ID logic and client-side helpers (detectMediaType, generateSessionId). Remove all localStorage data storage functions.
- `CatalogPage.tsx`: replace all `store.*` data calls with `backendApi.*` async calls; show loading states
- `ThreadPage.tsx`: replace all `store.*` data calls with `backendApi.*` async calls; image uploads still use base64 data URLs stored in the post mediaUrl field
- `AdminPage.tsx`: replace all `store.*` data calls with `backendApi.*` async calls; seed categories on first load from backend
- `ArchivePage.tsx`: replace all `store.*` data calls with `backendApi.*` async calls
- `App.tsx`: remove `seedIfNeeded()` call; categories are seeded from backend on first deploy

### Remove
- All localStorage-based data functions from `store.ts` (getThreads, saveThreads, createThread, getPosts, savePosts, createPost, deletePost, updateThread, deleteThread, getCategories, saveCategories, addCategory, deleteCategory, getBans, saveBans, banUser, unbanUser, isBanned, seedIfNeeded)
- `SEED_DONE_KEY` and seed logic in the frontend

## Implementation Plan

1. Generate Motoko backend with:
   - Stable vars for categories (seeded with defaults on init), threads, posts, bans
   - Full CRUD query/update functions for all entities
   - Admin functions gated by a hardcoded admin password check on the backend (or keep password check on frontend only -- simpler)
   - `uploaded_image` media type support (store base64 data URL as mediaUrl text)

2. Update `backend.d.ts` with generated type bindings

3. Create `src/frontend/src/backendApi.ts`:
   - Thin async wrappers around each backend method
   - Error handling with fallback to empty arrays

4. Rewrite `store.ts` to only contain: session ID, detectMediaType, in-memory presence helpers, type definitions

5. Update all four pages to be async, call backendApi, and handle loading/error states

6. Remove `seedIfNeeded` from App.tsx
