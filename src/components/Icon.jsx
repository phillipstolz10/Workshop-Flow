export default function Icon({ name, size = 16, className = '', strokeWidth = 1.5, style }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    className, style,
  };
  switch (name) {
    case 'plus':          return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'chevron-right': return <svg {...common}><path d="m9 6 6 6-6 6"/></svg>;
    case 'chevron-down':  return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case 'chevron-left':  return <svg {...common}><path d="m15 6-6 6 6 6"/></svg>;
    case 'grip':          return <svg {...common}><circle cx="9"  cy="6"  r="0.9" fill="currentColor" stroke="none"/><circle cx="15" cy="6"  r="0.9" fill="currentColor" stroke="none"/><circle cx="9"  cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="9"  cy="18" r="0.9" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="0.9" fill="currentColor" stroke="none"/></svg>;
    case 'clock':         return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'calendar':      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'user':          return <svg {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/></svg>;
    case 'trash':         return <svg {...common}><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>;
    case 'undo':          return <svg {...common}><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>;
    case 'redo':          return <svg {...common}><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>;
    case 'download':      return <svg {...common}><path d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg>;
    case 'copy':          return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
    case 'check':         return <svg {...common}><path d="m5 12 5 5L20 6"/></svg>;
    case 'x':             return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'arrow-right':   return <svg {...common}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
    case 'backpack':      return <svg {...common}><path d="M4 20V10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M8 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/><path d="M8 10h8"/></svg>;
    case 'user-plus':     return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>;
    case 'bell':          return <svg {...common}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case 'link':          return <svg {...common}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case 'external-link': return <svg {...common}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
    case 'bookmark':        return <svg {...common}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;
    case 'message-circle':  return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    default: return null;
  }
}
