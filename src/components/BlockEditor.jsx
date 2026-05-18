import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import { snap5 } from '../lib/utils.js';

export default function BlockEditor({ block, onChange, onClose, onDelete, mode = 'inline' }) {
  if (!block) return null;

  const [desc, setDesc] = useState(block.description || '');
  const [person, setPerson] = useState(block.person || '');
  const [material, setMaterial] = useState(block.material || '');
  const [durRaw, setDurRaw] = useState(String(block.duration));
  const [durEmpty, setDurEmpty] = useState(false);

  useEffect(() => {
    setDesc(block.description || '');
    setPerson(block.person || '');
    setMaterial(block.material || '');
    setDurRaw(String(block.duration));
    setDurEmpty(false);
  }, [block.id]);

  const update = (patch) => onChange({ ...block, ...patch });

  const body = (
    <div className="be-grid">
      <div className="be-field be-field-duration">
        <label className="field-label">Duration in min</label>
        <div className="be-duration-stepper">
          <button
            className="be-step"
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
            onChange={(e) => {
              const v = e.target.value; setDurRaw(v); setDurEmpty(false);
              if (v !== '') update({ duration: snap5(parseInt(v, 10)) });
            }}
            onBlur={(e) => {
              if (e.target.value === '') { setDurEmpty(true); }
              else {
                const snapped = snap5(parseInt(e.target.value, 10));
                setDurRaw(String(snapped)); setDurEmpty(false); update({ duration: snapped });
              }
            }}
          />
          <button
            className="be-step"
            onClick={() => {
              const next = block.duration + 5;
              setDurRaw(String(next)); setDurEmpty(false); update({ duration: next });
            }}
            aria-label="Increase 5 min"
          >+</button>
        </div>
      </div>

      <div className="be-field be-field-desc">
        <label className="field-label">Description</label>
        <textarea
          className="textarea" value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => onChange({ ...block, description: desc, person, material })}
          placeholder="What's the activity? Instructions for your future self."
        />
      </div>

      <div className="be-field be-field-person">
        <label className="field-label">Person</label>
        <input
          className="input" value={person}
          onChange={(e) => setPerson(e.target.value)}
          onBlur={() => onChange({ ...block, description: desc, person, material })}
          placeholder="Who leads this?"
        />
      </div>

      <div className="be-field be-field-material">
        <label className="field-label">Materials</label>
        <input
          className="input" value={material}
          onChange={(e) => setMaterial(e.target.value)}
          onBlur={() => onChange({ ...block, description: desc, person, material })}
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
    return (
      <>
        <div className="be-panel-scrim" onClick={() => { onChange({ ...block, description: desc, person, material }); onClose(); }} />
        <aside className="be-panel" role="dialog" aria-label="Edit block">
          <div className="be-panel-head">
            <div>
              <div className="eyebrow">Edit block</div>
              <div
                className="be-panel-title ce"
                contentEditable suppressContentEditableWarning
                onBlur={(e) => { const v = e.currentTarget.textContent.trim(); if (v) update({ title: v }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                style={{ outline: 'none', borderRadius: 4, padding: '2px 4px', marginLeft: -4, cursor: 'text' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = ''; }}
                onFocus={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-border)'; }}
                onBlurCapture={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.boxShadow = ''; }}
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
