import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon.jsx';
import Dashboard from './Dashboard.jsx';
import ProjectView from './ProjectView.jsx';
import Workshop from './Workshop.jsx';
import AuthScreen from './AuthScreen.jsx';
import ProfileView from './ProfileView.jsx';
import TemplateEditor from './TemplateEditor.jsx';
import { HistoryContext } from '../contexts/HistoryContext.jsx';
import { useTweaks } from '../hooks/useTweaks.js';
import { db } from '../lib/supabase.js';
import { loadAllData, applyStateDiff, seedSampleProject, getProfile, upsertProfile, setPresenceColor, acceptPendingInvitations, getNotifications, markNotificationRead, markAllNotificationsRead, getTemplates, saveTemplate, deleteTemplate, getTemplate, updateTemplate } from '../lib/db.js';
import NamePromptModal from './NamePromptModal.jsx';
import NotificationPanel from './NotificationPanel.jsx';

const TWEAK_DEFAULTS = { density: 'comfortable', sectionStyle: 'cards', editor: 'panel' };

const PRESENCE_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6'];

function getInitials(fullName, email) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: 'var(--text-muted)' }}>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  </div>
);

// ── URL ↔ view helpers ────────────────────────────────────────────────────────
function viewToPath(v) {
  if (v.name === 'workshop')  return `/projects/${v.projectId}/workshops/${v.workshopId}`;
  if (v.name === 'project')   return `/projects/${v.projectId}`;
  if (v.name === 'profile')   return '/profile';
  if (v.name === 'template')  return `/templates/${v.templateId}`;
  return '/';
}

