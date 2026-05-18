import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon.jsx';
import Dashboard from './Dashboard.jsx';
import ProjectView from './ProjectView.jsx';
import Workshop from './Workshop.jsx';
import AuthScreen from './AuthScreen.jsx';
import ProfileView from './ProfileView.jsx';
import { HistoryContext } from '../contexts/HistoryContext.jsx';
import { useTweaks } from '../hooks/useTweaks.js';
import { db } from '../lib/supabase.js';
import { loadAllData, applyStateDiff, seedSampleProject } from '../lib/db.js';

const TWEAK_DEFAULTS = { density: 'comfortable', sectionStyle: 'cards', editor: 'panel' };

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: 'var(--text-muted)' }}>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  </div>
);

export default function App() {
  const [session,     setSession]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [view,    setView]    = useState({ name: 'dashboard' });
  const [toastMsg, setToastMsg] = useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [, forceTick] = useState(0);
  const bump = () => forceTick((t) => t + 1);

  const loadStartedRef = useRef(false);

  const doLoadData = async (user = null) => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setLoading(true); setDbError(null);
    try {
      let d = await loadAllData();
      if (user && d.projects.length === 0) {
        const flag = `wf_seeded_${user.id}`;
        if (!localStorage.getItem(flag)) {
          await seedSampleProject().catch(() => {});
          localStorage.setItem(flag, '1');
          d = await loadAllData();
        }
      }
      setData(d); setLoading(false);
    } catch (e) {
      loadStartedRef.current = false;
      setDbError(e.message || 'Could not connect to database.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthChecked(true);
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && s) {
        doLoadData(s.user);
      }
      if (event === 'SIGNED_OUT') {
        loadStartedRef.current = false;
        setData(null);
        setView({ name: 'dashboard' });
        undoStack.current = [];
        redoStack.current = [];
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToastMsg(null), 1800);
  };

  const pushHistory = useCallback(() => {
    undoStack.current.push(JSON.parse(JSON.stringify(data)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    bump();
  }, [data]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current.pop();
    const curr = JSON.parse(JSON.stringify(data));
    redoStack.current.push(curr);
    setData(prev); bump(); showToast('Undone');
    applyStateDiff(curr, prev).catch(() => showToast('Sync error after undo'));
  }, [data]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop();
    const curr = JSON.parse(JSON.stringify(data));
    undoStack.current.push(curr);
    setData(next); bump(); showToast('Redone');
    applyStateDiff(curr, next).catch(() => showToast('Sync error after redo'));
  }, [data]);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    window.history.replaceState({ name: 'dashboard' }, '');
    const onPop = (e) => setView(e.state || { name: 'dashboard' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => { document.body.setAttribute('data-density', tweaks.density); }, [tweaks.density]);

  const updateData = (mut) => setData((d) => typeof mut === 'function' ? mut(d) : mut);

  const navigateTo = (newView) => { setView(newView); window.history.pushState(newView, ''); };
  const goDashboard = () => navigateTo({ name: 'dashboard' });
  const goProject   = (projectId) => navigateTo({ name: 'project', projectId });
  const goWorkshop  = (workshopId) => {
    const w = data.workshops[workshopId];
    navigateTo({ name: 'workshop', projectId: w.projectId, workshopId });
  };

  const newProject = async () => {
    const id = crypto.randomUUID();
    const p  = { id, name: 'Untitled project', description: 'Add a short description.', workshopIds: [] };
    setData((d) => ({ ...d, projects: [p, ...d.projects] }));
    navigateTo({ name: 'project', projectId: id });
    const { error } = await db.from('projects').insert({ id, name: p.name, description: p.description });
    if (error) { showToast('Failed to create project'); setData((d) => ({ ...d, projects: d.projects.filter(x => x.id !== id) })); }
  };

  const updateProject = async (projectId, patch) => {
    pushHistory();
    setData((d) => ({ ...d, projects: d.projects.map((p) => p.id === projectId ? { ...p, ...patch } : p) }));
    const dbPatch = {};
    if ('name'        in patch) dbPatch.name        = patch.name;
    if ('description' in patch) dbPatch.description = patch.description;
    if (Object.keys(dbPatch).length) await db.from('projects').update(dbPatch).eq('id', projectId);
  };

  const deleteProject = async (projectId) => {
    pushHistory();
    setData((d) => {
      const proj = d.projects.find((p) => p.id === projectId);
      const newWorkshops = { ...d.workshops }, newSections = { ...d.sections }, newBlocks = { ...d.blocks };
      proj.workshopIds.forEach((wid) => {
        const w = d.workshops[wid];
        if (w) w.sectionIds.forEach((sid) => {
          const s = d.sections[sid];
          if (s) s.blockIds.forEach((bid) => delete newBlocks[bid]);
          delete newSections[sid];
        });
        delete newWorkshops[wid];
      });
      return { ...d, projects: d.projects.filter((p) => p.id !== projectId), workshops: newWorkshops, sections: newSections, blocks: newBlocks };
    });
    showToast('Project deleted');
    await db.from('projects').delete().eq('id', projectId);
  };

  const newWorkshop = async (projectId) => {
    const sid = crypto.randomUUID(), wid = crypto.randomUUID();
    const sec = { id: sid, title: 'Opening', blockIds: [] };
    const ws  = { id: wid, projectId, title: 'Untitled workshop', date: '2026-06-01', plannedDuration: 0, startTime: '09:00', sectionIds: [sid] };
    const pos = data.projects.find(p => p.id === projectId)?.workshopIds.length || 0;
    setData((d) => ({
      ...d,
      workshops: { ...d.workshops, [wid]: ws },
      sections:  { ...d.sections,  [sid]: sec },
      projects:  d.projects.map((p) => p.id === projectId ? { ...p, workshopIds: [...p.workshopIds, wid] } : p)
    }));
    navigateTo({ name: 'workshop', projectId, workshopId: wid });
    const { error } = await db.from('workshops').insert({ id: wid, project_id: projectId, title: ws.title, date: ws.date, planned_duration: 0, start_time: '09:00', position: pos });
    if (!error) await db.from('sections').insert({ id: sid, workshop_id: wid, title: sec.title, position: 0 });
  };

  const deleteWorkshop = async (workshopId) => {
    pushHistory();
    const w = data.workshops[workshopId];
    setData((d) => {
      const newWorkshops = { ...d.workshops }; delete newWorkshops[workshopId];
      const newSections  = { ...d.sections };
      w.sectionIds.forEach((sid) => { const s = d.sections[sid]; if (s) { delete newSections[sid]; } });
      return { ...d, workshops: newWorkshops, sections: newSections,
        projects: d.projects.map((p) => ({ ...p, workshopIds: p.workshopIds.filter((x) => x !== workshopId) })) };
    });
    showToast('Workshop deleted');
    await db.from('workshops').delete().eq('id', workshopId);
  };

  const hist = { canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0, undo, redo };

  if (!authChecked) return <Spinner />;
  if (!session) return <AuthScreen />;
  if (loading) return <Spinner />;

  if (dbError) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, color: 'var(--danger)', padding: 32, textAlign: 'center' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div style={{ fontWeight: 600 }}>Could not load data</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320 }}>{dbError}</div>
      <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => doLoadData()}>
        Retry
      </button>
    </div>
  );

  const firstProjectId  = data.projects[0]?.id;
  const firstWorkshopId = firstProjectId ? data.projects[0]?.workshopIds[0] : null;

  return (
    <HistoryContext.Provider value={hist}>
      <div className="app-shell">
        <nav className="topnav">
          <div className="topnav-left">
            <a className="brand" onClick={goDashboard} style={{ cursor: 'pointer' }}>
              workshop<span className="dot">.</span>flow
            </a>
          </div>
          <div className="topnav-right">
            <button className="avatar-btn" onClick={() => navigateTo({ name: 'profile' })} title="Account">
              {(session?.user?.email?.[0] ?? '?').toUpperCase()}
            </button>
          </div>
        </nav>

        {view.name === 'dashboard' &&
          <Dashboard data={data} onOpenProject={goProject} onNewProject={newProject} onDeleteProject={deleteProject} />
        }
        {view.name === 'project' &&
          <ProjectView
            data={data}
            projectId={view.projectId}
            onOpenWorkshop={goWorkshop}
            onNewWorkshop={() => newWorkshop(view.projectId)}
            onDeleteWorkshop={deleteWorkshop}
            onUpdateProject={updateProject}
            onBack={goDashboard}
          />
        }
        {view.name === 'workshop' &&
          <Workshop
            data={data}
            workshopId={view.workshopId}
            onUpdateData={updateData}
            onBack={goDashboard}
            onProject={() => goProject(view.projectId)}
            tweaks={tweaks}
            toast={showToast}
            pushHistory={pushHistory}
          />
        }
        {view.name === 'profile' &&
          <ProfileView session={session} onBack={goDashboard} />
        }

        {toastMsg && (
          <div className="toast">
            <Icon name="check" size={14} />{toastMsg}
          </div>
        )}
      </div>
    </HistoryContext.Provider>
  );
}
