import { useState, useEffect, useRef } from 'react';
import { upsertProfile } from '../lib/db.js';

export default function NamePromptModal({ userId, onSaved }) {
  const [name,  setName]  = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Block Escape key — modal cannot be dismissed
  useEffect(() => {
    const trap = (e) => { if (e.key === 'Escape') e.stopImmediatePropagation(); };
    window.addEventListener('keydown', trap, true);
    return () => window.removeEventListener('keydown', trap, true);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter your name.'); return; }
    setBusy(true); setError('');
    try {
      await upsertProfile(userId, trimmed);
      onSaved(trimmed);
    } catch {
      setError('Could not save your name. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="np-overlay">
      <div className="np-modal">
        <div className="np-brand">
          workshop<span className="dot">.</span>flow
        </div>
        <h2 className="np-heading">What's your name?</h2>
        <p className="np-sub">This will be used to identify you in collaboration.</p>
        <form onSubmit={handleSubmit} noValidate>
          <input
            ref={inputRef}
            className="input np-input"
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
            autoComplete="name"
            disabled={busy}
          />
          {error && <div className="np-error">{error}</div>}
          <button
            className="btn np-submit"
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? 'Saving…' : 'Save name'}
          </button>
        </form>
      </div>
    </div>
  );
}
