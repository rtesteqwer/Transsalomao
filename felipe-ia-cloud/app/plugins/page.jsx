'use client';

import { useEffect, useMemo, useState } from 'react';

const TOKEN_PLUGINS = new Set(['github', 'vercel', 'neon']);

export default function PluginsPage() {
  const [plugins, setPlugins] = useState([]);
  const [tokens, setTokens] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/plugins', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao carregar plugins.');
      setPlugins(Array.isArray(data?.plugins) ? data.plugins : []);
    } catch (e) {
      setError(e.message || 'Falha ao carregar plugins.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const oauthError = params.get('error');

    if (connected) setNotice('Plugin conectado com sucesso.');
    if (oauthError) {
      const messages = {
        google_oauth_not_configured: 'O OAuth do Google ainda precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel.',
        oauth_state: 'A validação de segurança do OAuth falhou. Tente conectar novamente.',
        oauth_exchange: 'O Google recusou a conclusão do OAuth.',
        unsupported_oauth: 'Este plugin não usa esse fluxo OAuth.'
      };
      setError(messages[oauthError] || 'Não foi possível concluir a conexão.');
    }

    refresh();
  }, []);

  const connectedCount = useMemo(
    () => plugins.filter(item => item.connected).length,
    [plugins]
  );

  async function saveToken(provider) {
    const token = String(tokens[provider] || '').trim();
    if (!token) return;

    setBusy(provider);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/plugins/' + provider + '/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Credencial recusada.');

      setTokens(prev => ({ ...prev, [provider]: '' }));
      setNotice('Plugin conectado e credencial validada.');
      await refresh();
    } catch (e) {
      setError(e.message || 'Não foi possível conectar.');
    } finally {
      setBusy('');
    }
  }

  async function disconnect(provider) {
    setBusy(provider);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/plugins/' + provider + '/credentials', {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao desconectar.');

      setNotice('Plugin desconectado.');
      await refresh();
    } catch (e) {
      setError(e.message || 'Falha ao desconectar.');
    } finally {
      setBusy('');
    }
  }

  if (loading && !plugins.length) {
    return <main className="pluginsPage"><div className="pluginLoading">Carregando plugins…</div></main>;
  }

  return (
    <main className="pluginsPage">
      <div className="pluginsShell">
        <header className="pluginsHeader">
          <div>
            <a className="pluginsBack" href="/">← Felipe IA</a>
            <h1>Plugins</h1>
            <p>{connectedCount} de {plugins.length} conectados. Cada serviço usa autenticação separada.</p>
          </div>
        </header>

        <div className="pluginsSecurity">
          🔒 Tokens ficam criptografados em cookie HttpOnly. A Felipe IA recebe ferramentas autenticadas, não a credencial bruta.
        </div>

        {error && <div className="pluginError">{error}</div>}
        {notice && <div className="pluginSuccess">{notice}</div>}

        <section className="pluginsGrid">
          {plugins.map(plugin => (
            <article className="pluginCard" key={plugin.id}>
              <div className="pluginCardTop">
                <div className="pluginIcon">{plugin.icon}</div>
                <div className="pluginName">
                  <strong>{plugin.name}</strong>
                  <span>{plugin.auth === 'google-oauth' ? 'Google OAuth' : 'Credencial segura'}</span>
                </div>
                <span className={'pluginStatus ' + (plugin.connected ? 'connected' : '')}>
                  {plugin.connected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>

              <div className="pluginDescription">{plugin.description}</div>

              <div className="pluginCaps">
                {(plugin.capabilities || []).map(cap => <span key={cap}>{cap}</span>)}
              </div>

              <div className="pluginActions">
                {plugin.connected ? (
                  <button className="pluginBtn danger" disabled={busy === plugin.id} onClick={() => disconnect(plugin.id)}>
                    {busy === plugin.id ? 'Desconectando…' : 'Desconectar'}
                  </button>
                ) : plugin.auth === 'google-oauth' ? (
                  plugin.oauthReady ? (
                    <a className="pluginBtn primary" href={'/api/plugins/' + plugin.id + '/connect'}>
                      Conectar com Google
                    </a>
                  ) : (
                    <span className="pluginHelp">
                      OAuth Google ainda não configurado no projeto.
                    </span>
                  )
                ) : TOKEN_PLUGINS.has(plugin.id) ? (
                  <div className="pluginTokenRow">
                    <input
                      type="password"
                      autoComplete="off"
                      value={tokens[plugin.id] || ''}
                      placeholder={
                        plugin.id === 'github' ? 'GitHub fine-grained token' :
                        plugin.id === 'vercel' ? 'Vercel token' :
                        'Neon API key'
                      }
                      onChange={e => setTokens(prev => ({ ...prev, [plugin.id]: e.target.value }))}
                    />
                    <button
                      className="pluginBtn primary"
                      disabled={busy === plugin.id || !String(tokens[plugin.id] || '').trim()}
                      onClick={() => saveToken(plugin.id)}
                    >
                      {busy === plugin.id ? 'Validando…' : 'Conectar'}
                    </button>
                  </div>
                ) : null}
              </div>

              {!plugin.sessionReady && (
                <div className="pluginHelp">O segredo interno de criptografia ainda não está configurado.</div>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
