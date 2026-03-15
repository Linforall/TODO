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
const isAddTaskModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const editTitle = ref("");
const edit描述 = ref("");
const edit截止日期 = ref<string | null>(null);
const edit优先级 = ref(3);

const isAlwaysOnTop = ref(false);
const isIgnoringCursorEvents = ref(false);
const isDarkMode = ref(false);

// 自定义 Tooltip 状态
const tooltipState = ref({
  show: false,
  text: '',
  x: 0,
  y: 0
});

function showTooltip(event: MouseEvent, text: string) {
  tooltipState.value = {
    show: true,
    text,
    x: event.clientX,
    y: event.clientY - 30
  };
}

function hideTooltip() {
  tooltipState.value.show = false;
}

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

// 显示未完成的任务
const displayedTasks = computed(() => {
  return smartSortedTasks.value.filter(task => task.status !== 'completed' && task.status !== 'skipped');
});

// 显示已完成的任务
const completedTasks = computed(() => {
  return state.tasks.filter(task => task.status === 'completed');
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
    resetAddTaskForm();
  }
}

function resetAddTaskForm() {
  newTaskTitle.value = "";
  newTask描述.value = "";
  newTask截止日期.value = null;
  newTask优先级.value = 3;
}

function openAddTaskModal() {
  resetAddTaskForm();
  isAddTaskModalOpen.value = true;
}

