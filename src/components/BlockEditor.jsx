import { useState, useEffect, useRef, useContext } from 'react';
import Icon from './Icon.jsx';
import { snap5, initials, firstName } from '../lib/utils.js';
import { WorkshopRealtimeContext } from '../contexts/WorkshopRealtimeContext.jsx';

function LockChip({ lock }) {
  if (!lock) return null;
  return (
    <span className="lock-chip">
      <span className="lock-chip-avatar" style={{ background: lock.color }}>
        {initials(lock.full_name)}
      </span>
      <span className="lock-chip-name" style={{ color: lock.color }}>
        {firstName(lock.full_name)}
      </span>
    </span>
  );
}

export default function BlockEditor({ block, onChange, onClose, onDelete, mode = 'inline' }) {
  if (!block) return null;

  const { locks, trackField, untrackField, userId } = useContext(WorkshopRealtimeContext);

  const [desc,     setDesc]     = useState(block.description || '');
  const [person,   setPerson]   = useState(block.person      || '');
  const [material, setMaterial] = useState(block.material    || '');
  const [durRaw,   setDurRaw]   = useState(String(block.duration));
  const [durEmpty, setDurEmpty] = useState(false);

  // Track which fields the local user is currently typing in so we don't
  // clobber their in-progress input with remote updates.
  const focusedFields = useRef(new Set());

  // Full reset when switching to a different block.
  useEffect(() => {
    focusedFields.current.clear();
    setDesc(block.description || '');
    setPerson(block.person     || '');
    setMaterial(block.material || '');
    setDurRaw(String(block.duration));
    setDurEmpty(false);
  }, [block.id]);

  // Sync each field from remote patches — but only when the local user
  // isn't actively editing that field, so we don't jump their cursor.
  useEffect(() => {
    if (!focusedFields.current.has('description')) setDesc(block.description || '');
  }, [block.description]);                                          // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusedFields.current.has('person')) setPerson(block.person || '');
  }, [block.person]);                                               // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusedFields.current.has('material')) setMaterial(block.material || '');
  }, [block.material]);                                             // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusedFields.current.has('duration')) { setDurRaw(String(block.duration)); setDurEmpty(false); }
  }, [block.duration]);                                             // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => onChange({ ...block, ...patch });

  // ── Lock helpers ──────────────────────────────────────────────────────────
  // locks = { 'blockId:fieldName': { user_id, full_name, color } }
  // We only show a lock when it belongs to a *different* user.
  const getLock = (fieldName) => {
    const lock = locks[`${block.id}:${fieldName}`];
    return lock && lock.user_id !== userId ? lock : null;
  };
  const lockTitle = (fieldName) => {
    const l = getLock(fieldName);
    return l ? `Locked — ${l.full_name || 'Someone'} is editing` : undefined;
  };

  const body = (
    <div className="be-grid">
      <div className="be-field be-field-duration">
        <label className="field-label">Duration in min<LockChip lock={getLock('duration')} /></label>
        <div className="be-duration-stepper">
          <button
            className="be-step"
            disabled={!!getLock('duration')}
            title={lockTitle('duration')}
            onClick={() => {
              const next = Math.max(5, block.duration - 5);
              setDurRaw(String(next)); setDurEmpty(false); update({ duration: next });
            }}
            aria-label="Decrease 5 min"
          >−</button>
          <input
            type="number" min="5" step="5"
            className={'input mono be-duration-input' + (durEmpty ? ' is-warn' : '')}
            value={durRaw}
            disabled={!!getLock('duration')}
            title={lockTitle('duration')}
            onFocus={() => { focusedFields.current.add('duration'); trackField(block.id, 'duration'); }}
            onBlur={(e) => {
              focusedFields.current.delete('duration'); untrackField(block.id, 'duration');
              if (e.target.value === '') { setDurEmpty(true); }
              else {
                const snapped = snap5(parseInt(e.target.value, 10));
                setDurRaw(String(snapped)); setDurEmpty(false); update({ duration: snapped });
              }
            }}
            onChange={(e) => {
              const v = e.target.value; setDurRaw(v); setDurEmpty(false);
              if (v !== '') update({ duration: snap5(parseInt(v, 10)) });
            }}
          />
          <button
            className="be-step"
            disabled={!!getLock('duration')}
            title={lockTitle('duration')}
            onClick={() => {
              const next = block.duration + 5;
              setDurRaw(String(next)); setDurEmpty(false); update({ duration: next });
            }}
            aria-label="Increase 5 min"
          >+</button>
        </div>
      </div>

      <div className="be-field be-field-desc">
        <label className="field-label">Description<LockChip lock={getLock('description')} /></label>
        <textarea
          className="textarea"
          value={desc}
          disabled={!!getLock('description')}
          title={lockTitle('description')}
          onFocus={() => { focusedFields.current.add('description'); trackField(block.id, 'description'); }}
          onBlur={() => { focusedFields.current.delete('description'); untrackField(block.id, 'description'); onChange({ ...block, description: desc, person, material }); }}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What's the activity? Instructions for your future self."
        />
      </div>

      <div className="be-field be-field-person">
        <label className="field-label">Person<LockChip lock={getLock('person')} /></label>
        <input
          className="input"
          value={person}
          disabled={!!getLock('person')}
          title={lockTitle('person')}
          onFocus={() => { focusedFields.current.add('person'); trackField(block.id, 'person'); }}
          onBlur={() => { focusedFields.current.delete('person'); untrackField(block.id, 'person'); onChange({ ...block, description: desc, person, material }); }}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="Who leads this?"
        />
      </div>

      <div className="be-field be-field-material">
        <label className="field-label">Materials<LockChip lock={getLock('material')} /></label>
        <input
          className="input"
          value={material}
          disabled={!!getLock('material')}
          title={lockTitle('material')}
          onFocus={() => { focusedFields.current.add('material'); trackField(block.id, 'material'); }}
          onBlur={() => { focusedFields.current.delete('material'); untrackField(block.id, 'material'); onChange({ ...block, description: desc, person, material }); }}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Post-its, projector, etc."
        />
      </div>

      <div className="be-actions">
        <button className="btn btn-ghost" onClick={onDelete} style={{ color: 'var(--danger)' }}>
          <Icon name="trash" size={14} /> Delete block
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary"
          onClick={() => { onChange({ ...block, description: desc, person, material }); onClose(); }}
        >
          <Icon name="check" size={14} /> Done
        </button>
      </div>
    </div>
  );

  if (mode === 'panel') {
    const titleLock = getLock('title');
    return (
      <>
        <div className="be-panel-scrim" onClick={() => { onChange({ ...block, description: desc, person, material }); onClose(); }} />
        <aside className="be-panel" role="dialog" aria-label="Edit block">
          <div className="be-panel-head">
            <div>
              <div className="eyebrow">Edit block</div>
              <div
                className="be-panel-title ce"
                contentEditable={!titleLock}
                suppressContentEditableWarning
                title={titleLock ? `Locked — ${titleLock.full_name || 'Someone'} is editing` : undefined}
                style={{
                  outline: 'none', borderRadius: 4, padding: '2px 4px', marginLeft: -4,
                  cursor: titleLock ? 'default' : 'text',
                  opacity: titleLock ? 0.5 : undefined,
                  pointerEvents: titleLock ? 'none' : undefined,
                }}
                onFocus={(e) => {
                  trackField(block.id, 'title');
                  e.currentTarget.style.background = 'var(--surface-2)';
                  e.currentTarget.style.boxShadow  = '0 0 0 2px var(--accent-border)';
                }}
                onBlur={(e) => {
                  untrackField(block.id, 'title');
                  e.currentTarget.style.background = '';
                  e.currentTarget.style.boxShadow  = '';
                  const v = e.currentTarget.textContent.trim();
                  if (v) update({ title: v });
                }}
                onMouseEnter={(e) => { if (!titleLock) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = ''; }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
              >{block.title || 'Untitled block'}</div>
            </div>
            <button className="btn btn-icon" onClick={() => { onChange({ ...block, description: desc, person, material }); onClose(); }}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="be-panel-body">{body}</div>
        </aside>
      </>
    );
  }

  return <div className="be-inline">{body}</div>;
}
