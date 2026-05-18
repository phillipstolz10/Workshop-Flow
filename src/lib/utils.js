export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(hhmm, mins) {
  const parts = (hhmm || '09:00').split(':');
  const base = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  const total = base + (mins || 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDuration(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function workshopTotal(data, workshopId) {
  const w = data.workshops[workshopId];
  if (!w) return 0;
  let t = 0;
  w.sectionIds.forEach(sid => {
    (data.sections[sid]?.blockIds || []).forEach(bid => { t += data.blocks[bid]?.duration || 0; });
  });
  return t;
}

export function projectTotal(data, projectId) {
  const proj = Array.isArray(data.projects)
    ? data.projects.find(x => x.id === projectId)
    : data.projects[projectId];
  if (!proj) return 0;
  return proj.workshopIds.reduce((s, w) => s + workshopTotal(data, w), 0);
}

export function snap5(n) {
  return Math.max(5, Math.round((n || 5) / 5) * 5);
}
