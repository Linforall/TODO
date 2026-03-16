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
    <!-- 背景 -->
    <div class="fixed inset-0 -z-10"
      :class="isDarkMode ? 'bg-slate-900/80' : 'bg-[#cfc9b5]'"
    ></div>

    <div class="w-full h-full overflow-y-auto px-2 pb-12 pt-8">
      <!-- 顶部导航 -->
      <div class="flex justify-between mb-4">
        <span class="text-[10px] uppercase tracking-[0.5px] font-medium">DAILY TASKS</span>
        <span class="text-[10px] uppercase tracking-[0.5px] font-medium">SYSTEM 01</span>
      </div>
      <!-- Custom Title Bar -->
      <div
        class="fixed top-0 left-0 right-0 h-8 flex items-center justify-between px-4 z-[9999] select-none"
        :class="[
          isDarkMode ? 'bg-black/60 border-white/10' : 'bg-[#cfc9b5] border-black/10',
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
        <!-- TODO 大字 - AGEN 实心 + DA 空心轮廓 -->
        <div class="mb-6 text-left pl-2">
          <h1 class="text-[22vw] leading-[0.85] font-bold uppercase tracking-[-0.04em] ml-[-0.05em]" style="color: #255327;">TODO</h1>
        </div>

        <!-- 笔记本样式 - 输入框和任务列表 -->
        <div class="mx-2 border-l border-t border-black">
          <!-- 输入区域 -->
          <div class="flex border-b border-black">
            <input
              type="text"
              v-model="newTaskTitle"
              @keyup.enter="isAddTaskModalOpen = true"
              placeholder="Enter new task..."
              class="flex-grow bg-transparent border-none p-4 text-base font-medium text-black uppercase placeholder-black/40 focus:outline-none focus:bg-black/5"
            />
            <button
              @click="isAddTaskModalOpen = true"
              class="w-[60px] flex items-center justify-center border-l border-black text-2xl text-black hover:bg-black hover:text-[#cfc9b5] transition-colors"
            >
              +
            </button>
          </div>

          <!-- Task List -->
          <div v-if="state.loading" class="text-center py-12" :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'">加载中...</div>
          <div v-else-if="displayedTasks.length === 0"></div>
          <div v-else>
            <div
              v-for="task in displayedTasks"
              :key="task.id"
              class="flex items-start p-4 border-b border-black"
            >
              <!-- 自定义复选框 -->
              <label class="relative w-5 h-5 flex-shrink-0 mr-3 mt-0.5">
                <input
                  type="checkbox"
                  :checked="task.status === 'completed'"
                  @change="toggleComplete(task)"
                  class="absolute opacity-0 cursor-pointer h-0 w-0"
                />
                <span
                  class="absolute top-0 left-0 w-5 h-5 border-[1.5px] border-black transition-all"
                  :class="task.status === 'completed' ? 'bg-black' : 'bg-transparent'"
                ></span>
              </label>
              <div class="flex-1 min-w-0">
                <span
                  class="font-medium uppercase"
                  :class="[
                    task.status === 'completed'
                      ? 'line-through decoration-[1.5px] text-black/50'
                      : 'text-black',
                    isDarkMode ? 'text-white' : ''
                  ]"
                >{{ task.title }}</span>
              </div>
              <button @click="deleteTask(task.id)" class="p-1.5 transition-colors opacity-0 hover:opacity-100"
              >
                <svg class="w-4 h-4 text-black/50" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 已完成任务 -->
          <div v-if="completedTasks.length > 0">
            <div>
              <div v-for="task in completedTasks" :key="task.id" class="flex items-start p-4 border-b border-black"
              >
                <!-- 自定义复选框 -->
                <label class="relative w-5 h-5 flex-shrink-0 mr-3 mt-0.5">
                  <input
                    type="checkbox"
                    :checked="task.status === 'completed'"
                    @change="toggleComplete(task)"
                    class="absolute opacity-0 cursor-pointer h-0 w-0"
                  />
                  <span
                    class="absolute top-0 left-0 w-5 h-5 border-[1.5px] border-black transition-all"
                    :class="task.status === 'completed' ? 'bg-black' : 'bg-transparent'"
                  ></span>
                </label>
                <div class="flex-1 min-w-0">
                  <span
                    class="font-medium uppercase line-through decoration-[1.5px] text-black/50"
                  >{{ task.title }}</span>
                </div>
                <button @click="deleteTask(task.id)" class="p-1.5 transition-colors opacity-0 hover:opacity-100"
                >
                  <svg class="w-4 h-4 text-black/50" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 逾期任务（在笔记本边框外单独显示） -->
        <div v-if="overdueTasks.length > 0" class="mx-2 mt-4">
          <h2 class="text-lg font-semibold mb-2"
            :class="isDarkMode ? 'text-red-400' : 'text-[#e84a1b]'"
          >
            逾期任务
          </h2>
          <div class="border-l border-black pl-4">
            <div v-for="task in overdueTasks" :key="task.id" class="flex items-center justify-between p-3 border-b border-black/20"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  :checked="task.status === 'completed'"
                  @change="toggleComplete(task)"
                  class="w-5 h-5 rounded-none cursor-pointer border-2 border-black bg-transparent"
                />
                <div class="flex-1 min-w-0">
                  <span class="font-medium uppercase truncate block"
                    :class="isDarkMode ? 'text-white' : 'text-black'"
                  >{{ task.title }}</span>
                  <p class="text-xs" :class="isDarkMode ? 'text-rose-400' : 'text-[#e84a1b]'">截止：{{ new Date(task.deadline!).toLocaleString() }}</p>
                </div>
              </div>
              <div class="flex items-center space-x-2 ml-3">
                <button @click="snoozeTask(task, 1)" class="px-3 py-1.5 text-xs font-medium border border-black hover:bg-black hover:text-white transition-colors"
                >延后1天</button>
                <button @click="snoozeTask(task, 7)" class="px-3 py-1.5 text-xs font-medium border border-black hover:bg-black hover:text-white transition-colors"
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

      </div>

      <!-- Edit Modal -->
      <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="closeEditModal">
        <div class="w-full max-w-md border border-black"
          :class="isDarkMode ? 'bg-slate-900/95' : 'bg-[#cfc9b5]'"
        >
          <!-- 标题栏 -->
          <div class="flex items-center justify-between p-4 border-b border-black">
            <h2 class="text-lg font-semibold uppercase" :class="isDarkMode ? 'text-white' : 'text-black'">编辑任务</h2>
            <button @click="closeEditModal" class="p-1 hover:bg-black/10 transition-colors">
              <svg class="w-5 h-5" :class="isDarkMode ? 'text-white' : 'text-black'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <!-- 表单内容 -->
          <form @submit.prevent="saveEdit" class="p-4">
            <div class="mb-4">
              <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">标题</label>
              <input
                v-model="editTitle"
                class="w-full px-4 py-2.5 border border-black transition-all uppercase"
                :class="isDarkMode
                  ? 'bg-black/30 text-white placeholder-white/40'
                  : 'bg-white/50 text-black placeholder-black/40'"
                required
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">描述</label>
              <textarea
                v-model="edit描述"
                rows="2"
                class="w-full px-4 py-2.5 border border-black transition-all resize-none uppercase"
                :class="isDarkMode
                  ? 'bg-black/30 text-white placeholder-white/40'
                  : 'bg-white/50 text-black placeholder-black/40'"
              ></textarea>
            </div>
            <div class="flex gap-3 mb-5">
              <div class="flex-1">
                <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">截止日期</label>
                <input
                  type="datetime-local"
                  v-model="edit截止日期"
                  class="w-full px-4 py-2.5 border border-black transition-all"
                  :class="isDarkMode
                    ? 'bg-black/30 text-white'
                    : 'bg-white/50 text-black'"
                />
              </div>
              <div class="flex-1">
                <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">优先级</label>
                <select
                  v-model.number="edit优先级"
                  class="w-full px-4 py-2.5 border border-black transition-all uppercase"
                  :class="isDarkMode
                    ? 'bg-black/30 text-white'
                    : 'bg-white/50 text-black'"
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
                class="flex-1 px-4 py-2.5 font-medium transition-all border border-black uppercase"
                :class="isDarkMode
                  ? 'bg-white text-black hover:bg-white/80'
                  : 'bg-black text-[#cfc9b5] hover:bg-black/80'"
              >
                保存修改
              </button>
              <button
                type="button"
                @click="closeEditModal"
                class="flex-1 px-4 py-2.5 font-medium transition-all border border-black uppercase"
                :class="isDarkMode
                  ? 'text-white hover:bg-white/10'
                  : 'text-black hover:bg-black/5'"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Add Task Modal -->
      <div v-if="isAddTaskModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="closeAddTaskModal">
        <div class="w-full max-w-md border border-black"
          :class="isDarkMode ? 'bg-slate-900/95' : 'bg-[#cfc9b5]'"
        >
          <!-- 标题栏 -->
          <div class="flex items-center justify-between p-4 border-b border-black">
            <h2 class="text-lg font-semibold uppercase" :class="isDarkMode ? 'text-white' : 'text-black'">添加新任务</h2>
            <button @click="closeAddTaskModal" class="p-1 hover:bg-black/10 transition-colors">
              <svg class="w-5 h-5" :class="isDarkMode ? 'text-white' : 'text-black'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <!-- 表单内容 -->
          <form @submit.prevent="addTask" class="p-4">
            <div class="mb-4">
              <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">标题</label>
              <input
                v-model="newTaskTitle"
                placeholder="输入任务标题..."
                class="w-full px-4 py-2.5 border border-black transition-all uppercase"
                :class="isDarkMode
                  ? 'bg-black/30 text-white placeholder-white/40'
                  : 'bg-white/50 text-black placeholder-black/40'"
                required
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">描述（可选）</label>
              <textarea
                v-model="newTask描述"
                placeholder="添加描述..."
                rows="2"
                class="w-full px-4 py-2.5 border border-black transition-all resize-none uppercase"
                :class="isDarkMode
                  ? 'bg-black/30 text-white placeholder-white/40'
                  : 'bg-white/50 text-black placeholder-black/40'"
              ></textarea>
            </div>
            <div class="flex gap-3 mb-5">
              <div class="flex-1">
                <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">截止日期</label>
                <input
                  type="datetime-local"
                  v-model="newTask截止日期"
                  class="w-full px-4 py-2.5 border border-black transition-all"
                  :class="isDarkMode
                    ? 'bg-black/30 text-white'
                    : 'bg-white/50 text-black'"
                />
              </div>
              <div class="flex-1">
                <label class="block text-sm mb-1.5 uppercase font-medium" :class="isDarkMode ? 'text-white/80' : 'text-black'">优先级</label>
                <select
                  v-model.number="newTask优先级"
                  class="w-full px-4 py-2.5 border border-black transition-all uppercase"
                  :class="isDarkMode
                    ? 'bg-black/30 text-white'
                    : 'bg-white/50 text-black'"
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
                class="flex-1 px-4 py-2.5 font-medium transition-all border border-black uppercase"
                :class="isDarkMode
                  ? 'bg-white text-black hover:bg-white/80'
                  : 'bg-black text-[#cfc9b5] hover:bg-black/80'"
              >
                添加任务
              </button>
              <button
                type="button"
                @click="closeAddTaskModal"
                class="flex-1 px-4 py-2.5 font-medium transition-all border border-black uppercase"
                :class="isDarkMode
                  ? 'text-white hover:bg-white/10'
                  : 'text-black hover:bg-black/5'"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Bottom Status Bar -->
      <div class="fixed bottom-0 left-0 right-0 h-8 flex items-center justify-between px-2 py-4"
      >
        <span class="text-[10px] uppercase tracking-[0.5px] font-medium">ACTIVE: {{ taskStats.pending }}</span>
        <span class="text-[10px] uppercase tracking-[0.5px] font-medium">SYNCED</span>
      </div>
    </div>
  </main>
</template>

<style>
:root {
  --text-primary: #000000;
}

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
