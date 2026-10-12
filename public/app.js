/** Vanilla-JS kanban frontend. Talks to the JSON API on the same origin. */

const STATUSES = ['todo', 'doing', 'done'];
const LABELS = { todo: 'To do', doing: 'Doing', done: 'Done' };

const api = {
  async request(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data;
  },
  listProjects: () => api.request('/api/projects'),
  createProject: (body) => api.request('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  listTasks: (projectId) => api.request(`/api/projects/${projectId}/tasks`),
  createTask: (projectId, body) =>
    api.request(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
  moveTask: (id, status) => api.request(`/api/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ status }) }),
  deleteTask: (id) => api.request(`/api/tasks/${id}`, { method: 'DELETE' }),
  stats: () => api.request('/api/stats'),
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const state = { projectId: null, tasks: [] };

async function refreshProjects() {
  const { projects } = await api.listProjects();
  const list = document.getElementById('project-list');
  list.replaceChildren();
  for (const project of projects) {
    const li = el('li');
    const btn = el('button', null);
    btn.type = 'button';
    btn.textContent = project.name;
    btn.setAttribute('aria-current', String(project.id === state.projectId));
    btn.addEventListener('click', () => selectProject(project.id));
    const meta = el('span', 'meta', `${project.doneCount}/${project.taskCount} done`);
    li.append(btn, meta);
    list.append(li);
  }
  return projects;
}

async function refreshStats() {
  const { stats } = await api.stats();
  document.getElementById('stats').textContent =
    `${stats.projects} projects · ${stats.tasks} tasks · ${stats.overdue} overdue`;
}

function taskCard(task) {
  const card = el('div', 'task');
  card.dataset.priority = task.priority;
  if (task.overdue) card.classList.add('overdue');
  card.append(el('div', 'title', task.title));
  const row = el('div', 'row');
  row.append(el('span', null, task.priority), el('span', 'due', task.dueDate ?? ''));
  card.append(row);

  const actions = el('div', 'actions');
  const idx = STATUSES.indexOf(task.status);
  if (idx > 0) actions.append(moveButton(task, STATUSES[idx - 1], `← ${LABELS[STATUSES[idx - 1]]}`));
  if (idx < STATUSES.length - 1) actions.append(moveButton(task, STATUSES[idx + 1], `${LABELS[STATUSES[idx + 1]]} →`));
  const del = el('button', 'ghost', 'Delete');
  del.addEventListener('click', async () => {
    await api.deleteTask(task.id);
    await loadBoard();
  });
  actions.append(del);
  card.append(actions);
  return card;
}

function moveButton(task, status, label) {
  const btn = el('button', 'ghost', label);
  btn.addEventListener('click', async () => {
    await api.moveTask(task.id, status);
    await loadBoard();
  });
  return btn;
}

function renderBoard() {
  const board = document.getElementById('board');
  board.replaceChildren();
  for (const status of STATUSES) {
    const column = el('div', 'column');
    column.dataset.status = status;
    const items = state.tasks.filter((t) => t.status === status);
    const header = el('h3');
    header.append(el('span', null, LABELS[status]), document.createTextNode(String(items.length)));
    column.append(header);
    const list = el('div', 'list');
    for (const task of items) list.append(taskCard(task));
    column.append(list);
    board.append(column);
  }
}

async function loadBoard() {
  if (!state.projectId) return;
  const { tasks } = await api.listTasks(state.projectId);
  state.tasks = tasks;
  renderBoard();
  await refreshProjects();
  await refreshStats();
}

async function selectProject(id) {
  state.projectId = id;
  document.getElementById('new-task').hidden = false;
  const projects = await refreshProjects();
  const current = projects.find((p) => p.id === id);
  document.getElementById('board-title').textContent = current ? current.name : 'Project';
  await loadBoard();
}

function wire() {
  document.getElementById('new-project').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = event.target.elements.name;
    if (!input.value.trim()) return;
    const { project } = await api.createProject({ name: input.value.trim() });
    input.value = '';
    await selectProject(project.id);
  });

  document.getElementById('new-task').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const title = form.elements.title.value.trim();
    if (!title || !state.projectId) return;
    await api.createTask(state.projectId, {
      title,
      priority: form.elements.priority.value,
      assignee: form.elements.assignee.value.trim(),
    });
    form.reset();
    await loadBoard();
  });

  refreshProjects().then((projects) => {
    if (projects[0]) selectProject(projects[0].id);
    refreshStats();
  });
}

if (typeof document !== 'undefined') {
  wire();
}
