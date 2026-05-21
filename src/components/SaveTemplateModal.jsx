import { useState } from 'react';
import Icon from './Icon.jsx';
import { saveTemplate } from '../lib/db.js';

export default function SaveTemplateModal({ workshopTitle, content, onClose, onSaved }) {
  const [name, setName] = useState(workshopTitle || '');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Please enter a template name'); return; }
    setSaving(true);
    try {
      const tmpl = await saveTemplate(name.trim(), desc.trim(), content);
      onSaved(tmpl);
      onClose();
    } catch {
      setError('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()}>
        <div className="st-title">Save as Template</div>
        <div className="st-field">
          <label className="field-label">Template name</label>
          <input
            className={'input' + (error && !name.trim() ? ' is-warn' : '')}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Template name"
            autoFocus
          />
        </div>
        <div className="st-field">
          <label className="field-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            className="textarea"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this template used for?"
            rows={3}
          />
        </div>
        {error && <div className="st-error">{error}</div>}
        <div className="st-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : <><Icon name="bookmark" size={14} /> Save template</>}
          </button>
        </div>
      </div>
    </div>
  );
}
