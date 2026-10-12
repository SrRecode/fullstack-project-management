import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStore } from '../src/store.js';
import { createServer } from '../src/app.js';
import { contentType, safeJoin } from '../src/static.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

describe('store', () => {
  test('creates a project with defaults and a valid hex color', () => {
    const store = createStore();
    const project = store.createProject({ name: '  Apollo  ', color: 'not-a-color' });
    assert.equal(project.name, 'Apollo');
    assert.equal(project.color, '#4f46e5');
  });

  test('rejects a project without a name', () => {
    const store = createStore();
    assert.throws(() => store.createProject({}), /name is required/);
  });

  test('rejects an invalid task status', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    assert.throws(() => store.createTask(project.id, { title: 'T', status: 'nope' }), /status must be one of/);
  });

  test('rejects a malformed due date', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    assert.throws(() => store.createTask(project.id, { title: 'T', dueDate: 'tomorrow' }), /ISO date/);
  });

  test('completing a task stamps completedAt, reopening clears it', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    const task = store.createTask(project.id, { title: 'Ship it' });
    assert.equal(task.completedAt, null);
    const done = store.moveTask(task.id, 'done');
    assert.ok(done.completedAt);
    const reopened = store.moveTask(task.id, 'doing');
    assert.equal(reopened.completedAt, null);
  });

  test('flags overdue tasks (past due, not done)', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    store.createTask(project.id, { title: 'Late', dueDate: '2000-01-01' });
    store.createTask(project.id, { title: 'Finished late', dueDate: '2000-01-01', status: 'done' });
    const tasks = store.listTasks();
    assert.equal(tasks.find((t) => t.title === 'Late').overdue, true);
    assert.equal(tasks.find((t) => t.title === 'Finished late').overdue, false);
    assert.equal(store.stats().overdue, 1);
  });

  test('filters tasks by status and searches title/description', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    store.createTask(project.id, { title: 'Design landing', status: 'doing' });
    store.createTask(project.id, { title: 'Write docs', description: 'cover the landing page' });
    assert.equal(store.listTasks({ status: 'doing' }).length, 1);
    assert.equal(store.listTasks({ q: 'landing' }).length, 2);
  });

  test('sorts tasks by priority', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    store.createTask(project.id, { title: 'Low', priority: 'low' });
    store.createTask(project.id, { title: 'Urgent', priority: 'urgent' });
    const titles = store.listTasks({ sort: 'priority' }).map((t) => t.title);
    assert.deepEqual(titles, ['Urgent', 'Low']);
  });

  test('deleting a project cascades to its tasks', () => {
    const store = createStore();
    const project = store.createProject({ name: 'P' });
    store.createTask(project.id, { title: 'A' });
    store.removeProject(project.id);
    assert.equal(store.listTasks({ projectId: project.id }).length, 0);
    assert.equal(store.getProject(project.id), null);
  });

  test('unknown ids throw a 404-shaped error', () => {
    const store = createStore();
    assert.throws(() => store.updateProject('nope', { name: 'x' }), (e) => e.status === 404);
    assert.throws(() => store.removeTask('nope'), (e) => e.status === 404);
  });
});

describe('static helpers', () => {
  test('contentType maps extensions and rejects traversal', () => {
    assert.match(contentType('a.css'), /text\/css/);
    const base = join(here, '..');
    assert.equal(safeJoin(base, '/../../etc/passwd'), null);
  });
});

describe('http api', () => {
  let server;
  let base;
  let projectId;

  before(async () => {
    server = createServer(undefined, { publicDir });
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((r) => server.close(r));
  });

  const json = async (path, options) => {
    const res = await fetch(base + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };

  test('health endpoint', async () => {
    const { status, body } = await json('/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });

  test('create + list projects', async () => {
    const created = await json('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Website revamp' }) });
    assert.equal(created.status, 201);
    projectId = created.body.project.id;
    const list = await json('/api/projects');
    assert.equal(list.status, 200);
    assert.ok(list.body.projects.some((p) => p.id === projectId));
  });

  test('create + move + delete a task', async () => {
    const created = await json(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Draft hero', priority: 'high' }),
    });
    assert.equal(created.status, 201);
    const taskId = created.body.task.id;

    const moved = await json(`/api/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify({ status: 'done' }) });
    assert.equal(moved.body.task.status, 'done');

    const del = await json(`/api/tasks/${taskId}`, { method: 'DELETE' });
    assert.equal(del.status, 204);

    const gone = await json(`/api/tasks/${taskId}`);
    assert.equal(gone.status, 404);
  });

  test('validation and routing errors', async () => {
    const noName = await json('/api/projects', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(noName.status, 400);

    const badJson = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(badJson.status, 400);

    const missing = await json('/api/projects/does-not-exist');
    assert.equal(missing.status, 404);

    const method = await json('/api/projects', { method: 'DELETE' });
    assert.equal(method.status, 405);
  });

  test('stats reflect created data', async () => {
    await json(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify({ title: 'X', dueDate: '2000-01-01' }) });
    const { status, body } = await json('/api/stats');
    assert.equal(status, 200);
    assert.ok(body.stats.tasks >= 1);
    assert.ok(body.stats.overdue >= 1);
  });

  test('serves the frontend at / with the right content types', async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);

    const css = await fetch(`${base}/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);

    const js = await fetch(`${base}/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);

    const missing = await fetch(`${base}/nope.js`);
    assert.equal(missing.status, 404);
  });
});
