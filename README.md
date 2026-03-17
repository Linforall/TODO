# TODO - 桌面待办事项应用

基于 Tauri 2.x + Vue 3 + TypeScript + SQLite 构建的桌面待办事项应用。

## 功能特性

- **任务管理**：支持截止日期、子任务
- **系统通知**：定时检查即将到期的任务并发送通知
- **窗口控制**：自定义标题栏，支持置顶、鼠标穿透模式
- **主题模式**：深色/浅色模式切换，毛玻璃 UI 风格
- **智能排序**：按截止日期自动排序任务

## 技术栈

- **前端**：Vue 3 + TypeScript + Tailwind CSS
- **后端**：Rust + Tauri 2.x
- **数据库**：SQLite
- **插件**：sql, notification, global-shortcut, opener

## 快速开始

### 前端开发

```bash
pnpm dev          # 启动 Vite 开发服务器 (http://localhost:1420)
pnpm build        # 类型检查并构建前端到 dist/
```

### Tauri 开发

```bash
pnpm tauri dev   # 热重载模式运行应用
pnpm tauri build # 构建生产版本可执行文件
```

生产构建的 .exe 位于 `src-tauri/target/release/`

## 项目结构

```
TODO/
├── src/                    # 前端源码
│   ├── App.vue            # 主界面组件
│   ├── main.ts            # 入口文件
│   ├── store.ts           # 状态管理
│   ├── db.ts              # 数据库操作
│   └── notification.ts    # 通知模块
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   └── main.rs        # Tauri 命令
│   └── tauri.conf.json    # Tauri 配置
├── dist/                  # 前端构建输出
└── README.md
```

## 快捷键

- `Ctrl+Shift+X`：退出鼠标穿透模式
- `Escape`：退出鼠标穿透模式

## 许可证

MIT
