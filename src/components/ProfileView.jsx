import { useState } from 'react';
import Icon from './Icon.jsx';
import { db } from '../lib/supabase.js';

export default function ProfileView({ session, onBack }) {
  const userEmail = session?.user?.email || '';
  const [email,    setEmail]    = useState(userEmail);
  const [password, setPassword] = useState('');
  const [emailBusy,    setEmailBusy]    = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [emailFb,    setEmailFb]    = useState(null);
  const [passwordFb, setPasswordFb] = useState(null);

  const saveEmail = async (e) => {
    e.preventDefault();
    setEmailBusy(true); setEmailFb(null);
    const { error } = await db.auth.updateUser({ email });
    setEmailFb(error
      ? { type: 'error',   msg: error.message }
      : { type: 'success', msg: 'Confirmation sent to your new email address.' });
    setEmailBusy(false);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPasswordBusy(true); setPasswordFb(null);
    const { error } = await db.auth.updateUser({ password });
    if (!error) setPassword('');
    setPasswordFb(error
      ? { type: 'error',   msg: error.message }
      : { type: 'success', msg: 'Password updated.' });
    setPasswordBusy(false);
  };

  const signOut = async () => { await db.auth.signOut(); };

  return (
    <div className="page" data-screen-label="Profile">
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            <a onClick={onBack} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Projects</a>
            <span style={{ color: 'var(--text-subtle)', margin: '0 6px' }}>/</span>
            <span>Account</span>
          </div>
          <h1 className="page-title">Account</h1>
        </div>
      </div>

      <div className="profile-body">
        <div className="profile-section">
          <div className="profile-section-title">Email address</div>
          <form onSubmit={saveEmail}>
            <div className="profile-row" style={{ marginBottom: emailFb ? 10 : 0 }}>
              <input className="input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <button className="btn btn-primary" type="submit"
                disabled={emailBusy || email === userEmail}>
                {emailBusy ? 'Saving…' : 'Update'}
              </button>
            </div>
            {emailFb && <div className={`profile-feedback ${emailFb.type}`}>{emailFb.msg}</div>}
          </form>
        </div>

        <div className="profile-section">
          <div className="profile-section-title">New password</div>
          <form onSubmit={savePassword}>
            <div className="profile-row" style={{ marginBottom: passwordFb ? 10 : 0 }}>
              <input className="input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password" minLength={6} autoComplete="new-password" />
              <button className="btn btn-primary" type="submit"
                disabled={passwordBusy || !password}>
                {passwordBusy ? 'Saving…' : 'Update'}
              </button>
            </div>
            {passwordFb && <div className={`profile-feedback ${passwordFb.type}`}>{passwordFb.msg}</div>}
          </form>
        </div>

        <div className="profile-section">
          <div className="profile-section-title">Session</div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Signed in as <strong style={{ color: 'var(--text)' }}>{userEmail}</strong>
            </div>
            <button className="btn btn-ghost" onClick={signOut} style={{ color: 'var(--danger)' }}>
              <Icon name="trash" size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
