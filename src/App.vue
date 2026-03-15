<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { state, actions, smartSortedTasks, overdueTasks, getSubtasks } from "./store";
import type { Task } from "./db";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { checkAndSendNotifications } from "./notification";
import { register } from "@tauri-apps/plugin-global-shortcut";

const newTaskTitle = ref("");
const newTask描述 = ref("");
const newTask截止日期 = ref<string | null>(null);
const newTask优先级 = ref(3);

const addingSubtaskToTaskId = ref<number | null>(null);
const newSubtaskTitle = ref("");
const newSubtaskDescription = ref("");
const newSubtaskDeadline = ref<string | null>(null);
const newSubtaskPriority = ref(3);

const isEditModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const editTitle = ref("");
const edit描述 = ref("");
const edit截止日期 = ref<string | null>(null);
const edit优先级 = ref(3);

const isAlwaysOnTop = ref(false);
const isIgnoringCursorEvents = ref(false);
const isDarkMode = ref(false);

const startDrag = async (event: MouseEvent) => {
  if (event.button === 0) {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    } catch (e) {
      console.error('Drag error:', e);
    }
  }
};

const selectedDate = ref(new Date().toISOString().split('T')[0]);

const taskStats = computed(() => {
  const allTasks = state.tasks;
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  const pending = allTasks.filter(t => t.status === 'pending').length;
  const overdue = overdueTasks.value.length;
  return { total, completed, pending, overdue };
});

onMounted(async () => {
  actions.fetchTasks();
  setInterval(checkAndSendNotifications, 5 * 60 * 1000);
  registerEscapeShortcut();

  // Listen for global shortcut to exit passthrough mode
  listen("exit-passthrough", async () => {
    if (isIgnoringCursorEvents.value) {
      isIgnoringCursorEvents.value = false;
      await invoke("set_ignore_cursor_events", { ignore: false });
    }
  });
});

async function registerEscapeShortcut() {
  try {
    await register("Escape", async () => {
      if (isIgnoringCursorEvents.value) {
        isIgnoringCursorEvents.value = false;
        await invoke("set_ignore_cursor_events", { ignore: false });
      }
    });
  } catch (e) {
    console.error("Failed to register escape shortcut:", e);
  }
}

watch(selectedDate, (newDate) => {
  if (newDate) {
    actions.fetchTasksByDate(newDate);
  } else {
    actions.fetchTasks();
  }
});

const displayedTasks = computed(() => {
  return smartSortedTasks.value.filter(task => task.status !== 'completed' && task.status !== 'skipped');
});

async function addTask() {
  if (newTaskTitle.value.trim()) {
    await actions.addTask({
      title: newTaskTitle.value.trim(),
      description: newTask描述.value.trim() || null,
      deadline: newTask截止日期.value,
      priority: newTask优先级.value,
      parent_id: null,
      reminder_at: null,
    });
    newTaskTitle.value = "";
    newTask描述.value = "";
    newTask截止日期.value = null;
    newTask优先级.value = 3;
  }
}

async function toggleComplete(task: Task) {
  await actions.toggleComplete(task.id, task.status);
}

async function deleteTask(id: number) {
  await actions.deleteTask(id);
}

async function snoozeTask(task: Task, days: number) {
  const new截止日期 = new Date();
  new截止日期.setDate(new截止日期.getDate() + days);
  await actions.snoozeOverdueTask(task.id, new截止日期.toISOString());
}

async function toggleAlwaysOnTop() {
  isAlwaysOnTop.value = !isAlwaysOnTop.value;
  await invoke("set_always_on_top", { alwaysOnTop: isAlwaysOnTop.value });
}

async function toggleIgnoreCursorEvents() {
  isIgnoringCursorEvents.value = !isIgnoringCursorEvents.value;
  await invoke("set_ignore_cursor_events", { ignore: isIgnoringCursorEvents.value });
}

async function closeWindow() {
  await invoke("close_window");
}

async function minimizeWindow() {
  await invoke("minimize_window");
}

async function toggleMaximize() {
  await invoke("toggle_maximize");
}

function openEditModal(task: Task) {
  editingTask.value = task;
  editTitle.value = task.title;
  edit描述.value = task.description || "";
  edit截止日期.value = task.deadline;
  edit优先级.value = task.priority;
  isEditModalOpen.value = true;
}

