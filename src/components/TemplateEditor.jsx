import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import Icon from './Icon.jsx';
import BlockRow from './BlockRow.jsx';
import BlockEditor from './BlockEditor.jsx';
import { WorkshopRealtimeContext } from '../contexts/WorkshopRealtimeContext.jsx';
import { updateTemplate } from '../lib/db.js';
import { snap5, fmtDuration } from '../lib/utils.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function contentToState(content) {
  const sectionIds = [];
  const sections = {};
  const blocks = {};
  (content?.sections || []).forEach((sec) => {
    const sid = crypto.randomUUID();
    sectionIds.push(sid);
    const blockIds = [];
    (sec.blocks || []).forEach((b) => {
      const bid = crypto.randomUUID();
      blockIds.push(bid);
      blocks[bid] = {
        id: bid, sectionId: sid,
        title:       b.title       || 'New block',
        description: b.description || '',
        material:    b.material    || '',
        duration:    b.duration    || 15,
      };
    });
    sections[sid] = { id: sid, title: sec.title || 'Section', blockIds };
  });
  return { sectionIds, sections, blocks };
}

function stateToContent(state) {
  return {
    sections: state.sectionIds.map((sid, si) => {
      const sec = state.sections[sid];
      return {
        title: sec.title,
        position: si,
        blocks: sec.blockIds.map((bid, bi) => {
          const b = state.blocks[bid];
          return {
            position: bi,
            duration:    b.duration,
            title:       b.title,
            description: b.description || '',
            material:    b.material    || '',
          };
        }),
      };
    }),
  };
}

