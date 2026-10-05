import {
  googleOAuthReady,
  pluginSessionReady,
  readPluginCredential
} from './plugin-auth.js';

const CATALOG = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '✉️',
    description: 'Pesquisar e ler mensagens da sua conta Gmail.',
    capabilities: ['Pesquisar e-mails', 'Ler mensagens'],
    auth: 'google-oauth'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: '▶️',
    description: 'Pesquisar vídeos e consultar informações do YouTube.',
    capabilities: ['Pesquisar vídeos', 'Ler dados de vídeos'],
    auth: 'google-oauth'
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '⌘',
    description: 'Consultar repositórios e ler arquivos de código.',
    capabilities: ['Listar repositórios', 'Ler arquivos'],
    auth: 'token'
  },
  {
    id: 'vercel',
    name: 'Vercel',
    icon: '▲',
    description: 'Consultar projetos e deployments da sua conta Vercel.',
    capabilities: ['Listar projetos', 'Ver deployments'],
    auth: 'token'
  },
  {
    id: 'neon',
    name: 'Neon',
    icon: '◫',
    description: 'Consultar projetos e branches do Neon PostgreSQL.',
    capabilities: ['Listar projetos', 'Listar branches'],
    auth: 'token'
  }
];

export async function getPluginCatalog() {
  const sessionReady = pluginSessionReady();
  return Promise.all(CATALOG.map(async item => {
    const credential = await readPluginCredential(item.id);
    return {
      ...item,
      connected: Boolean(credential),
      oauthReady: item.auth === 'google-oauth' ? googleOAuthReady() : false,
      sessionReady
    };
  }));
}
