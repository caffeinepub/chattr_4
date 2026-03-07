# Chattr

## Current State

- Full-stack chatroom app on ICP with Motoko backend and React/TypeScript frontend
- Users have pixel avatar (auto-generated) or uploaded custom avatar (stored on backend as base64/URL)
- Avatars displayed in chat bubbles and header
- Compose bar in ThreadPage has an image upload button (ImagePlus icon) for uploading image files
- OnboardingModal allows users to pick a username + optional avatar upload (file/drag-drop)
- SettingsModal allows users to update username and avatar (file upload)
- No GIF support currently

## Requested Changes (Diff)

### Add

- **GIF Picker component** (`GifPicker.tsx`): Giphy-powered picker with two tabs — "Trending" (fetches Giphy trending GIFs on open) and "Search" (debounced search as user types). API key: `rDA2nx5ya4RMgjd6KOJ0lrAtm9KLBWUv`. Grid layout with animated GIF thumbnails. Clicking a GIF selects it.
- **GIF avatar support** in OnboardingModal: Add a third option in the avatar section — "Search GIF" button opens the GifPicker. Selected GIF URL becomes the avatarUrl (stored as a remote URL, not uploaded). Avatar preview shows the animated GIF.
- **GIF avatar support** in SettingsModal: Same "Search GIF" option alongside existing upload button.
- **GIF sending in chat** (ThreadPage): Consolidate the existing image upload button to also open the GifPicker. A popover/sheet opens with two tabs: "Upload Image" (existing file upload + drag-drop) and "GIFs" (GifPicker). Selecting a GIF sends it as a message with `mediaType: "gif"` and `mediaUrl` = the Giphy GIF URL.
- **Inline GIF rendering** in ChatBubble: GIFs with `mediaType: "gif"` render as auto-playing animated `<img>` tags (similar to InlineImageThumbnail but without lightbox — GIFs loop inline). Clicking opens lightbox like other images.
- **`detectMediaType` update** in store.ts: Add `"gif"` as a media type.

### Modify

- **ThreadPage compose bar**: Replace the standalone `ImagePlus` button with a combined media button that opens a popover with two tabs — "Image" and "GIF". The Image tab contains the existing file input trigger + drag-drop zone. The GIF tab shows the GifPicker.
- **OnboardingModal avatar section**: Add a "GIF avatar" button below the existing "Upload avatar" button. Clicking opens GifPicker inline (or as a sheet). Selected GIF URL is stored as avatarUrl. Avatar `<img>` displays the GIF (animated).
- **SettingsModal avatar section**: Same as OnboardingModal — add "Pick GIF avatar" option.
- **ChatBubble**: Handle `mediaType === "gif"` to render inline animated image (with lightbox on click).

### Remove

- Nothing removed

## Implementation Plan

1. Create `src/frontend/src/components/GifPicker.tsx` — fetches Giphy trending and search endpoints, renders a 3-column animated GIF grid with a search input, loading state, and error state. Props: `apiKey`, `onSelect(gifUrl: string)`, `onClose()`.
2. Update `src/frontend/src/store.ts` — add `"gif"` to the `MediaType` union.
3. Update `src/frontend/src/pages/ThreadPage.tsx`:
   - Replace the ImagePlus button with a combined button that toggles a popover with "Image" / "GIF" tabs
   - In the GIF tab, render `<GifPicker>` — on select, close popover and send the GIF URL as a post with `mediaType: "gif"`
   - In ChatBubble, handle `mediaType === "gif"`: render an `<img>` tag with the GIF URL inline (auto-play, with click-to-lightbox)
4. Update `src/frontend/src/components/OnboardingModal.tsx`:
   - Add "Pick GIF" button next to/below avatar upload
   - On click, show `<GifPicker>` inline or in an overlay
   - On GIF select, set avatarPreview to the GIF URL, set avatarDataUrl to null (it's a remote URL, not a data URL), track as `avatarIsGif: true`
   - On submit: if `avatarIsGif`, call `setAvatar(sessionId, gifUrl)` directly (already a URL)
5. Update `src/frontend/src/components/SettingsModal.tsx`:
   - Same GIF avatar picker pattern as OnboardingModal
6. Validate (typecheck + lint + build) and fix any errors
