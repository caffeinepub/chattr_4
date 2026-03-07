# Chattr

## Current State
ThreadPage is a real-time chatroom with polling every 3 seconds. It auto-scrolls to the bottom when new messages arrive. There are no indicators for unread messages when the user is scrolled up, and no in-chat mention indicator.

## Requested Changes (Diff)

### Add
- **New messages floating button**: appears when the user is scrolled up and new messages arrive below. Shows unread count badge. Disappears when user scrolls to the bottom.
- **Mention floating button**: separate from unread button, appears when the user's username is @mentioned in a message they haven't seen yet. Persists until user scrolls past the mentioned message. Shows `@` icon.
- When both indicators are active, they stack vertically (mention above, unread below), like Telegram.

### Modify
- ThreadPage scroll detection: track whether user is "at bottom" (within ~100px threshold).
- New post polling: when new posts arrive and user is NOT at bottom, increment unread count instead of auto-scrolling.
- Already auto-scrolls when user IS at bottom — keep that behavior.
- Mention detection: when posts arrive, check if any new post mentions `@myUsername`. If user is not at bottom (hasn't seen it), show mention indicator.

### Remove
- Nothing removed.

## Implementation Plan
1. Add `isAtBottom` ref + scroll handler on the messages scrollable div.
2. Track `unreadCount` (number) state — increments when posts arrive and user is not at bottom.
3. Track `pendingMentionPostId` (string | null) state — set when a new post mentioning the user arrives and user hasn't seen it.
4. Render `FloatingNewMessagesButton` below the scrollable area (absolute positioned bottom-right inside the chat container) when `unreadCount > 0`.
5. Render `FloatingMentionButton` stacked above the new messages button when `pendingMentionPostId` is set.
6. Clicking either button scrolls to: new messages button → scrolls to bottom + clears unread; mention button → scrolls to the specific mention post + clears mention.
7. Scroll event listener clears unread when user reaches bottom; clears mention when the mentioned post enters the viewport (using IntersectionObserver or scroll position check).
