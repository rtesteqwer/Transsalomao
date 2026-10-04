import { get, put } from '@vercel/blob';

const TASKS_PATH = 'felipe-self-program-v1/tasks.json';
const MAX_TASKS = 120;

function blobOptions() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { access: 'private', token } : null;
}

function clean(value, max = 1800) {
  return String(value ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removido]')
    .replace(/\b(?:sk|ghp|github_pat|npg)_[A-Za-z0-9_-]{10,}\b/g, '[segredo removido]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{16,}\b/gi, 'Bearer [segredo removido]')
    .replace(/\b(senha|password|token|secret|api[-_ ]?key)\s*[:=]\s*\S+/gi, '$1=[segredo removido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function hash(value) {
  let h = 2166136261;
  const source = String(value || '');
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function readTasks() {
  const options = blobOptions();
  if (!options) return [];
  try {
    const result = await get(TASKS_PATH, { ...options, useCache: false });
    if (!result?.stream) return [];
    const parsed = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('not found')) return [];
    console.error('Felipe IA self-program read error:', error);
    return [];
  }
}

async function writeTasks(tasks) {
  const options = blobOptions();
  if (!options) return false;
  try {
    await put(
      TASKS_PATH,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        tasks: tasks.slice(-MAX_TASKS)
      }),
      {
        ...options,
        allowOverwrite: true,
        contentType: 'application/json'
      }
    );
    return true;
  } catch (error) {
    console.error('Felipe IA self-program write error:', error);
    return false;
  }
}

export function selfProgrammingEnabled() {
  return Boolean(blobOptions());
}

export function isSelfProgrammingRequest(text) {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;

  const target =
    /\b(felipe\s*ia|você|voce|si mesma|seu código|seu codigo|seu sistema|seu próprio código|seu proprio codigo)\b/i.test(value) ||
    /\b(auto[- ]?program|autoprogram|se auto program|se programar|auto evolu|se atualiz|se melhorar)\b/i.test(value);

  const action =
    /\b(program|codific|alter|modific|corrij|melhor|refator|implement|adicion|remov|atualiz|evolu|crie|criar|consert|otimiz)\w*/i.test(value);

  return target && action;
}

export async function enqueueSelfProgrammingTask({ request, userId }) {
  if (!selfProgrammingEnabled()) {
    return { enabled: false, queued: false, reason: 'storage_unavailable' };
  }

  const safeRequest = clean(request, 1800);
  if (!safeRequest) return { enabled: true, queued: false, reason: 'empty' };

  const source = hash(clean(userId || 'anonymous', 200));
  const id = 'sp_' + hash(safeRequest + '|' + source + '|' + Math.floor(Date.now() / 60000));
  const current = await readTasks();

  const duplicate = current.find(item =>
    item?.status === 'pending' &&
    item?.request === safeRequest
  );
  if (duplicate) {
    return { enabled: true, queued: true, taskId: duplicate.id, duplicate: true };
  }

  const next = [
    ...current,
    {
      id,
      request: safeRequest,
      source,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0
    }
  ];

  const saved = await writeTasks(next);
  return { enabled: true, queued: saved, taskId: saved ? id : null };
}

export async function listPendingSelfProgrammingTasks(limit = 1) {
  const tasks = await readTasks();
  return tasks
    .filter(item => item?.status === 'pending')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, Math.max(1, Math.min(5, Number(limit) || 1)));
}

export async function updateSelfProgrammingTask(id, patch = {}) {
  const tasks = await readTasks();
  const index = tasks.findIndex(item => item?.id === id);
  if (index < 0) return false;

  tasks[index] = {
    ...tasks[index],
    ...patch,
    id: tasks[index].id,
    updatedAt: Date.now()
  };

  return writeTasks(tasks);
}
