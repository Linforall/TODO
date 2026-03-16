# CLAUDE.md

此文件为在代码仓库中使用 Claude Code (claude.ai/code) 提供指导。

## 项目概述

基于 Tauri 2.x + Vue 3 + TypeScript + SQLite 构建的桌面待办事项应用。功能包括：任务管理（优先级、截止日期、子任务）、系统通知、窗口控制（置顶、鼠标穿透）、深色/浅色模式及毛玻璃 UI 风格。

## 命令

```bash
# 前端开发
pnpm dev          # 启动 Vite 开发服务器 (http://localhost:1420)
pnpm build        # 类型检查并构建前端到 dist/

# Tauri 开发
pnpm tauri dev   # 热重载模式运行应用
pnpm tauri build # 构建生产版本可执行文件

# 生产构建的 .exe 位于 src-tauri/target/release/
```

## 架构

### 前端 (Vue 3 + TypeScript)
- **入口**: `src/main.ts` - 初始化 Vue 应用和 SQLite 数据库
- **主界面**: `src/App.vue` - 单页应用，包含所有组件；使用 Tailwind CSS 实现毛玻璃风格
- **状态管理**: `src/store.ts` - Vue reactive 状态，包含 CRUD 操作和"恐慌值"排序算法
- **数据库**: `src/db.ts` - 通过 `@tauri-apps/plugin-sql` 操作 SQLite；Task 接口包含 parent_id 支持子任务
- **通知**: `src/notification.ts` - 每 5 分钟检查即将到期的任务并发送系统通知

### 后端 (Rust/Tauri)
- **主入口**: `src-tauri/src/lib.rs` - Tauri 命令：窗口控制、通知、全局快捷键
- **窗口控制**: 自定义标题栏（tauri.conf.json 中 decorations: false）；通过 `startDragging()` 拖动窗口
- **穿透模式**: 鼠标事件穿透窗口（点击穿透）；Escape 键退出模式
- **全局快捷键**: Ctrl+Shift+X 退出穿透模式

### 数据库结构
```sql
tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  deadline DATETIME,
  reminder_at DATETIME,
  priority INTEGER DEFAULT 3,  -- 0: 紧急且重要, 1: 重要, 2: 紧急, 3: 普通
  status TEXT DEFAULT 'pending',  -- pending, ongoing, completed, skipped
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Tauri 配置
- `src-tauri/tauri.conf.json` - 窗口大小 800x600，自定义标题栏，开发服务器端口 1420
- 使用插件: sql, notification, global-shortcut, opener

## 关键实现细节

- **智能排序**: 按"恐慌值"排序任务 - 结合优先级权重（0 最高）和距离截止日期的时间
- **子任务**: 通过 parent_id 外键实现层级结构；显示在可展开的父任务下方
- **深色模式**: 通过 isDarkMode ref 切换；动态改变背景和毛玻璃透明度
- **毛玻璃效果**: backdrop-blur-2xl 配合半透明背景 (bg-white/30, bg-white/40)

## 图标使用规范

项目图标获取和使用的标准规范。

### 图标来源

- **Iconify 图标库**: https://icones.js.org/ - 推荐使用，包含数千个开源图标
- **Heroicons**: https://heroicons.com/ - 作为备用参考风格

### 使用方式

#### 方式一：内联 SVG（推荐用于简单图标）
对于简单的图标（如窗口控制、功能按钮），直接内联 SVG 到组件中：

```vue
<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
</svg>
```

#### 方式二：Iconify Vue 组件（推荐用于大量图标）
如需使用大量图标，可安装 `@iconify/vue` 库：

```bash
pnpm add @iconify/vue
```

使用示例：
```vue
<script setup>
import { Icon } from '@iconify/vue'
</script>

<template>
  <Icon icon="ph:checkmark-circle-fill" class="w-5 h-5" />
</template>
```

### 当前使用的图标

项目中已使用的图标（内联 SVG）：

| 图标 | 用途 |
|------|------|
| 关闭按钮 (X) | 关闭窗口、模态框 |
| 最小化 (横线) | 最小化窗口 |
| 最大化 (框) | 最大化/还原窗口 |
| 太阳/月亮 | 深色/浅色模式切换 |
| 图钉 | 窗口置顶功能 |
| 眼睛 | 鼠标穿透模式 |
| 垃圾桶 | 删除任务 |

### 图标选择建议

- **简单功能**: 使用内联 SVG，减少依赖
- **复杂图标集**: 使用 Iconify，按需加载
- **风格统一**: 优先选择 Outline 或 Solid 风格，保持一致
- **尺寸统一**: 使用 Tailwind 的 w-5 h-5 或自定义类确保尺寸一致

## Git 提交规范

提交代码时需遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，格式如下：

```
<类型>(<范围>): <描述>

[可选的正文]

[可选的脚注]
```

### 提交类型 (type)

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式调整（不影响功能） |
| `refactor` | 代码重构（不影响功能） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建过程或辅助工具变动 |

### 提交示例

```bash
# 功能提交
git commit -m "feat: 添加任务过期提醒功能"

# 修复提交
git commit -m "fix: 修复深色模式下文字颜色对比度问题"

# 多文件修改
git commit -m "feat: 优化毛玻璃视觉效果
- 添加透明窗口配置
- 更新所有组件的模糊效果强度
- 修复深色模式切换问题"
```

### 注意事项

- 使用中文编写提交描述
- 描述应简洁明了，说明本次修改的内容
- 保持提交粒度适中，一个提交只做一件事

## 代码格式化

生成或修改代码后，必须对文件进行格式化：

```bash
# 格式化前端代码 (Vue/TypeScript)
pnpm exec prettier --write src/**/*.vue src/**/*.ts

# 格式化 Rust 代码
cd src-tauri && cargo fmt
```

- 前端使用 Prettier 格式化
- Rust 使用 cargo fmt 格式化
