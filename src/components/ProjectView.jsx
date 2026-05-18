import Icon from './Icon.jsx';
import { fmtDate, workshopTotal, fmtDuration } from '../lib/utils.js';

export default function ProjectView({ data, projectId, onOpenWorkshop, onNewWorkshop, onBack, onDeleteWorkshop, onUpdateProject }) {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const workshops = project.workshopIds.map((wid) => data.workshops[wid]);

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <a onClick={onBack} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Projects</a>
            <span style={{ color: 'var(--text-subtle)' }}>/</span>
            <span style={{ color: 'var(--text)' }}>This project</span>
          </div>
          <h1
            className="page-title ce"
            contentEditable suppressContentEditableWarning
            onBlur={(e) => { const v = e.currentTarget.textContent.trim(); if (v) onUpdateProject(projectId, { name: v }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            style={{ outline: 'none', borderRadius: 6, padding: '2px 6px', marginLeft: -6, cursor: 'text' }}
            onFocus={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
            onBlurCapture={(e) => { e.currentTarget.style.background = ''; }}
          >{project.name}</h1>
          <p
            className="page-sub ce"
            contentEditable suppressContentEditableWarning
            onBlur={(e) => { const v = e.currentTarget.textContent.trim(); if (v) onUpdateProject(projectId, { description: v }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            style={{ outline: 'none', borderRadius: 6, padding: '2px 6px', marginLeft: -6, cursor: 'text' }}
            onFocus={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
            onBlurCapture={(e) => { e.currentTarget.style.background = ''; }}
          >{project.description}</p>
        </div>
        <button className="btn btn-accent" onClick={onNewWorkshop}>
          <Icon name="plus" size={14} /> New workshop
        </button>
      </div>

      <div className="eyebrow" style={{ marginBottom: 16 }}>Workshops</div>

      <div className="ws-grid">
        {workshops.map((w, i) => {
          const total = workshopTotal(data, w.id);
          return (
            <div key={w.id} className="ws-card hoverable card ws-card-deletable" onClick={() => onOpenWorkshop(w.id)}>
              <div className="ws-card-num serif">{String(i + 1).padStart(2, '0')}</div>
              <div className="ws-card-body">
                <div className="ws-card-date mono">{fmtDate(w.date)}</div>
                <div className="ws-card-title">{w.title}</div>
                <div className="ws-card-meta">
                  <span className="pill"><Icon name="clock" size={11} />{fmtDuration(total)}</span>
                </div>
              </div>
              <div className="ws-card-arrow"><Icon name="arrow-right" size={16} /></div>
              <button
                className="ws-card-delete btn btn-icon"
                onClick={(e) => { e.stopPropagation(); onDeleteWorkshop(w.id); }}
                title="Delete workshop"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
        <button className="ws-card ws-card-new" onClick={onNewWorkshop}>
          <Icon name="plus" size={18} />
          <span>Add a workshop</span>
        </button>
      </div>
    </div>
  );
}
