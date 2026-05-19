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
  const [blockEditors, setBlockEditors] = useState({});

  const myLocksRef   = useRef(new Set());
  const myActiveBlockRef = useRef(null);
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
    // Phoenix Channels can keep multiple presence entries for the same user_id
    // (e.g. a stale socket from a previous session alongside the current one).
    // Deduplicate by user_id, keeping only the entry with the highest ts so
    // stale active_block / lock values from dead connections don't bleed through.
    const byUser = {};
    Object.values(state).flat().forEach((p) => {
      const prev = byUser[p.user_id];
      if (!prev || (p.ts || 0) > (prev.ts || 0)) byUser[p.user_id] = p;
    });
    const entries = Object.values(byUser);

    const users    = [];
    const newLocks = {};
    const newBlockEditors = {};
    entries.forEach((p) => {
      users.push({ user_id: p.user_id, full_name: p.full_name, color: p.color });
      if (p.user_id !== userInfoRef.current.userId) {
        // Field locks
        if (Array.isArray(p.locks)) {
          p.locks.forEach((key) => {
            newLocks[key] = { user_id: p.user_id, full_name: p.full_name, color: p.color };
          });
        }
        // Active block editor
        if (p.active_block) {
          newBlockEditors[p.active_block] = { user_id: p.user_id, full_name: p.full_name, color: p.color };
        }
      }
    });

    setPresence(users);
    setLocks(newLocks);
    setBlockEditors(newBlockEditors);
  }, []);

  const pushPresence = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch) return;
    const { userId: uid, fullName: fn, color: c } = userInfoRef.current;
    await ch.track({
      user_id:      uid,
      full_name:    fn  || 'Anonymous',
      color:        c   || '#3b82f6',
      locks:        [...myLocksRef.current],
      active_block: myActiveBlockRef.current,
      ts:           Date.now(), // used to pick the newest entry when the same user
    });                         // has multiple sockets (stale tab + current tab)
  }, []);

  // ── Channel setup ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!workshopId || !userId) return;

    // `active` prevents async callbacks from firing after cleanup.
    // This avoids unhandled-rejection crashes in React Strict Mode where
    // the effect runs, cleans up, then runs again before async work settles.
    let active = true;

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
      .on('presence', { event: 'sync' },  () => { if (active) rebuildFromPresence(channel.presenceState()); })
      .on('presence', { event: 'join' },  () => { if (active) rebuildFromPresence(channel.presenceState()); })
      .on('presence', { event: 'leave' }, () => { if (active) rebuildFromPresence(channel.presenceState()); });

    // Subscribe then track self — catch errors so an unsubscribed channel
    // (e.g. during Strict Mode cleanup) never produces an unhandled rejection.
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && active) {
        await pushPresence().catch(() => {});
      }
    });

    return () => {
      active = false;
      channelRef.current = null;
      myLocksRef.current.clear();
      // Remove the channel synchronously so the Supabase client drops it from
      // its registry immediately. In React Strict Mode the cleanup and the next
      // mount run back-to-back; if removeChannel is deferred (chained after
      // untrack), the second mount calls db.channel() with the same name and
      // gets back the already-subscribed instance — adding presence listeners
      // to it then throws "cannot add presence callbacks after subscribe()".
      channel.untrack().catch(() => {}); // fire-and-forget — presence clears when channel closes
      db.removeChannel(channel);       // synchronous registry removal
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

  /** Call when a block editor opens/closes — tracks which block this user is editing. */
  const trackActiveBlock = useCallback(async (blockId) => {
    myActiveBlockRef.current = blockId || null;
    await pushPresence();
  }, [pushPresence]);

  return { presence, locks, blockEditors, broadcast, trackField, untrackField, trackActiveBlock };
}
