import { useState } from 'react';
import { api, splitInterests, tokenStore } from './api';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', interests: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : { ...form, interests: splitInterests(form.interests) };
      const { user, token } = await api(`/auth/${mode}`, { method: 'POST', body });
      tokenStore.set(token);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
      {mode === 'register' && (
        <>
          <input name="name" placeholder="Name" value={form.name} onChange={change} required />
          <input name="interests" placeholder="Interests, comma separated (chess, reading)" value={form.interests} onChange={change} />
        </>
      )}
      <input name="email" type="email" placeholder="Email" value={form.email} onChange={change} required />
      <input name="password" type="password" placeholder="Password (min 8 characters)" value={form.password} onChange={change} required />
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Register'}</button>
      <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'No account? Register' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
