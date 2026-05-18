import { useState } from 'react';
import { db } from '../lib/supabase.js';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(null);

  const go = (m) => { setMode(m); setAlert(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setAlert(null);

    if (mode === 'reset') {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      setAlert(error
        ? { type: 'error', msg: error.message }
        : { type: 'success', msg: 'Check your email for a password-reset link.' });
      setBusy(false);
      return;
    }

    if (mode === 'signup') {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) {
        const msg = error.message.toLowerCase().includes('already registered')
          ? 'An account with this email already exists. Try signing in.'
          : error.message;
        setAlert({ type: 'error', msg });
      } else if (data.session === null) {
        setAlert({ type: 'success', msg: 'Account created! Check your email to confirm before signing in.' });
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase().includes('invalid login')
          ? 'Incorrect email or password.'
          : error.message.toLowerCase().includes('email not confirmed')
          ? 'Please confirm your email before signing in.'
          : error.message;
        setAlert({ type: 'error', msg });
      }
    }
    setBusy(false);
  };

  const titles = { signin: 'Sign in.', signup: 'Create account.', reset: 'Reset password.' };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">workshop<span className="dot">.</span>flow</div>
        <h1 className="auth-title">{titles[mode]}</h1>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
          </div>

          {mode !== 'reset' && (
            <div className="auth-field">
              <label>Password</label>
              <input className="input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </div>
          )}

          {alert && <div className={`auth-alert ${alert.type}`}>{alert.msg}</div>}

          <button type="submit" className="btn auth-submit" disabled={busy}>
            {busy ? '…' : mode === 'reset' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'signin' && <>
            <button type="button" onClick={() => go('signup')}>New here? Create an account</button>
            <button type="button" onClick={() => go('reset')}>Forgot password?</button>
          </>}
          {mode === 'signup' && (
            <button type="button" onClick={() => go('signin')}>Already have an account? Sign in</button>
          )}
          {mode === 'reset' && (
            <button type="button" onClick={() => go('signin')}>← Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
