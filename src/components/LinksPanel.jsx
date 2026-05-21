import { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { getLinks, addLink, updateLinkLabel, deleteLink } from '../lib/db.js';

function extractDomain(raw) {
  try { return new URL(raw).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isValidUrl(raw) {
  try { new URL(raw); return true; } catch { return false; }
}

export default function LinksPanel({ entityType, entityId, onClose }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [urlVal, setUrlVal] = useState('');
  const [labelVal, setLabelVal] = useState('');
  const [urlError, setUrlError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const editRef = useRef(null);

  useEffect(() => {
    getLinks(entityType, entityId)
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const handleUrlChange = (val) => {
    setUrlVal(val);
    setUrlError('');
    const domain = extractDomain(val);
    if (domain && !labelVal) setLabelVal(domain);
  };

  const handleAdd = async () => {
    const trimUrl = urlVal.trim();
    if (!trimUrl || !isValidUrl(trimUrl)) { setUrlError('Please enter a valid URL'); return; }
    const label = labelVal.trim() || extractDomain(trimUrl) || trimUrl;
    const pos = links.length;
    try {
      const link = await addLink(entityType, entityId, label, trimUrl, pos);
      setLinks((l) => [...l, link]);
      setUrlVal(''); setLabelVal(''); setUrlError('');
    } catch { setUrlError('Failed to save link'); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteLink(id);
      setLinks((l) => l.filter((x) => x.id !== id));
    } catch {}
  };

  const startEdit = (link) => { setEditingId(link.id); setEditLabel(link.label); };

  const commitEdit = async (id) => {
    const trimmed = editLabel.trim();
    if (trimmed) {
      try {
        await updateLinkLabel(id, trimmed);
        setLinks((l) => l.map((x) => x.id === id ? { ...x, label: trimmed } : x));
      } catch {}
    }
    setEditingId(null);
  };

  return (
    <>
      <div className="lp-scrim" onClick={onClose} />
      <aside className="lp-panel">
        <div className="lp-head">
          <div className="lp-title">Related Links</div>
          <button className="btn btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="lp-body">
          {loading ? (
            <div className="lp-empty">Loading…</div>
          ) : links.length === 0 ? (
            <div className="lp-empty">No links yet. Add your first link below.</div>
          ) : (
            <ul className="lp-list">
              {links.map((link) => (
                <li key={link.id} className="lp-item">
                  {editingId === link.id ? (
                    <input
                      ref={editRef}
                      className="lp-edit-input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={() => commitEdit(link.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(link.id); } if (e.key === 'Escape') setEditingId(null); }}
                    />
                  ) : (
                    <span className="lp-label" onClick={() => startEdit(link)} title="Click to edit label">
                      {link.label}
                    </span>
                  )}
                  <div className="lp-item-actions">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="lp-open" title="Open link">
                      <Icon name="external-link" size={13} />
                    </a>
                    <button className="btn btn-icon lp-del" onClick={() => handleDelete(link.id)} title="Delete link">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lp-form">
          <div className="sp-section-label">Add link</div>
          <div className="lp-form-row">
            <input
              className="input lp-url-input"
              value={urlVal}
              placeholder="Paste a URL"
              onChange={(e) => handleUrlChange(e.target.value)}
              onPaste={(e) => { const v = e.clipboardData.getData('text'); setTimeout(() => handleUrlChange(v), 0); }}
              onBlur={() => { if (urlVal) handleUrlChange(urlVal); }}
            />
            <button className="btn btn-accent lp-add-btn" onClick={handleAdd} disabled={!urlVal.trim()}>Add</button>
          </div>
          {urlError && <div className="lp-error">{urlError}</div>}
        </div>
      </aside>
    </>
  );
}
