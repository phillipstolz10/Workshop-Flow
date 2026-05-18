import { useState, useRef, useEffect, useContext, Fragment } from 'react';
import Icon from './Icon.jsx';
import BlockRow from './BlockRow.jsx';
import BlockEditor from './BlockEditor.jsx';
import { HistoryContext } from '../contexts/HistoryContext.jsx';
import { db } from '../lib/supabase.js';
import { syncSectionPositions, syncBlockPositions } from '../lib/db.js';
import { workshopTotal, fmtDuration, addMinutes, snap5 } from '../lib/utils.js';

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

function UndoRedoBtns() {
  const h = useContext(HistoryContext);
  return (
    <>
      <button className="btn btn-ghost ws-tool" onClick={h.undo} disabled={!h.canUndo} title="Undo (⌘Z)">
        <Icon name="undo" size={14} /><span>Undo</span><span className="kbd">⌘Z</span>
      </button>
      <button className="btn btn-ghost ws-tool" onClick={h.redo} disabled={!h.canRedo} title="Redo (⌘⇧Z)">
        <Icon name="redo" size={14} /><span>Redo</span>
      </button>
    </>
  );
}

export default function Workshop({ data, workshopId, onUpdateData, onBack, onProject, tweaks, toast, pushHistory }) {
  const workshop = data.workshops[workshopId];
  const project = data.projects.find((p) => p.id === workshop.projectId);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [editingPlanned, setEditingPlanned] = useState(false);

  const [drag, setDrag] = useState(null);
  const blockDragRef = useRef(null);
  const [dropOver, setDropOver] = useState(null);
  const [secDrag, setSecDrag] = useState(null);
  const [secDropAt, setSecDropAt] = useState(null);

  const totalMins = workshopTotal(data, workshopId);
  const blockOffsets = (() => {
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
  const editingMode = tweaks.editor;
  const sectionStyle = tweaks.sectionStyle;

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
      const { error } = await db.from('blocks').update(dbPatch).eq('id', id);
      if (error) toast('Save failed');
    }
  };

  const deleteBlock = async (id) => {
    pushHistory();
    onUpdateData((d) => {
      const newBlocks = { ...d.blocks }; delete newBlocks[id];
      const newSections = { ...d.sections };
      Object.keys(newSections).forEach((sid) => {
        if (newSections[sid].blockIds.includes(id))
          newSections[sid] = { ...newSections[sid], blockIds: newSections[sid].blockIds.filter((x) => x !== id) };
      });
      return { ...d, blocks: newBlocks, sections: newSections };
    });
    setEditingBlockId(null);
    toast('Block deleted');
    await db.from('blocks').delete().eq('id', id);
  };

  const addBlock = async (sectionId) => {
    pushHistory();
    const id    = crypto.randomUUID();
    const block = { id, duration: 15, title: 'New block', description: '', person: '', material: '' };
    const pos   = data.sections[sectionId]?.blockIds?.length || 0;
    onUpdateData((d) => ({
      ...d,
      blocks:   { ...d.blocks,   [id]: block },
      sections: { ...d.sections, [sectionId]: { ...d.sections[sectionId], blockIds: [...d.sections[sectionId].blockIds, id] } }
    }));
    setEditingBlockId(id);
    await db.from('blocks').insert({ id, section_id: sectionId, title: block.title, duration: block.duration, position: pos });
  };

  const addSection = async (insertAtIndex = null) => {
    pushHistory();
    const id  = crypto.randomUUID();
    const sec = { id, title: 'New section', blockIds: [] };
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
    setTimeout(() => { if (newIds) syncSectionPositions(newIds).catch(() => {}); }, 0);
  };

  const renameSection = async (id, title) => {
    pushHistory();
    onUpdateData((d) => ({ ...d, sections: { ...d.sections, [id]: { ...d.sections[id], title } } }));
    await db.from('sections').update({ title }).eq('id', id);
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
      const newBlocks = { ...d.blocks }; sec.blockIds.forEach((bid) => delete newBlocks[bid]);
      const newSections = { ...d.sections }; delete newSections[id];
      return {
        ...d, blocks: newBlocks, sections: newSections,
        workshops: { ...d.workshops, [workshopId]: { ...d.workshops[workshopId], sectionIds: d.workshops[workshopId].sectionIds.filter((x) => x !== id) } }
      };
    });
    toast('Section removed');
    await db.from('sections').delete().eq('id', id);
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
    setTimeout(() => { if (newIds) syncSectionPositions(newIds).catch(() => {}); }, 0);
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
    }, 0);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setEditingBlockId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
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
          <div className="ws-toolbar-group">
            <UndoRedoBtns />
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </header>

      <main className={'ws-agenda style-' + sectionStyle} onDragOver={(e) => { if (blockDragRef.current) e.preventDefault(); }}>
        {workshop.sectionIds.map((sid, idx) => {
          const section = data.sections[sid];
          const isCollapsed = !!collapsed[sid];
          const secTotal = section.blockIds.reduce((s, bid) => s + (data.blocks[bid]?.duration || 0), 0);

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
                      const block = data.blocks[bid];
                      const isEditing = editingBlockId === bid && editingMode === 'inline';
                      const isDropTarget = dropOver && dropOver.sectionId === sid && dropOver.beforeBlockId === bid;
                      return (
                        <BlockRow
                          key={bid}
                          block={block}
                          isEditing={isEditing}
                          isDragging={drag?.blockId === bid}
                          isDropTarget={isDropTarget}
                          onOpen={() => setEditingBlockId(bid)}
                          onChange={(patch) => patchBlock(bid, patch)}
                          onClose={() => setEditingBlockId(null)}
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
          onClose={() => setEditingBlockId(null)}
          onDelete={() => deleteBlock(editingBlockId)}
        />
      )}
    </div>
  );
}
