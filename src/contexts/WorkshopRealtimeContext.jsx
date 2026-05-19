import { createContext } from 'react';

/**
 * Provides real-time presence and field-lock state for the current workshop.
 * Consumed by Workshop and BlockEditor. Populated by useWorkshopRealtime.
 *
 * presence  – array of { user_id, full_name, color } for every user viewing this workshop
 * locks     – { 'blockId:fieldName': { user_id, full_name, color } } — locked by another user
 * trackField(blockId, fieldName)   — call on input focus to claim a lock
 * untrackField(blockId, fieldName) — call on input blur  to release a lock
 * userId    – current user's id (so BlockEditor can skip self-locks)
 */
export const WorkshopRealtimeContext = createContext({
  presence:         [],
  locks:            {},
  blockEditors:     {},
  trackField:       async () => {},
  untrackField:     async () => {},
  trackActiveBlock: async () => {},
  userId:           null,
});
