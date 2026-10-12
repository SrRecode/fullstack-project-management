import { randomUUID } from 'node:crypto';

export const STATUSES = ['todo', 'doing', 'done'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${field} is required`);
  }
  return value.trim();
}

function optionalEnum(value, allowed, field) {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} must be an ISO date like 2026-01-31`);
  }
  return value;
}

function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false;
  return task.dueDate < new Date().toISOString().slice(0, 10);
}

export function createStore() {
  const projects = new Map();
  const tasks = new Map();

  function tasksOf(projectId) {
    return [...tasks.values()].filter((task) => task.projectId === projectId);
  }

  function projectSummary(project) {
    const list = tasksOf(project.id);
    return {
      ...project,
      taskCount: list.length,
      doneCount: list.filter((task) => task.status === 'done').length,
      overdueCount: list.filter(isOverdue).length,
    };
  }

  return {
    // --- projects ---
    createProject({ name, description, color } = {}) {
      const now = new Date().toISOString();
      const project = {
        id: randomUUID(),
        name: requireText(name, 'name'),
        description: typeof description === 'string' ? description.trim() : '',
        color: typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f46e5',
        createdAt: now,
        updatedAt: now,
      };
      projects.set(project.id, project);
      return project;
    },

    listProjects() {
      return [...projects.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(projectSummary);
    },

    getProject(id) {
      const project = projects.get(id);
      return project ? projectSummary(project) : null;
    },

    updateProject(id, patch = {}) {
      const project = projects.get(id);
      if (!project) throw notFound('Project not found');
      if (patch.name !== undefined) project.name = requireText(patch.name, 'name');
      if (patch.description !== undefined) project.description = String(patch.description).trim();
      if (patch.color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw badRequest('color must be a hex color like #4f46e5');
        project.color = patch.color;
      }
      project.updatedAt = new Date().toISOString();
      return projectSummary(project);
    },

    removeProject(id) {
      if (!projects.has(id)) throw notFound('Project not found');
      for (const task of tasksOf(id)) tasks.delete(task.id);
      projects.delete(id);
      return true;
    },

    // --- tasks ---
    createTask(projectId, { title, description, status, priority, assignee, dueDate } = {}) {
      if (!projects.has(projectId)) throw notFound('Project not found');
      const now = new Date().toISOString();
      const task = {
        id: randomUUID(),
        projectId,
        title: requireText(title, 'title'),
        description: typeof description === 'string' ? description.trim() : '',
        status: optionalEnum(status, STATUSES, 'status') ?? 'todo',
        priority: optionalEnum(priority, PRIORITIES, 'priority') ?? 'medium',
        assignee: typeof assignee === 'string' ? assignee.trim() : '',
        dueDate: optionalDate(dueDate, 'dueDate') ?? null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      if (task.status === 'done') task.completedAt = now;
      tasks.set(task.id, task);
      return task;
    },

    getTask(id) {
      return tasks.get(id) ?? null;
    },

    listTasks(filters = {}) {
      let result = [...tasks.values()];
      if (filters.projectId !== undefined) result = result.filter((t) => t.projectId === filters.projectId);
      if (filters.status !== undefined) result = result.filter((t) => t.status === filters.status);
      if (filters.priority !== undefined) result = result.filter((t) => t.priority === filters.priority);
      if (typeof filters.assignee === 'string' && filters.assignee.trim() !== '') {
        const needle = filters.assignee.trim().toLowerCase();
        result = result.filter((t) => t.assignee.toLowerCase().includes(needle));
      }
      if (typeof filters.q === 'string' && filters.q.trim() !== '') {
        const needle = filters.q.trim().toLowerCase();
        result = result.filter(
          (t) => t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle),
        );
      }
      const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sort = filters.sort ?? 'created';
      result.sort((a, b) => {
        if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority];
        if (sort === 'due') return String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999'));
        if (sort === 'title') return a.title.localeCompare(b.title);
        return b.createdAt.localeCompare(a.createdAt);
      });
      return result.map((task) => ({ ...task, overdue: isOverdue(task) }));
    },

    updateTask(id, patch = {}) {
      const task = tasks.get(id);
      if (!task) throw notFound('Task not found');
      if (patch.title !== undefined) task.title = requireText(patch.title, 'title');
      if (patch.description !== undefined) task.description = String(patch.description).trim();
      if (patch.priority !== undefined) task.priority = optionalEnum(patch.priority, PRIORITIES, 'priority');
      if (patch.assignee !== undefined) task.assignee = typeof patch.assignee === 'string' ? patch.assignee.trim() : '';
      if (patch.dueDate !== undefined) task.dueDate = optionalDate(patch.dueDate, 'dueDate') ?? null;
      if (patch.status !== undefined) {
        task.status = optionalEnum(patch.status, STATUSES, 'status');
        task.completedAt = task.status === 'done' ? new Date().toISOString() : null;
      }
      task.updatedAt = new Date().toISOString();
      return { ...task, overdue: isOverdue(task) };
    },

    moveTask(id, status) {
      return this.updateTask(id, { status });
    },

    removeTask(id) {
      if (!tasks.has(id)) throw notFound('Task not found');
      tasks.delete(id);
      return true;
    },

    stats() {
      const list = [...tasks.values()];
      const byStatus = { todo: 0, doing: 0, done: 0 };
      const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
      for (const task of list) {
        byStatus[task.status] += 1;
        byPriority[task.priority] += 1;
      }
      return {
        projects: projects.size,
        tasks: list.length,
        overdue: list.filter(isOverdue).length,
        byStatus,
        byPriority,
      };
    },
  };
}
