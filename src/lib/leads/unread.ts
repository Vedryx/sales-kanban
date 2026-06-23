import type { LeadCard } from '@/types/lead';

// A lead is "unread" when it has received a reply (unreadReplyAt set) that
// the SDR has not yet acknowledged (lastReadReplyAt absent OR strictly older
// than unreadReplyAt). Opening the detail pane fires /mark-read which sets
// lastReadReplyAt = now, clearing the badge.
//
// Lives in its own module so the same predicate is shared by:
//   - LeadCardView (badge visibility)
//   - Board (toast diffing)
//   - /api/inbound/unread (server-side list filter)
export function isUnreadReply(
  state: Pick<LeadCard, 'unreadReplyAt' | 'lastReadReplyAt'>,
): boolean {
  if (!state.unreadReplyAt) return false;
  const replyTime = Date.parse(state.unreadReplyAt);
  if (!Number.isFinite(replyTime)) return false;
  if (!state.lastReadReplyAt) return true;
  const readTime = Date.parse(state.lastReadReplyAt);
  if (!Number.isFinite(readTime)) return true;
  return replyTime > readTime;
}
