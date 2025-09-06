# Workbench 工作台架构详解

## 一、概述

低代码引擎提供了两种不同的工作台模式，通过不同的 Workbench 组件来实现：

- **Workbench**（普通模式）：来自 `packages/editor-skeleton/src/layouts/workbench.tsx`
- **WorkSpaceWorkbench**（工作空间模式）：来自 `packages/workspace/src/layouts/workbench.tsx`

## 二、两种模式的选择机制

### 模式选择入口
在 `packages/engine/src/engine-core.ts` 第 237-267 行：

```typescript
// 应用级设计模式（工作空间模式）
if (options && options.enableWorkspaceMode) {
    render(
        createElement(WorkSpaceWorkbench, {  // 使用 WorkSpaceWorkbench
            workspace: innerWorkspace,
            className: 'engine-main',
            topAreaItemClassName: 'engine-actionitem',
        }),
        engineContainer,
    );
    // 工作空间特有的初始化
    innerWorkspace.enableAutoOpenFirstWindow = engineConfig.get('enableAutoOpenFirstWindow', true);
    innerWorkspace.setActive(true);
    innerWorkspace.initWindow();
    await innerWorkspace.plugins.init(pluginPreference);
    return;
}

// 普通模式
await plugins.init(pluginPreference as any);
render(
    createElement(Workbench, {  // 使用普通 Workbench
        skeleton: innerSkeleton,
        className: 'engine-main',
        topAreaItemClassName: 'engine-actionitem',
    }),
    engineContainer,
);
```

### 别名导入机制
```typescript
// engine-core.ts 第 33 行
import { Workspace as InnerWorkspace, Workbench as WorkSpaceWorkbench, IWorkspace } from '../../workspace/src';
```

**重要说明**：`WorkSpaceWorkbench` 实际上就是 `packages/workspace/src/layouts/workbench.tsx` 中的 `Workbench` 组件的别名。

## 三、WorkSpaceWorkbench（工作空间模式）

### 使用场景
1. **多项目管理**：需要同时编辑多个项目或页面
2. **多窗口编辑**：需要在不同编辑器之间快速切换
3. **外部工具集成**：需要集成第三方编辑工具（webview 模式）
4. **企业级应用**：复杂的工作流和多人协作场景

### 核心特性

#### 1. 多窗口管理
```tsx
// packages/workspace/src/layouts/workbench.tsx:58-67
<div className="lc-workspace-workbench-window">
  {
    workspace.windows.map(d => (
      <WindowView
        active={d.id === workspace.window?.id}
        window={d}
        key={d.id}
      />
    ))
  }
</div>
```

#### 2. 窗口类型支持
- **editor 类型**：标准低代码编辑器
- **webview 类型**：嵌入外部网页工具

#### 3. 动态窗口创建
```typescript
// workspace.openEditorWindow()
const resource = new Resource(resourceData, resourceType, workspace);
const window = new EditorWindow(resource, workspace, config);
this.windows = [...this.windows, window];
```

### 布局结构
```
WorkSpaceWorkbench
├── TopArea                    # 顶部工具栏
├── WorkbenchBody
│   ├── LeftArea              # 左侧面板
│   ├── LeftFloatPane         # 左侧浮动面板
│   ├── LeftFixedPane         # 左侧固定面板
│   └── WorkbenchCenter
│       ├── WorkbenchCenterContent
│       │   ├── SubTopArea    # 子顶部区域
│       │   └── WorkbenchWindow  # 🔥 核心窗口区域
│       │       ├── WindowView 1 (active)
│       │       ├── WindowView 2 (inactive)
│       │       └── WindowView n (inactive)
│       ├── MainArea          # 主内容区域
│       └── BottomArea        # 底部面板
└── TipContainer             # 提示容器
```

### 工作空间生命周期
```typescript
// 1. 工作空间激活
innerWorkspace.setActive(true);

// 2. 初始化窗口
innerWorkspace.initWindow();

// 3. 插件初始化
await innerWorkspace.plugins.init(pluginPreference);

// 4. 窗口管理
workspace.openEditorWindow(name, title, options);
workspace.removeEditorWindow(name, id);
```

## 四、Workbench（普通模式）

### 使用场景
1. **单项目编辑**：专注于单个项目的开发
2. **简单应用**：不需要复杂窗口管理的场景
3. **嵌入式使用**：作为组件嵌入到其他应用中
4. **轻量级编辑器**：快速启动和使用

### 核心特性

