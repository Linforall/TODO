<template>
  <!-- 极客风格进度条 - 底部状态栏版 -->
  <div class="geek-progress-bar" :class="{ 'dark-mode': isDarkMode }">
    <!-- 左侧标签 -->
    <div class="progress-label">
      <span class="terminal-prompt">&gt;</span>
      <span class="label-text">PROGRESS</span>
    </div>

    <!-- 进度条主体 -->
    <div class="progress-track">
      <div
        class="progress-fill"
        :style="{ width: percentage + '%' }"
      ></div>
    </div>

    <!-- 百分比和计数 -->
    <div class="progress-info">
      <span class="percentage">{{ percentage }}%</span>
      <span class="count">{{ stats.completed }}/{{ stats.total }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  stats: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  };
  isDarkMode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isDarkMode: false
});

const percentage = computed(() => {
  if (props.stats.total === 0) return 0;
  return Math.round((props.stats.completed / props.stats.total) * 100);
});
</script>

<style scoped>
.geek-progress-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  height: 24px;
  background: #cfc9b5;
  border-top: 1px solid rgba(0, 0, 0, 0.15);
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 10px;
  color: #000;
}

/* 暗色模式 */
.geek-progress-bar.dark-mode {
  background: #0a0a0a;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
}

.progress-label {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.terminal-prompt {
  color: #000;
  animation: blink 1s infinite;
}

.geek-progress-bar.dark-mode .terminal-prompt {
  color: #39ff14;
}

.label-text {
  color: #444;
  letter-spacing: 1px;
}

.geek-progress-bar.dark-mode .label-text {
  color: #888;
}

.progress-track {
  flex: 1;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.geek-progress-bar.dark-mode .progress-track {
  background: rgba(255, 255, 255, 0.1);
}

.progress-fill {
  height: 100%;
  background: #000;
  border-radius: 2px;
  transition: width 0.4s ease-out;
  min-width: 0;
}

.geek-progress-bar.dark-mode .progress-fill {
  background: linear-gradient(90deg, #2db812, #39ff14);
  box-shadow: 0 0 6px #39ff14;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.percentage {
  color: #000;
  font-weight: bold;
}

.geek-progress-bar.dark-mode .percentage {
  color: #39ff14;
}

.count {
  color: #444;
  letter-spacing: 0.5px;
}

.geek-progress-bar.dark-mode .count {
  color: #888;
}

/* 动画 */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
