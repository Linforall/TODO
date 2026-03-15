<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { state, actions, smartSortedTasks, overdueTasks, getSubtasks } from "./store";
import type { Task } from "./db";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { checkAndSendNotifications } from "./notification";
import { register } from "@tauri-apps/plugin-global-shortcut";

const newTaskTitle = ref("");
const newTask描述 = ref("");
const newTask截止日期 = ref<string | null>(null);
const newTask优先级 = ref(3); // Default to 普通

const addingSubtaskToTaskId = ref<number | null>(null);
const newSubtaskTitle = ref("");
const newSubtaskDescription = ref("");
const newSubtaskDeadline = ref<string | null>(null);
const newSubtaskPriority = ref(3);

// Edit task modal
const isEditModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const editTitle = ref("");
const edit描述 = ref("");
const edit截止日期 = ref<string | null>(null);
const edit优先级 = ref(3);

const isAlwaysOnTop = ref(false);
const isIgnoringCursorEvents = ref(false);
const isDarkMode = ref(false);

// Drag functionality
const startDrag = async (event: MouseEvent) => {
  // Only start dragging on left mouse button
  if (event.button === 0) {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    } catch (e) {
      console.error('Drag error:', e);
    }
  }
};

const selectedDate = ref(new Date().toISOString().split('T')[0]); // YYYY-MM-DD

// Task statistics
const taskStats = computed(() => {
  const allTasks = state.tasks;
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  const pending = allTasks.filter(t => t.status === 'pending').length;
  const overdue = overdueTasks.value.length;
  return { total, completed, pending, overdue };
});

onMounted(() => {
  actions.fetchTasks();
  // Check for notifications every 5 minutes
  setInterval(checkAndSendNotifications, 5 * 60 * 1000);

  // Register Escape key to exit穿透 mode
  registerEscapeShortcut();
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
    actions.fetchTasks(); // If no date selected, fetch all tasks
  }
});