function closeAddTaskModal() {
  isAddTaskModalOpen.value = false;
  resetAddTaskForm();
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
  <!-- Custom Tooltip -->
  <div
    v-if="tooltipState.show"
    class="fixed z-[10000] px-3 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-800 text-xs rounded-lg shadow-xl pointer-events-none whitespace-nowrap transform -translate-x-1/2 -translate-y-full"
    :style="{ left: tooltipState.x + 'px', top: tooltipState.y + 'px' }"
  >
    {{ tooltipState.text }}
    <div class="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-800 dark:border-t-white"></div>
  </div>

  <main class="w-full h-screen overflow-hidden" :class="isDarkMode ? 'dark' : ''" @mousemove="tooltipState.show && hideTooltip()">
    <!-- 毛玻璃背景容器 -->
    <div class="fixed inset-0 -z-10"
      :class="isDarkMode ? 'bg-slate-900/80' : 'bg-[#f8f8f8]/80'"
    ></div>

    <div class="w-full h-full overflow-y-auto px-4 pb-4 pt-12">
      <!-- Custom Title Bar -->
      <div
        class="fixed top-0 left-0 right-0 h-8 backdrop-blur-xl flex items-center justify-between px-4 z-[9999] select-none"
        :class="[
          isDarkMode ? 'bg-black/60 border-white/10' : 'bg-[#e8e8e9]/90 border-white/20',
          { 'pointer-events-auto': isIgnoringCursorEvents }
        ]"
        :style="isIgnoringCursorEvents ? 'pointer-events: auto;' : ''"
      >
        <!-- 双击标题栏退出穿透模式 -->
        <div class="absolute inset-0 cursor-move" @mousedown="startDrag" @dblclick="toggleIgnoreCursorEvents"></div>

        <div class="flex items-center space-x-2 relative z-10">
          <button @click="closeWindow" class="w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200 bg-[#ff5f57] hover:bg-[#e04841] cursor-pointer">
            <svg class="w-2 h-2 opacity-0 hover:opacity-100" style="color: #820005" viewBox="0 0 8 8" fill="none">
              <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          <button @click="minimizeWindow" class="w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200 bg-[#ffbd2e] hover:bg-[#e5a91f] cursor-pointer">
            <svg class="w-2 h-2 opacity-0 hover:opacity-100" style="color: #995700" viewBox="0 0 8 8" fill="none">
              <path d="M1 4h6" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          <button @click="toggleMaximize" class="w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200 bg-[#28c840] hover:bg-[#1eb830] cursor-pointer">
            <svg class="w-2 h-2 opacity-0 hover:opacity-100" style="color: #006500" viewBox="0 0 8 8" fill="none">
              <path d="M1 3v4h4M3 1h4v4" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
        </div>

        <div class="flex items-center space-x-2 relative z-10">
          <button @click="toggleDarkMode" class="p-1.5 rounded-lg transition-all duration-200"
            :class="isDarkMode ? 'hover:bg-slate-700' : 'bg-[#f0f0f2] hover:bg-white shadow-md'"
            @mouseenter="showTooltip($event, isDarkMode ? '浅色模式' : '深色模式')" @mouseleave="hideTooltip">
            <svg v-if="isDarkMode" class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4 text-[#1e3246]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
            </svg>
          </button>
          <button @click="toggleAlwaysOnTop" class="p-1.5 rounded-lg transition-all duration-200"
            :class="[
              isDarkMode ? 'hover:bg-slate-700' : 'bg-[#f0f0f2] hover:bg-white shadow-md',
              isAlwaysOnTop ? (isDarkMode ? 'bg-blue-500/20' : 'bg-[#1e3246]/20') : ''
            ]"
            @mouseenter="showTooltip($event, isAlwaysOnTop ? '取消置顶' : '置顶')" @mouseleave="hideTooltip">
            <!-- 图钉图标 -->
            <svg v-if="isAlwaysOnTop" class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11 3a1 1 0 10-2 0v1.586l-3.293-3.293a1 1 0 00-1.414 0L4 6.414V7a1 1 0 001 1h1.586l.707.707a1 1 0 001.414 0L9 6.414V5a1 1 0 00-1-1h-1a1 1 0 00-1 1v1.586l-1 1V19a2 2 0 002 2h6a2 2 0 002-2V8.414l1-1V11a1 1 0 102 0V5a1 1 0 00-1-1h-1z"/>
              <path fill-rule="evenodd" d="M14 5a1 1 0 011 1v1h1a1 1 0 110 2H4a1 1 0 010-2h1V6a1 1 0 011-1h2z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4" :class="isDarkMode ? 'text-gray-400' : 'text-[#858585]'" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.5 3a.5.5 0 00-.5.5v2.882c-.36-.086-.73-.132-1.107-.132A2.5 2.5 0 003.5 8.25v7.75a2 2 0 002 2h9a2 2 0 002-2v-7.75a2.5 2.5 0 00-2.5-2.5c-.377 0-.747.046-1.107.132V3.5a.5.5 0 00-.5-.5h-3.5zM9 6a1 1 0 011-1h2a1 1 0 011 1v1.586l.707-.707a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l.707.707V6z" clip-rule="evenodd"/>
            </svg>
          </button>
          <button @click="toggleIgnoreCursorEvents" class="p-1.5 rounded-lg transition-all duration-200"
            :class="[
              isDarkMode ? 'hover:bg-slate-700' : 'bg-[#f0f0f2] hover:bg-white shadow-md',
              isIgnoringCursorEvents ? (isDarkMode ? 'bg-green-500/20' : 'bg-[#e84a1b]/20') : ''
            ]"
            @mouseenter="showTooltip($event, isIgnoringCursorEvents ? '取消穿透' : '鼠标穿透')" @mouseleave="hideTooltip">
            <!-- 手势图标 -->
            <svg v-if="isIgnoringCursorEvents" class="w-4 h-4 text-[#e84a1b]" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4" :class="isDarkMode ? 'text-gray-400' : 'text-[#858585]'" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="pt-8 max-w-2xl mx-auto">
        <!-- Stats Grid and Add Button -->
        <div class="flex items-stretch gap-3 mb-6">
          <div class="flex-1 grid grid-cols-4 gap-3">
            <!-- 全部任务 -->
            <div class="rounded-2xl p-3 text-center border shadow-lg hover:scale-105 transition-transform"
              :class="isDarkMode ? 'bg-black/60 border-white/20' : 'bg-gradient-to-b from-[#f0f0f2] to-[#e2e2e4] border-[#eeeeee] shadow-[0_4px_12px_rgba(0,0,0,0.08)]'"
            >
              <svg class="w-6 h-6 mx-auto mb-1" :class="isDarkMode ? 'text-blue-400' : 'text-[#1e3246]'" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
              </svg>
              <div class="text-2xl font-bold" :class="isDarkMode ? 'text-blue-400' : 'text-[#1e3246]'">{{ taskStats.total }}</div>
              <div class="text-xs" :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'">全部</div>
            </div>
            <!-- 已完成 -->
            <div class="rounded-2xl p-3 text-center border shadow-lg hover:scale-105 transition-transform"
              :class="isDarkMode ? 'bg-black/60 border-white/20' : 'bg-gradient-to-b from-[#f0f0f2] to-[#e2e2e4] border-[#eeeeee] shadow-[0_4px_12px_rgba(0,0,0,0.08)]'"
            >
              <svg class="w-6 h-6 mx-auto mb-1" :class="isDarkMode ? 'text-green-400' : 'text-[#4af626]'" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <div class="text-2xl font-bold" :class="isDarkMode ? 'text-green-400' : 'text-[#4af626]'">{{ taskStats.completed }}</div>
              <div class="text-xs" :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'">已完成</div>
            </div>
            <!-- 待处理 -->
            <div class="rounded-2xl p-3 text-center border shadow-lg hover:scale-105 transition-transform"
              :class="isDarkMode ? 'bg-black/60 border-white/20' : 'bg-gradient-to-b from-[#f0f0f2] to-[#e2e2e4] border-[#eeeeee] shadow-[0_4px_12px_rgba(0,0,0,0.08)]'"
            >
              <svg class="w-6 h-6 mx-auto mb-1" :class="isDarkMode ? 'text-amber-400' : 'text-[#b59257]'" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
              </svg>
              <div class="text-2xl font-bold" :class="isDarkMode ? 'text-amber-400' : 'text-[#b59257]'">{{ taskStats.pending }}</div>
              <div class="text-xs" :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'">待处理</div>
            </div>
            <!-- 逾期 -->
            <div class="rounded-2xl p-3 text-center border shadow-lg hover:scale-105 transition-transform"
              :class="isDarkMode ? 'bg-black/60 border-white/20' : 'bg-gradient-to-b from-[#f0f0f2] to-[#e2e2e4] border-[#eeeeee] shadow-[0_4px_12px_rgba(0,0,0,0.08)]'"
            >
              <svg class="w-6 h-6 mx-auto mb-1" :class="isDarkMode ? 'text-red-400' : 'text-[#e84a1b]'" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
              <div class="text-2xl font-bold" :class="isDarkMode ? 'text-red-400' : 'text-[#e84a1b]'">{{ taskStats.overdue }}</div>
              <div class="text-xs" :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'">逾期</div>
            </div>
          </div>
          <!-- Add Task Button - 3D 按钮效果 -->
          <button
            @click="openAddTaskModal"
            class="w-16 h-16 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all duration-150 active:translate-y-1"
            :class="isDarkMode
              ? 'bg-gradient-to-br from-blue-600 to-indigo-700 border-white/20 shadow-lg hover:shadow-xl hover:scale-105'
              : 'bg-gradient-to-b from-[#f0f0f2] to-[#e2e2e4] border-[#eeeeee] shadow-[0_4px_0_#c2c2c4,0_6px_12px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_0_#c2c2c4,0_8px_16px_rgba(0,0,0,0.2)] hover:scale-105 active:shadow-[0_0_0_#c2c2c4,inset_0_2px_4px_rgba(0,0,0,0.1)]'"
            @mouseenter="showTooltip($event, '添加任务')" @mouseleave="hideTooltip"
          >
            <svg class="w-8 h-8" :class="isDarkMode ? 'text-white' : 'text-[#1e3246]'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>

        <!-- Date Filter -->
        <div class="mb-6 rounded-xl p-4 border shadow-lg"
          :class="isDarkMode
            ? 'bg-black/60 border-white/20'
            : 'bg-gradient-to-b from-[#f0f0f2] to-[#e8e8e9] border-[#eeeeee] shadow-[0_4px_12px_rgba(0,0,0,0.08)]'"
        >
          <label class="block text-sm mb-2" :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'">筛选日期</label>
          <input
            type="date"
            v-model="selectedDate"
            class="w-full px-4 py-2.5 rounded-xl border transition-all duration-200"
            :class="isDarkMode
              ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
              : 'bg-white border-[#eeeeee] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
          />
        </div>

        <!-- Completed Tasks -->
        <div v-if="completedTasks.length > 0" class="mb-6 rounded-2xl p-5 border shadow-lg"
          :class="isDarkMode
            ? 'bg-green-900/30 border-green-800/50 shadow-green-500/10'
            : 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)]'"
        >
          <h2 class="text-lg font-semibold mb-4 flex items-center"
            :class="isDarkMode ? 'text-green-400' : 'text-[#4af626]'"
          >
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            已完成任务 ({{ completedTasks.length }})
          </h2>
          <div class="space-y-3">
            <div v-for="task in completedTasks" :key="task.id" class="flex items-center justify-between p-3 rounded-xl border opacity-75"
              :class="isDarkMode
                ? 'bg-slate-800/70 border-slate-700/50'
                : 'bg-white/70 border-green-200/50'"
            >
              <div class="flex-1 min-w-0">
                <span class="font-medium truncate block line-through decoration-2"
                  :class="isDarkMode ? 'text-gray-100 decoration-green-500/50' : 'text-gray-900 decoration-green-500'"
                >{{ task.title }}</span>
                <p v-if="task.description" class="text-xs line-through"
                  :class="isDarkMode ? 'text-white/50' : 'text-[#777777]'"
                >{{ task.description }}</p>
              </div>
              <div class="flex items-center space-x-2 ml-3">
                <button @click="toggleComplete(task)" class="p-1.5 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-blue-400 hover:bg-blue-900/50' : 'text-[#1e3246] hover:bg-blue-50'"
                  @mouseenter="showTooltip($event, '标记为未完成')" @mouseleave="hideTooltip"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button @click="deleteTask(task.id)" class="p-1.5 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-rose-400 hover:bg-rose-900/50' : 'text-[#e84a1b] hover:bg-rose-100'"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Overdue Tasks -->
        <div v-if="overdueTasks.length > 0" class="mb-6 rounded-2xl p-5 border shadow-lg"
          :class="isDarkMode
            ? 'bg-red-900/30 border-red-800/50 shadow-red-500/10'
            : 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)]'"
        >
          <h2 class="text-lg font-semibold mb-4 flex items-center"
            :class="isDarkMode ? 'text-red-400' : 'text-[#e84a1b]'"
          >
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            逾期任务
          </h2>
          <div class="space-y-3">
            <div v-for="task in overdueTasks" :key="task.id" class="flex items-center justify-between p-3 rounded-xl border"
              :class="isDarkMode
                ? 'bg-slate-800/70 border-slate-700/50'
                : 'bg-white/70 border-red-200'"
            >
              <div class="flex-1 min-w-0">
                <span class="font-medium truncate block"
                  :class="isDarkMode ? 'text-gray-100' : 'text-gray-900'"
                >{{ task.title }}</span>
                <p class="text-xs" :class="isDarkMode ? 'text-rose-400' : 'text-[#e84a1b]'">截止：{{ new Date(task.deadline!).toLocaleString() }}</p>
              </div>
              <div class="flex items-center space-x-2 ml-3">
                <button @click="snoozeTask(task, 1)" class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  :class="isDarkMode
                    ? 'bg-amber-500/80 text-white hover:bg-amber-500'
                    : 'bg-[#b59257] text-white hover:bg-[#a08048] shadow-[0_2px_0_#8a6f42]'"
                >延后1天</button>
                <button @click="snoozeTask(task, 7)" class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  :class="isDarkMode
                    ? 'bg-orange-500/80 text-white hover:bg-orange-500'
                    : 'bg-[#1e3246] text-white hover:bg-[#2a4259] shadow-[0_2px_0_#152538]'"
                >延后7天</button>
                <button @click="deleteTask(task.id)" class="p-1.5 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-rose-400 hover:bg-rose-900/50' : 'text-[#e84a1b] hover:bg-rose-100'"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Task List -->
        <div v-if="state.loading" class="text-center py-12" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">加载中...</div>
        <div v-else-if="displayedTasks.length === 0" class="text-center py-12">
          <div class="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center border"
            :class="isDarkMode
              ? 'bg-black/40 border-white/10'
              : 'bg-white/60 border-[#eeeeee] shadow-md'"
          >
            <svg class="w-10 h-10" :class="isDarkMode ? 'text-white/60' : 'text-[#858585]'" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
            </svg>
          </div>
          <p :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'">这一天没有任务，放松一下吧</p>
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="task in displayedTasks"
            :key="task.id"
            class="group rounded-2xl p-4 border transition-all duration-200 shadow-lg"
            :class="[
              isDarkMode
                ? 'bg-black/60 border-white/20 hover:border-blue-400/50 hover:bg-black/70'
                : 'bg-gradient-to-b from-white to-[#f8f8f8] border-[#eeeeee] hover:border-[#1e3246]/30 hover:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)]',
              { 'opacity-50': task.status === 'completed' }
            ]"
          >
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                :checked="task.status === 'completed'"
                @change="toggleComplete(task)"
                class="mt-1 w-5 h-5 rounded cursor-pointer"
                :class="isDarkMode
                  ? 'text-blue-400 dark:bg-white/10 focus:ring-blue-400'
                  : 'text-[#1e3246] bg-white border-[#d1d1d3] focus:ring-[#1e3246]'"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium" :class="isDarkMode ? 'text-white' : 'text-[#333333]'">{{ task.title }}</span>
                  <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="[
                    isDarkMode ? (
                      task.priority === 0 ? 'bg-red-900/40 text-red-400' :
                      task.priority === 1 ? 'bg-orange-900/40 text-orange-400' :
                      task.priority === 2 ? 'bg-yellow-900/40 text-yellow-400' :
                      'bg-white/10 text-white/70'
                    ) : (
                      task.priority === 0 ? 'bg-red-100 text-red-600' :
                      task.priority === 1 ? 'bg-orange-100 text-orange-600' :
                      task.priority === 2 ? 'bg-yellow-100 text-yellow-600' :
                      'bg-[#e8e8e9] text-[#777777]'
                    )
                  ]">
                    {{ priorityLabels[task.priority] }}
                  </span>
                </div>
                <p v-if="task.description" class="text-sm mb-1 truncate"
                  :class="isDarkMode ? 'text-white/70' : 'text-[#777777]'"
                >{{ task.description }}</p>
                <p v-if="task.deadline" class="text-xs" :class="isDarkMode ? 'text-white/50' : 'text-[#858585]'">截止：{{ new Date(task.deadline).toLocaleString() }}</p>
              </div>
              <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button @click="showAddSubtask(task.id)" class="p-2 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-green-400 hover:bg-green-900/30' : 'text-[#4af626] hover:bg-green-50'"
                  @mouseenter="showTooltip($event, '添加子任务')" @mouseleave="hideTooltip"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button v-if="getTaskSubtasks(task.id).length > 0" @click="toggleSubtasks(task.id)" class="p-2 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-purple-400 hover:bg-purple-900/30' : 'text-[#858585] hover:bg-purple-50'"
                  @mouseenter="showTooltip($event, '查看子任务')" @mouseleave="hideTooltip"
                >
                  <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-180': isSubtasksExpanded(task.id) }" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button @click="openEditModal(task)" class="p-2 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-blue-400 hover:bg-blue-900/30' : 'text-[#1e3246] hover:bg-blue-50'"
                  @mouseenter="showTooltip($event, '编辑')" @mouseleave="hideTooltip"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                  </svg>
                </button>
                <button @click="deleteTask(task.id)" class="p-2 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-[#e84a1b] hover:bg-red-50'"
                  @mouseenter="showTooltip($event, '删除')" @mouseleave="hideTooltip"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Add Subtask Form -->
            <div v-if="addingSubtaskToTaskId === task.id" class="mt-3 ml-8 p-3 rounded-xl border"
              :class="isDarkMode
                ? 'bg-black/60 border-white/10'
                : 'bg-white border-[#eeeeee] shadow-md'"
            >
              <input
                v-model="newSubtaskTitle"
                placeholder="子任务标题"
                class="w-full px-3 py-2 mb-2 rounded-lg border text-sm"
                :class="isDarkMode
                  ? 'bg-white/10 border-white/10 text-white'
                  : 'bg-[#f8f8f8] border-[#eeeeee] text-[#333333]'"
                @keyup.enter="addSubtask(task.id)"
              />
              <div class="flex space-x-2">
                <button @click="addSubtask(task.id)" class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  :class="isDarkMode
                    ? 'bg-green-600 text-white hover:bg-green-500'
                    : 'bg-[#4af626] text-white hover:bg-green-500 shadow-[0_2px_0_#3dc520]'"
                >添加</button>
                <button @click="hideAddSubtask" class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  :class="isDarkMode
                    ? 'bg-slate-600 text-white hover:bg-slate-500'
                    : 'bg-[#858585] text-white hover:bg-slate-500 shadow-[0_2px_0_#6b6b6b]'"
                >取消</button>
              </div>
            </div>

            <!-- Subtasks -->
            <div v-if="isSubtasksExpanded(task.id) && getTaskSubtasks(task.id).length > 0" class="mt-3 ml-8 space-y-2">
              <div
                v-for="subtask in getTaskSubtasks(task.id)"
                :key="subtask.id"
                class="flex items-center gap-3 p-3 rounded-xl border"
                :class="[
                  isDarkMode
                    ? 'bg-white/10 border-white/10'
                    : 'bg-[#f8f8f8] border-[#eeeeee]',
                  { 'opacity-50': subtask.status === 'completed' }
                ]"
              >
                <input
                  type="checkbox"
                  :checked="subtask.status === 'completed'"
                  @change="toggleComplete(subtask)"
                  class="w-4 h-4 rounded cursor-pointer"
                  :class="isDarkMode ? 'text-blue-400' : 'text-[#1e3246]'"
                />
                <span class="flex-1 text-sm" :class="isDarkMode ? 'text-white' : 'text-[#333333]'">{{ subtask.title }}</span>
                <button @click="deleteTask(subtask.id)" class="p-1 rounded-lg transition-colors"
                  :class="isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-[#e84a1b] hover:bg-red-50'"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
        <div class="rounded-2xl shadow-2xl w-full max-w-md p-6 border"
          :class="isDarkMode
            ? 'bg-black/80 border-white/20'
            : 'bg-gradient-to-br from-[#f8f8f8] to-white border-[#eeeeee] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]'"
        >
          <h2 class="text-xl font-semibold mb-5" :class="isDarkMode ? 'text-white' : 'text-[#333333]'">编辑任务</h2>
          <div class="mb-4">
            <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">标题</label>
            <input
              v-model="editTitle"
              class="w-full px-4 py-2.5 rounded-xl border transition-all"
              :class="isDarkMode
                ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
                : 'bg-white border-[#d1d1d3] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
              required
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">描述</label>
            <textarea
              v-model="edit描述"
              rows="2"
              class="w-full px-4 py-2.5 rounded-xl border transition-all resize-none"
              :class="isDarkMode
                ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
                : 'bg-white border-[#d1d1d3] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
            ></textarea>
          </div>
          <div class="flex gap-3 mb-5">
            <div class="flex-1">
              <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">截止日期</label>
              <input
                type="datetime-local"
                v-model="edit截止日期"
                class="w-full px-4 py-2.5 rounded-xl border transition-all"
                :class="isDarkMode
                  ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
                  : 'bg-white border-[#d1d1d3] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
              />
            </div>
            <div class="flex-1">
              <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">优先级</label>
              <select
                v-model.number="edit优先级"
                class="w-full px-4 py-2.5 rounded-xl border transition-all"
                :class="isDarkMode
                  ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
                  : 'bg-white border-[#d1d1d3] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
              >
                <option :value="0">紧急且重要</option>
                <option :value="1">重要</option>
                <option :value="2">紧急</option>
                <option :value="3">普通</option>
              </select>
            </div>
          </div>
          <div class="flex gap-3">
            <button @click="saveEdit" class="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all"
              :class="isDarkMode
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500'
                : 'bg-gradient-to-r from-[#1e3246] to-[#2a4259] text-white hover:from-[#2a4259] hover:to-[#365272] shadow-[0_2px_0_#152538]'"
            >
              保存修改
            </button>
            <button @click="closeEditModal" class="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all border"
              :class="isDarkMode
                ? 'bg-white/10 text-white/80 hover:bg-white/20 border-white/10'
                : 'bg-white text-[#777777] hover:bg-[#f8f8f8] border-[#eeeeee] shadow-[0_2px_0_#d1d1d3]'"
            >
              取消
            </button>
          </div>
        </div>
      </div>

      <!-- Add Task Modal -->
      <div v-if="isAddTaskModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" @click.self="closeAddTaskModal">
        <div class="rounded-2xl shadow-2xl w-full max-w-md p-6 border"
          :class="isDarkMode
            ? 'bg-black/80 border-white/20'
            : 'bg-gradient-to-br from-[#f8f8f8] to-white border-[#eeeeee] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]'"
        >
          <h2 class="text-xl font-semibold mb-5" :class="isDarkMode ? 'text-white' : 'text-[#333333]'">添加新任务</h2>
          <form @submit.prevent="addTask">
            <div class="mb-4">
              <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">标题</label>
              <input
                v-model="newTaskTitle"
                placeholder="输入任务标题..."
                class="w-full px-4 py-2.5 rounded-xl border transition-all"
                :class="isDarkMode
                  ? 'bg-white/10 border-white/10 text-white placeholder-white/50 focus:ring-blue-500'
                  : 'bg-white border-[#d1d1d3] text-[#333333] placeholder-[#999999] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
                required
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">描述（可选）</label>
              <textarea
                v-model="newTask描述"
                placeholder="添加描述..."
                rows="2"
                class="w-full px-4 py-2.5 rounded-xl border transition-all resize-none"
                :class="isDarkMode
                  ? 'bg-white/10 border-white/10 text-white placeholder-white/50 focus:ring-blue-500'
                  : 'bg-white border-[#d1d1d3] text-[#333333] placeholder-[#999999] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
              ></textarea>
            </div>
            <div class="flex gap-3 mb-5">
              <div class="flex-1">
                <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">截止日期</label>
                <input
                  type="datetime-local"
                  v-model="newTask截止日期"
                  class="w-full px-4 py-2.5 rounded-xl border transition-all"
                  :class="isDarkMode
                    ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
                    : 'bg-white border-[#d1d1d3] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
                />
              </div>
              <div class="flex-1">
                <label class="block text-sm mb-1.5" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">优先级</label>
                <select
                  v-model.number="newTask优先级"
                  class="w-full px-4 py-2.5 rounded-xl border transition-all"
                  :class="isDarkMode
                    ? 'bg-white/10 border-white/10 text-white focus:ring-blue-500'
                    : 'bg-white border-[#d1d1d3] text-[#333333] focus:ring-[#1e3246] focus:border-transparent focus:outline-none'"
                >
                  <option :value="0">紧急且重要</option>
                  <option :value="1">重要</option>
                  <option :value="2">紧急</option>
                  <option :value="3">普通</option>
                </select>
              </div>
            </div>
            <div class="flex gap-3">
              <button
                type="submit"
                class="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all"
                :class="isDarkMode
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500'
                  : 'bg-gradient-to-r from-[#1e3246] to-[#2a4259] text-white hover:from-[#2a4259] hover:to-[#365272] shadow-[0_2px_0_#152538]'"
              >
                添加任务
              </button>
              <button
                type="button"
                @click="closeAddTaskModal"
                class="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all border"
                :class="isDarkMode
                  ? 'bg-white/10 text-white/80 hover:bg-white/20 border-white/10'
                  : 'bg-white text-[#777777] hover:bg-[#f8f8f8] border-[#eeeeee] shadow-[0_2px_0_#d1d1d3]'"
              >
                取消
              </button>
            </div>
          </form>
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
