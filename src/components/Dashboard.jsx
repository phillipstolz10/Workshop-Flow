import Icon from './Icon.jsx';

export default function Dashboard({ data, userId, onOpenProject, onNewProject, onDeleteProject }) {
  const projects = data.projects;
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
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span className="dash-row-arrow"><Icon name="arrow-right" size={16} /></span>
            </div>
            {p.userId === userId && (
              <button
                className="btn btn-icon dash-row-delete"
                onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                title="Delete project"
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ))}
        <button className="dash-row-new" onClick={onNewProject}>
          <div className="dash-row-main">
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={14} /> Start a new project
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
