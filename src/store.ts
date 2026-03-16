import { reactive, computed } from 'vue';
import { getDb, Task } from './db';

// 任务状态常量
export const TaskStatus = {
  PENDING: 'pending',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  SKIPPED: 'skipped'
} as const;

// 优先级常量
export const Priority = {
  URGENT_IMPORTANT: 0,
  IMPORTANT: 1,
  URGENT: 2,
  NORMAL: 3
} as const;

export const state = reactive({
  tasks: [] as Task[],
  loading: false,
});

export const actions = {
  async fetchTasks() {
    state.loading = true;
    const db = await getDb();
    state.tasks = await db.select<Task[]>('SELECT * FROM tasks ORDER BY priority ASC, deadline ASC');
    state.loading = false;
  },

  async fetchTasksByDate(date: string) {
    state.loading = true;
    const db = await getDb();
    // SQLite stores DATETIME as TEXT, so we can compare strings
    state.tasks = await db.select<Task[]>(
      'SELECT * FROM tasks WHERE strftime("%Y-%m-%d", deadline) = ? ORDER BY deadline ASC',
      [date]
    );
    state.loading = false;
  },

  async addTask(task: Omit<Task, 'id' | 'created_at' | 'status'>) {
    const db = await getDb();
    await db.execute(
      'INSERT INTO tasks (title, description, parent_id, deadline, priority) VALUES (?, ?, ?, ?, ?)',
      [task.title, task.description || '', task.parent_id, task.deadline, task.priority]
    );
    await this.fetchTasks();
  },

  async toggleComplete(id: number, currentStatus: string) {
    const db = await getDb();
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    await db.execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, id]);
    // 直接更新本地状态，不触发重新加载
    const task = state.tasks.find(t => t.id === id);
    if (task) {
      task.status = newStatus;
    }
  },

  async deleteTask(id: number) {
    const db = await getDb();
    await db.execute('DELETE FROM tasks WHERE id = ?', [id]);
    await this.fetchTasks();
  },

  async snoozeOverdueTask(id: number, newDeadline: string) {
    const db = await getDb();
    await db.execute('UPDATE tasks SET deadline = ?, status = "pending" WHERE id = ?', [newDeadline, id]);
    await this.fetchTasks();
  },

  async updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'created_at'>>) {
    const db = await getDb();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.deadline !== undefined) { fields.push('deadline = ?'); values.push(updates.deadline); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(updates.parent_id); }
    if (updates.reminder_at !== undefined) { fields.push('reminder_at = ?'); values.push(updates.reminder_at); }

    if (fields.length > 0) {
      values.push(id);
      await db.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
      await this.fetchTasks();
    }
  }
};

// Panic Value Calculation (Higher = More Urgent)
function getPanicValue(task: Task): number {
  let score = (3 - task.priority) * 10;
  if (task.deadline) {
    const remaining = new Date(task.deadline).getTime() - Date.now();
    const hoursLeft = remaining / (1000 * 60 * 60);
    if (hoursLeft < 0) score += 100;
    else if (hoursLeft < 24) score += 50;
    else score += Math.max(0, 24 * 7 / hoursLeft);
  }
  return score;
}

export const smartSortedTasks = computed(() => {
  return [...state.tasks].sort((a, b) => getPanicValue(b) - getPanicValue(a));
});

export const overdueTasks = computed(() => {
  const now = Date.now();
  return state.tasks.filter(task =>
    task.deadline && new Date(task.deadline).getTime() < now && task.status !== 'completed' && task.status !== 'skipped'
  ).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
});

// Get parent tasks (tasks without parent_id)
export const parentTasks = computed(() => {
  return state.tasks.filter(task => task.parent_id === null);
});

// Get subtasks for a specific parent task
export function getSubtasks(parentId: number): Task[] {
  return state.tasks.filter(task => task.parent_id === parentId);
}
