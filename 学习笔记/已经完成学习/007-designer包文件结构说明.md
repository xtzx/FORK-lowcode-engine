# Designer 包文件结构与功能说明

## 目录结构概览

```
packages/designer/src/
├── builtin-simulator/          # 内置模拟器（画布渲染核心）
├── component-actions.ts        # 组件操作相关动作
├── component-meta.ts          # 组件元数据管理
├── context-menu-actions.ts    # 右键菜单动作
├── designer/                  # 设计器核心
├── document/                  # 文档模型
├── icons/                     # 图标组件
├── locale/                    # 国际化
├── plugin/                    # 插件系统
├── project/                   # 项目管理
├── simulator.ts              # 模拟器接口定义
├── transducers/              # 数据转换器
├── types/                    # 类型定义
└── utils/                    # 工具函数
```

## 详细文件功能说明

### 1. builtin-simulator/ （内置模拟器）

**核心作用**：负责画布的渲染和交互，是设计器与渲染器之间的桥梁

```
builtin-simulator/
├── bem-tools/                 # 画布辅助工具
│   ├── bem-tools.less        # 样式
│   ├── border-container.tsx   # 边框容器
│   ├── border-detecting.tsx   # 边框检测（悬停效果）
│   ├── border-resizing.tsx    # 边框调整大小
│   ├── border-selecting.tsx   # 边框选中效果
│   ├── borders.less           # 边框样式
│   ├── drag-resize-engine.ts  # 拖拽调整大小引擎
│   ├── index.tsx              # BemTools 主入口
│   ├── insertion.less         # 插入指示器样式
│   ├── insertion.tsx          # 插入位置指示器
│   └── manager.ts             # 工具管理器
├── context.ts                 # 模拟器上下文
├── create-simulator.ts        # 创建模拟器函数（注入资源到iframe）
├── host-view.tsx              # 模拟器视图组件（Canvas、Content）
├── host.less                  # 模拟器样式
├── host.ts                    # 模拟器主机（核心逻辑）
├── index.ts                   # 导出入口
├── live-editing/              # 实时编辑
│   └── live-editing.ts        # 内联编辑功能
├── node-selector/             # 节点选择器
│   ├── index.less            # 样式
│   └── index.tsx             # 节点选择组件
├── renderer.ts               # 渲染器接口
├── resource-consumer.ts      # 资源消费者（管理组件、样式等资源）
├── utils/                    # 工具函数
│   ├── clickable.ts         # 点击判断
│   ├── parse-metadata.ts    # 元数据解析
│   ├── path.ts              # 路径处理
│   └── throttle.ts          # 节流函数
└── viewport.ts               # 视口管理（缩放、滚动）
```

### 2. designer/ （设计器核心）

**核心作用**：管理设计器的核心功能，包括拖拽、选择、定位等

```
designer/
├── active-tracker.ts          # 激活状态跟踪器
├── clipboard.ts              # 剪贴板功能
├── designer-view.tsx         # 设计器主视图
├── designer.less             # 设计器样式
├── designer.ts               # 设计器核心类
├── detecting.ts              # 元素检测（悬停、点击）
├── drag-ghost/               # 拖拽幽灵（拖拽时的预览）
│   ├── ghost.less           # 样式
│   ├── index.tsx            # 拖拽幽灵组件
│   └── README.md            # 说明文档
├── dragon.ts                 # 拖拽引擎（Dragon）
├── index.ts                  # 导出入口
├── location.ts               # 位置定位（投放位置计算）
├── offset-observer.ts        # 偏移观察者（同步辅助UI）
├── scroller.ts              # 滚动管理
└── setting/                  # 设置面板
    ├── index.ts             # 导出
    ├── setting-entry-type.ts # 设置项类型
    ├── setting-field.ts     # 设置字段
    ├── setting-prop-entry.ts # 属性设置项
    ├── setting-top-entry.ts  # 顶部设置项
    └── utils.ts             # 工具函数
```

### 3. document/ （文档模型）

**核心作用**：管理页面文档的数据模型和操作

```
document/
├── document-model.ts         # 文档模型（核心）
├── document-view.tsx        # 文档视图
├── history.ts               # 历史记录（撤销/重做）
├── index.ts                 # 导出入口
├── node/                    # 节点系统
│   ├── exclusive-group.ts  # 互斥组（如Tab切换）
│   ├── index.ts            # 导出
│   ├── modal-nodes-manager.ts # 弹窗节点管理
│   ├── node-children.ts    # 子节点管理
│   ├── node.ts             # 节点基类（核心）
│   ├── props/              # 属性系统
│   │   ├── prop.ts        # 单个属性
│   │   ├── props.ts       # 属性集合
│   │   └── value-to-source.ts # 值转源码
│   └── transform-stage.ts  # 转换阶段（设计态/渲染态）
└── selection.ts             # 选中管理
```

### 4. 其他重要文件

```
├── component-actions.ts      # 组件操作（删除、复制、粘贴等）
├── component-meta.ts         # 组件元数据（配置、属性定义）
├── context-menu-actions.ts   # 右键菜单动作定义
├── project/                  # 项目管理
│   ├── project.ts           # 项目模型（管理多文档）
│   ├── project-view.tsx     # 项目视图
│   └── project.less         # 样式
├── plugin/                   # 插件系统
│   ├── plugin.ts            # 插件基类
│   ├── plugin-manager.ts    # 插件管理器
│   ├── plugin-context.ts    # 插件上下文
│   └── plugin-utils.ts      # 插件工具
├── icons/                    # 图标组件
│   ├── clone.tsx            # 克隆图标
│   ├── component.tsx        # 组件图标
│   ├── container.tsx        # 容器图标
│   ├── lock.tsx             # 锁定图标
│   └── ...                  # 其他图标
├── locale/                   # 国际化
│   ├── zh-CN.json          # 中文
│   └── en-US.json          # 英文
└── utils/                    # 工具函数
    ├── misc.ts              # 杂项工具
    ├── tree.ts              # 树操作
    └── slot.ts              # 插槽处理
```

## 核心功能模块详解

### 最重要的文件（需要重点理解）

#### 1. **host.ts** (1623行)

- iframe 生命周期管理
- 资源加载和注入
- 事件处理（拖拽、选择、编辑）
- 与渲染器通信

#### 2. **dragon.ts** (640行)

- 拖拽引擎核心
- 处理从组件库拖入
- 处理画布内拖拽
- 投放位置计算

#### 3. **node.ts**

- 节点树管理
- 组件增删改查
- 属性管理
- 父子关系维护

#### 4. **document-model.ts**

- 文档数据管理
- Schema 导入导出
- 历史记录
- 事件通知

#### 5. **designer.ts**

- 设计器总控制器
- 协调各模块
- 对外API接口
- 全局状态管理

### 关键交互流程

1. **组件拖入流程**：

   - dragon.ts 处理拖拽 → location.ts 计算位置 → node.ts 创建节点 → host.ts 通知渲染
2. **属性修改流程**：

   - setting-field.ts 触发 → prop.ts 更新 → document-model.ts 记录 → host.ts 通知渲染
3. **画布交互流程**：

   - detecting.ts 检测 → selection.ts 选中 → bem-tools 显示 → active-tracker.ts 跟踪状态
