import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../lib/supabase.js';

/**
 * Manages one Supabase Realtime channel per workshop.
 *
 * Sync strategy: broadcast events (self: false) so every user in the channel
 * sees changes made by others immediately. The sender has already applied the
 * change optimistically, so they never receive their own broadcasts.
 *
 * Presence is used for:
 *   – showing who is currently viewing the workshop
 *   – field-level locks (each user tracks which fields they are editing)
 *
 * Broadcast event payloads (all outbound calls go through `broadcast()`):
 *   block_patch      { blockId, patch }
 *   block_add        { block, sectionId }
 *   block_delete     { blockId }
 *   section_add      { section, sectionIds }
 *   section_delete   { sectionId }
 *   section_rename   { sectionId, title }
 *   block_reorder    { blockOrders: { [sectionId]: blockIds[] } }
 *   section_reorder  { sectionIds }
 */
export function useWorkshopRealtime({
  workshopId,
  userId,
  fullName,
  color,
  onRemoteBlockPatch,
  onRemoteBlockAdd,
  onRemoteBlockDelete,
  onRemoteSectionAdd,
  onRemoteSectionDelete,
  onRemoteSectionRename,
  onRemoteBlockReorder,
  onRemoteSectionReorder,
}) {
  const [presence, setPresence] = useState([]);
  const [locks,    setLocks]    = useState({});

  const myLocksRef   = useRef(new Set());
  const channelRef   = useRef(null);
  const userInfoRef  = useRef({ userId, fullName, color });
  useEffect(() => { userInfoRef.current = { userId, fullName, color }; }, [userId, fullName, color]);

  // Keep callbacks in a ref so the channel listeners (set up once) always
  // call the latest version even after re-renders.
  const cbRef = useRef({});
  cbRef.current = {
    onRemoteBlockPatch,
    onRemoteBlockAdd,
    onRemoteBlockDelete,
    onRemoteSectionAdd,
    onRemoteSectionDelete,
    onRemoteSectionRename,
    onRemoteBlockReorder,
    onRemoteSectionReorder,
  };

  // ── Presence helpers ──────────────────────────────────────────────────────

  const rebuildFromPresence = useCallback((state) => {
    const users    = [];
    const newLocks = {};
    Object.values(state).flat().forEach((p) => {
      // Only add each user once (presence key is userId, so duplicates are rare)
      if (!users.find((u) => u.user_id === p.user_id)) {
        users.push({ user_id: p.user_id, full_name: p.full_name, color: p.color });
      }
      // Exclude own locks — we already know our own editing state
      if (p.user_id !== userInfoRef.current.userId && Array.isArray(p.locks)) {
        p.locks.forEach((key) => {
          newLocks[key] = { user_id: p.user_id, full_name: p.full_name, color: p.color };
        });
      }
    });
    setPresence(users);
    setLocks(newLocks);
  }, []);

  const pushPresence = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch) return;
    const { userId: uid, fullName: fn, color: c } = userInfoRef.current;
    await ch.track({
      user_id:  uid,
      full_name: fn  || 'Anonymous',
      color:    c   || '#3b82f6',
      locks:    [...myLocksRef.current],
    });
  }, []);

  // ── Channel setup ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!workshopId || !userId) return;

    const channel = db.channel(`workshop:${workshopId}`, {
      config: {
        broadcast: { self: false }, // don't echo our own broadcasts back
        presence:  { key: userId },
      },
    });
    channelRef.current = channel;

    // Broadcast listeners — delegate through cbRef so they always call the
    // latest callback even though the channel is only set up once.
    channel
      .on('broadcast', { event: 'block_patch' },     ({ payload }) => cbRef.current.onRemoteBlockPatch(payload.blockId, payload.patch))
      .on('broadcast', { event: 'block_add' },       ({ payload }) => cbRef.current.onRemoteBlockAdd(payload.block, payload.sectionId))
      .on('broadcast', { event: 'block_delete' },    ({ payload }) => cbRef.current.onRemoteBlockDelete(payload.blockId))
      .on('broadcast', { event: 'section_add' },     ({ payload }) => cbRef.current.onRemoteSectionAdd(payload.section, payload.sectionIds))
      .on('broadcast', { event: 'section_delete' },  ({ payload }) => cbRef.current.onRemoteSectionDelete(payload.sectionId))
      .on('broadcast', { event: 'section_rename' },  ({ payload }) => cbRef.current.onRemoteSectionRename(payload.sectionId, payload.title))
      .on('broadcast', { event: 'block_reorder' },   ({ payload }) => cbRef.current.onRemoteBlockReorder(payload.blockOrders))
      .on('broadcast', { event: 'section_reorder' }, ({ payload }) => cbRef.current.onRemoteSectionReorder(payload.sectionIds));

    // Presence listeners
    channel
      .on('presence', { event: 'sync' },  () => rebuildFromPresence(channel.presenceState()))
      .on('presence', { event: 'join' },  () => rebuildFromPresence(channel.presenceState()))
      .on('presence', { event: 'leave' }, () => rebuildFromPresence(channel.presenceState()));

    // Subscribe then track self
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await pushPresence();
      }
    });

    return () => {
      // Untrack presence before removing the channel
      channel.untrack().finally(() => db.removeChannel(channel));
      channelRef.current = null;
      myLocksRef.current.clear();
    };
  }, [workshopId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ────────────────────────────────────────────────────────────

  /** Send a typed broadcast event to all other users in this workshop. */
  const broadcast = useCallback(async (event, payload) => {
    const ch = channelRef.current;
    if (!ch) return;
    await ch.send({ type: 'broadcast', event, payload });
  }, []);

  /** Call on input focus — claims an edit lock for (blockId, fieldName). */
  const trackField = useCallback(async (blockId, fieldName) => {
    myLocksRef.current.add(`${blockId}:${fieldName}`);
    await pushPresence();
  }, [pushPresence]);

  /** Call on input blur — releases the edit lock for (blockId, fieldName). */
  const untrackField = useCallback(async (blockId, fieldName) => {
    myLocksRef.current.delete(`${blockId}:${fieldName}`);
    await pushPresence();
  }, [pushPresence]);

  return { presence, locks, broadcast, trackField, untrackField };
}
