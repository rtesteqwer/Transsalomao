import { jsonSchema, tool } from 'ai';
import { getGoogleAccessToken, readPluginCredential } from './plugin-auth.js';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 1200) };
  }

  if (!response.ok) {
    const message = data?.message || data?.error?.message || data?.error || ('HTTP ' + response.status);
    throw new Error(String(message).slice(0, 500));
  }

  return data;
}

function bearer(token, extra = {}) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json',
    ...extra
  };
}

function headerMap(payload) {
  const result = {};
  for (const item of Array.isArray(payload?.headers) ? payload.headers : []) {
    if (item?.name) result[String(item.name).toLowerCase()] = String(item.value || '');
  }
  return result;
}

function decodeBase64Url(value) {
  if (!value) return '';
  try {
    return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function gmailBody(payload) {
  if (!payload) return '';
  if (payload?.body?.data) return decodeBase64Url(payload.body.data).slice(0, 12000);

  for (const part of payload?.parts || []) {
    if (part?.mimeType === 'text/plain' && part?.body?.data) {
      return decodeBase64Url(part.body.data).slice(0, 12000);
    }
  }

  for (const part of payload?.parts || []) {
    const nested = gmailBody(part);
    if (nested) return nested;
  }

  return '';
}

async function gmailTools() {
  const token = await getGoogleAccessToken('gmail');
  if (!token) return {};

  return {
    searchGmail: tool({
      description: 'Pesquisa mensagens na conta Gmail conectada usando a sintaxe de busca do Gmail. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Busca Gmail, por exemplo: newer_than:7d from:empresa.com' },
          limit: { type: 'integer', minimum: 1, maximum: 10 }
        },
        required: ['query'],
        additionalProperties: false
      }),
      execute: async ({ query, limit = 8 }) => {
        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
        url.searchParams.set('q', String(query || ''));
        url.searchParams.set('maxResults', String(Math.min(10, Math.max(1, Number(limit) || 8))));
        const result = await fetchJson(url.toString(), { headers: bearer(token) });
        const items = Array.isArray(result?.messages) ? result.messages : [];

        return Promise.all(items.map(async item => {
          const detailUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(item.id));
          detailUrl.searchParams.set('format', 'metadata');
          for (const name of ['Subject', 'From', 'Date']) detailUrl.searchParams.append('metadataHeaders', name);
          const detail = await fetchJson(detailUrl.toString(), { headers: bearer(token) });
          const headers = headerMap(detail?.payload);

          return {
            id: detail.id,
            threadId: detail.threadId,
            subject: headers.subject || '',
            from: headers.from || '',
            date: headers.date || '',
            snippet: detail.snippet || ''
          };
        }));
      }
    }),

    readGmailMessage: tool({
      description: 'Lê uma mensagem Gmail específica pelo ID. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'ID da mensagem Gmail.' }
        },
        required: ['messageId'],
        additionalProperties: false
      }),
      execute: async ({ messageId }) => {
        const data = await fetchJson(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(String(messageId)) + '?format=full',
          { headers: bearer(token) }
        );
        const headers = headerMap(data?.payload);

        return {
          id: data.id,
          threadId: data.threadId,
          subject: headers.subject || '',
          from: headers.from || '',
          to: headers.to || '',
          date: headers.date || '',
          snippet: data.snippet || '',
          body: gmailBody(data?.payload)
        };
      }
    })
  };
}

async function youtubeTools() {
  const token = await getGoogleAccessToken('youtube');
  if (!token) return {};

  return {
    searchYouTube: tool({
      description: 'Pesquisa vídeos no YouTube usando a conta Google conectada. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termos de busca no YouTube.' },
          limit: { type: 'integer', minimum: 1, maximum: 10 }
        },
        required: ['query'],
        additionalProperties: false
      }),
      execute: async ({ query, limit = 5 }) => {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('type', 'video');
        url.searchParams.set('q', String(query || ''));
        url.searchParams.set('maxResults', String(Math.min(10, Math.max(1, Number(limit) || 5))));
        const data = await fetchJson(url.toString(), { headers: bearer(token) });

        return (data?.items || []).map(item => ({
          videoId: item?.id?.videoId,
          title: item?.snippet?.title,
          channelTitle: item?.snippet?.channelTitle,
          publishedAt: item?.snippet?.publishedAt,
          description: String(item?.snippet?.description || '').slice(0, 500)
        }));
      }
    })
  };
}