#### 1. 固定布局
```tsx
// packages/editor-skeleton/src/layouts/workbench.tsx:31-55
render() {
  return (
    <div className="lc-workbench">
      <SkeletonContext.Provider value={skeleton}>
        <TopArea area={skeleton.topArea} />
        <div className="lc-workbench-body">
          <LeftArea area={skeleton.leftArea} />
          <LeftFloatPane area={skeleton.leftFloatArea} />
          <LeftFixedPane area={skeleton.leftFixedArea} />
          <div className="lc-workbench-center">
            <Toolbar area={skeleton.toolbar} />
            <MainArea area={skeleton.mainArea} />      {/* DesignerPlugin 在这里 */}
            <BottomArea area={skeleton.bottomArea} />
          </div>
          <RightArea area={skeleton.rightArea} />      {/* 属性面板 */}
        </div>
      </SkeletonContext.Provider>
    </div>
  );
}
```

#### 2. 基于 Skeleton 的插件系统
```typescript
// skeleton.add() 注册插件到不同区域
skeleton.add({
    area: 'mainArea',
    name: 'designer',
    type: 'Widget',
    content: <DesignerPlugin />,  // 设计器插件
});

skeleton.add({
    area: 'rightArea',
    name: 'settingsPane',
    type: 'Panel',
    content: <SettingsPrimaryPane />,  // 属性面板插件
});
```

### 布局结构
```
Workbench
├── TopArea                    # 顶部工具栏
├── WorkbenchBody
│   ├── LeftArea              # 左侧组件库面板
│   ├── LeftFloatPane         # 左侧浮动面板
│   ├── LeftFixedPane         # 左侧固定面板
│   ├── WorkbenchCenter
│   │   ├── Toolbar           # 工具栏
│   │   ├── MainArea          # 🔥 主编辑器区域（DesignerPlugin）
│   │   └── BottomArea        # 底部面板
│   └── RightArea             # 右侧属性面板
└── TipContainer             # 提示容器
```

## 五、关键区别对比

| 特性 | WorkSpaceWorkbench（工作空间模式） | Workbench（普通模式） |
|------|----------------------------------|---------------------|
| **启用条件** | `enableWorkspaceMode: true` | 默认模式 |
| **窗口管理** | 多窗口，支持切换 | 单一固定界面 |
| **主要区域** | WindowView（动态窗口） | MainArea（插件区域） |
| **外部集成** | 支持 webview 嵌入 | 不支持 |
| **复杂度** | 高，支持复杂场景 | 低，简单直接 |
| **资源消耗** | 较高 | 较低 |
| **适用场景** | 企业级、多项目 | 单项目、嵌入式 |
| **插件初始化** | `workspace.plugins.init()` | `plugins.init()` |

## 六、数据流与状态管理

### WorkSpaceWorkbench 数据流
```
Workspace (多窗口管理)
├── windows: EditorWindow[]          # 所有窗口实例
├── window: EditorWindow             # 当前活动窗口
└── skeleton: ISkeleton              # 骨架系统

每个 EditorWindow
├── resource: IResource              # 资源定义
├── resourceType: 'editor' | 'webview'
└── editorViews: Context[]           # 编辑器视图上下文
```

### 普通 Workbench 数据流
```
Skeleton (插件系统)
├── topArea, leftArea, rightArea...  # 各个区域
├── MainArea                         # 包含 DesignerPlugin
│   └── DesignerPlugin
│       └── DesignerView
│           └── ProjectView          # 直接到项目视图
└── 插件通过 skeleton.add() 注册
```

## 七、使用示例

### 启用工作空间模式
```typescript
import { init } from '@alilc/lowcode-engine';

await init(container, {
    enableWorkspaceMode: true,        // 🔥 关键配置
    enableAutoOpenFirstWindow: true, // 自动打开首个窗口
    // 其他配置...
});
```

### 创建多个编辑器窗口
```typescript
// 打开页面编辑器
workspace.openEditorWindow(
    'page-editor',      // 资源名称
    'Homepage',         // 窗口标题
    { pageId: 'home' }  // 配置参数
);

// 打开外部工具
workspace.openEditorWindow(
    'external-tool',
    'Design System',
    { url: 'https://design-tool.com' }
);
```

## 八、最佳实践

### 选择 WorkSpaceWorkbench 的场景
- 需要同时编辑多个页面或组件
- 需要集成外部设计工具
- 团队协作，不同成员负责不同模块
- 复杂的工作流，需要在不同编辑器间切换

### 选择普通 Workbench 的场景
- 单一项目或页面的编辑
- 简单的低代码应用开发
- 嵌入到已有系统中作为编辑组件
- 对启动速度和性能有要求

## 九、总结

**WorkSpaceWorkbench** 和 **Workbench** 代表了低代码引擎的两种不同架构模式：

- **WorkSpaceWorkbench**：面向**企业级多项目管理**的工作空间模式，提供强大的多窗口和外部工具集成能力
- **Workbench**：面向**单项目快速开发**的传统模式，简单直接，性能更优

选择哪种模式主要取决于业务复杂度和使用场景的需求。两种模式都基于相同的核心技术栈，但在用户体验和功能范围上有显著差异。
