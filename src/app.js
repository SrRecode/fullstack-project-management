import http from 'node:http';
import { createStore } from './store.js';
import { serveStatic, sendText } from './static.js';

const MAX_BODY_BYTES = 64 * 1024;

function send(res, status, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('Body must be a JSON object'), { status: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createHandler(store = createStore(), options = {}) {
  const publicDir = options.publicDir;

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;
      const method = req.method ?? 'GET';
      const q = Object.fromEntries(url.searchParams.entries());

      if (pathname.startsWith('/api/')) {
        // --- health & stats ---
        if (pathname === '/api/health' && method === 'GET') {
          return send(res, 200, { status: 'ok' });
        }
        if (pathname === '/api/stats' && method === 'GET') {
          return send(res, 200, { stats: store.stats() });
        }

        // --- projects collection ---
        if (pathname === '/api/projects') {
          if (method === 'GET') return send(res, 200, { projects: store.listProjects() });
          if (method === 'POST') return send(res, 201, { project: store.createProject(await readJson(req)) });
          return send(res, 405, { error: 'Method not allowed' });
        }

        // --- project tasks collection ---
        const projectTasks = pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
        if (projectTasks) {
          const projectId = decodeURIComponent(projectTasks[1]);
          if (method === 'GET') {
            if (!store.getProject(projectId)) return send(res, 404, { error: 'Project not found' });
            return send(res, 200, { tasks: store.listTasks({ ...q, projectId }) });
          }
          if (method === 'POST') {
            return send(res, 201, { task: store.createTask(projectId, await readJson(req)) });
          }
          return send(res, 405, { error: 'Method not allowed' });
        }

        // --- single project ---
        const project = pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (project) {
          const id = decodeURIComponent(project[1]);
          if (method === 'GET') {
            const found = store.getProject(id);
            if (!found) return send(res, 404, { error: 'Project not found' });
            return send(res, 200, { project: found });
          }
          if (method === 'PATCH' || method === 'PUT') {
            return send(res, 200, { project: store.updateProject(id, await readJson(req)) });
          }
          if (method === 'DELETE') {
            store.removeProject(id);
            return send(res, 204, undefined);
          }
          return send(res, 405, { error: 'Method not allowed' });
        }

        // --- tasks collection (all projects) ---
        if (pathname === '/api/tasks' && method === 'GET') {
          return send(res, 200, { tasks: store.listTasks(q) });
        }

        // --- task move ---
        const move = pathname.match(/^\/api\/tasks\/([^/]+)\/move$/);
        if (move) {
          if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
          const body = await readJson(req);
          return send(res, 200, { task: store.moveTask(decodeURIComponent(move[1]), body.status) });
        }

        // --- single task ---
        const task = pathname.match(/^\/api\/tasks\/([^/]+)$/);
        if (task) {
          const id = decodeURIComponent(task[1]);
          if (method === 'GET') {
            const found = store.getTask(id);
            if (!found) return send(res, 404, { error: 'Task not found' });
            return send(res, 200, { task: found });
          }
          if (method === 'PATCH' || method === 'PUT') {
            return send(res, 200, { task: store.updateTask(id, await readJson(req)) });
          }
          if (method === 'DELETE') {
            store.removeTask(id);
            return send(res, 204, undefined);
          }
          return send(res, 405, { error: 'Method not allowed' });
        }

        return send(res, 404, { error: 'Not found' });
      }

      // --- static frontend ---
      if (method === 'GET' && publicDir) {
        const handled = await serveStatic(publicDir, pathname, res);
        if (handled) return undefined;
      }
      return sendText(res, 404, 'Not found');
    } catch (error) {
      return send(res, error.status ?? 500, { error: error.message ?? 'Internal server error' });
    }
  };
}

export function createServer(store, options) {
  return http.createServer(createHandler(store, options));
}