async function saveEdit() {
  if (editingTask.value && editTitle.value.trim()) {
    await actions.updateTask(editingTask.value.id, {
      title: editTitle.value.trim(),
      description: edit描述.value.trim() || null,
      deadline: edit截止日期.value,
      priority: edit优先级.value,
    });
    closeEditModal();
  }
}

function closeEditModal() {
  isEditModalOpen.value = false;
  editingTask.value = null;
}

function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

const expandedTaskIds = ref<Set<number>>(new Set());

function toggleSubtasks(taskId: number) {
  if (expandedTaskIds.value.has(taskId)) {
    expandedTaskIds.value.delete(taskId);
  } else {
    expandedTaskIds.value.add(taskId);
  }
}

function isSubtasksExpanded(taskId: number): boolean {
  return expandedTaskIds.value.has(taskId);
}

function showAddSubtask(taskId: number) {
  addingSubtaskToTaskId.value = taskId;
  newSubtaskTitle.value = "";
  newSubtaskDescription.value = "";
  newSubtaskDeadline.value = null;
  newSubtaskPriority.value = 3;
}

function hideAddSubtask() {
  addingSubtaskToTaskId.value = null;
}

async function addSubtask(parentId: number) {
  if (newSubtaskTitle.value.trim()) {
    await actions.addTask({
      title: newSubtaskTitle.value.trim(),
      description: newSubtaskDescription.value.trim() || null,
      deadline: newSubtaskDeadline.value,
      priority: newSubtaskPriority.value,
      parent_id: parentId,
      reminder_at: null,
    });
    hideAddSubtask();
  }
}

function getTaskSubtasks(parentId: number): Task[] {
  return getSubtasks(parentId);
}

const priorityLabels = ['紧急且重要', '重要', '紧急', '普通'];
</script>

