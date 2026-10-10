'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível entrar.');
      window.location.replace('/');
    } catch (e) {
      setError(e?.message || 'Falha de conexão.');
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1220', color: '#f8fafc' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, padding: 28, border: '1px solid #263449', borderRadius: 20, background: '#111c2e', boxShadow: '0 20px 60px #0005' }}>
        <p style={{ color: '#60a5fa', fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>ACESSO PRIVADO</p>
        <h1 style={{ fontSize: 28, margin: '8px 0' }}>Felipe IA</h1>
        <p style={{ color: '#a8b6ca', marginBottom: 24 }}>Digite o código de acesso para continuar.</p>
        <label htmlFor="access-code" style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>Código de acesso</label>
        <input id="access-code" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={{ boxSizing: 'border-box', width: '100%', padding: 13, border: '1px solid #3b4c63', borderRadius: 10, background: '#0b1220', color: '#fff', outlineColor: '#60a5fa' }} />
        {error ? <p role="alert" style={{ color: '#fca5a5', fontSize: 13, marginTop: 12 }}>{error}</p> : null}
        <button type="submit" disabled={busy || !password} style={{ width: '100%', marginTop: 18, padding: 13, border: 0, borderRadius: 10, background: busy ? '#475569' : '#2563eb', color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
        <p style={{ marginTop: 20, color: '#7f91a9', fontSize: 12 }}>Sessões expiram após 8 horas. Não use códigos compartilhados publicamente.</p>
      </form>
    </main>
  );
}