function ContentEditable({ value, onChange, className, placeholder }) {
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
      data-placeholder={placeholder}
      onBlur={(e) => {
        const v = e.currentTarget.textContent.trim();
        if (v !== lastValRef.current) { lastValRef.current = v; onChange(v); }
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TemplateEditor({ template, onBack, toast, tweaks, projects = [], userId, onUseTemplate }) {
  const [state,  setState]  = useState(() => contentToState(template.content));
  const [name,   setName]   = useState(template.name || '');
  const [desc,   setDesc]   = useState(template.description || '');

  const [editingBlockId, setEditingBlockId] = useState(null);
  const [collapsed,      setCollapsed]      = useState({});
  const [showUseModal,   setShowUseModal]   = useState(false);

  // Local undo/redo (independent of global HistoryContext)
  const undoStack  = useRef([]);
  const redoStack  = useRef([]);
  const [, tick]   = useState(0);
  const bump       = () => tick((t) => t + 1);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // Drag state
  const [drag,      setDrag]      = useState(null);
  const blockDragRef = useRef(null);
  const [dropOver,  setDropOver]  = useState(null);
  const [secDrag,   setSecDrag]   = useState(null);
  const [secDropAt, setSecDropAt] = useState(null);

  // Refs for latest name/desc so saveTimer closure gets fresh values
  const nameRef = useRef(name);
  const descRef = useRef(desc);

  // ── Debounced save ─────────────────────────────────────────────────────────
  const saveTimer = useRef(null);

  const scheduleSave = useCallback((nextState, nextName, nextDesc) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await updateTemplate(template.id, {
          name: nextName,
          description: nextDesc,
          content: stateToContent(nextState),
        });
        toast('Saved');
      } catch {
        toast('Save failed');
      }
    }, 600);
  }, [template.id, toast]);

  // ── Core mutate helper ─────────────────────────────────────────────────────
  const mutate = useCallback((updater) => {
    undoStack.current.push(JSON.parse(JSON.stringify(state)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    const next = updater(state);
    setState(next);
    bump();
    scheduleSave(next, nameRef.current, descRef.current);
  }, [state, scheduleSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current.pop();
    redoStack.current.push(JSON.parse(JSON.stringify(state)));
    setState(prev); bump();
    scheduleSave(prev, nameRef.current, descRef.current);
  }, [state, scheduleSave]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRedo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop();
    undoStack.current.push(JSON.parse(JSON.stringify(state)));
    setState(next); bump();
    scheduleSave(next, nameRef.current, descRef.current);
  }, [state, scheduleSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts (local, not global)
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); handleRedo(); }
      else if (e.key === 'Escape') setEditingBlockId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  // ── Block mutations ────────────────────────────────────────────────────────
  const patchBlock = (id, patch) => {
    mutate((s) => ({ ...s, blocks: { ...s.blocks, [id]: { ...s.blocks[id], ...patch } } }));
  };

  const deleteBlock = (id) => {
    mutate((s) => {
      const newBlocks = { ...s.blocks }; delete newBlocks[id];
      const newSections = { ...s.sections };
      Object.keys(newSections).forEach((sid) => {
        if (newSections[sid].blockIds.includes(id))
          newSections[sid] = { ...newSections[sid], blockIds: newSections[sid].blockIds.filter((x) => x !== id) };
      });
      return { ...s, blocks: newBlocks, sections: newSections };
    });
    setEditingBlockId(null);
    toast('Block deleted');
  };

  const addBlock = (sectionId) => {
    const id = crypto.randomUUID();
    const block = { id, sectionId, duration: 15, title: 'New block', description: '', person: '', material: '' };
    mutate((s) => ({
      ...s,
      blocks:   { ...s.blocks,   [id]: block },
      sections: { ...s.sections, [sectionId]: { ...s.sections[sectionId], blockIds: [...s.sections[sectionId].blockIds, id] } },
    }));
    setEditingBlockId(id);
  };

  const addSection = (insertAtIndex = null) => {
    const id  = crypto.randomUUID();
    const sec = { id, title: 'New section', blockIds: [] };
    mutate((s) => {
      const newIds = [...s.sectionIds];
      if (insertAtIndex == null || insertAtIndex >= newIds.length) newIds.push(id);
      else newIds.splice(insertAtIndex, 0, id);
      return { ...s, sections: { ...s.sections, [id]: sec }, sectionIds: newIds };
    });
  };

  const renameSection = (id, title) => {
    mutate((s) => ({ ...s, sections: { ...s.sections, [id]: { ...s.sections[id], title } } }));
  };

  const deleteSection = (id) => {
    mutate((s) => {
      const sec = s.sections[id];
      const newBlocks   = { ...s.blocks };   sec.blockIds.forEach((bid) => delete newBlocks[bid]);
      const newSections = { ...s.sections }; delete newSections[id];
      return { ...s, blocks: newBlocks, sections: newSections, sectionIds: s.sectionIds.filter((x) => x !== id) };
    });
    toast('Section removed');
  };

  const moveSection = (sectionId, insertAt) => {
    mutate((s) => {
      const newIds = s.sectionIds.filter((x) => x !== sectionId);
      const adjusted = insertAt > s.sectionIds.indexOf(sectionId) ? insertAt - 1 : insertAt;
      newIds.splice(Math.max(0, Math.min(newIds.length, adjusted)), 0, sectionId);
      return { ...s, sectionIds: newIds };
    });
  };

  const findBlockSection = (s, blockId) => {
    for (const sid of Object.keys(s.sections)) {
      if (s.sections[sid].blockIds.includes(blockId)) return sid;
    }
    return null;
  };

  const moveBlock = (blockId, toSectionId, beforeBlockId) => {
    mutate((s) => {
      const fromSid = findBlockSection(s, blockId);
      if (!fromSid) return s;
      const sections = { ...s.sections };
      sections[fromSid] = { ...sections[fromSid], blockIds: sections[fromSid].blockIds.filter((x) => x !== blockId) };
      const toIds = (fromSid === toSectionId ? sections[fromSid].blockIds : sections[toSectionId].blockIds).slice();
      const idx = beforeBlockId == null ? toIds.length : toIds.indexOf(beforeBlockId);
      toIds.splice(idx === -1 ? toIds.length : idx, 0, blockId);
      sections[toSectionId] = { ...sections[toSectionId], blockIds: toIds };
      return { ...s, sections };
    });
  };

  // ── Name / description inline edit ────────────────────────────────────────
  const renameName = (v) => {
    const val = v || 'Untitled template';
    setName(val); nameRef.current = val;
    scheduleSave(state, val, descRef.current);
  };

  const renameDesc = (v) => {
    setDesc(v); descRef.current = v;
    scheduleSave(state, nameRef.current, v);
  };

  const editingBlock = editingBlockId ? state.blocks[editingBlockId] : null;
  const editingMode  = tweaks?.editor || 'panel';
  const sectionStyle = tweaks?.sectionStyle || 'cards';

  // Stub realtime context (no collaboration for templates)
  const noopCtx = {
    presence: [], locks: {}, blockEditors: {},
    trackField: () => {}, untrackField: () => {}, trackActiveBlock: () => {},
    userId: '',
  };

  return (
    <WorkshopRealtimeContext.Provider value={noopCtx}>
      <div className="ws-page">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="ws-header">
          <div className="ws-header-inner">
            <div className="ws-header-meta">
              <div className="eyebrow eyebrow-row">
                <a onClick={onBack}>Templates</a>
              </div>
              <ContentEditable className="ws-title" value={name} onChange={renameName} placeholder="Untitled template" />
              <ContentEditable
                className="te-desc"
                value={desc}
                onChange={renameDesc}
                placeholder="Add a description"
              />
            </div>
            <div className="te-header-right">
              <div className="ws-header-total">
                <div className="eyebrow">Total session</div>
                <div className="ws-total-num serif">
                  {fmtDuration(Object.values(state.blocks).reduce((sum, b) => sum + (b.duration || 0), 0))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => setShowUseModal(true)}>
                Use this template
              </button>
            </div>
          </div>
        </header>

        {/* ── Agenda ──────────────────────────────────────────────────────── */}
        <main className={'ws-agenda style-' + sectionStyle} onDragOver={(e) => { if (blockDragRef.current) e.preventDefault(); }}>
          {state.sectionIds.map((sid, idx) => {
            const section    = state.sections[sid];
            if (!section) return null;
            const isCollapsed = !!collapsed[sid];
            const secTotal   = section.blockIds.reduce((s, bid) => s + (state.blocks[bid]?.duration || 0), 0);

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
                        const block        = state.blocks[bid];
                        if (!block) return null;
                        const isEditing    = editingBlockId === bid && editingMode === 'inline';
                        const isDropTarget = dropOver && dropOver.sectionId === sid && dropOver.beforeBlockId === bid;
                        return (
                          <BlockRow
                            key={bid}
                            block={block}
                            isEditing={isEditing}
                            isDragging={drag?.blockId === bid}
                            isDropTarget={isDropTarget}
                            activeEditor={null}
                            onOpen={() => setEditingBlockId(bid)}
                            onChange={(patch) => patchBlock(bid, patch)}
                            onClose={() => setEditingBlockId(null)}
                            onDelete={() => deleteBlock(bid)}
                            startTime={null}
                            onDragStart={() => { const d = { blockId: bid, fromSection: sid }; blockDragRef.current = d; setDrag(d); }}
                            onDragEnd={() => { blockDragRef.current = null; setDrag(null); setDropOver(null); }}
                            onDragOver={(e) => {
                              if (!blockDragRef.current) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              const rect = e.currentTarget.getBoundingClientRect();
                              const before = (e.clientY - rect.top) < rect.height / 2;
                              const blockIds = state.sections[sid].blockIds;
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

                {secDrag && idx === state.sectionIds.length - 1 && (
                  <div
                    className={'sec-drop-bar' + (secDropAt === state.sectionIds.length ? ' is-active' : '')}
                    onDragOver={(e) => { e.preventDefault(); setSecDropAt(state.sectionIds.length); }}
                    onDrop={(e) => { e.preventDefault(); moveSection(secDrag, state.sectionIds.length); setSecDrag(null); setSecDropAt(null); }}
                  />
                )}
              </Fragment>
            );
          })}

          <button className="ws-add-section" onClick={() => addSection()}>
            <Icon name="plus" size={16} /><span>Add a section</span>
          </button>
        </main>

        {/* ── Block editor panel ──────────────────────────────────────────── */}
        {editingBlock && editingMode === 'panel' && (
          <BlockEditor
            mode="panel"
            block={editingBlock}
            onChange={(b) => patchBlock(editingBlockId, b)}
            onClose={() => setEditingBlockId(null)}
            onDelete={() => deleteBlock(editingBlockId)}
          />
        )}

        {/* ── Floating undo/redo (local stacks, no save-as-template) ─────── */}
        <div className="float-ur-panel">
          <button className="float-ur-btn" onClick={handleUndo} disabled={!canUndo} aria-label="Undo">
            <Icon name="undo" size={16} />
            <span className="float-ur-tip">Undo</span>
          </button>
          <button className="float-ur-btn" onClick={handleRedo} disabled={!canRedo} aria-label="Redo">
            <Icon name="redo" size={16} />
            <span className="float-ur-tip">Redo</span>
          </button>
        </div>

      {/* ── Use template modal ──────────────────────────────────────────── */}
      {showUseModal && (
        <div className="confirm-overlay" onClick={() => setShowUseModal(false)}>
          <div className="ut-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ut-modal-head">
              <div className="ut-modal-title">Create workshop from template</div>
              <p className="ut-modal-sub">Select a project to add the new workshop to</p>
              <button className="btn btn-icon ut-modal-close" onClick={() => setShowUseModal(false)} aria-label="Close">
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="ut-modal-body">
              {projects.length === 0 ? (
                <p className="ut-modal-empty">
                  You have no projects yet.{' '}
                  <a onClick={() => { setShowUseModal(false); onBack(); }} style={{ cursor: 'pointer', color: 'var(--accent)' }}>
                    Create a project first.
                  </a>
                </p>
              ) : (() => {
                const own    = projects.filter((p) => p.userId === userId);
                const shared = projects.filter((p) => p.userId !== userId);
                const Row = ({ p }) => (
                  <button key={p.id} className="ut-modal-row" onClick={() => { setShowUseModal(false); onUseTemplate(template, p.id); }}>
                    <div className="ut-modal-row-name">{p.name}</div>
                    <div className="ut-modal-row-count">{p.workshopIds.length} {p.workshopIds.length === 1 ? 'workshop' : 'workshops'}</div>
                  </button>
                );
                return (
                  <>
                    {own.map((p) => <Row key={p.id} p={p} />)}
                    {shared.length > 0 && (
                      <>
                        <div className="ut-modal-group-label">Shared with me</div>
                        {shared.map((p) => <Row key={p.id} p={p} />)}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      </div>
    </WorkshopRealtimeContext.Provider>
  );
}