<template>
  <main class="w-full h-screen overflow-hidden" :class="isDarkMode ? 'dark' : ''">
    <!-- 完全透明的背景，让桌面透出来 -->
    <!-- 深色/浅色模式只影响UI组件的颜色，不改变背景 -->

    <div class="w-full h-full overflow-y-auto px-4 pb-4 pt-8">
      <!-- Custom Title Bar -->
      <div
        class="fixed top-0 left-0 right-0 h-8 backdrop-blur-xl bg-white/30 dark:bg-black/30 flex items-center justify-between px-4 z-[9999] select-none border-b border-white/10 dark:border-white/10"
        :class="{ 'pointer-events-auto': isIgnoringCursorEvents }"
        :style="isIgnoringCursorEvents ? 'pointer-events: auto;' : ''"
      >
        <!-- 双击标题栏退出穿透模式 -->
        <div class="absolute inset-0 cursor-move" @mousedown="startDrag" @dblclick="toggleIgnoreCursorEvents"></div>

        <div class="flex items-center space-x-2 relative z-10">
          <button @click="closeWindow" class="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-all duration-200" title="关闭">
            <svg class="w-2 h-2 text-white opacity-70 hover:opacity-100 transition-opacity" viewBox="0 0 8 8" fill="none">
              <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          <button @click="minimizeWindow" class="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 flex items-center justify-center transition-all duration-200" title="最小化">
            <svg class="w-2 h-2 text-white opacity-70 hover:opacity-100 transition-opacity" viewBox="0 0 8 8" fill="none">
              <path d="M1 4h6" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          <button @click="toggleMaximize" class="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 flex items-center justify-center transition-all duration-200" title="最大化">
            <svg class="w-2 h-2 text-white opacity-70 hover:opacity-100 transition-opacity" viewBox="0 0 8 8" fill="none">
              <path d="M1 3v4h4M3 1h4v4" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
        </div>

        <span class="text-xs text-slate-700 dark:text-white/80 font-medium">待办事项</span>

        <div class="flex items-center space-x-2 relative z-10">
          <button @click="toggleDarkMode" class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200" :title="isDarkMode ? '浅色模式' : '深色模式'">
            <svg v-if="isDarkMode" class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
            </svg>
          </button>
          <button @click="toggleAlwaysOnTop" class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200" :class="isAlwaysOnTop ? 'bg-blue-500/20' : ''" :title="isAlwaysOnTop ? '取消置顶' : '置顶'">
            <svg class="w-4 h-4" :class="isAlwaysOnTop ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v2.5H6.75a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5V2.75z"/>
              <path fill-rule="evenodd" d="M5.573 4.317a.75.75 0 01.87-.493 6.5 6.5 0 019.335 1.977.75.75 0 01.87.493 8.5 8.5 0 01-11.072 0zM12.75 6.5a.75.75 0 00-1.5 0v3a.75.75 0 001.5 0v-3z" clip-rule="evenodd"/>
            </svg>
          </button>
          <button @click="toggleIgnoreCursorEvents" class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200" :class="isIgnoringCursorEvents ? 'bg-green-500/20' : ''" :title="isIgnoringCursorEvents ? '取消穿透' : '鼠标穿透'">
            <svg class="w-4 h-4" :class="isIgnoringCursorEvents ? 'text-green-500' : 'text-gray-500 dark:text-gray-400'" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H15.75c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-10.5c-.69 0-1.25-.56-1.25-1.25v-8.5zM5.75 4.5c-.69 0-1.25.56-1.25 1.25v.5a2 2 0 104 0v-.5c0-.69-.56-1.25-1.25-1.25h-2.5z" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="pt-8 max-w-2xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-3xl font-semibold text-slate-800 dark:text-white inline-block mb-2 drop-shadow-sm">待办事项</h1>
          <p class="text-slate-600 dark:text-slate-300 text-sm drop-shadow">高效管理您的每日任务</p>
        </div>

        <!-- Add Task Card - Glassmorphism -->
        <form @submit.prevent="addTask" class="mb-6 backdrop-blur-2xl bg-white/40 dark:bg-black/40 rounded-2xl p-5 border border-white/20 dark:border-white/10 shadow-2xl">
          <div class="mb-4">
            <input
              v-model="newTaskTitle"
              placeholder="添加新任务..."
              class="w-full px-4 py-3 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-white/50 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200"
              required
            />
          </div>
          <div class="mb-4">
            <textarea
              v-model="newTask描述"
              placeholder="添加描述（可选）..."
              rows="2"
              class="w-full px-4 py-3 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-white/50 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 resize-none"
            ></textarea>
          </div>
          <div class="flex gap-3 mb-4">
            <div class="flex-1">
              <input
                type="datetime-local"
                v-model="newTask截止日期"
                class="w-full px-4 py-3 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200"
              />
            </div>
            <select
              v-model.number="newTask优先级"
              class="px-4 py-3 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200"
            >
              <option :value="0">紧急且重要</option>
              <option :value="1">重要</option>
              <option :value="2">紧急</option>
              <option :value="3">普通</option>
            </select>
          </div>
          <button
            type="submit"
            class="w-full px-6 py-3 bg-gradient-to-r from-blue-500/80 to-indigo-500/80 dark:from-blue-600/80 dark:to-indigo-600/80 text-white font-medium rounded-xl hover:from-blue-500 hover:to-indigo-500 dark:hover:from-blue-500 dark:hover:to-indigo-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
          >
            添加任务
          </button>
        </form>

        <!-- Stats Grid - Glassmorphism -->
        <div class="grid grid-cols-4 gap-3 mb-6">
          <div class="backdrop-blur-2xl bg-white/30 dark:bg-white/10 rounded-2xl p-4 text-center border border-white/20 dark:border-white/10 shadow-lg">
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ taskStats.total }}</div>
            <div class="text-xs text-slate-700 dark:text-white/70">全部</div>
          </div>
          <div class="backdrop-blur-2xl bg-white/30 dark:bg-white/10 rounded-2xl p-4 text-center border border-white/20 dark:border-white/10 shadow-lg">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ taskStats.completed }}</div>
            <div class="text-xs text-slate-700 dark:text-white/70">已完成</div>
          </div>
          <div class="backdrop-blur-2xl bg-white/30 dark:bg-white/10 rounded-2xl p-4 text-center border border-white/20 dark:border-white/10 shadow-lg">
            <div class="text-2xl font-bold text-amber-500 dark:text-amber-400">{{ taskStats.pending }}</div>
            <div class="text-xs text-slate-700 dark:text-white/70">待处理</div>
          </div>
          <div class="backdrop-blur-2xl bg-white/30 dark:bg-white/10 rounded-2xl p-4 text-center border border-white/20 dark:border-white/10 shadow-lg">
            <div class="text-2xl font-bold text-red-500 dark:text-red-400">{{ taskStats.overdue }}</div>
            <div class="text-xs text-slate-700 dark:text-white/70">逾期</div>
          </div>
        </div>

        <!-- Date Filter - Glassmorphism -->
        <div class="mb-6 backdrop-blur-2xl bg-white/30 dark:bg-white/10 rounded-xl p-4 border border-white/20 dark:border-white/10 shadow-lg">
          <label class="block text-sm text-slate-700 dark:text-white/70 mb-2">筛选日期</label>
          <input
            type="date"
            v-model="selectedDate"
            class="w-full px-4 py-2.5 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200"
          />
        </div>

        <!-- Overdue Tasks - Glassmorphism -->
        <div v-if="overdueTasks.length > 0" class="mb-6 backdrop-blur-md bg-red-50/80 dark:bg-red-900/30 rounded-2xl p-5 border border-red-200/50 dark:border-red-800/50 shadow-lg shadow-red-500/10">
          <h2 class="text-lg font-semibold text-red-600 dark:text-red-400 mb-4 flex items-center">
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            逾期任务
          </h2>
          <div class="space-y-3">
            <div v-for="task in overdueTasks" :key="task.id" class="flex items-center justify-between p-3 backdrop-blur-md bg-white/70 dark:bg-slate-800/70 rounded-xl border border-white/30 dark:border-slate-700/50">
              <div class="flex-1 min-w-0">
                <span class="font-medium text-gray-900 dark:text-gray-100 truncate block">{{ task.title }}</span>
                <p class="text-xs text-rose-500">截止：{{ new Date(task.deadline!).toLocaleString() }}</p>
              </div>
              <div class="flex items-center space-x-2 ml-3">
                <button @click="snoozeTask(task, 1)" class="px-3 py-1.5 bg-amber-400 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition-colors">延后1天</button>
                <button @click="snoozeTask(task, 7)" class="px-3 py-1.5 bg-orange-400 text-white rounded-lg text-xs font-medium hover:bg-orange-500 transition-colors">延后7天</button>
                <button @click="deleteTask(task.id)" class="p-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg transition-colors">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Task List -->
        <div v-if="state.loading" class="text-center py-12 text-slate-700 dark:text-white/80">加载中...</div>
        <div v-else-if="displayedTasks.length === 0" class="text-center py-12">
          <div class="w-20 h-20 mx-auto mb-4 backdrop-blur-xl bg-white/20 dark:bg-white/10 rounded-full flex items-center justify-center border border-white/20 dark:border-white/10">
            <svg class="w-10 h-10 text-slate-600 dark:text-white/60" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
            </svg>
          </div>
          <p class="text-slate-700 dark:text-white/70">这一天没有任务，放松一下吧</p>
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="task in displayedTasks"
            :key="task.id"
            class="group backdrop-blur-2xl bg-white/30 dark:bg-white/10 rounded-2xl p-4 border border-white/20 dark:border-white/10 hover:border-blue-400/50 dark:hover:border-blue-400/30 hover:bg-white/50 dark:hover:bg-white/20 transition-all duration-200 shadow-lg"
            :class="{ 'opacity-50': task.status === 'completed' }"
          >
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                :checked="task.status === 'completed'"
                @change="toggleComplete(task)"
                class="mt-1 w-5 h-5 text-blue-600 dark:text-blue-400 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium text-slate-800 dark:text-white" :class="{ 'line-through': task.status === 'completed' }">{{ task.title }}</span>
                  <span class="px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm" :class="[
                    task.priority === 0 ? 'bg-red-100/60 text-red-600 dark:bg-red-900/40 dark:text-red-400' :
                    task.priority === 1 ? 'bg-orange-100/60 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400' :
                    task.priority === 2 ? 'bg-yellow-100/60 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400' :
                    'bg-slate-100/60 text-slate-600 dark:bg-white/10 dark:text-white/70'
                  ]">
                    {{ priorityLabels[task.priority] }}
                  </span>
                </div>
                <p v-if="task.description" class="text-sm text-slate-700 dark:text-white/70 mb-1 truncate">{{ task.description }}</p>
                <p v-if="task.deadline" class="text-xs text-slate-500 dark:text-white/50">截止：{{ new Date(task.deadline).toLocaleString() }}</p>
              </div>
              <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button @click="showAddSubtask(task.id)" class="p-2 text-green-600 dark:text-green-400 hover:bg-green-50/60 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="添加子任务">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button v-if="getTaskSubtasks(task.id).length > 0" @click="toggleSubtasks(task.id)" class="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50/60 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="查看子任务">
                  <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-180': isSubtasksExpanded(task.id) }" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button @click="openEditModal(task)" class="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="编辑">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                  </svg>
                </button>
                <button @click="deleteTask(task.id)" class="p-2 text-red-600 dark:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="删除">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Add Subtask Form -->
            <div v-if="addingSubtaskToTaskId === task.id" class="mt-3 ml-8 p-3 backdrop-blur-xl bg-white/60 dark:bg-black/60 rounded-xl border border-white/20 dark:border-white/10">
              <input
                v-model="newSubtaskTitle"
                placeholder="子任务标题"
                class="w-full px-3 py-2 mb-2 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-lg text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
                @keyup.enter="addSubtask(task.id)"
              />
              <div class="flex space-x-2">
                <button @click="addSubtask(task.id)" class="px-3 py-1.5 bg-green-500/80 text-white rounded-lg text-sm hover:bg-green-500 transition-colors">添加</button>
                <button @click="hideAddSubtask" class="px-3 py-1.5 bg-slate-400/80 text-white rounded-lg text-sm hover:bg-slate-500 transition-colors">取消</button>
              </div>
            </div>

            <!-- Subtasks -->
            <div v-if="isSubtasksExpanded(task.id) && getTaskSubtasks(task.id).length > 0" class="mt-3 ml-8 space-y-2">
              <div
                v-for="subtask in getTaskSubtasks(task.id)"
                :key="subtask.id"
                class="flex items-center gap-3 p-3 backdrop-blur-xl bg-white/30 dark:bg-white/10 rounded-xl border border-white/20 dark:border-white/10"
                :class="{ 'opacity-50': subtask.status === 'completed' }"
              >
                <input
                  type="checkbox"
                  :checked="subtask.status === 'completed'"
                  @change="toggleComplete(subtask)"
                  class="w-4 h-4 text-blue-600 dark:text-blue-400 rounded focus:ring-blue-500 cursor-pointer"
                />
                <span class="flex-1 text-sm text-slate-800 dark:text-white" :class="{ 'line-through': subtask.status === 'completed' }">{{ subtask.title }}</span>
                <button @click="deleteTask(subtask.id)" class="p-1 text-red-600 dark:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal - Glassmorphism -->
      <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
        <div class="backdrop-blur-2xl bg-white/60 dark:bg-black/60 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/20 dark:border-white/10">
          <h2 class="text-xl font-semibold text-slate-800 dark:text-white mb-5">编辑任务</h2>
          <div class="mb-4">
            <label class="block text-sm text-slate-700 dark:text-white/80 mb-1.5">标题</label>
            <input
              v-model="editTitle"
              class="w-full px-4 py-2.5 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all"
              required
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm text-slate-700 dark:text-white/80 mb-1.5">描述</label>
            <textarea
              v-model="edit描述"
              rows="2"
              class="w-full px-4 py-2.5 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all resize-none"
            ></textarea>
          </div>
          <div class="flex gap-3 mb-5">
            <div class="flex-1">
              <label class="block text-sm text-slate-700 dark:text-white/80 mb-1.5">截止日期</label>
              <input
                type="datetime-local"
                v-model="edit截止日期"
                class="w-full px-4 py-2.5 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all"
              />
            </div>
            <div class="flex-1">
              <label class="block text-sm text-slate-700 dark:text-white/80 mb-1.5">优先级</label>
              <select
                v-model.number="edit优先级"
                class="w-full px-4 py-2.5 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all"
              >
                <option :value="0">紧急且重要</option>
                <option :value="1">重要</option>
                <option :value="2">紧急</option>
                <option :value="3">普通</option>
              </select>
            </div>
          </div>
          <div class="flex gap-3">
            <button @click="saveEdit" class="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500/80 to-indigo-500/80 dark:from-blue-600/80 dark:to-indigo-600/80 text-white font-medium rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all backdrop-blur-sm">
              保存修改
            </button>
            <button @click="closeEditModal" class="flex-1 px-4 py-2.5 bg-white/50 dark:bg-white/10 text-slate-700 dark:text-white/80 font-medium rounded-xl hover:bg-white/70 dark:hover:bg-white/20 border border-white/20 dark:border-white/10 transition-all">
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.4);
  border-radius: 3px;
}

.dark ::-webkit-scrollbar-thumb {
  background: rgba(71, 85, 105, 0.4);
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.7);
}

/* Focus styles */
input:focus, select:focus, textarea:focus, button:focus {
  outline: none;
}

/* Smooth transitions */
* {
  transition-property: background-color, border-color, color, fill, stroke;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}
</style>