function pathToView(path) {
  const ws = path.match(/^\/projects\/([^/?#]+)\/workshops\/([^/?#]+)/);
  if (ws) return { name: 'workshop', projectId: ws[1], workshopId: ws[2] };
  const pr = path.match(/^\/projects\/([^/?#]+)/);
  if (pr) return { name: 'project', projectId: pr[1] };
  if (path.startsWith('/profile')) return { name: 'profile' };
  const tmpl = path.match(/^\/templates\/([^/?#]+)/);
  if (tmpl) return { name: 'template', templateId: tmpl[1] };
  return { name: 'dashboard' };
}

export default function App() {
  const [session,     setSession]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState(null);
  // Initialise from the current URL so reloads land on the right screen.
  const [view,    setView]    = useState(() => pathToView(window.location.pathname));
  const [toastMsg, setToastMsg] = useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [, forceTick] = useState(0);
  const bump = () => forceTick((t) => t + 1);
  // Workshop registers a diff-broadcaster here so undo/redo propagates to peers.
  const afterUndoRedoRef = useRef(null);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const [profile,      setProfile]      = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [notifications,      setNotifications]      = useState([]);
  const [showNotifications,  setShowNotifications]  = useState(false);
  const [templates,          setTemplates]          = useState([]);
  const [activeTemplate,     setActiveTemplate]     = useState(null);

  const loadStartedRef = useRef(false);

  const doLoadData = async (user = null) => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setLoading(true); setDbError(null);
    try {
      // Auto-accept any pending invitations before loading so shared projects appear immediately
      if (user) await acceptPendingInvitations(user.id).catch(() => {});
      let d = await loadAllData();
      if (user && d.projects.length === 0) {
        const flag = `wf_seeded_${user.id}`;
        if (!localStorage.getItem(flag)) {
          await seedSampleProject().catch(() => {});
          localStorage.setItem(flag, '1');
          d = await loadAllData();
        }
      }
      // Load profile + notifications
      if (user) {
        const [prof, notifs] = await Promise.all([
          getProfile(user.id).catch(() => null),
          getNotifications(user.id).catch(() => []),
        ]);
        // Assign a presence color once per user if they don't have one yet
        let finalProf = prof;
        if (!prof?.presence_color) {
          const color = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
          await setPresenceColor(user.id, color).catch(() => {});
          finalProf = { ...(prof || {}), presence_color: color };
        }
        setProfile(finalProf);
        setProfileReady(true);
        setNotifications(notifs);
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
        setProfile(null);
        setProfileReady(false);
        setNotifications([]);
        setShowNotifications(false);
        setView({ name: 'dashboard' });
        window.history.replaceState({ name: 'dashboard' }, '', '/');
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
    afterUndoRedoRef.current?.(curr, prev);
  }, [data]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop();
    const curr = JSON.parse(JSON.stringify(data));
    undoStack.current.push(curr);
    setData(next); bump(); showToast('Redone');
    applyStateDiff(curr, next).catch(() => showToast('Sync error after redo'));
    afterUndoRedoRef.current?.(curr, next);
  }, [data]);

  useEffect(() => {
    const onKey = (e) => {
      if (viewRef.current?.name === 'template') return; // template editor handles its own undo/redo
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Realtime: stream new notifications for this user
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = db
      .channel(`notifs:${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [session?.user?.id]);

  // Realtime: update project list when user is added to a project
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = db
      .channel(`members:${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'project_members',
        filter: `user_id=eq.${session.user.id}`,
      }, async () => {
        await acceptPendingInvitations(session.user.id).catch(() => {});
        const fresh = await loadAllData().catch(() => null);
        if (fresh) setData(fresh);
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || view.name !== 'dashboard') return;
    getTemplates().then(setTemplates).catch(() => {});
  }, [session?.user?.id, view.name]);

  useEffect(() => {
    if (view.name !== 'template' || !view.templateId || !session?.user?.id) return;
    if (activeTemplate?.id === view.templateId) return; // already loaded
    getTemplate(view.templateId).then(setActiveTemplate).catch(() => goDashboard());
  }, [view.name, view.templateId, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteTemplate = async (id) => {
    setTemplates((t) => t.filter((x) => x.id !== id));
    try {
      await deleteTemplate(id);
    } catch {
      // restore on error
      getTemplates().then(setTemplates).catch(() => {});
    }
  };

  const markNotifRead = async (id) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    await markNotificationRead(id).catch(() => {});
  };

  const markAllNotifsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead(session.user.id).catch(() => {});
  };

  const handleNotifNavigate = async (notif) => {
    if (notif.type === 'project_invitation' && notif.metadata?.project_id) {
      await acceptPendingInvitations(session.user.id).catch(() => {});
      const fresh = await loadAllData().catch(() => null);
      if (fresh) setData(fresh);
      navigateTo({ name: 'project', projectId: notif.metadata.project_id });
    } else if ((notif.type === 'new_comment' || notif.type === 'comment_reply') && notif.metadata?.workshop_id) {
      navigateTo({ name: 'workshop', projectId: notif.metadata.project_id, workshopId: notif.metadata.workshop_id, openCommentMode: true });
    }
  };

  useEffect(() => {
    // Stamp history state for the current URL so back/forward always has state.
    const initial = pathToView(window.location.pathname);
    window.history.replaceState(initial, '', window.location.pathname);
    const onPop = (e) => setView(e.state || pathToView(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Clear undo/redo stacks every time a workshop is opened so the previous
  // session's history never leaks into a new one.
  useEffect(() => {
    if (!view.workshopId) return;
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, [view.workshopId]);

  useEffect(() => { document.body.setAttribute('data-density', tweaks.density); }, [tweaks.density]);

  const updateData = (mut) => setData((d) => typeof mut === 'function' ? mut(d) : mut);

  const navigateTo = (newView) => { setView(newView); window.history.pushState(newView, '', viewToPath(newView)); };
  const goDashboard = () => navigateTo({ name: 'dashboard' });
  const goProject   = (projectId) => navigateTo({ name: 'project', projectId });
  const goTemplate  = async (templateId) => {
    // Find in already-loaded templates first, else fetch
    const existing = templates.find((t) => t.id === templateId);
    if (existing) {
      setActiveTemplate(existing);
    } else {
      try {
        const t = await getTemplate(templateId);
        setActiveTemplate(t);
      } catch { return; }
    }
    navigateTo({ name: 'template', templateId });
  };
  const useTemplate = async (template, projectId) => {
    const wid = crypto.randomUUID();
    const pos = data.projects.find((p) => p.id === projectId)?.workshopIds.length || 0;
    const content = template.content || { sections: [] };
    const newSections = {}, newBlocks = {}, sectionIds = [], dbSections = [], dbBlocks = [];
    (content.sections || []).forEach((sec, si) => {
      const sid = crypto.randomUUID();
      sectionIds.push(sid);
      const blockIds = [];
      (sec.blocks || []).forEach((b, bi) => {
        const bid = crypto.randomUUID();
        blockIds.push(bid);
        newBlocks[bid] = { id: bid, sectionId: sid, title: b.title || 'Block', description: b.description || '', person: '', material: b.material || '', duration: b.duration || 15 };
        dbBlocks.push({ id: bid, section_id: sid, title: b.title || 'Block', duration: b.duration || 15, description: b.description || null, person: null, material: b.material || null, position: bi });
      });
      newSections[sid] = { id: sid, workshopId: wid, title: sec.title || 'Section', blockIds };
      dbSections.push({ id: sid, workshop_id: wid, title: sec.title || 'Section', position: si });
    });
    const today = new Date().toISOString().split('T')[0];
    const ws = { id: wid, projectId, title: template.name || 'Untitled workshop', date: today, plannedDuration: 0, startTime: '09:00', sectionIds };
    setData((d) => ({
      ...d,
      workshops: { ...d.workshops, [wid]: ws },
      sections:  { ...d.sections, ...newSections },
      blocks:    { ...d.blocks,   ...newBlocks },
      projects:  d.projects.map((p) => p.id === projectId ? { ...p, workshopIds: [...p.workshopIds, wid] } : p),
    }));
    navigateTo({ name: 'workshop', projectId, workshopId: wid });
    showToast('Workshop created from template');
    const { error } = await db.from('workshops').insert({ id: wid, project_id: projectId, title: ws.title, date: ws.date, planned_duration: 0, start_time: '09:00', position: pos });
    if (!error && dbSections.length) {
      await db.from('sections').insert(dbSections);
      if (dbBlocks.length) await db.from('blocks').insert(dbBlocks);
    }
  };

  const newTemplate = async () => {
    try {
      const t = await saveTemplate('Untitled template', '', { sections: [] });
      setTemplates((prev) => [t, ...prev]);
      setActiveTemplate(t);
      navigateTo({ name: 'template', templateId: t.id });
    } catch { toast('Failed to create template'); }
  };
  const goWorkshop  = (workshopId) => {
    const w = data.workshops[workshopId];
    navigateTo({ name: 'workshop', projectId: w.projectId, workshopId });
  };

  const newProject = async () => {
    const id = crypto.randomUUID();
    const p  = { id, name: 'Untitled project', description: 'Add a short description.', userId: session.user.id, workshopIds: [] };
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
    const today = new Date().toISOString().split('T')[0];
    const ws  = { id: wid, projectId, title: 'Untitled workshop', date: today, plannedDuration: 0, startTime: '09:00', sectionIds: [sid] };
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

  const hist = { canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0, undo, redo, afterUndoRedoRef };

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
            <button
              className={'notif-bell' + (showNotifications ? ' is-active' : '')}
              onClick={() => setShowNotifications((v) => !v)}
              title="Notifications"
            >
              <Icon name="bell" size={17} />
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="notif-badge">
                  {notifications.filter((n) => !n.read).length > 9 ? '9+' : notifications.filter((n) => !n.read).length}
                </span>
              )}
            </button>
            <button className="avatar-btn" onClick={() => navigateTo({ name: 'profile' })}
              title={profile?.full_name || session?.user?.email || 'Account'}>
              {getInitials(profile?.full_name, session?.user?.email)}
            </button>
          </div>
        </nav>

        {view.name === 'dashboard' &&
          <Dashboard data={data} userId={session.user.id} onOpenProject={goProject} onNewProject={newProject} onDeleteProject={deleteProject} templates={templates} onDeleteTemplate={handleDeleteTemplate} onOpenTemplate={goTemplate} onNewTemplate={newTemplate} />
        }
        {view.name === 'project' &&
          <ProjectView
            data={data}
            projectId={view.projectId}
            userId={session.user.id}
            session={session}
            profile={profile}
            onOpenWorkshop={goWorkshop}
            onNewWorkshop={() => newWorkshop(view.projectId)}
            onDeleteWorkshop={deleteWorkshop}
            onDeleteProject={deleteProject}
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
            userId={session.user.id}
            userColor={profile?.presence_color}
            userFullName={profile?.full_name}
            templates={templates}
            openCommentMode={!!view.openCommentMode}
          />
        }
        {view.name === 'template' && activeTemplate && (
          <TemplateEditor
            template={activeTemplate}
            onBack={goDashboard}
            toast={showToast}
            tweaks={tweaks}
            projects={data.projects}
            userId={session.user.id}
            onUseTemplate={useTemplate}
          />
        )}
        {view.name === 'profile' &&
          <ProfileView
            session={session}
            profile={profile}
            onSaveProfile={(name) => setProfile((p) => ({ ...(p || {}), full_name: name }))}
            onBack={goDashboard}
          />
        }

        {toastMsg && (
          <div className="toast">
            <Icon name="check" size={14} />{toastMsg}
          </div>
        )}

        {showNotifications && (
          <NotificationPanel
            notifications={notifications}
            onMarkRead={markNotifRead}
            onMarkAllRead={markAllNotifsRead}
            onNavigate={handleNotifNavigate}
            onClose={() => setShowNotifications(false)}
          />
        )}

        {profileReady && !profile?.full_name?.trim() && (
          <NamePromptModal
            userId={session.user.id}
            onSaved={(name) => setProfile((p) => ({ ...(p || {}), full_name: name }))}
          />
        )}
      </div>
    </HistoryContext.Provider>
  );
}
