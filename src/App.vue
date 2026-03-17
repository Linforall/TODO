<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { unregister } from "@tauri-apps/plugin-global-shortcut";
import { state, actions, smartSortedTasks, overdueTasks } from "./store";
import type { Task } from "./db";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { checkAndSendNotifications } from "./notification";
import { register } from "@tauri-apps/plugin-global-shortcut";
import GeekProgressBar from "./components/GeekProgressBar.vue";

const newTaskTitle = ref("");
const newTask描述 = ref("");
const newTask截止日期 = ref<string | null>(null);

// 获取当前日期时间字符串 (格式: YYYY-MM-DDTHH:mm)
function getCurrentDateTimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 打开添加任务模态框并设置默认日期
function openAddTaskModal() {
  newTask截止日期.value = getCurrentDateTimeString();
  isAddTaskModalOpen.value = true;
}

const isEditModalOpen = ref(false);
const isAddTaskModalOpen = ref(false);
const editingTask = ref<Task | null>(null);
const editTitle = ref("");
const edit描述 = ref("");
const edit截止日期 = ref<string | null>(null);

const isAlwaysOnTop = ref(false);
const isIgnoringCursorEvents = ref(false);
const isDarkMode = ref(false);
const isDragging = ref(false);

// 清理函数引用
let notificationInterval: number | null = null;
let unlistenExitPassthrough: (() => void) | null = null;

// 自定义 Tooltip 状态
const tooltipState = ref({
  show: false,
  text: "",
  x: 0,
  y: 0,
  direction: "up", // 'up' 或 'down'
});

function showTooltip(event: MouseEvent, text: string) {
  const threshold = 60; // 距离顶部多少像素时切换方向

  // 检测是否靠近窗口顶部，如果是则显示在下方
  const direction = event.clientY < threshold ? "down" : "up";

  tooltipState.value = {
    show: true,
    text,
    x: event.clientX,
    y: direction === "up" ? event.clientY - 30 : event.clientY + 20,
    direction,
  };
}

function hideTooltip() {
  tooltipState.value.show = false;
}

const startDrag = async (event: MouseEvent) => {
  if (event.button === 0) {
    isDragging.value = true;
    try {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    } catch (e) {
      console.error("Drag error:", e);
    }
  }
};

const stopDrag = () => {
  isDragging.value = false;
};

const selectedDate = ref(new Date().toISOString().split("T")[0]);

const taskStats = computed(() => {
  let completed = 0,
    pending = 0;
  for (const task of state.tasks) {
    if (task.status === "completed") completed++;
    else if (task.status === "pending") pending++;
  }
  return {
    total: state.tasks.length,
    completed,
    pending,
    overdue: overdueTasks.value.length,
  };
});

onMounted(async () => {
  actions.fetchTasks();
  notificationInterval = window.setInterval(
    checkAndSendNotifications,
    5 * 60 * 1000,
  );
  registerEscapeShortcut();

  // Listen for global shortcut to exit passthrough mode
  unlistenExitPassthrough = await listen("exit-passthrough", async () => {
    if (isIgnoringCursorEvents.value) {
      isIgnoringCursorEvents.value = false;
      await invoke("set_ignore_cursor_events", { ignore: false });
    }
  });
});

onUnmounted(() => {
  // 清理定时器
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }
  // 清理事件监听器
  if (unlistenExitPassthrough) {
    unlistenExitPassthrough();
  }
  // 注销全局快捷键
  unregister("Escape").catch(() => {});
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
  return smartSortedTasks.value.filter(
    (task) => task.status !== "completed" && task.status !== "skipped",
  );
});

// 显示已完成的任务
const completedTasks = computed(() => {
  return state.tasks.filter((task) => task.status === "completed");
});

