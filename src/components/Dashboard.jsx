import { useState } from 'react';
import Icon from './Icon.jsx';

export default function Dashboard({ data, userId, onOpenProject, onNewProject, onDeleteProject, templates, onDeleteTemplate, onOpenTemplate }) {
  const projects = data.projects;
  const [pendingDelete, setPendingDelete] = useState(null); // project object
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Workspace</div>
          <h1 className="page-title">Your Projects</h1>
        </div>
        <button className="btn btn-accent" onClick={onNewProject}>
          <Icon name="plus" size={14} /> New project
        </button>
      </div>

      <div className="dash-list">
        {projects.map((p) => (
          <div key={p.id} className={'dash-row' + (p.userId === userId ? ' dash-row-deletable' : '')} onClick={() => onOpenProject(p.id)}>
            <div className="dash-row-main">
              <div className="dash-row-title">
                {p.name}
                {p.userId !== userId && (
                  <span className="dash-shared-badge">Shared</span>
                )}
              </div>
              <div className="dash-row-desc">{p.description}</div>
            </div>
            <div className="dash-row-end">
              <span className="dash-row-arrow"><Icon name="arrow-right" size={16} /></span>
              {p.userId === userId && (
                <button
                  className="btn btn-icon dash-row-delete"
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                  title="Delete project"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="page-head" style={{ marginTop: 48, marginBottom: 0 }}>
        <div>
          <h2 className="dash-section-heading">Your Templates</h2>
        </div>
      </div>
      {templates && templates.length > 0 ? (
        <div className="dash-list" style={{ marginTop: 16 }}>
          {templates.map((t) => (
            <div key={t.id} className="dash-row dash-row-deletable" onClick={() => onOpenTemplate(t.id)} style={{ cursor: 'pointer' }}>
              <div className="dash-row-main">
                <div className="dash-row-title">{t.name}</div>
                {t.description && <div className="dash-row-desc">{t.description}</div>}
              </div>
              <div className="dash-row-end">
                <span className="dash-row-arrow"><Icon name="arrow-right" size={16} /></span>
                <button
                  className="btn btn-icon dash-row-delete"
                  onClick={(e) => { e.stopPropagation(); setPendingDeleteTemplate(t); }}
                  title="Delete template"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-empty-desc">Save any workshop as a template to reuse it in future sessions.</p>
      )}

      {pendingDeleteTemplate && (
        <div className="confirm-overlay" onClick={() => setPendingDeleteTemplate(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">Delete template?</div>
            <p className="confirm-body">
              Delete "{pendingDeleteTemplate.name}"? This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setPendingDeleteTemplate(null)}>Cancel</button>
              <button
                className="btn confirm-delete-btn"
                onClick={() => { onDeleteTemplate(pendingDeleteTemplate.id); setPendingDeleteTemplate(null); }}
              >
                <Icon name="trash" size={14} /> Delete template
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="confirm-overlay" onClick={() => setPendingDelete(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">Delete "{pendingDelete.name}"?</div>
            <p className="confirm-body">
              This will permanently delete the project and all its workshops, sections, and blocks. This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="btn confirm-delete-btn"
                onClick={() => { onDeleteProject(pendingDelete.id); setPendingDelete(null); }}
              >
                <Icon name="trash" size={14} /> Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
