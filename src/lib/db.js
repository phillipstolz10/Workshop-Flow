import { db } from './supabase.js';

// Convert Supabase rows → flat app data format
export function dbToAppData(projects, workshops, sections, blocks) {
  const wssByProj = {}, sectsByWs = {}, blocksBySect = {};
  for (const w of workshops || []) (wssByProj[w.project_id] = wssByProj[w.project_id] || []).push(w);
  for (const s of sections  || []) (sectsByWs[s.workshop_id]  = sectsByWs[s.workshop_id]  || []).push(s);
  for (const b of blocks    || []) (blocksBySect[b.section_id] = blocksBySect[b.section_id] || []).push(b);
  return {
    projects: (projects || []).map(p => ({
      id: p.id, name: p.name, description: p.description || '',
      userId: p.user_id,
      workshopIds: (wssByProj[p.id] || []).sort((a,b) => a.position - b.position).map(w => w.id)
    })),
    workshops: Object.fromEntries((workshops || []).map(w => [w.id, {
      id: w.id, projectId: w.project_id, title: w.title, date: w.date || '',
      plannedDuration: w.planned_duration || 0, startTime: w.start_time || '09:00',
      sectionIds: (sectsByWs[w.id] || []).sort((a,b) => a.position - b.position).map(s => s.id)
    }])),
    sections: Object.fromEntries((sections || []).map(s => [s.id, {
      id: s.id, workshopId: s.workshop_id, title: s.title,
      blockIds: (blocksBySect[s.id] || []).sort((a,b) => a.position - b.position).map(b => b.id)
    }])),
    blocks: Object.fromEntries((blocks || []).map(b => [b.id, {
      id: b.id, sectionId: b.section_id, title: b.title, duration: b.duration,
      description: b.description || '', person: b.person || '', material: b.material || ''
    }]))
  };
}

export async function loadAllData() {
  const [pr, wr, sr, br] = await Promise.all([
    db.from('projects').select('*').order('created_at'),
    db.from('workshops').select('*').order('position'),
    db.from('sections').select('*').order('position'),
    db.from('blocks').select('*').order('position'),
  ]);
  if (pr.error) throw pr.error;
  return dbToAppData(pr.data, wr.data, sr.data, br.data);
}

export async function syncSectionPositions(sectionIds) {
  for (let i = 0; i < sectionIds.length; i++) {
    await db.from('sections').update({ position: i }).eq('id', sectionIds[i]);
  }
}

export async function syncBlockPositions(sectionId, blockIds) {
  for (let i = 0; i < blockIds.length; i++) {
    await db.from('blocks').update({ position: i, section_id: sectionId }).eq('id', blockIds[i]);
  }
}

export async function applyStateDiff(fromState, toState) {
  // Projects
  const fromPIds = new Set(fromState.projects.map(p => p.id));
  const toPIds   = new Set(toState.projects.map(p => p.id));
  const delProjs = [...fromPIds].filter(id => !toPIds.has(id));
  if (delProjs.length) await db.from('projects').delete().in('id', delProjs);
  if (toState.projects.length) {
    await db.from('projects').upsert(toState.projects.map(p => ({ id: p.id, name: p.name, description: p.description || '' })));
  }

  // Workshops
  const fromWIds = new Set(Object.keys(fromState.workshops));
  const toWIds   = new Set(Object.keys(toState.workshops));
  const delWs    = [...fromWIds].filter(id => !toWIds.has(id));
  if (delWs.length) await db.from('workshops').delete().in('id', delWs);
  const wsRows = toState.projects.flatMap(p => p.workshopIds.map((wid, i) => {
    const w = toState.workshops[wid];
    return { id: w.id, project_id: w.projectId, title: w.title, date: w.date || null, planned_duration: w.plannedDuration || 0, start_time: w.startTime || '09:00', position: i };
  }));
  if (wsRows.length) await db.from('workshops').upsert(wsRows);

  // Sections
  const fromSIds = new Set(Object.keys(fromState.sections));
  const toSIds   = new Set(Object.keys(toState.sections));
  const delSects = [...fromSIds].filter(id => !toSIds.has(id));
  if (delSects.length) await db.from('sections').delete().in('id', delSects);
  const secRows = Object.values(toState.workshops).flatMap(w =>
    w.sectionIds.map((sid, i) => ({ id: sid, workshop_id: w.id, title: toState.sections[sid]?.title || '', position: i }))
  );
  if (secRows.length) await db.from('sections').upsert(secRows);

  // Blocks
  const fromBIds = new Set(Object.keys(fromState.blocks));
  const toBIds   = new Set(Object.keys(toState.blocks));
  const delBlocks = [...fromBIds].filter(id => !toBIds.has(id));
  if (delBlocks.length) await db.from('blocks').delete().in('id', delBlocks);
  const blkRows = Object.values(toState.sections).flatMap(s =>
    s.blockIds.map((bid, i) => {
      const b = toState.blocks[bid];
      return { id: b.id, section_id: s.id, position: i, duration: b.duration, title: b.title,
        description: b.description || null, person: b.person || null, material: b.material || null };
    })
  );
  if (blkRows.length) await db.from('blocks').upsert(blkRows);
}