async function addTask() {
  if (newTaskTitle.value.trim()) {
    await actions.addTask({
      title: newTaskTitle.value.trim(),
      description: newTask描述.value.trim() || null,
      deadline: newTask截止日期.value,
      priority: 3,
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
  await invoke("set_ignore_cursor_events", {
    ignore: isIgnoringCursorEvents.value,
  });
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
  isEditModalOpen.value = true;
}

// 供模板调用的编辑函数
defineExpose({ openEditModal });

async function saveEdit() {
  if (editingTask.value && editTitle.value.trim()) {
    await actions.updateTask(editingTask.value.id, {
      title: editTitle.value.trim(),
      description: edit描述.value.trim() || null,
      deadline: edit截止日期.value,
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
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}
</script>

<template>
  <!-- Custom Tooltip -->
  <div
    v-if="tooltipState.show"
    class="fixed z-[10000] px-3 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-800 text-xs rounded-lg shadow-xl pointer-events-none whitespace-nowrap transform -translate-x-1/2"
    :class="
      tooltipState.direction === 'up' ? '-translate-y-full' : 'translate-y-0'
    "
    :style="{ left: tooltipState.x + 'px', top: tooltipState.y + 'px' }"
  >
    {{ tooltipState.text }}
    <div
      class="absolute left-1/2 -translate-x-1/2 border-4 border-transparent"
      :class="
        tooltipState.direction === 'up'
          ? 'top-full border-t-slate-800 dark:border-t-white'
          : 'bottom-full border-b-slate-800 dark:border-b-white'
      "
    ></div>
  </div>

  <main
    class="w-full h-screen overflow-hidden"
    :class="isDarkMode ? 'dark' : ''"
  >
    <!-- 背景 -->
    <div
      class="fixed inset-0 -z-10"
      :class="isDarkMode ? 'bg-slate-900/80' : 'bg-[#cfc9b5]'"
    ></div>

    <div class="w-full h-full overflow-y-auto px-2 pb-12 pt-8">
      <!-- 顶部导航 -->
      <div class="flex justify-between mb-4">
        <span
          class="text-[10px] uppercase tracking-[0.5px] font-medium"
          :class="isDarkMode ? 'text-white/60' : 'text-black/60'"
          >DAILY TASKS</span
        >
        <span
          class="text-[10px] uppercase tracking-[0.5px] font-medium"
          :class="isDarkMode ? 'text-white/60' : 'text-black/60'"
          >BY ANONYMOUS</span
        >
      </div>
      <!-- Custom Title Bar -->
      <div
        class="fixed top-0 left-0 right-0 h-8 flex items-center justify-between px-4 z-[9999] select-none transition-all duration-300"
        :class="[
          isDarkMode
            ? 'bg-black/90 border-white/10'
            : 'bg-[#cfc9b5]/90 border-black/10',
          { 'pointer-events-auto': isIgnoringCursorEvents },
        ]"
        :style="
          isIgnoringCursorEvents
            ? 'pointer-events: auto; backdrop-filter: none;'
            : ''
        "
      >
        <!-- 双击标题栏退出穿透模式 -->
        <div
          class="absolute inset-0"
          :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
          @mousedown="startDrag"
          @mouseup="stopDrag"
          @dblclick="toggleIgnoreCursorEvents"
        ></div>

        <div class="flex items-center space-x-2 relative z-10">
          <button
            @click="closeWindow"
            class="w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200 bg-[#ff5f57] hover:bg-[#e04841] cursor-pointer"
          >
            <svg
              class="w-2 h-2 opacity-0 hover:opacity-100"
              style="color: #820005"
              viewBox="0 0 8 8"
              fill="none"
            >
              <path
                d="M1 1l6 6M7 1l-6 6"
                stroke="currentColor"
                stroke-width="1.5"
              />
            </svg>
          </button>
          <button
            @click="minimizeWindow"
            class="w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200 bg-[#ffbd2e] hover:bg-[#e5a91f] cursor-pointer"
          >
            <svg
              class="w-2 h-2 opacity-0 hover:opacity-100"
              style="color: #995700"
              viewBox="0 0 8 8"
              fill="none"
            >
              <path d="M1 4h6" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
          <button
            @click="toggleMaximize"
            class="w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200 bg-[#28c840] hover:bg-[#1eb830] cursor-pointer"
          >
            <svg
              class="w-2 h-2 opacity-0 hover:opacity-100"
              style="color: #006500"
              viewBox="0 0 8 8"
              fill="none"
            >
              <path
                d="M1 3v4h4M3 1h4v4"
                stroke="currentColor"
                stroke-width="1.2"
              />
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-1 relative z-10">
          <!-- 穿透模式提示 -->
          <span
            v-if="isIgnoringCursorEvents"
            class="text-xs text-rose-400 font-medium mr-2 animate-pulse"
          >
            按 Esc 或 Ctrl+Shift+X 退出
          </span>
          <!-- 深色/浅色模式切换 -->
          <button
            @click="toggleDarkMode"
            class="w-7 h-7 flex items-center justify-center rounded-md btn-spring hover:scale-110 hover:-translate-y-0.5 hover:shadow-lg"
            :class="isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'"
            @mouseenter="
              showTooltip($event, isDarkMode ? '浅色模式' : '深色模式')
            "
            @mouseleave="hideTooltip"
          >
            <!-- 太阳图标：简洁的实心圆形+光芒 -->
            <svg
              v-if="!isDarkMode"
              class="w-4 h-4 text-orange-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
              />
            </svg>
            <!-- 月亮图标：简洁的新月 -->
            <svg
              v-else
              class="w-4 h-4 text-yellow-300"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          <!-- 置顶功能 -->
          <button
            @click="toggleAlwaysOnTop"
            class="w-7 h-7 flex items-center justify-center rounded-md btn-spring hover:scale-110 hover:-translate-y-0.5 hover:shadow-lg"
            :class="[
              isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5',
              isAlwaysOnTop
                ? 'text-blue-400'
                : isDarkMode
                  ? 'text-gray-300'
                  : 'text-gray-600',
            ]"
            @mouseenter="
              showTooltip($event, isAlwaysOnTop ? '取消置顶' : '置顶')
            "
            @mouseleave="hideTooltip"
          >
            <!-- 图钉图标：简洁直观 -->
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M16 4a1 1 0 0 1 1 1v3.586l1.707 1.707a1 1 0 0 1 .293.707v2a1 1 0 0 1-1 1h-5v5l-1 2-1-2v-5H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L7 8.586V5a1 1 0 0 1 1-1h8z"
              />
            </svg>
          </button>

          <!-- 鼠标穿透功能 -->
          <button
            @click="toggleIgnoreCursorEvents"
            class="w-7 h-7 flex items-center justify-center rounded-md btn-spring hover:scale-110 hover:-translate-y-0.5 hover:shadow-lg"
            :class="[
              isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5',
              isIgnoringCursorEvents
                ? 'text-rose-400'
                : isDarkMode
                  ? 'text-gray-300'
                  : 'text-gray-600',
            ]"
            @mouseenter="
              showTooltip(
                $event,
                isIgnoringCursorEvents ? '取消穿透' : '鼠标穿透',
              )
            "
            @mouseleave="hideTooltip"
          >
            <!-- 眼睛图标：直观表示透视/穿透 -->
            <svg
              v-if="!isIgnoringCursorEvents"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <!-- 关闭的眼睛：表示穿透启用 -->
            <svg
              v-else
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>
      </div>

      <div class="pt-8 max-w-2xl mx-auto">
        <!-- TODO 大字 - AGEN 实心 + DA 空心轮廓 -->
        <div class="mb-6 text-left pl-2">
          <h1
            class="text-[22vw] leading-[0.85] font-bold uppercase tracking-[-0.04em] ml-[-0.05em]"
            style="color: #255327"
          >
            TODO
          </h1>
        </div>

        <!-- 笔记本样式 - 输入框和任务列表 -->
        <div class="mx-2 border-l border-t border-r border-black">
          <!-- 输入区域 -->
          <div class="flex border-b border-black">
            <input
              type="text"
              v-model="newTaskTitle"
              @keyup.enter="openAddTaskModal()"
              placeholder="Enter new task..."
              class="flex-1 bg-transparent border-none p-4 text-base font-medium uppercase focus:outline-none"
              :class="
                isDarkMode
                  ? 'text-white placeholder-white/40 focus:bg-white/5'
                  : 'text-black placeholder-black/40 focus:bg-black/5'
              "
            />
            <button
              @click="openAddTaskModal()"
              class="w-[60px] flex-shrink-0 flex items-center justify-center border-l border-black text-2xl transition-colors"
              :class="
                isDarkMode
                  ? 'text-white hover:bg-white hover:text-black'
                  : 'text-black hover:bg-black hover:text-[#cfc9b5]'
              "
            >
              +
            </button>
          </div>

          <!-- Task List -->
          <div
            v-if="state.loading"
            class="text-center py-12"
            :class="isDarkMode ? 'text-white/80' : 'text-[#777777]'"
          >
            加载中...
          </div>
          <div v-else-if="displayedTasks.length === 0"></div>
          <TransitionGroup v-else name="task-slide" tag="div" class="relative">
            <div
              v-for="task in displayedTasks"
              :key="task.id"
              class="flex items-center border-b border-black h-16"
            >
              <!-- 自定义复选框 -->
              <label
                class="relative w-5 h-5 flex-shrink-0 mx-4 self-center cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="task.status === 'completed'"
                  @change="toggleComplete(task)"
                  class="absolute opacity-0 cursor-pointer h-0 w-0"
                />
                <span
                  class="absolute top-0 left-0 w-5 h-5 border-[1.5px] rounded-sm checkbox-animate"
                  :class="[
                    task.status === 'completed'
                      ? isDarkMode
                        ? 'border-white/50'
                        : 'border-black/50'
                      : isDarkMode
                        ? 'border-white/40'
                        : 'border-gray-400',
                  ]"
                ></span>
                <!-- 勾选图标 - 手绘风格 -->
                <svg
                  v-if="task.status === 'completed'"
                  class="absolute top-0 left-0 w-5 h-5 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :class="isDarkMode ? 'text-white/70' : 'text-black/50'"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </label>
              <!-- 内容区域 -->
              <div class="flex-1 pr-4 min-w-0 overflow-hidden self-center">
                <span
                  class="font-medium uppercase block"
                  :class="[
                    task.status === 'completed'
                      ? isDarkMode
                        ? 'line-through text-white/40'
                        : 'line-through decoration-[1.5px] text-black/50'
                      : isDarkMode
                        ? 'text-white'
                        : 'text-black',
                  ]"
                  >{{ task.title }}</span
                >
                <div
                  v-if="task.description"
                  class="text-xs mt-0.5 line-clamp-1"
                  :class="isDarkMode ? 'text-white/50' : 'text-gray-500'"
                >
                  {{ task.description }}
                </div>
              </div>
              <!-- 删除按钮 -->
              <div class="w-8 flex-shrink-0 mr-4 flex justify-end self-center">
                <button
                  @click="deleteTask(task.id)"
                  class="p-1.5 transition-colors opacity-0 hover:opacity-100"
                >
                  <svg
                    class="w-4 h-4"
                    :class="isDarkMode ? 'text-white/40' : 'text-black/50'"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </TransitionGroup>

          <!-- 已完成任务 -->
          <div v-if="completedTasks.length > 0">
            <TransitionGroup name="task-slide" tag="div" class="relative">
              <div
                v-for="task in completedTasks"
                :key="task.id"
                class="flex items-center border-b border-black h-16"
              >
                <!-- 自定义复选框 -->
                <label
                  class="relative w-5 h-5 flex-shrink-0 mx-4 self-center cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="task.status === 'completed'"
                    @change="toggleComplete(task)"
                    class="absolute opacity-0 cursor-pointer h-0 w-0"
                  />
                  <span
                    class="absolute top-0 left-0 w-5 h-5 border-[1.5px] rounded-sm checkbox-animate"
                    :class="isDarkMode ? 'border-white/50' : 'border-black'"
                  ></span>
                  <!-- 勾选图标 - 手绘风格 -->
                  <svg
                    class="absolute top-0 left-0 w-5 h-5 pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    :class="isDarkMode ? 'text-white/60' : 'text-black/50'"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </label>
                <div class="flex-1 pr-4 min-w-0 overflow-hidden self-center">
                  <span
                    class="font-medium uppercase line-through block"
                    :class="
                      isDarkMode
                        ? 'text-white/40 decoration-white/40'
                        : 'text-black/50 decoration-[1.5px]'
                    "
                    >{{ task.title }}</span
                  >
                  <div
                    v-if="task.description"
                    class="text-xs mt-0.5 line-clamp-1"
                    :class="isDarkMode ? 'text-white/20' : 'text-black/30'"
                  >
                    {{ task.description }}
                  </div>
                </div>
                <div
                  class="w-8 flex-shrink-0 mr-4 flex justify-end self-center"
                >
                  <button
                    @click="deleteTask(task.id)"
                    class="p-1.5 transition-colors opacity-0 hover:opacity-100"
                  >
                    <svg
                      class="w-4 h-4"
                      :class="isDarkMode ? 'text-white/30' : 'text-black/50'"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>

        <!-- 逾期任务（在笔记本边框外单独显示） -->
        <div v-if="overdueTasks.length > 0" class="mx-2 mt-4">
          <h2
            class="text-lg font-semibold mb-2"
            :class="isDarkMode ? 'text-red-400' : 'text-[#e84a1b]'"
          >
            逾期任务
          </h2>
          <div class="border-l border-black pl-4 w-full box-border">
            <div
              v-for="task in overdueTasks"
              :key="task.id"
              class="flex items-center w-full p-3 border-b border-black/20 box-border"
              :class="isDarkMode ? 'border-white/10' : ''"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0 w-full">
                <input
                  type="checkbox"
                  :checked="task.status === 'completed'"
                  @change="toggleComplete(task)"
                  class="w-5 h-5 rounded-none cursor-pointer border-2 bg-transparent flex-shrink-0"
                  :class="isDarkMode ? 'border-white' : 'border-black'"
                />
                <div class="flex-1 min-w-0">
                  <span
                    class="font-medium uppercase truncate block"
                    :class="isDarkMode ? 'text-white' : 'text-black'"
                    >{{ task.title }}</span
                  >
                  <p
                    class="text-xs"
                    :class="isDarkMode ? 'text-rose-400' : 'text-[#e84a1b]'"
                  >
                    截止：{{ new Date(task.deadline!).toLocaleString() }}
                  </p>
                  <p
                    v-if="task.description"
                    class="text-xs mt-1 line-clamp-2"
                    :class="isDarkMode ? 'text-white/50' : 'text-gray-500'"
                  >
                    {{ task.description }}
                  </p>
                </div>
              </div>
              <div class="flex items-center space-x-2 ml-3 flex-shrink-0">
                <button
                  @click="snoozeTask(task, 1)"
                  class="px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap"
                  :class="
                    isDarkMode
                      ? 'border-white/50 text-white hover:bg-white hover:text-black'
                      : 'border-black text-black hover:bg-black hover:text-white'
                  "
                >
                  延后1天
                </button>
                <button
                  @click="snoozeTask(task, 7)"
                  class="px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap"
                  :class="
                    isDarkMode
                      ? 'border-white/50 text-white hover:bg-white hover:text-black'
                      : 'border-black text-black hover:bg-black hover:text-white'
                  "
                >
                  延后7天
                </button>
                <button
                  @click="deleteTask(task.id)"
                  class="p-1.5 rounded-lg transition-colors flex-shrink-0"
                  :class="
                    isDarkMode
                      ? 'text-rose-400 hover:bg-rose-900/50'
                      : 'text-[#e84a1b] hover:bg-rose-100'
                  "
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <div
        v-if="isEditModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="closeEditModal"
      >
        <div
          class="w-full max-w-md border border-black"
          :class="isDarkMode ? 'bg-slate-900/95' : 'bg-[#cfc9b5]'"
        >
          <!-- 标题栏 -->
          <div
            class="flex items-center justify-between p-4 border-b border-black"
          >
            <h2
              class="text-lg font-semibold uppercase"
              :class="isDarkMode ? 'text-white' : 'text-black'"
            >
              编辑任务
            </h2>
            <button
              @click="closeEditModal"
              class="p-1 hover:bg-black/10 transition-colors"
            >
              <svg
                class="w-5 h-5"
                :class="isDarkMode ? 'text-white' : 'text-black'"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <!-- 表单内容 -->
          <form @submit.prevent="saveEdit" class="p-4">
            <div class="mb-4">
              <label
                class="block text-sm mb-1.5 uppercase font-medium"
                :class="isDarkMode ? 'text-white/80' : 'text-black'"
                >标题</label
              >
              <input
                v-model="editTitle"
                class="w-full px-4 py-2.5 border border-black transition-all uppercase"
                :class="
                  isDarkMode
                    ? 'bg-black/30 text-white placeholder-white/40'
                    : 'bg-white/50 text-black placeholder-black/40'
                "
                required
              />
            </div>
            <div class="mb-4">
              <label
                class="block text-sm mb-1.5 uppercase font-medium"
                :class="isDarkMode ? 'text-white/80' : 'text-black'"
                >描述</label
              >
              <textarea
                v-model="edit描述"
                rows="2"
                class="w-full px-4 py-2.5 border border-black transition-all resize-none uppercase"
                :class="
                  isDarkMode
                    ? 'bg-black/30 text-white placeholder-white/40'
                    : 'bg-white/50 text-black placeholder-black/40'
                "
              ></textarea>
            </div>
            <div class="mb-5">
              <label
                class="block text-sm mb-1.5 uppercase font-medium"
                :class="isDarkMode ? 'text-white/80' : 'text-black'"
                >截止日期</label
              >
              <input
                type="datetime-local"
                v-model="edit截止日期"
                class="w-full px-4 py-2.5 border border-black transition-all"
                :class="
                  isDarkMode
                    ? 'bg-black/30 text-white'
                    : 'bg-white/50 text-black'
                "
              />
            </div>
            <div class="flex gap-3">
              <button
                type="submit"
                class="flex-1 px-4 py-2.5 font-medium transition-all border border-black uppercase"
                :class="
                  isDarkMode
                    ? 'bg-white text-black hover:bg-white/80'
                    : 'bg-black text-[#cfc9b5] hover:bg-black/80'
                "
              >
                保存修改
              </button>
              <button
                type="button"
                @click="closeEditModal"
                class="flex-1 px-4 py-2.5 font-medium transition-all border border-black uppercase"
                :class="
                  isDarkMode
                    ? 'text-white hover:bg-white/10'
                    : 'text-black hover:bg-black/5'
                "
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Add Task Modal -->
      <div
        v-if="isAddTaskModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl"
        @click.self="closeAddTaskModal"
      >
        <div
          class="w-full max-w-sm rounded-xl shadow-xl border overflow-hidden"
          :class="
            isDarkMode
              ? 'bg-slate-900/80 border-white/10 shadow-black/50'
              : 'bg-[#cfc9b5]/80 border-black/10 shadow-black/20'
          "
        >
          <!-- 标题栏 -->
          <div
            class="flex items-center justify-between p-4 border-b"
            :class="isDarkMode ? 'border-white/10' : 'border-black/10'"
          >
            <h2
              class="text-lg font-semibold"
              :class="isDarkMode ? 'text-white' : 'text-black'"
            >
              添加新任务
            </h2>
            <button
              @click="closeAddTaskModal"
              class="p-1.5 rounded-lg transition-colors"
              :class="isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/10'"
            >
              <svg
                class="w-5 h-5"
                :class="isDarkMode ? 'text-white/70' : 'text-black/70'"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <!-- 表单内容 -->
          <form @submit.prevent="addTask" class="p-4">
            <div class="mb-4">
              <label
                class="block text-sm font-medium mb-1.5"
                :class="isDarkMode ? 'text-white/70' : 'text-black/70'"
                >标题</label
              >
              <input
                v-model="newTaskTitle"
                placeholder="输入任务标题..."
                class="w-full px-3 py-2 rounded-lg transition-all outline-none"
                :class="
                  isDarkMode
                    ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-white/30 focus:bg-white/10 focus:ring-2 focus:ring-white/20'
                    : 'bg-white/40 border border-black/10 text-black placeholder-black/40 focus:border-black/30 focus:bg-white/60 focus:ring-2 focus:ring-black/20'
                "
                required
              />
            </div>
            <div class="mb-4">
              <label
                class="block text-sm font-medium mb-1.5"
                :class="isDarkMode ? 'text-white/70' : 'text-black/70'"
                >描述（可选）</label
              >
              <textarea
                v-model="newTask描述"
                placeholder="添加描述..."
                rows="2"
                class="w-full px-3 py-2 rounded-lg transition-all outline-none resize-none"
                :class="
                  isDarkMode
                    ? 'bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-white/30 focus:bg-white/10 focus:ring-2 focus:ring-white/20'
                    : 'bg-white/40 border border-black/10 text-black placeholder-black/40 focus:border-black/30 focus:bg-white/60 focus:ring-2 focus:ring-black/20'
                "
              ></textarea>
            </div>
            <div class="mb-4">
              <label
                class="block text-sm font-medium mb-1.5"
                :class="isDarkMode ? 'text-white/70' : 'text-black/70'"
                >截止日期</label
              >
              <input
                type="datetime-local"
                v-model="newTask截止日期"
                class="w-full px-3 py-2 rounded-lg transition-all outline-none"
                :class="
                  isDarkMode
                    ? 'bg-white/5 border border-white/10 text-white focus:border-white/30 focus:bg-white/10 focus:ring-2 focus:ring-white/20'
                    : 'bg-white/40 border border-black/10 text-black focus:border-black/30 focus:bg-white/60 focus:ring-2 focus:ring-black/20'
                "
              />
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                class="flex-1 px-4 py-2 font-medium rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                :class="
                  isDarkMode
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/20'
                    : 'bg-gradient-to-r from-slate-700 to-slate-800 text-white hover:from-slate-600 hover:to-slate-700 shadow-lg shadow-black/20'
                "
              >
                添加任务
              </button>
              <button
                type="button"
                @click="closeAddTaskModal"
                class="flex-1 px-4 py-2 font-medium rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                :class="
                  isDarkMode
                    ? 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/10'
                    : 'bg-black/5 text-black/70 hover:bg-black/10 border border-black/10'
                "
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Bottom Status Bar - Geek Progress Bar -->
      <div class="fixed bottom-0 left-0 right-0">
        <GeekProgressBar :stats="taskStats" :is-dark-mode="isDarkMode" />
      </div>
    </div>
  </main>
</template>

<style>
:root {
  --text-primary: #000000;
}

html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* Custom scrollbar - glassmorphism style */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dark ::-webkit-scrollbar-thumb {
  background: rgba(71, 85, 105, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.5);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* Focus styles */
input:focus,
select:focus,
textarea:focus,
button:focus {
  outline: none;
}

/* Smooth transitions - 基础交互元素 */
.interactive {
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

/* 按钮和可点击元素的弹性过渡 */
.btn-spring {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.3s ease;
}

/* Task list transition animations - 流畅列表动画 */
.task-slide-move {
  transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* 进入动画 - 从右侧滑入带弹性 */
.task-slide-enter-from {
  opacity: 0;
  transform: translateX(60px);
}

.task-slide-enter-to {
  opacity: 1;
  transform: translateX(0);
}

.task-slide-enter-active {
  transition:
    opacity 0.35s ease-out,
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 离开动画 - 淡出向左滑出 */
.task-slide-leave-from {
  opacity: 1;
  transform: translateX(0) scale(1);
}

.task-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px) scale(0.95);
}

.task-slide-leave-active {
  transition:
    opacity 0.3s ease-in,
    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  width: 100%;
  z-index: 0;
}

/* 复选框动画 */
.checkbox-animate {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.checkbox-animate:checked {
  animation: check-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes check-pop {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* 任务完成时的动画 */
.task-complete {
  animation: task-complete-flash 0.4s ease-out;
}

@keyframes task-complete-flash {
  0% {
    background-color: transparent;
  }
  30% {
    background-color: rgba(34, 197, 94, 0.15);
  }
  100% {
    background-color: transparent;
  }
}

/* 深色模式下日期选择器日历图标 */
.dark input[type="datetime-local"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
}
</style>
