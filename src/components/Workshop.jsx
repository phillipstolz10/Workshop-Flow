import { useState, useRef, useEffect, useContext, useCallback, Fragment } from 'react';
import Icon from './Icon.jsx';
import BlockRow from './BlockRow.jsx';
import BlockEditor from './BlockEditor.jsx';
import PackingList from './PackingList.jsx';
import LinksPanel from './LinksPanel.jsx';
import { HistoryContext } from '../contexts/HistoryContext.jsx';
import { WorkshopRealtimeContext } from '../contexts/WorkshopRealtimeContext.jsx';
import { useWorkshopRealtime } from '../hooks/useWorkshopRealtime.js';
import { db } from '../lib/supabase.js';
import { syncSectionPositions, syncBlockPositions } from '../lib/db.js';
import { workshopTotal, fmtDuration, addMinutes, snap5, initials } from '../lib/utils.js';

function ContentEditable({ value, onChange, className }) {
  const ref = useRef(null);
  const lastValRef = useRef(value);
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
      lastValRef.current = value;
    }
  }, [value]);
  return (
    <span
      ref={ref}
      className={'ce ' + (className || '')}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const v = e.currentTarget.textContent.trim();
        if (v !== lastValRef.current) { lastValRef.current = v; onChange(v); }
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

function TickerNumber({ value, isOver }) {
  const [display, setDisplay] = useState(value);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (display !== value) {
      setBump(true);
      const t1 = setTimeout(() => setDisplay(value), 0);
      const t2 = setTimeout(() => setBump(false), 320);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [value]);
  return (
    <span className={'ticker' + (bump ? ' is-bump' : '') + (isOver ? ' is-over' : '')}>
      {value}
    </span>
  );
}

function FloatingUndoRedo() {
  const h = useContext(HistoryContext);
  return (
    <div className="float-ur-panel">
      <button className="float-ur-btn" onClick={h.undo} disabled={!h.canUndo} aria-label="Undo">
        <Icon name="undo" size={16} />
        <span className="float-ur-tip">Undo</span>
      </button>
      <button className="float-ur-btn" onClick={h.redo} disabled={!h.canRedo} aria-label="Redo">
        <Icon name="redo" size={16} />
        <span className="float-ur-tip">Redo</span>
      </button>
    </div>
  );
}

function PresenceAvatars({ presence, userId }) {
  const others = presence.filter((p) => p.user_id !== userId);
  if (others.length === 0) return null;
  const shown = others.slice(0, 3);
  const extra = others.length - shown.length;
  return (
    <div className="presence-stack">
      <div className="presence-avatars">
        {shown.map((p) => (
          <div
            key={p.user_id}
            className="presence-avatar"
            style={{ background: p.color || '#3b82f6' }}
            title={p.full_name || 'Anonymous'}
          >
            {initials(p.full_name)}
          </div>
        ))}
        {extra > 0 && (
          <div className="presence-avatar presence-avatar-overflow">+{extra}</div>
        )}
      </div>
      <span className="presence-online-dot" />
      <span className="presence-label">{others.length} here</span>
    </div>
  );
}

export default function Workshop({ data, workshopId, onUpdateData, onBack, onProject, tweaks, toast, pushHistory, userId, userColor, userFullName }) {
  // Look up workshop/project — may be briefly undefined during Strict Mode
  // double-mount or a concurrent data reload. Guard after hooks (Rules of Hooks).
  const workshop = data.workshops[workshopId];
  const project  = workshop ? data.projects.find((p) => p.id === workshop.projectId) : null;

  const [editingBlockId,  setEditingBlockId]  = useState(null);
  const [collapsed,       setCollapsed]       = useState({});
  const [editingPlanned,  setEditingPlanned]  = useState(false);
  const [showPackingList, setShowPackingList] = useState(false);
  const [showLinks, setShowLinks] = useState(false);

  const [drag,       setDrag]       = useState(null);
  const blockDragRef = useRef(null);
  const [dropOver,   setDropOver]   = useState(null);
  const [secDrag,    setSecDrag]    = useState(null);
  const [secDropAt,  setSecDropAt]  = useState(null);

  const totalMins = workshop ? workshopTotal(data, workshopId) : 0;
  const blockOffsets = (() => {
    if (!workshop) return {};
    const map = {}; let cum = 0;
    workshop.sectionIds.forEach(sid => {
      (data.sections[sid]?.blockIds || []).forEach(bid => {
        map[bid] = cum;
        cum += data.blocks[bid]?.duration || 0;
      });
    });
    return map;
  })();

  const editingBlock = editingBlockId ? data.blocks[editingBlockId] : null;
  const editingMode  = tweaks.editor;
  const sectionStyle = tweaks.sectionStyle;

  // Close the editor automatically if the block was deleted by a remote user
  useEffect(() => {
    if (editingBlockId && !data.blocks[editingBlockId]) {
      closeBlockEditor();
    }
  }, [data.blocks, editingBlockId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Remote update handlers (no pushHistory — don't pollute local undo stack) ──

  const handleRemoteBlockPatch = useCallback((blockId, patch) => {
    onUpdateData((d) => {
      if (!d.blocks[blockId]) return d;
      return { ...d, blocks: { ...d.blocks, [blockId]: { ...d.blocks[blockId], ...patch } } };
    });
  }, [onUpdateData]);

  const handleRemoteBlockAdd = useCallback((block, sectionId) => {
    onUpdateData((d) => {
      if (d.blocks[block.id]) return d; // already present (e.g. our own optimistic add)
      const section = d.sections[sectionId];
      if (!section) return d;
      return {
        ...d,
        blocks:   { ...d.blocks,   [block.id]: block },
        sections: { ...d.sections, [sectionId]: { ...section, blockIds: [...section.blockIds, block.id] } },
      };
    });
  }, [onUpdateData]);

  const handleRemoteBlockDelete = useCallback((blockId) => {
    onUpdateData((d) => {
      if (!d.blocks[blockId]) return d;
      const newBlocks   = { ...d.blocks };   delete newBlocks[blockId];
      const newSections = { ...d.sections };
      Object.keys(newSections).forEach((sid) => {
        if (newSections[sid].blockIds.includes(blockId)) {
          newSections[sid] = { ...newSections[sid], blockIds: newSections[sid].blockIds.filter((x) => x !== blockId) };
        }
      });
      return { ...d, blocks: newBlocks, sections: newSections };
    });
  }, [onUpdateData]);

  const handleRemoteSectionAdd = useCallback((section, sectionIds) => {
    onUpdateData((d) => {
      if (d.sections[section.id]) return d;
      return {
        ...d,
        sections:  { ...d.sections, [section.id]: section },
        workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], sectionIds } },
      };
    });
  }, [onUpdateData, workshopId]);

  const handleRemoteSectionDelete = useCallback((sectionId) => {
    onUpdateData((d) => {
      const sec = d.sections[sectionId];
      if (!sec) return d;
      const newBlocks   = { ...d.blocks };
      sec.blockIds.forEach((bid) => delete newBlocks[bid]);
      const newSections = { ...d.sections }; delete newSections[sectionId];
      return {
        ...d,
        blocks:    newBlocks,
        sections:  newSections,
        workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], sectionIds: d.workshops[workshopId].sectionIds.filter((x) => x !== sectionId) } },
      };
    });
  }, [onUpdateData, workshopId]);

  const handleRemoteSectionRename = useCallback((sectionId, title) => {
    onUpdateData((d) => {
      if (!d.sections[sectionId]) return d;
      return { ...d, sections: { ...d.sections, [sectionId]: { ...d.sections[sectionId], title } } };
    });
  }, [onUpdateData]);

  const handleRemoteBlockReorder = useCallback((blockOrders) => {
    // blockOrders: { [sectionId]: blockIds[] }
    onUpdateData((d) => {
      const newSections = { ...d.sections };
      Object.entries(blockOrders).forEach(([sid, blockIds]) => {
        if (newSections[sid]) newSections[sid] = { ...newSections[sid], blockIds };
      });
      return { ...d, sections: newSections };
    });
  }, [onUpdateData]);

  const handleRemoteSectionReorder = useCallback((sectionIds) => {
    onUpdateData((d) => ({
      ...d,
      workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], sectionIds } },
    }));
  }, [onUpdateData, workshopId]);

  // ── Realtime hook ─────────────────────────────────────────────────────────

  const { presence, locks, blockEditors, broadcast, trackField, untrackField, trackActiveBlock } = useWorkshopRealtime({
    workshopId,
    userId,
    fullName: userFullName,
    color:    userColor,
    onRemoteBlockPatch:     handleRemoteBlockPatch,
    onRemoteBlockAdd:       handleRemoteBlockAdd,
    onRemoteBlockDelete:    handleRemoteBlockDelete,
    onRemoteSectionAdd:     handleRemoteSectionAdd,
    onRemoteSectionDelete:  handleRemoteSectionDelete,
    onRemoteSectionRename:  handleRemoteSectionRename,
    onRemoteBlockReorder:   handleRemoteBlockReorder,
    onRemoteSectionReorder: handleRemoteSectionReorder,
  });

  // Wrappers so trackActiveBlock is called synchronously in the same event as
  // setEditingBlockId — avoiding a race where an onBlur pushPresence fires
  // after the useEffect-based trackActiveBlock(null) and re-instates the old
  // active_block in Supabase presence.
  const openBlockEditor  = useCallback((bid) => { setEditingBlockId(bid);  trackActiveBlock(bid);  }, [trackActiveBlock]);
  const closeBlockEditor = useCallback(()    => { setEditingBlockId(null); trackActiveBlock(null); }, [trackActiveBlock]);

  // ── Broadcast undo/redo diffs to peers ────────────────────────────────────
  // App.jsx calls afterUndoRedoRef.current(fromState, toState) after every
  // undo/redo. We diff the block map and broadcast a block_patch for each
  // changed block so collaborators see the revert without a full page reload.
  const { afterUndoRedoRef } = useContext(HistoryContext);
  useEffect(() => {
    afterUndoRedoRef.current = (fromState, toState) => {
      const FIELDS = ['title', 'description', 'person', 'material', 'duration'];
      Object.keys(toState.blocks).forEach((blockId) => {
        const from = fromState.blocks[blockId];
        const to   = toState.blocks[blockId];
        if (!from || !to) return;
        const patch = {};
        FIELDS.forEach((f) => { if (from[f] !== to[f]) patch[f] = to[f]; });
        if (Object.keys(patch).length) broadcast('block_patch', { blockId, patch });
      });
    };
    return () => { afterUndoRedoRef.current = null; };
  }, [broadcast, afterUndoRedoRef]);

  // ── Local mutations (each also broadcasts to other users) ─────────────────

  const patchBlock = async (id, patch) => {
    pushHistory();
    onUpdateData((d) => ({ ...d, blocks: { ...d.blocks, [id]: { ...d.blocks[id], ...patch } } }));
    const dbPatch = {};
    if ('title'       in patch) dbPatch.title       = patch.title;
    if ('description' in patch) dbPatch.description = patch.description || null;
    if ('person'      in patch) dbPatch.person      = patch.person      || null;
    if ('material'    in patch) dbPatch.material    = patch.material    || null;
    if ('duration'    in patch) dbPatch.duration    = patch.duration;
    if (Object.keys(dbPatch).length) {
      const [{ error }] = await Promise.all([
        db.from('blocks').update(dbPatch).eq('id', id),
        broadcast('block_patch', { blockId: id, patch }),
      ]);
      if (error) toast('Save failed');
    }
  };

  const deleteBlock = async (id) => {
    pushHistory();
    onUpdateData((d) => {
      const newBlocks   = { ...d.blocks }; delete newBlocks[id];
      const newSections = { ...d.sections };
      Object.keys(newSections).forEach((sid) => {
        if (newSections[sid].blockIds.includes(id))
          newSections[sid] = { ...newSections[sid], blockIds: newSections[sid].blockIds.filter((x) => x !== id) };
      });
      return { ...d, blocks: newBlocks, sections: newSections };
    });
    closeBlockEditor();
    toast('Block deleted');
    await Promise.all([
      db.from('blocks').delete().eq('id', id),
      broadcast('block_delete', { blockId: id }),
    ]);
  };

  const addBlock = async (sectionId) => {
    pushHistory();
    const id    = crypto.randomUUID();
    const block = { id, sectionId, duration: 15, title: 'New block', description: '', person: '', material: '' };
    const pos   = data.sections[sectionId]?.blockIds?.length || 0;
    onUpdateData((d) => ({
      ...d,
      blocks:   { ...d.blocks,   [id]: block },
      sections: { ...d.sections, [sectionId]: { ...d.sections[sectionId], blockIds: [...d.sections[sectionId].blockIds, id] } },
    }));
    openBlockEditor(id);
    await Promise.all([
      db.from('blocks').insert({ id, section_id: sectionId, title: block.title, duration: block.duration, position: pos }),
      broadcast('block_add', { block, sectionId }),
    ]);
  };

  const addSection = async (insertAtIndex = null) => {
    pushHistory();
    const id  = crypto.randomUUID();
    const sec = { id, workshopId, title: 'New section', blockIds: [] };
    let newIds;
    onUpdateData((d) => {
      const ws = d.workshops[workshopId];
      newIds = [...ws.sectionIds];
      if (insertAtIndex == null || insertAtIndex >= newIds.length) newIds.push(id);
      else newIds.splice(insertAtIndex, 0, id);
      return { ...d, sections: { ...d.sections, [id]: sec }, workshops: { ...d.workshops, [workshopId]: { ...ws, sectionIds: newIds } } };
    });
    const pos = insertAtIndex == null ? (data.workshops[workshopId]?.sectionIds.length || 0) : insertAtIndex;
    await db.from('sections').insert({ id, workshop_id: workshopId, title: sec.title, position: pos });
    if (newIds) {
      await Promise.all([
        syncSectionPositions(newIds).catch(() => {}),
        broadcast('section_add', { section: sec, sectionIds: newIds }),
      ]);
    }
  };

  const renameSection = async (id, title) => {
    pushHistory();
    onUpdateData((d) => ({ ...d, sections: { ...d.sections, [id]: { ...d.sections[id], title } } }));
    await Promise.all([
      db.from('sections').update({ title }).eq('id', id),
      broadcast('section_rename', { sectionId: id, title }),
    ]);
  };

  const renameWorkshop = async (title) => {
    pushHistory();
    onUpdateData((d) => ({ ...d, workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], title } } }));
    await db.from('workshops').update({ title }).eq('id', workshopId);
  };

  const changePlannedDuration = async (mins) => {
    pushHistory();
    const snapped = Math.max(5, snap5(mins));
    onUpdateData((d) => ({ ...d, workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], plannedDuration: snapped } } }));
    await db.from('workshops').update({ planned_duration: snapped }).eq('id', workshopId);
  };

  const changeDate = async (date) => {
    pushHistory();
    onUpdateData((d) => ({ ...d, workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], date } } }));
    await db.from('workshops').update({ date: date || null }).eq('id', workshopId);
  };

  const changeStartTime = async (startTime) => {
    onUpdateData((d) => ({ ...d, workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], startTime } } }));
    await db.from('workshops').update({ start_time: startTime }).eq('id', workshopId);
  };

  const deleteSection = async (id) => {
    pushHistory();
    onUpdateData((d) => {
      const sec = d.sections[id];
      const newBlocks   = { ...d.blocks }; sec.blockIds.forEach((bid) => delete newBlocks[bid]);
      const newSections = { ...d.sections }; delete newSections[id];
      return {
        ...d, blocks: newBlocks, sections: newSections,
        workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], sectionIds: d.workshops[workshopId].sectionIds.filter((x) => x !== id) } },
      };
    });
    toast('Section removed');
    await Promise.all([
      db.from('sections').delete().eq('id', id),
      broadcast('section_delete', { sectionId: id }),
    ]);
  };

  const findBlockSection = (d, blockId) => {
    for (const sid of Object.keys(d.sections)) {
      if (d.sections[sid].blockIds.includes(blockId)) return sid;
    }
    return null;
  };

  const moveSection = async (sectionId, insertAt) => {
    pushHistory();
    let newIds;
    onUpdateData((d) => {
      const ws = d.workshops[workshopId];
      newIds = ws.sectionIds.filter((x) => x !== sectionId);
      const adjusted = insertAt > ws.sectionIds.indexOf(sectionId) ? insertAt - 1 : insertAt;
      newIds.splice(Math.max(0, Math.min(newIds.length, adjusted)), 0, sectionId);
      return { ...d, workshops: { ...d.workshops, [workshopId]: { ...ws, sectionIds: newIds } } };
    });
    setTimeout(() => {
      if (newIds) {
        syncSectionPositions(newIds).catch(() => {});
        broadcast('section_reorder', { sectionIds: newIds });
      }
    }, 0);
  };

  const moveBlock = async (blockId, toSectionId, beforeBlockId) => {
    pushHistory();
    let affectedSections = {};
    onUpdateData((d) => {
      const fromSid = findBlockSection(d, blockId);
      if (!fromSid) return d;
      const sections = { ...d.sections };
      sections[fromSid] = { ...sections[fromSid], blockIds: sections[fromSid].blockIds.filter((x) => x !== blockId) };
      const toIds = (fromSid === toSectionId ? sections[fromSid].blockIds : sections[toSectionId].blockIds).slice();
      const idx = beforeBlockId == null ? toIds.length : toIds.indexOf(beforeBlockId);
      toIds.splice(idx === -1 ? toIds.length : idx, 0, blockId);
      sections[toSectionId] = { ...sections[toSectionId], blockIds: toIds };
      affectedSections = { [fromSid]: sections[fromSid].blockIds, [toSectionId]: toIds };
      return { ...d, sections };
    });
    setTimeout(() => {
      Object.entries(affectedSections).forEach(([sid, ids]) => syncBlockPositions(sid, ids).catch(() => {}));
      if (Object.keys(affectedSections).length) {
        broadcast('block_reorder', { blockOrders: affectedSections });
      }
    }, 0);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeBlockEditor(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Context value for children (BlockEditor etc.) ─────────────────────────

  const realtimeCtx = { presence, locks, blockEditors, trackField, untrackField, trackActiveBlock, userId };

  // ── Guard — must come after all hooks ────────────────────────────────────
  if (!workshop || !project) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <WorkshopRealtimeContext.Provider value={realtimeCtx}>
      <div className="ws-page">
        <header className="ws-header">
          <div className="ws-header-inner">
            <div className="ws-header-meta">
              <div className="eyebrow" style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
                <a onClick={onBack} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Projects</a>
                <span style={{ color: 'var(--text-subtle)' }}>/</span>
                <a onClick={onProject} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>{project.name}</a>
              </div>
              <ContentEditable className="ws-title" value={workshop.title} onChange={renameWorkshop} />
              <div className="ws-header-row">
                <label className="ws-date">
                  <Icon name="calendar" size={13} />
                  <input type="date" value={workshop.date} onChange={(e) => changeDate(e.target.value)} className="ws-date-input" />
                </label>
                <span style={{ color: 'var(--text-subtle)' }}>·</span>
                <label className="ws-start-time">
                  <Icon name="clock" size={13} />
                  <input
                    type="time" value={workshop.startTime || '09:00'}
                    onChange={(e) => changeStartTime(e.target.value)}
                    className="ws-start-time-input"
                  />
                </label>
                {totalMins > 0 && (
                  <>
                    <span style={{ color: 'var(--text-subtle)' }}>·</span>
                    <span className="ws-end-time">Ends {addMinutes(workshop.startTime || '09:00', totalMins)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="ws-header-total">
              <div className="eyebrow">Total session</div>
              <div className="ws-total-num serif">
                <TickerNumber value={fmtDuration(totalMins)} isOver={totalMins > (workshop.plannedDuration || 0)} />
              </div>
              {editingPlanned ? (
                <div className="ws-total-sub mono" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <input
                    type="number" min="5" step="5"
                    defaultValue={workshop.plannedDuration || totalMins}
                    onBlur={(e) => { changePlannedDuration(parseInt(e.target.value || '5', 10)); setEditingPlanned(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingPlanned(false); }}
                    autoFocus
                    style={{ width: 52, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface)', outline: 'none' }}
                  />
                  <span>min planned</span>
                </div>
              ) : (
                <div className="ws-total-sub mono" onClick={() => setEditingPlanned(true)} style={{ cursor: 'pointer' }} title="Click to edit planned duration">
                  {fmtDuration(workshop.plannedDuration || totalMins)} planned
                </div>
              )}
            </div>
          </div>

          <div className="ws-toolbar">
            <div style={{ flex: 1 }} />
            <PresenceAvatars presence={presence} userId={userId} />
            <div className="ws-toolbar-group">
              <button
                className={'btn btn-ghost ws-tool' + (showPackingList ? ' is-active' : '')}
                onClick={() => setShowPackingList((v) => !v)}
                title="Packing list"
                style={showPackingList ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' } : {}}
              >
                <Icon name="backpack" size={14} />
                <span>Packing list</span>
              </button>
            </div>
            <div className="ws-toolbar-group">
              <button
                className={'btn btn-ghost ws-tool' + (showLinks ? ' is-active' : '')}
                onClick={() => setShowLinks((v) => !v)}
                title="Related links"
                style={showLinks ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' } : {}}
              >
                <Icon name="link" size={14} />
                <span>Links</span>
              </button>
            </div>
          </div>
        </header>

        <main className={'ws-agenda style-' + sectionStyle} onDragOver={(e) => { if (blockDragRef.current) e.preventDefault(); }}>
          {workshop.sectionIds.map((sid, idx) => {
            const section    = data.sections[sid];
            const isCollapsed = !!collapsed[sid];
            const secTotal   = section.blockIds.reduce((s, bid) => s + (data.blocks[bid]?.duration || 0), 0);

            const InsertBar = (
              <div className="sec-insert" onClick={() => addSection(idx)}>
                <span className="sec-insert-line" />
                <span className="sec-insert-btn"><Icon name="plus" size={12} /> Add section here</span>
                <span className="sec-insert-line" />
              </div>
            );

            const SecDropBar = (
              <div
                className={'sec-drop-bar' + (secDrag && secDropAt === idx ? ' is-active' : '')}
                onDragOver={(e) => { if (secDrag) { e.preventDefault(); setSecDropAt(idx); } }}
                onDrop={(e) => { if (secDrag) { e.preventDefault(); moveSection(secDrag, idx); setSecDrag(null); setSecDropAt(null); } }}
              />
            );

            return (
              <Fragment key={sid}>
                {idx > 0 && !secDrag && !drag && InsertBar}
                {secDrag && SecDropBar}

                <section
                  className={'sec ' + (sectionStyle === 'cards' ? 'sec-card' : 'sec-flat') + (secDrag === sid ? ' is-section-dragging' : '')}
                  onDragOver={(e) => { if ((secDrag && secDrag !== sid) || blockDragRef.current) e.preventDefault(); }}
                >
                  <span
                    className="sec-grip"
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'sec:' + sid); setSecDrag(sid); }}
                    onDragEnd={() => { setSecDrag(null); setSecDropAt(null); }}
                    title="Drag section to reorder"
                  >
                    <Icon name="grip" size={12} />
                  </span>
                  <header className="sec-head">
                    <button className="sec-toggle" onClick={() => setCollapsed((c) => ({ ...c, [sid]: !c[sid] }))}>
                      <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
                    </button>
                    <div className="sec-index mono">{String(idx + 1).padStart(2, '0')}</div>
                    <ContentEditable className="sec-title" value={section.title} onChange={(v) => renameSection(sid, v)} />
                    <div className="sec-duration mono" title="Section duration">
                      <span className="sec-duration-num">{secTotal}</span>
                      <span className="sec-duration-unit">min</span>
                    </div>
                    <div className="sec-actions">
                      <button className="btn btn-icon" onClick={() => deleteSection(sid)} title="Delete section"><Icon name="trash" size={15} /></button>
                    </div>
                  </header>

                  {!isCollapsed && (
                    <div
                      className="sec-body"
                      onDragOver={(e) => {
                        if (!blockDragRef.current) return;
                        e.preventDefault();
                        if (section.blockIds.length === 0) { setDropOver({ sectionId: sid, beforeBlockId: null }); }
                      }}
                      onDrop={(e) => {
                        const d = blockDragRef.current;
                        if (!d) return;
                        if (section.blockIds.length === 0) {
                          e.preventDefault();
                          moveBlock(d.blockId, sid, null);
                          blockDragRef.current = null; setDrag(null); setDropOver(null);
                        }
                      }}
                    >
                      {section.blockIds.length === 0 && (
                        <button className={'sec-empty' + (drag && dropOver?.sectionId === sid ? ' is-drop-target' : '')} onClick={() => addBlock(sid)}>
                          <Icon name="plus" size={14} />
                          {drag ? 'Drop block here' : 'Empty section. Add the first block.'}
                        </button>
                      )}

                      {section.blockIds.map((bid) => {
                        const block        = data.blocks[bid];
                        const isEditing    = editingBlockId === bid && editingMode === 'inline';
                        const isDropTarget = dropOver && dropOver.sectionId === sid && dropOver.beforeBlockId === bid;
                        return (
                          <BlockRow
                            key={bid}
                            block={block}
                            isEditing={isEditing}
                            isDragging={drag?.blockId === bid}
                            isDropTarget={isDropTarget}
                            activeEditor={blockEditors[bid]}
                            onOpen={() => openBlockEditor(bid)}
                            onChange={(patch) => patchBlock(bid, patch)}
                            onClose={() => closeBlockEditor()}
                            onDelete={() => deleteBlock(bid)}
                            startTime={addMinutes(workshop.startTime || '09:00', blockOffsets[bid] || 0)}
                            onDragStart={() => { const d = { blockId: bid, fromSection: sid }; blockDragRef.current = d; setDrag(d); }}
                            onDragEnd={() => { blockDragRef.current = null; setDrag(null); setDropOver(null); }}
                            onDragOver={(e) => {
                              if (!blockDragRef.current) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              const rect = e.currentTarget.getBoundingClientRect();
                              const before = (e.clientY - rect.top) < rect.height / 2;
                              const blockIds = data.sections[sid].blockIds;
                              const ix = blockIds.indexOf(bid);
                              const beforeBlockId = before ? bid : (blockIds[ix + 1] || null);
                              setDropOver({ sectionId: sid, beforeBlockId });
                            }}
                            onDrop={(e) => {
                              const d = blockDragRef.current;
                              if (!d) return;
                              e.preventDefault();
                              if (dropOver) moveBlock(d.blockId, dropOver.sectionId, dropOver.beforeBlockId);
                              blockDragRef.current = null; setDrag(null); setDropOver(null);
                            }}
                          />
                        );
                      })}

                      {drag && section.blockIds.length > 0 && (
                        <div
                          className={'blk-drop-tail' + (dropOver?.sectionId === sid && dropOver?.beforeBlockId === null ? ' is-active' : '')}
                          onDragOver={(e) => { e.preventDefault(); setDropOver({ sectionId: sid, beforeBlockId: null }); }}
                          onDrop={(e) => { const d = blockDragRef.current; if (!d) return; e.preventDefault(); moveBlock(d.blockId, sid, null); blockDragRef.current = null; setDrag(null); setDropOver(null); }}
                        />
                      )}

                      <button className="sec-add-row" onClick={() => addBlock(sid)}>
                        <Icon name="plus" size={13} /> Add block to "{section.title}"
                      </button>
                    </div>
                  )}
                </section>

                {secDrag && idx === workshop.sectionIds.length - 1 && (
                  <div
                    className={'sec-drop-bar' + (secDropAt === workshop.sectionIds.length ? ' is-active' : '')}
                    onDragOver={(e) => { e.preventDefault(); setSecDropAt(workshop.sectionIds.length); }}
                    onDrop={(e) => { e.preventDefault(); moveSection(secDrag, workshop.sectionIds.length); setSecDrag(null); setSecDropAt(null); }}
                  />
                )}
              </Fragment>
            );
          })}

          <button className="ws-add-section" onClick={() => addSection()}>
            <Icon name="plus" size={16} /><span>Add a section</span>
          </button>
        </main>

        {editingBlock && editingMode === 'panel' && (
          <BlockEditor
            mode="panel"
            block={editingBlock}
            onChange={(b) => patchBlock(editingBlockId, b)}
            onClose={() => closeBlockEditor()}
            onDelete={() => deleteBlock(editingBlockId)}
          />
        )}

        {showPackingList && (
          <PackingList
            data={data}
            workshopId={workshopId}
            onClose={() => setShowPackingList(false)}
          />
        )}

        {showLinks && (
          <LinksPanel
            entityType="workshop"
            entityId={workshopId}
            onClose={() => setShowLinks(false)}
          />
        )}

        <FloatingUndoRedo />
      </div>
    </WorkshopRealtimeContext.Provider>
  );
}