// ── Project membership ──────────────────────────────────────────────────────

export async function acceptPendingInvitations(userId) {
  await db.from('project_members')
    .update({ status: 'accepted' })
    .eq('user_id', userId)
    .eq('status', 'pending');
}

export async function getProjectMembers(projectId) {
  const { data, error } = await db
    .from('project_members')
    .select('id, user_id, role, status, invited_email, created_at')
    .eq('project_id', projectId)
    .order('created_at');
  if (error) throw error;
  if (!data?.length) return [];

  // Fetch display names from profiles for all member user IDs
  const userIds = data.map((m) => m.user_id).filter(Boolean);
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const nameMap = {};
  (profiles || []).forEach((p) => { nameMap[p.id] = p.full_name || null; });

  return data.map((m) => ({ ...m, full_name: nameMap[m.user_id] || null }));
}

export async function inviteToProject(projectId, invitedByUserId, email) {
  const trimmed = email.toLowerCase().trim();

  // Look up user by email via RPC (needs SECURITY DEFINER to read auth.users)
  const { data: foundId, error: rpcErr } = await db.rpc('get_user_id_by_email', {
    email_input: trimmed,
  });
  if (rpcErr) throw rpcErr;
  if (!foundId) throw new Error('NO_ACCOUNT');
  if (foundId === invitedByUserId) throw new Error('SELF_INVITE');

  const { error } = await db.from('project_members').insert({
    project_id: projectId,
    user_id: foundId,
    invited_by: invitedByUserId,
    invited_email: trimmed,
    role: 'editor',
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') throw new Error('ALREADY_INVITED');
    throw error;
  }
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(userId) {
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id) {
  await db.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(userId) {
  await db.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

export async function getProfile(userId) {
  const { data } = await db.from('profiles').select('full_name').eq('id', userId).single();
  return data || null;
}

export async function upsertProfile(userId, fullName) {
  const { error } = await db.from('profiles').upsert({ id: userId, full_name: fullName });
  if (error) throw error;
}

export async function seedSampleProject() {
  const pid = crypto.randomUUID();
  const wid = crypto.randomUUID();
  const s1  = crypto.randomUUID();
  const s2  = crypto.randomUUID();
  const s3  = crypto.randomUUID();
  const s4  = crypto.randomUUID();

  const d = new Date();
  d.setDate(d.getDate() + 14);
  const workshopDate = d.toISOString().slice(0, 10);

  await db.from('projects').insert({ id: pid, name: 'Website Redesign', description: 'Redesign the company website with a fresh, user-centred approach.' });
  await db.from('workshops').insert({ id: wid, project_id: pid, title: 'Ideation Workshop', date: workshopDate, planned_duration: 140, position: 0 });
  await db.from('sections').insert([
    { id: s1, workshop_id: wid, title: 'Opening', position: 0 },
    { id: s2, workshop_id: wid, title: 'Explore',  position: 1 },
    { id: s3, workshop_id: wid, title: 'Ideate',   position: 2 },
    { id: s4, workshop_id: wid, title: 'Closing',  position: 3 },
  ]);
  await db.from('blocks').insert([
    { section_id: s1, position: 0, duration: 10, title: 'Welcome & Introductions', description: 'Welcome participants, introduce the facilitator and the agenda for the day.', person: 'Facilitator', material: 'Printed agenda' },
    { section_id: s1, position: 1, duration: 15, title: 'Project Context', description: 'Brief the team on the redesign goals, timeline, and key constraints.', person: 'Project Lead', material: 'Slide deck' },
    { section_id: s2, position: 0, duration: 20, title: 'User Insights Review', description: 'Walk through key findings from user research. Highlight pain points and opportunities.', person: 'UX Researcher', material: 'Research report, sticky notes' },
    { section_id: s2, position: 1, duration: 25, title: 'Inspiration Round', description: 'Each participant shares 2-3 examples of designs they find inspiring and explains why.', person: 'All participants', material: 'Laptop or printed references' },
    { section_id: s3, position: 0, duration: 30, title: 'Crazy 8s', description: 'Each participant sketches 8 rough ideas in 8 minutes. Three rounds total.', person: 'All participants', material: 'A4 paper, markers' },
    { section_id: s3, position: 1, duration: 20, title: 'Idea Showcase', description: 'Each participant presents their favourite idea to the group. No criticism — questions only.', person: 'All participants', material: 'Sketches from Crazy 8s' },
    { section_id: s4, position: 0, duration: 10, title: 'Dot Voting', description: 'Each participant places 3 votes on the ideas they find most promising.', person: 'Facilitator', material: 'Dot stickers or digital voting tool' },
    { section_id: s4, position: 1, duration: 10, title: 'Next Steps & Wrap-up', description: 'Summarise outcomes, assign owners for follow-up actions, and close the session.', person: 'Facilitator', material: 'Whiteboard or shared notes doc' },
  ]);
}
