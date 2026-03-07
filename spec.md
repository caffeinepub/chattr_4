# Chattr

## Current State

The thread page (ThreadPage.tsx) has a compose bar with:
- A paperclip button that toggles a separate media URL input row
- An image upload button (ImagePlus) for file uploads
- A text input for message content
- A send button

When a media URL is submitted (via the separate media URL row), the post renders:
- The URL text shown in the bubble
- A collapsible embed below (YouTube, Twitch, Twitter, image, video, link)

Users must click the paperclip to reveal the media URL input — there is no auto-detection in the main text input.

## Requested Changes (Diff)

### Add
- Auto-detect media URLs typed or pasted directly into the main message input (same regex patterns as `detectMediaType`)
- Inline preview area above the compose bar that appears while typing when a media URL is detected in the message input
  - Show a small preview: image thumbnail for image URLs, YouTube thumbnail for YouTube URLs, media type chip + truncated URL for Twitch/Twitter/video/link
  - Show a dismiss/clear button on the preview
- When a message containing a media URL is sent, post it with both the text content and the detected media embed (URL text visible in bubble + collapsible/inline embed below), same as existing behavior

### Modify
- Main text input `onChange`: after updating content state, also scan the input value for a media URL using `detectMediaType`; if found, update an `inlineMediaUrl` and `inlineMediaType` state; if not found, clear them
- `handleSubmit`: if `inlineMediaUrl` is set (and no uploadedImage and no explicit mediaUrl from the paperclip), use `inlineMediaUrl` / `inlineMediaType` as the post's media fields
- The paperclip + separate media URL row remain for users who want to attach a URL without it being in the message text

### Remove
- Nothing removed

## Implementation Plan

1. Add two new state variables: `inlineMediaUrl: string` and `inlineMediaType: MediaType` (default `"text"`)
2. Add a helper `extractFirstUrl(text: string): string | null` that finds the first URL-like token in the text using a regex
3. On every `content` change in the main input, run `extractFirstUrl` → if found, run `detectMediaType` on it and set `inlineMediaUrl`/`inlineMediaType`; if not found, clear both
4. Add an `InlinePreview` component rendered above the compose bar (between staged image preview and the main input row) that shows a compact preview of `inlineMediaUrl`:
   - Image URLs: small thumbnail (max 60px) + filename/url
   - YouTube: YouTube thumbnail image (via `https://img.youtube.com/vi/{id}/mqdefault.jpg`) + title chip
   - Twitch/Twitter/video/link: MediaTypeChip + truncated URL
   - Dismiss button (X) that clears `inlineMediaUrl`/`inlineMediaType` and does NOT clear message text
5. In `handleSubmit`, priority order for media:
   1. uploadedImage (existing behavior)
   2. explicit mediaUrl from paperclip (existing behavior)
   3. inlineMediaUrl detected from message text (new)
6. After submit, clear `inlineMediaUrl` and `inlineMediaType` along with other state resets
7. `canSend` already covers `content.trim() !== ""` which will be true when a URL is typed, so no change needed there
