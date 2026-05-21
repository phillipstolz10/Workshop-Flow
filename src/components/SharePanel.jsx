import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import { getProjectMembers, inviteToProject } from '../lib/db.js';

function getInitials(name, email) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

export default function SharePanel({ projectId, session, profile, onClose }) {
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'error'|'success', msg }

  const ownerName  = profile?.full_name?.trim() || session?.user?.email || '';
  const ownerEmail = session?.user?.email || '';

  const loadMembers = async () => {
    setLoading(true);
    try { setMembers(await getProjectMembers(projectId)); } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { loadMembers(); }, [projectId]);

  const handleInvite = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === ownerEmail.toLowerCase()) {
      setFeedback({ type: 'error', msg: "That's your own email address." });
      return;
    }
    setBusy(true); setFeedback(null);
    try {
      await inviteToProject(projectId, session.user.id, trimmed);
      setEmail('');
      setFeedback({ type: 'success', msg: `Invitation sent to ${trimmed}.` });
      await loadMembers();
    } catch (err) {
      const msg =
        err.message === 'NO_ACCOUNT'     ? 'No account found with this email address.' :
        err.message === 'ALREADY_INVITED' ? 'This person has already been invited.' :
        'Something went wrong. Please try again.';
      setFeedback({ type: 'error', msg });
    }
    setBusy(false);
  };

  const acceptedCount = members.filter((m) => m.status === 'accepted').length;
  const subtitle = members.length === 0
    ? 'Only you have access'
    : `You + ${members.length} other${members.length === 1 ? '' : 's'}${acceptedCount > 0 ? ` · ${acceptedCount} accepted` : ''}`;

  return (
    <>
      <div className="sp-scrim" onClick={onClose} />
      <div className="sp-panel" role="dialog" aria-label="Share project">
        <div className="sp-head">
          <div>
            <div className="sp-title">Share project</div>
          </div>
          <button className="btn btn-icon sp-close" onClick={onClose} title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="sp-body">
          {/* Member list */}
          <div className="sp-section">
            <div className="sp-section-label">Members</div>
            <ul className="sp-member-list">
              {/* Owner row — always first */}
              <li className="sp-member">
                <div className="sp-member-avatar">
                  {getInitials(ownerName, ownerEmail)}
                </div>
                <div className="sp-member-info">
                  {ownerName && ownerName !== ownerEmail && (
                    <div className="sp-member-name">
                      {ownerName} <span className="sp-you">(you)</span>
                    </div>
                  )}
                  <div className={ownerName && ownerName !== ownerEmail ? 'sp-member-email' : 'sp-member-name'}>
                    {ownerEmail} {(!ownerName || ownerName === ownerEmail) && <span className="sp-you">(you)</span>}
                  </div>
                </div>
                <span className="sp-badge sp-badge-owner">Owner</span>
              </li>

              {/* Invited members */}
              {loading ? (
                <li className="sp-loading">Loading members…</li>
              ) : (
                members.map((m) => (
                  <li key={m.id} className="sp-member">
                    <div className="sp-member-avatar sp-member-avatar-muted">
                      {getInitials(m.full_name, m.invited_email)}
                    </div>
                    <div className="sp-member-info">
                      {m.full_name ? (
                        <>
                          <div className="sp-member-name">{m.full_name}</div>
                          <div className="sp-member-email">{m.invited_email}</div>
                        </>
                      ) : (
                        <div className="sp-member-name">{m.invited_email}</div>
                      )}
                    </div>
                    <span className="sp-badge sp-badge-role">Editor</span>
                    <span className={`sp-badge ${m.status === 'accepted' ? 'sp-badge-accepted' : 'sp-badge-pending'}`}>
                      {m.status === 'accepted' ? 'Accepted' : 'Pending'}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Invite form — sticky bottom */}
        <div className="sp-section sp-invite-section">
          <div className="sp-section-label">Invite by email</div>
          <form onSubmit={handleInvite} className="sp-invite-form">
            <input
              className="input sp-email-input"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFeedback(null); }}
              disabled={busy}
              autoComplete="off"
            />
            <button
              className="btn btn-accent sp-invite-btn"
              type="submit"
              disabled={busy || !email.trim()}
            >
              {busy ? '…' : 'Invite'}
            </button>
          </form>
          {feedback && (
            <div className={`sp-feedback sp-${feedback.type}`}>{feedback.msg}</div>
          )}
        </div>
      </div>
    </>
  );
}
