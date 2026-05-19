import { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import BlockEditor from './BlockEditor.jsx';
import { snap5, initials } from '../lib/utils.js';

export default function BlockRow({
  block, isEditing, isDragging, isDropTarget, activeEditor,
  onOpen, onChange, onClose, onDelete,
  onDragStart, onDragEnd, onDragOver, onDrop,
  startTime,
}) {
  const [durOpen, setDurOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!durOpen) return;
    const onDoc = (e) => { if (popoverRef.current && !popoverRef.current.contains(e.target)) setDurOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setDurOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [durOpen]);

  const adjust = (delta) => {
    const next = Math.max(5, (block.duration || 5) + delta);
    onChange({ duration: next });
  };

  return (
    <div
      className={
        'blk' +
        (isEditing ? ' is-editing' : '') +
        (isDragging ? ' is-dragging' : '') +
        (isDropTarget ? ' is-drop-target' : '')
      }
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className="blk-activity-strip"
        style={{ opacity: activeEditor ? 1 : 0, background: activeEditor?.color || 'transparent' }}
      />
      <div className="blk-row" onClick={() => { if (!isEditing && !durOpen) onOpen(); }}>
        <div
          className="blk-grip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
            onDragStart && onDragStart(e);
          }}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
        >
          <Icon name="grip" size={14} />
        </div>

        <div className="blk-main">
          <div className="blk-title-head">
            <div
              className={'blk-duration mono' + (durOpen ? ' is-open' : '')}
              onClick={(e) => { e.stopPropagation(); setDurOpen(o => !o); }}
              title="Click to adjust"
            >
              {block.duration}<span className="blk-duration-unit">m</span>
              {startTime && <div className="blk-start-time">{startTime}</div>}
              {durOpen && (
                <div className="blk-dur-pop" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
                  <button className="blk-dur-step" onClick={() => adjust(-5)}>−</button>
                  <input
                    type="number" min="5" step="5" className="blk-dur-input mono"
                    value={block.duration}
                    onChange={(e) => { const v = parseInt(e.target.value || '5', 10); onChange({ duration: Math.max(5, v) }); }}
                    onBlur={(e) => { const v = parseInt(e.target.value || '5', 10); onChange({ duration: snap5(v) }); }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  <span className="blk-dur-pop-unit mono">min</span>
                  <button className="blk-dur-step" onClick={() => adjust(5)}>+</button>
                </div>
              )}
            </div>
            <div className="blk-content-col">
              <div className="blk-title-row">
                <div className="blk-title">{block.title || 'Untitled block'}</div>
                {block.person && (
                  <span className="blk-owner">
                    <Icon name="user" size={11} /> {block.person}
                  </span>
                )}
                {activeEditor && (
                  <div
                    className="blk-editor-avatar"
                    style={{ background: activeEditor.color }}
                    title={activeEditor.full_name || 'Someone'}
                  >
                    {initials(activeEditor.full_name)}
                  </div>
                )}
              </div>
              {block.description && <div className="blk-desc">{block.description}</div>}
              {block.material && <div className="blk-material"><Icon name="copy" size={11} /> {block.material}</div>}
            </div>
          </div>
        </div>

        <div className="blk-actions">
          <button
            className="btn btn-icon blk-delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete block"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {isEditing && (
        <BlockEditor mode="inline" block={block} onChange={onChange} onClose={onClose} onDelete={onDelete} />
      )}
    </div>
  );
}
