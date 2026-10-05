'use client';

const plugins = [
  { id: 'gmail', icon: '✉️', name: 'Gmail', auth: 'Google OAuth', description: 'Pesquisar e ler e-mails com autorização da conta Google.', capabilities: ['Pesquisar e-mails', 'Ler mensagens'] },
  { id: 'youtube', icon: '▶️', name: 'YouTube', auth: 'Google OAuth', description: 'Pesquisar vídeos e consultar dados do YouTube.', capabilities: ['Pesquisar vídeos', 'Consultar vídeos'] },
  { id: 'github', icon: '⌘', name: 'GitHub', auth: 'OAuth / Token', description: 'Consultar repositórios e arquivos de código.', capabilities: ['Listar repositórios', 'Ler arquivos'] },
  { id: 'vercel', icon: '▲', name: 'Vercel', auth: 'Token seguro', description: 'Consultar projetos, deployments e estados.', capabilities: ['Listar projetos', 'Ver deployments'] },
  { id: 'neon', icon: '◫', name: 'Neon', auth: 'API key', description: 'Consultar projetos e branches do PostgreSQL Neon.', capabilities: ['Listar projetos', 'Listar branches'] }
];

export default function PluginsPage() {
  return (
    <main className="pluginsPage">
      <div className="pluginsShell">
        <header className="pluginsHeader">
          <div>
            <a className="pluginsBack" href="/">← Felipe IA</a>
            <h1>Plugins</h1>
            <p>Conecte serviços externos à Felipe IA com permissões separadas e credenciais protegidas no servidor.</p>
          </div>
        </header>

        <div className="pluginsSecurity">
          🔒 Credenciais não devem ficar no navegador nem ser enviadas ao modelo. Cada conector será autenticado pelo backend da Felipe IA.
        </div>

        <section className="pluginsGrid">
          {plugins.map(plugin => (
            <article className="pluginCard" key={plugin.id}>
              <div className="pluginCardTop">
                <div className="pluginIcon">{plugin.icon}</div>
                <div className="pluginName">
                  <strong>{plugin.name}</strong>
                  <span>{plugin.auth}</span>
                </div>
                <span className="pluginStatus">Preparado</span>
              </div>

              <div className="pluginDescription">{plugin.description}</div>

              <div className="pluginCaps">
                {plugin.capabilities.map(cap => <span key={cap}>{cap}</span>)}
              </div>

              <div className="pluginHelp">
                A autenticação deste conector será ativada no backend antes de permitir acesso aos dados.
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