const displayedTasks = computed(() => {
  // For now, we'll just show tasks based on the selected date filter, or all if no date selected.
  // The smartSortedTasks will apply sorting to the currently fetched tasks.
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

// Subtask functionality
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
</script>

<template>
  <main class="w-full h-screen overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
    <!-- Custom Title Bar (fixed, 高度 40px) -->
    <div
      class="fixed top-0 left-0 right-0 h-10 bg-gray-200 dark:bg-gray-800 flex items-center justify-between px-4 z-[9999] select-none"
      :class="{ 'pointer-events-auto': isIgnoringCursorEvents }"
      :style="isIgnoringCursorEvents ? 'pointer-events: auto;' : ''"
    >
      <!-- Drag Area -->
      <div class="absolute inset-0 cursor-move" @mousedown="startDrag"></div>

      <!-- Mac-style window buttons -->
      <div class="flex items-center space-x-2 relative z-10">
        <button @click="closeWindow" class="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center group" title="关闭">
          <svg class="w-2 h-2 text-red-800 opacity-0 group-hover:opacity-100" viewBox="0 0 8 8" fill="none">
            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button @click="minimizeWindow" class="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center group" title="最小化">
          <svg class="w-2 h-2 text-yellow-800 opacity-0 group-hover:opacity-100" viewBox="0 0 8 8" fill="none">
            <path d="M1 4h6" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button @click="toggleMaximize" class="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center group" title="最大化">
          <svg class="w-2 h-2 text-green-800 opacity-0 group-hover:opacity-100" viewBox="0 0 8 8" fill="none">
            <path d="M1 3v4h4M3 1h4v4" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 功能按钮栏 (fixed, 高度 40px, 位于 top-10) -->
    <div class="fixed top-10 left-0 right-0 h-10 bg-gray-100 dark:bg-gray-700 flex items-center justify-end px-4 space-x-2 z-[9998] select-none" @mousedown="startDrag">
      <button @click="toggleDarkMode" :class="[isDarkMode ? 'bg-purple-600' : 'bg-gray-400', 'text-white px-2 py-0.5 rounded text-xs']">
        {{ isDarkMode ? '深色' : '浅色' }}
      </button>
      <button @click="toggleAlwaysOnTop" :class="[isAlwaysOnTop ? 'bg-blue-600' : 'bg-gray-400', 'text-white px-2 py-0.5 rounded text-xs']">
        {{ isAlwaysOnTop ? '置顶' : '取消置顶' }}
      </button>
      <button @click="toggleIgnoreCursorEvents" :class="[isIgnoringCursorEvents ? 'bg-green-600' : 'bg-gray-400', 'text-white px-2 py-0.5 rounded text-xs']">
        {{ isIgnoringCursorEvents ? '穿透' : '取消穿透' }}
      </button>
    </div>

    <!-- Scrollable Content Area (从 top-20 开始) -->
    <div class="w-full h-full overflow-y-auto px-4 pb-4 pt-20">
      <h1 class="text-4xl font-bold mb-8 text-blue-600 dark:text-blue-400 text-center">待办事项</h1>

    <!-- 编辑任务 Modal -->
    <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">编辑任务</h2>
        <div class="mb-4">
          <label for="edit-title" class="block text-sm font-medium mb-1">标题</label>
          <input
            id="edit-title"
            v-model="editTitle"
            class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            required
          />
        </div>
        <div class="mb-4">
          <label for="edit-description" class="block text-sm font-medium mb-1">描述</label>
          <textarea
            id="edit-description"
            v-model="edit描述"
            rows="2"
            class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          ></textarea>
        </div>
        <div class="mb-4 flex space-x-4">
          <div class="flex-1">
            <label for="edit-deadline" class="block text-sm font-medium mb-1">截止日期</label>
            <input
              id="edit-deadline"
              type="datetime-local"
              v-model="edit截止日期"
              class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div class="flex-1">
            <label for="edit-priority" class="block text-sm font-medium mb-1">优先级</label>
            <select
              id="edit-priority"
              v-model.number="edit优先级"
              class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option :value="0">紧急且重要</option>
              <option :value="1">重要</option>
              <option :value="2">紧急</option>
              <option :value="3">普通</option>
            </select>
          </div>
        </div>
        <div class="flex space-x-3">
          <button @click="saveEdit" class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
            保存修改
          </button>
          <button @click="closeEditModal" class="flex-1 px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- New Task Input -->
    <form @submit.prevent="addTask" class="w-full mb-8 bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
      <div class="mb-4">
        <label for="title" class="block text-sm font-medium mb-1">标题</label>
        <input
          id="title"
          v-model="newTaskTitle"
          placeholder="需要做什么？"
          class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          required
        />
      </div>
      <div class="mb-4">
        <label for="description" class="block text-sm font-medium mb-1">描述 (可选)</label>
        <textarea
          id="description"
          v-model="newTask描述"
          placeholder="添加更多详情..."
          class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          rows="2"
        ></textarea>
      </div>
      <div class="mb-4 flex space-x-4">
        <div class="flex-1">
          <label for="deadline" class="block text-sm font-medium mb-1">截止日期 (可选)</label>
          <input
            id="deadline"
            type="datetime-local"
            v-model="newTask截止日期"
            class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div class="flex-1">
          <label for="priority" class="block text-sm font-medium mb-1">优先级</label>
          <select
            id="priority"
            v-model.number="newTask优先级"
            class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option :value="0">紧急且重要</option>
            <option :value="1">重要</option>
            <option :value="2">紧急</option>
            <option :value="3">普通</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        class="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
      >
        添加任务
      </button>
    </form>

    <!-- Task Statistics -->
    <div class="w-full mb-8 grid grid-cols-4 gap-4">
      <div class="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ taskStats.total }}</div>
        <div class="text-sm text-gray-600 dark:text-gray-400">全部</div>
      </div>
      <div class="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-green-600 dark:text-green-400">{{ taskStats.completed }}</div>
        <div class="text-sm text-gray-600 dark:text-gray-400">已完成</div>
      </div>
      <div class="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{{ taskStats.pending }}</div>
        <div class="text-sm text-gray-600 dark:text-gray-400">待处理</div>
      </div>
      <div class="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-red-600 dark:text-red-400">{{ taskStats.overdue }}</div>
        <div class="text-sm text-gray-600 dark:text-gray-400">Overdue</div>
      </div>
    </div>

    <!-- 逾期任务 -->
    <div v-if="overdueTasks.length > 0" class="w-full mb-8 bg-red-100 dark:bg-red-800 shadow-md rounded-lg p-6 border-l-4 border-red-500">
      <h2 class="text-xl font-bold mb-4 text-red-700 dark:text-red-300">逾期任务</h2>
      <ul>
        <li v-for="task in overdueTasks" :key="task.id" class="flex items-center justify-between p-2 border-b border-red-200 dark:border-red-700 last:border-b-0">
          <div>
            <span class="font-medium">{{ task.title }}</span>
            <p class="text-sm text-red-600 dark:text-red-400">截止： {{ new Date(task.deadline!).toLocaleString() }}</p>
          </div>
          <div class="flex space-x-2">
            <button @click="snoozeTask(task, 1)" class="px-3 py-1 bg-yellow-500 text-white rounded-md text-sm">延后1天</button>
            <button @click="snoozeTask(task, 7)" class="px-3 py-1 bg-orange-500 text-white rounded-md text-sm">延后7天</button>
            <button @click="deleteTask(task.id)" class="px-3 py-1 bg-red-500 text-white rounded-md text-sm">删除</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- Date Filter -->
    <div class="w-full mb-8 bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
      <label for="date-filter" class="block text-sm font-medium mb-1">按日期筛选：</label>
      <input
        id="date-filter"
        type="date"
        v-model="selectedDate"
        class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      />
    </div>

    <!-- Task List -->
    <div v-if="state.loading" class="text-lg">加载中...</div>
    <div v-else-if="displayedTasks.length === 0" class="text-lg text-gray-600 dark:text-gray-400">
      这一天没有任务，放松一下或添加新任务吧。
    </div>
    <ul v-else class="w-full bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
      <li
        v-for="task in displayedTasks"
        :key="task.id"
        class="flex flex-col p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
        :class="{ 'opacity-60': task.status === 'completed' }"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center flex-1 cursor-pointer" @click="openEditModal(task)">
            <input
              type="checkbox"
              :checked="task.status === 'completed'"
              @change="toggleComplete(task)"
              @click.stop
              class="mr-3 h-5 w-5 text-blue-600 dark:text-blue-400 rounded focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <div>
              <span class="text-lg font-medium" :class="{ 'line-through': task.status === 'completed' }">{{ task.title }}</span>
              <p v-if="task.description" class="text-sm text-gray-600 dark:text-gray-400">{{ task.description }}</p>
              <p v-if="task.deadline" class="text-xs text-gray-500 dark:text-gray-300">截止： {{ new Date(task.deadline).toLocaleString() }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-300">优先级: {{ ['紧急且重要', '重要', '紧急', '普通'][task.priority] }}</p>
            </div>
          </div>
          <div class="flex items-center space-x-1">
            <button
              @click="showAddSubtask(task.id)"
              class="p-2 text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-600 rounded-full focus:outline-none"
              title="添加子任务"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
              </svg>
            </button>
            <button
              v-if="getTaskSubtasks(task.id).length > 0"
              @click="toggleSubtasks(task.id)"
              class="p-2 text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-600 rounded-full focus:outline-none"
              title="Toggle subtasks"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" :class="{ 'rotate-180': isSubtasksExpanded(task.id) }">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
            <button
              @click="openEditModal(task)"
              class="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-600 rounded-full focus:outline-none"
              title="Edit task"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button
              @click="deleteTask(task.id)"
              class="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 rounded-full focus:outline-none"
              title="删除 task"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 添加子任务 form -->
        <div v-if="addingSubtaskToTaskId === task.id" class="mt-3 ml-8 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
          <input
            v-model="newSubtaskTitle"
            placeholder="子任务标题"
            class="w-full p-2 mb-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            @keyup.enter="addSubtask(task.id)"
          />
          <div class="flex space-x-2">
            <button @click="addSubtask(task.id)" class="px-3 py-1 bg-green-500 text-white rounded-md text-sm">添加</button>
            <button @click="hideAddSubtask" class="px-3 py-1 bg-gray-400 text-white rounded-md text-sm">取消</button>
          </div>
        </div>

        <!-- Subtasks -->
        <ul v-if="isSubtasksExpanded(task.id) && getTaskSubtasks(task.id).length > 0" class="ml-8 mt-2 space-y-2">
          <li
            v-for="subtask in getTaskSubtasks(task.id)"
            :key="subtask.id"
            class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-md"
            :class="{ 'opacity-60': subtask.status === 'completed' }"
          >
            <div class="flex items-center flex-1 cursor-pointer" @click="openEditModal(subtask)">
              <input
                type="checkbox"
                :checked="subtask.status === 'completed'"
                @change="toggleComplete(subtask)"
                @click.stop
                class="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400 rounded"
              />
              <div>
                <span class="text-sm font-medium" :class="{ 'line-through': subtask.status === 'completed' }">{{ subtask.title }}</span>
                <p v-if="subtask.deadline" class="text-xs text-gray-500 dark:text-gray-300">截止： {{ new Date(subtask.deadline).toLocaleString() }}</p>
              </div>
            </div>
            <button
              @click="deleteTask(subtask.id)"
              class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
              title="删除 subtask"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd" />
              </svg>
            </button>
          </li>
        </ul>
      </li>
    </ul>
    </div>
  </main>
</template>

<style>
/* Basic styling for dark mode toggle example */
.dark body {
  background-color: #1a202c;
  color: #a0aec0;
}
</style>