async function githubTools() {
  const credential = await readPluginCredential('github');
  const token = credential?.accessToken;
  if (!token) return {};

  const headers = bearer(token, {
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Felipe-IA'
  });

  return {
    listGitHubRepositories: tool({
      description: 'Lista repositórios GitHub acessíveis pela credencial conectada. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 30 }
        },
        additionalProperties: false
      }),
      execute: async ({ limit = 15 } = {}) => {
        const data = await fetchJson(
          'https://api.github.com/user/repos?sort=updated&per_page=' + Math.min(30, Math.max(1, Number(limit) || 15)),
          { headers }
        );

        return (Array.isArray(data) ? data : []).map(repo => ({
          name: repo.full_name,
          private: Boolean(repo.private),
          defaultBranch: repo.default_branch,
          updatedAt: repo.updated_at,
          url: repo.html_url
        }));
      }
    }),

    readGitHubFile: tool({
      description: 'Lê um arquivo de texto de um repositório GitHub acessível. Não altera arquivos.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repositório no formato owner/name.' },
          path: { type: 'string', description: 'Caminho do arquivo dentro do repositório.' },
          ref: { type: 'string', description: 'Branch, tag ou commit opcional.' }
        },
        required: ['repository', 'path'],
        additionalProperties: false
      }),
      execute: async ({ repository, path, ref }) => {
        const safeRepo = String(repository || '').trim();
        const safePath = String(path || '').replace(/^\/+/, '');

        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(safeRepo)) {
          throw new Error('Repositório inválido.');
        }

        const url = new URL(
          'https://api.github.com/repos/' +
          safeRepo +
          '/contents/' +
          safePath.split('/').map(encodeURIComponent).join('/')
        );
        if (ref) url.searchParams.set('ref', String(ref));

        const data = await fetchJson(url.toString(), { headers });
        if (data?.type !== 'file' || !data?.content) {
          throw new Error('O caminho não é um arquivo de texto legível.');
        }

        const full = Buffer.from(String(data.content).replace(/\n/g, ''), 'base64').toString('utf8');
        return {
          repository: safeRepo,
          path: data.path,
          sha: data.sha,
          content: full.slice(0, 30000),
          truncated: full.length > 30000
        };
      }
    })
  };
}

async function vercelTools() {
  const credential = await readPluginCredential('vercel');
  const token = credential?.accessToken;
  if (!token) return {};

  return {
    listVercelProjects: tool({
      description: 'Lista projetos da conta Vercel conectada. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50 }
        },
        additionalProperties: false
      }),
      execute: async ({ limit = 20 } = {}) => {
        const data = await fetchJson(
          'https://api.vercel.com/v9/projects?limit=' + Math.min(50, Math.max(1, Number(limit) || 20)),
          { headers: bearer(token) }
        );

        return (data?.projects || []).map(project => ({
          id: project.id,
          name: project.name,
          framework: project.framework,
          updatedAt: project.updatedAt
        }));
      }
    }),

    listVercelDeployments: tool({
      description: 'Lista deployments recentes da Vercel. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ID ou nome do projeto, opcional.' },
          limit: { type: 'integer', minimum: 1, maximum: 30 }
        },
        additionalProperties: false
      }),
      execute: async ({ projectId = '', limit = 15 } = {}) => {
        const url = new URL('https://api.vercel.com/v6/deployments');
        url.searchParams.set('limit', String(Math.min(30, Math.max(1, Number(limit) || 15))));
        if (projectId) url.searchParams.set('projectId', String(projectId));

        const data = await fetchJson(url.toString(), { headers: bearer(token) });
        return (data?.deployments || []).map(item => ({
          id: item.uid || item.id,
          name: item.name,
          url: item.url ? 'https://' + item.url : null,
          state: item.state || item.readyState,
          target: item.target,
          createdAt: item.createdAt || item.created
        }));
      }
    })
  };
}

async function neonTools() {
  const credential = await readPluginCredential('neon');
  const token = credential?.accessToken;
  if (!token) return {};

  return {
    listNeonProjects: tool({
      description: 'Lista projetos Neon acessíveis pela API key conectada. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50 }
        },
        additionalProperties: false
      }),
      execute: async ({ limit = 20 } = {}) => {
        const data = await fetchJson(
          'https://console.neon.tech/api/v2/projects?limit=' + Math.min(50, Math.max(1, Number(limit) || 20)),
          { headers: bearer(token) }
        );

        return (data?.projects || []).map(project => ({
          id: project.id,
          name: project.name,
          regionId: project.region_id,
          pgVersion: project.pg_version,
          createdAt: project.created_at,
          updatedAt: project.updated_at
        }));
      }
    }),

    listNeonBranches: tool({
      description: 'Lista branches de um projeto Neon. Somente leitura.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ID do projeto Neon.' }
        },
        required: ['projectId'],
        additionalProperties: false
      }),
      execute: async ({ projectId }) => {
        const id = encodeURIComponent(String(projectId || '').trim());
        const data = await fetchJson(
          'https://console.neon.tech/api/v2/projects/' + id + '/branches',
          { headers: bearer(token) }
        );

        return (data?.branches || []).map(branch => ({
          id: branch.id,
          name: branch.name,
          parentId: branch.parent_id,
          currentState: branch.current_state,
          primary: Boolean(branch.primary),
          createdAt: branch.created_at
        }));
      }
    })
  };
}

export async function getPluginTools() {
  const [gmail, youtube, github, vercel, neon] = await Promise.all([
    gmailTools(),
    youtubeTools(),
    githubTools(),
    vercelTools(),
    neonTools()
  ]);

  return {
    ...gmail,
    ...youtube,
    ...github,
    ...vercel,
    ...neon
  };
}
